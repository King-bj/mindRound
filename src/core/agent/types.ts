/**
 * Agent 核心类型
 */
import type { MessageDTO, ToolCall } from '../domain/Chat';
import type { OpenAITool } from '../repositories/IApiRepository';

/**
 * 工具权限类
 * - `readonly-sandbox`：读 sandbox 内免确认，sandbox 外需要确认
 * - `read-any`：任意读（如网络搜索、fetch），无需确认
 * - `write`：写操作，始终需要用户确认
 * - `exec`：命令执行，始终需要用户确认
 */
export type ToolPermission = 'readonly-sandbox' | 'read-any' | 'write' | 'exec';

/**
 * 工具运行上下文（注入到 run 方法）
 */
export interface ToolRunContext {
  /** sandbox 根目录列表（appData + 用户添加的工作文件夹） */
  sandboxRoots: string[];
  /** 用户是否已授权访问 sandbox 外（由 PermissionService 决策填入） */
  allowOutsideSandbox: boolean;
  /** 搜索引擎提供者 */
  searchProvider: 'ddg' | 'tavily' | 'serper';
  /** 搜索引擎 API Key（DDG 不需要） */
  searchApiKey: string;
}

/**
 * 工具抽象
 * @description 每个工具自描述其权限类与是否可缓存；具体逻辑通过 `run` 暴露
 */
export interface ITool<A = unknown> {
  /** 工具名（OpenAI function name，snake_case） */
  name: string;
  /** 给模型看的描述 */
  description: string;
  /** OpenAI 函数参数 JSON Schema */
  parameters: Record<string, unknown>;
  /** 权限类 */
  permission: ToolPermission;
  /** 是否对同名同参数进行会话级缓存 */
  cacheable: boolean;
  /** 执行 */
  run(args: A, ctx: ToolRunContext): Promise<string>;
}

/**
 * Agent 运行输入
 */
export interface AgentInput {
  /** system prompt（人物卡 SKILL.md 内容 + 附加指令） */
  system: string;
  /** 用户与助手历史消息 */
  messages: MessageDTO[];
  /** 会话 ID，用于缓存 / 工具结果持久化 */
  chatId: string;
  /** 当前回复助手对应的人格 ID（用于写入 assistant.personaId） */
  personaId?: string;
}

/**
 * Agent 流式事件
 * @description 同一次 `Agent.run()` 下所有事件共享一个 `turnId`，用于 UI 将
 * 多轮迭代合并为一个 assistant 气泡 + 若干步骤 + Sources 底条。
 */
export type AgentStreamEvent =
  | {
      type: 'message_start';
      role: 'assistant';
      timestamp: string;
      personaId?: string;
      turnId: string;
      /** 第几轮迭代（0 起步）——便于调试与测试 */
      iteration: number;
    }
  | { type: 'text_delta'; text: string; turnId: string }
  | { type: 'tool_call_start'; index: number; name?: string; turnId: string }
  | {
      type: 'tool_call_arguments_delta';
      index: number;
      argumentsDelta: string;
      turnId: string;
    }
  | { type: 'message_done'; message: MessageDTO; turnId: string }
  | {
      type: 'tool_executed';
      toolCallId: string;
      name: string;
      cached: boolean;
      turnId: string;
    }
  | { type: 'max_iterations_reached'; turnId: string }
  | { type: 'error'; error: string; turnId: string };

/**
 * 工具调用执行结果
 */
export interface ToolCallResult {
  /** 对应 ToolCall.id，匹配 tool message 的 tool_call_id */
  id: string;
  /** 工具名 */
  name: string;
  /** 返回给模型的字符串 */
  content: string;
  /** 结果是否来自缓存 */
  cached: boolean;
  /** 是否为错误（内容以 Error: 前缀呈现给模型） */
  isError: boolean;
}

/**
 * 工具执行所需的装配依赖（Agent 在构造时注入）
 */
export interface ToolRegistry {
  /** 查询工具 */
  get(name: string): ITool | undefined;
  /** 所有工具的 OpenAI schema 列表 */
  schemas(): OpenAITool[];
  /** 所有工具 */
  all(): ITool[];
}

/**
 * JSON 解析结果
 */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function safeParseJson(src: string | undefined | null): ParseResult<Record<string, unknown>> {
  const s = (src ?? '').trim();
  if (s === '') return { ok: true, value: {} };
  try {
    const v = JSON.parse(s);
    if (v == null || typeof v !== 'object' || Array.isArray(v)) {
      return { ok: false, error: '工具入参必须是 JSON 对象' };
    }
    return { ok: true, value: v as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 合并 tool_call_delta：按 index 聚合 id / name / arguments 片段
 */
export function mergeToolCallDelta(
  acc: ToolCall[],
  ev: {
    index: number;
    id?: string;
    name?: string;
    argumentsDelta?: string;
  }
): void {
  let slot = acc[ev.index];
  if (!slot) {
    slot = { id: '', name: '', arguments: '' };
    acc[ev.index] = slot;
  }
  if (ev.id) slot.id = ev.id;
  if (ev.name) slot.name = ev.name;
  if (ev.argumentsDelta) slot.arguments += ev.argumentsDelta;
}
