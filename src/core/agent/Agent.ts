/**
 * Agent 核心循环
 * @description 向 LLM 发起请求 → 收集 tool_calls → 并行执行（cache → permission → run）→ 回喂 → 重复；
 * 直到 finish_reason !== 'tool_calls' 或达到 MAX_ITERATIONS。
 */
import type {
  IApiRepository,
  ChatMessage,
  ChatToolCall,
} from '../repositories/IApiRepository';
import type { MessageDTO, ToolCall } from '../domain/Chat';
import type {
  AgentInput,
  AgentStreamEvent,
  ITool,
  ToolCallResult,
  ToolRegistry,
  ToolRunContext,
} from './types';
import { mergeToolCallDelta, safeParseJson } from './types';
import type { IPermissionService } from './PermissionService';
import type { IToolResultCache } from './ToolResultCache';
import { timestamp } from '../utils';
import { trimMessages } from './ContextTrimmer';

export const MAX_ITERATIONS = 8;

export interface AgentDeps {
  api: IApiRepository;
  registry: ToolRegistry;
  permission: IPermissionService;
  cache: IToolResultCache;
  /** 提供 tools 运行所需的上下文（sandbox roots + search 配置） */
  getBaseToolContext: () => Promise<Omit<ToolRunContext, 'allowOutsideSandbox'>>;
}

export class Agent {
  constructor(private deps: AgentDeps) {}

  async *run(input: AgentInput): AsyncGenerator<AgentStreamEvent> {
    let messages: MessageDTO[] = [...input.messages];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const apiMessages = messagesToApi(trimMessages(messages));
      let text = '';
      const toolCalls: ToolCall[] = [];
      let finishReason:
        | 'stop'
        | 'tool_calls'
        | 'length'
        | 'content_filter'
        | null = null;

      for await (const ev of this.deps.api.chat({
        messages: apiMessages,
        system: input.system,
        stream: true,
        tools: this.deps.registry.schemas(),
      })) {
        if (ev.type === 'text_delta') {
          text += ev.text;
          yield { type: 'text_delta', text: ev.text };
        } else if (ev.type === 'tool_call_delta') {
          mergeToolCallDelta(toolCalls, ev);
          if (ev.name || ev.id) {
            yield {
              type: 'tool_call_start',
              index: ev.index,
              name: ev.name,
            };
          }
          if (ev.argumentsDelta) {
            yield {
              type: 'tool_call_arguments_delta',
              index: ev.index,
              argumentsDelta: ev.argumentsDelta,
            };
          }
        } else if (ev.type === 'done') {
          finishReason = ev.finishReason;
        }
      }

      // 补齐 toolCalls 的空洞并剔除未收到 id 的槽位
      const validToolCalls = toolCalls.filter((t) => t && t.id && t.name);

      const assistantMsg: MessageDTO = {
        role: 'assistant',
        content: text,
        timestamp: timestamp(),
        personaId: input.personaId,
        toolCalls: validToolCalls.length > 0 ? validToolCalls : undefined,
      };
      messages.push(assistantMsg);
      yield { type: 'message_done', message: assistantMsg };

      if (finishReason !== 'tool_calls' || validToolCalls.length === 0) {
        return;
      }

      // 执行工具（并行），权限弹框在内部按顺序 await
      const results = await this.executeToolCalls(input.chatId, validToolCalls);
      for (const r of results) {
        const m: MessageDTO = {
          role: 'tool',
          content: r.content,
          timestamp: timestamp(),
          toolCallId: r.id,
          name: r.name,
          cached: r.cached || undefined,
        };
        messages.push(m);
        yield {
          type: 'tool_executed',
          toolCallId: r.id,
          name: r.name,
          cached: r.cached,
        };
        yield { type: 'message_done', message: m };
      }
    }

    yield { type: 'max_iterations_reached' };
  }

  private async executeToolCalls(
    chatId: string,
    toolCalls: ToolCall[]
  ): Promise<ToolCallResult[]> {
    // 按顺序处理权限弹框（避免同时弹多个），工具实际运行尽可能并发
    const results: ToolCallResult[] = new Array(toolCalls.length);
    const runnable: Array<{
      tc: ToolCall;
      tool: ITool;
      args: Record<string, unknown>;
      ctx: ToolRunContext;
      idx: number;
    }> = [];

    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const tool = this.deps.registry.get(tc.name);
      if (!tool) {
        results[i] = errResult(tc, `未知工具: ${tc.name}`);
        continue;
      }
      const parsed = safeParseJson(tc.arguments);
      if (!parsed.ok) {
        results[i] = errResult(tc, `入参 JSON 非法: ${parsed.error}`);
        continue;
      }
      const args = parsed.value;

      // 1. 缓存命中
      const cached = await this.deps.cache.get(chatId, tool, args);
      if (cached != null) {
        results[i] = {
          id: tc.id,
          name: tc.name,
          content: cached,
          cached: true,
          isError: false,
        };
        continue;
      }

      // 2. 权限决策（顺序 await，弹框串行）
      const auth = await this.deps.permission.authorize(tool, args);
      if (!auth.allowed) {
        results[i] = errResult(tc, `用户拒绝执行 ${tool.name}`);
        continue;
      }

      const base = await this.deps.getBaseToolContext();
      runnable.push({
        tc,
        tool,
        args,
        ctx: { ...base, allowOutsideSandbox: auth.allowOutsideSandbox },
        idx: i,
      });
    }

    // 3. 并发执行真正的工具 run
    await Promise.all(
      runnable.map(async ({ tc, tool, args, ctx, idx }) => {
        try {
          const content = await tool.run(args, ctx);
          results[idx] = {
            id: tc.id,
            name: tc.name,
            content,
            cached: false,
            isError: false,
          };
          if (tool.cacheable) {
            await this.deps.cache.set(chatId, tool, args, content);
          }
        } catch (e) {
          results[idx] = errResult(tc, `Error: ${(e as Error).message}`);
        }
      })
    );

    return results;
  }
}

/**
 * 将 MessageDTO 映射为 OpenAI ChatMessage
 */
export function messagesToApi(messages: MessageDTO[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === 'user') {
      return { role: 'user', content: m.content };
    }
    if (m.role === 'assistant') {
      const msg: ChatMessage = { role: 'assistant', content: m.content };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map<ChatToolCall>((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      return msg;
    }
    // tool
    return {
      role: 'tool',
      content: m.content,
      tool_call_id: m.toolCallId ?? '',
      name: m.name,
    };
  });
}

function errResult(tc: ToolCall, message: string): ToolCallResult {
  return {
    id: tc.id,
    name: tc.name || 'unknown',
    content: message,
    cached: false,
    isError: true,
  };
}
