import { describe, expect, it, vi } from 'vitest';
import { Agent, MAX_ITERATIONS } from './Agent';
import type { IApiRepository, ChatStreamEvent } from '../repositories/IApiRepository';
import type { ITool, ToolRegistry, ToolRunContext, AgentStreamEvent } from './types';
import type { IPermissionService } from './PermissionService';
import type { IToolResultCache } from './ToolResultCache';

function buildRegistry(tool: ITool): ToolRegistry {
  return {
    get(name: string) {
      return name === tool.name ? tool : undefined;
    },
    all() {
      return [tool];
    },
    schemas() {
      return [
        {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        },
      ];
    },
  };
}

async function collectEvents(it: AsyncGenerator<AgentStreamEvent>): Promise<AgentStreamEvent[]> {
  const out: AgentStreamEvent[] = [];
  for await (const ev of it) {
    out.push(ev);
  }
  return out;
}

/** 每轮 LLM 迭代：message_start 的 timestamp 与随后 assistant 的 message_done 一致 */
function assertAssistantTurnTimestamps(events: AgentStreamEvent[]): void {
  let lastStart: string | null = null;
  for (const e of events) {
    if (e.type === 'message_start' && e.role === 'assistant') {
      lastStart = e.timestamp;
    }
    if (e.type === 'message_done' && e.message.role === 'assistant') {
      expect(lastStart).not.toBeNull();
      expect(e.message.timestamp).toBe(lastStart);
    }
  }
}

describe('Agent', () => {
  it('处理 tool_calls 循环并回喂 tool 消息', async () => {
    const runTool = vi.fn().mockResolvedValue('tool-result');
    const tool: ITool = {
      name: 'web_search',
      description: 'search',
      parameters: { type: 'object' },
      permission: 'read-any',
      cacheable: true,
      run: runTool as unknown as (args: unknown, ctx: ToolRunContext) => Promise<string>,
    };
    let turn = 0;
    const api: IApiRepository = {
      chat: async function* (): AsyncGenerator<ChatStreamEvent> {
        if (turn === 0) {
          yield { type: 'tool_call_delta', index: 0, id: 'call_1', name: 'web_search' };
          yield {
            type: 'tool_call_delta',
            index: 0,
            argumentsDelta: '{"query":"mindround"}',
          };
          yield { type: 'done', finishReason: 'tool_calls' };
        } else {
          yield { type: 'text_delta', text: 'final answer' };
          yield { type: 'done', finishReason: 'stop' };
        }
        turn++;
      },
      chatComplete: vi.fn().mockResolvedValue(''),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const permission: IPermissionService = {
      authorize: vi.fn().mockResolvedValue({
        allowed: true,
        allowOutsideSandbox: false,
      }),
      getSandboxRoots: vi.fn().mockResolvedValue(['C:/workspace']),
    };
    const cache: IToolResultCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const agent = new Agent({
      api,
      registry: buildRegistry(tool),
      permission,
      cache,
      getBaseToolContext: async () => ({
        sandboxRoots: ['C:/workspace'],
        searchProvider: 'ddg',
        searchApiKey: '',
      }),
    });

    const events = await collectEvents(
      agent.run({
        system: 'sys',
        messages: [{ role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }],
        chatId: 'chat-1',
      })
    );

    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'message_start',
        role: 'assistant',
      })
    );
    assertAssistantTurnTimestamps(events);
    expect(runTool).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === 'tool_executed' && !e.cached)).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === 'message_done' &&
          e.message.role === 'tool' &&
          e.message.toolCallId === 'call_1'
      )
    ).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === 'message_done' &&
          e.message.role === 'assistant' &&
          e.message.content === 'final answer'
      )
    ).toBe(true);
  });

  it('命中缓存时不再执行工具', async () => {
    const runTool = vi.fn().mockResolvedValue('tool-result');
    const tool: ITool = {
      name: 'read_file',
      description: 'read',
      parameters: { type: 'object' },
      permission: 'readonly-sandbox',
      cacheable: true,
      run: runTool as unknown as (args: unknown, ctx: ToolRunContext) => Promise<string>,
    };
    let turn = 0;
    const api: IApiRepository = {
      chat: async function* (): AsyncGenerator<ChatStreamEvent> {
        if (turn === 0) {
          yield { type: 'tool_call_delta', index: 0, id: 'call_cache', name: 'read_file' };
          yield {
            type: 'tool_call_delta',
            index: 0,
            argumentsDelta: '{"path":"note.md"}',
          };
          yield { type: 'done', finishReason: 'tool_calls' };
        } else {
          yield { type: 'text_delta', text: 'done' };
          yield { type: 'done', finishReason: 'stop' };
        }
        turn++;
      },
      chatComplete: vi.fn().mockResolvedValue(''),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const permission: IPermissionService = {
      authorize: vi.fn().mockResolvedValue({
        allowed: true,
        allowOutsideSandbox: false,
      }),
      getSandboxRoots: vi.fn().mockResolvedValue(['C:/workspace']),
    };
    const cache: IToolResultCache = {
      get: vi.fn().mockResolvedValue('cached-content'),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const agent = new Agent({
      api,
      registry: buildRegistry(tool),
      permission,
      cache,
      getBaseToolContext: async () => ({
        sandboxRoots: ['C:/workspace'],
        searchProvider: 'ddg',
        searchApiKey: '',
      }),
    });

    const events = await collectEvents(
      agent.run({
        system: 'sys',
        messages: [{ role: 'user', content: 'read', timestamp: '2026-01-01T00:00:00.000Z' }],
        chatId: 'chat-cache',
      })
    );

    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'message_start',
        role: 'assistant',
      })
    );
    assertAssistantTurnTimestamps(events);
    expect(runTool).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'tool_executed' && e.cached)).toBe(true);
  });

  it('达到 MAX_ITERATIONS 时抛出上限事件', async () => {
    const tool: ITool = {
      name: 'web_search',
      description: 'search',
      parameters: { type: 'object' },
      permission: 'read-any',
      cacheable: false,
      run: vi.fn().mockResolvedValue('ok'),
    };
    const api: IApiRepository = {
      chat: async function* (): AsyncGenerator<ChatStreamEvent> {
        yield { type: 'tool_call_delta', index: 0, id: 'call_loop', name: 'web_search' };
        yield {
          type: 'tool_call_delta',
          index: 0,
          argumentsDelta: '{"query":"loop"}',
        };
        yield { type: 'done', finishReason: 'tool_calls' };
      },
      chatComplete: vi.fn().mockResolvedValue(''),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const permission: IPermissionService = {
      authorize: vi.fn().mockResolvedValue({
        allowed: true,
        allowOutsideSandbox: false,
      }),
      getSandboxRoots: vi.fn().mockResolvedValue(['C:/workspace']),
    };
    const cache: IToolResultCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const agent = new Agent({
      api,
      registry: buildRegistry(tool),
      permission,
      cache,
      getBaseToolContext: async () => ({
        sandboxRoots: ['C:/workspace'],
        searchProvider: 'ddg',
        searchApiKey: '',
      }),
    });

    const events = await collectEvents(
      agent.run({
        system: 'sys',
        messages: [{ role: 'user', content: 'loop', timestamp: '2026-01-01T00:00:00.000Z' }],
        chatId: 'chat-loop',
      })
    );

    expect(events[0]).toEqual(
      expect.objectContaining({
        type: 'message_start',
        role: 'assistant',
      })
    );
    assertAssistantTurnTimestamps(events);
    expect(events.filter((e) => e.type === 'message_done' && e.message.role === 'assistant')).toHaveLength(
      MAX_ITERATIONS
    );
    const last = events.at(-1);
    expect(last).toEqual(
      expect.objectContaining({ type: 'max_iterations_reached' })
    );
    expect(last && 'turnId' in last ? last.turnId : undefined).toEqual(expect.any(String));
  });

  it('同一次 Agent.run 的所有事件共享同一 turnId', async () => {
    const runTool = vi.fn().mockResolvedValue('tool-result');
    const tool: ITool = {
      name: 'web_search',
      description: 'search',
      parameters: { type: 'object' },
      permission: 'read-any',
      cacheable: true,
      run: runTool as unknown as (args: unknown, ctx: ToolRunContext) => Promise<string>,
    };
    let turn = 0;
    const api: IApiRepository = {
      chat: async function* (): AsyncGenerator<ChatStreamEvent> {
        if (turn === 0) {
          yield { type: 'tool_call_delta', index: 0, id: 'call_1', name: 'web_search' };
          yield { type: 'tool_call_delta', index: 0, argumentsDelta: '{"query":"x"}' };
          yield { type: 'done', finishReason: 'tool_calls' };
        } else {
          yield { type: 'text_delta', text: 'ok' };
          yield { type: 'done', finishReason: 'stop' };
        }
        turn++;
      },
      chatComplete: vi.fn().mockResolvedValue(''),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const permission: IPermissionService = {
      authorize: vi.fn().mockResolvedValue({ allowed: true, allowOutsideSandbox: false }),
      getSandboxRoots: vi.fn().mockResolvedValue(['C:/w']),
    };
    const cache: IToolResultCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const agent = new Agent({
      api,
      registry: buildRegistry(tool),
      permission,
      cache,
      getBaseToolContext: async () => ({
        sandboxRoots: ['C:/w'],
        searchProvider: 'ddg',
        searchApiKey: '',
      }),
    });

    const events = await collectEvents(
      agent.run({
        system: 'sys',
        messages: [{ role: 'user', content: 'hi', timestamp: '2026-01-01T00:00:00.000Z' }],
        chatId: 'c1',
      })
    );

    const turnIds = new Set<string>();
    for (const e of events) {
      if ('turnId' in e && typeof e.turnId === 'string') {
        turnIds.add(e.turnId);
      }
      if (e.type === 'message_done') {
        expect(e.message.turnId).toBeDefined();
        turnIds.add(e.message.turnId as string);
      }
    }
    expect(turnIds.size).toBe(1);
  });
});
