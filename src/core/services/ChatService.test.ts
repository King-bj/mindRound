/**
 * ChatService 单元测试
 * @description 群聊轮次顺序、追加成员（Agent 用 stub 替代）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from './ChatService';
import type { Chat } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { ContextBuilderService } from './ContextBuilderService';
import type { IPersonaRepository } from '../repositories/IPersonaRepository';
import type { Agent } from '../agent/Agent';
import type { AgentStreamEvent } from '../agent/types';
import type { IMemoryService } from './MemoryService';

function makeMemoryStub(): IMemoryService {
  return {
    shouldUpdateMemory: vi.fn().mockResolvedValue(false),
    summarizeAndSave: vi.fn().mockResolvedValue(undefined),
  };
}

function buildGroupChat(overrides: Partial<Chat> = {}): Chat {
  const now = new Date().toISOString();
  return {
    id: 'chat-g1',
    type: 'group',
    title: '测试群',
    personaIds: ['p-a', 'p-b', 'p-c'],
    currentSpeakerIndex: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** 模拟 Agent.run：直接产出一条最终 assistant 消息 */
function makeStubAgent(): Agent {
  const run = async function* (input: {
    personaId?: string;
  }): AsyncGenerator<AgentStreamEvent> {
    const msg = {
      role: 'assistant' as const,
      content: 'ok',
      timestamp: new Date().toISOString(),
      personaId: input.personaId,
    };
    yield { type: 'message_done', message: msg };
  };
  return { run } as unknown as Agent;
}

describe('ChatService', () => {
  describe('sendMessage / runGroupChat', () => {
    let speakerOrder: string[];

    beforeEach(() => {
      speakerOrder = [];
    });

    it('群聊在用户消息后按 personaIds 顺序依次回复', async () => {
      const chat = buildGroupChat();
      const chatRepo: Partial<IChatRepository> = {
        addMessage: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(chat),
        getMessages: vi.fn().mockResolvedValue([]),
        getMemory: vi.fn().mockResolvedValue(''),
        updateMemory: vi.fn().mockResolvedValue(undefined),
        getSpeakerIndex: vi.fn().mockResolvedValue(0),
        updateSpeakerIndex: vi.fn().mockResolvedValue(undefined),
      };

      const contextBuilder: Partial<ContextBuilderService> = {
        buildForChat: vi.fn().mockResolvedValue({
          messages: [],
          memory: '',
          skill: 'sys',
        }),
        buildGroupRoundContext: vi.fn().mockImplementation((_c, personaId: string) => {
          speakerOrder.push(personaId);
          return Promise.resolve({
            messages: [{ role: 'user' as const, content: 'instruction' }],
            system: 'sys',
          });
        }),
      };

      const personaRepo: Partial<IPersonaRepository> = {
        scan: vi.fn().mockResolvedValue([
          { id: 'p-a', name: 'A', description: '', avatar: null, tags: [] },
          { id: 'p-b', name: 'B', description: '', avatar: null, tags: [] },
          { id: 'p-c', name: 'C', description: '', avatar: null, tags: [] },
        ]),
        getSkillContent: vi.fn().mockResolvedValue(''),
      };

      const service = new ChatService(
        chatRepo as IChatRepository,
        contextBuilder as ContextBuilderService,
        personaRepo as IPersonaRepository,
        makeStubAgent(),
        makeMemoryStub()
      );

      await service.sendMessage(chat.id, '用户第一句');

      expect(speakerOrder).toEqual(['p-a', 'p-b', 'p-c']);
      expect(chatRepo.updateSpeakerIndex).toHaveBeenLastCalledWith(chat.id, 2);
    });

    it('在 tool_call 流式阶段推送 assistant 临时消息', async () => {
      const chat: Chat = {
        ...buildGroupChat({
          id: 'chat-single',
          type: 'single',
          personaIds: ['p-a'],
        }),
      };
      const chatRepo: Partial<IChatRepository> = {
        addMessage: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(chat),
        getMessages: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { role: 'user', content: '帮我查天气', timestamp: new Date().toISOString() },
          ]),
        getMemory: vi.fn().mockResolvedValue(''),
        updateMemory: vi.fn().mockResolvedValue(undefined),
      };

      const contextBuilder: Partial<ContextBuilderService> = {
        buildForChat: vi.fn().mockResolvedValue({
          messages: [{ role: 'user', content: '帮我查天气', timestamp: new Date().toISOString() }],
          memory: '',
          skill: 'sys',
        }),
      };
      const personaRepo: Partial<IPersonaRepository> = {
        scan: vi.fn().mockResolvedValue([]),
        getSkillContent: vi.fn().mockResolvedValue(''),
      };
      const updates: AgentStreamEvent[] = [
        { type: 'tool_call_start', index: 0, name: 'web_search' },
        { type: 'tool_call_arguments_delta', index: 0, argumentsDelta: '{"query":"上海天气"}' },
        {
          type: 'message_done',
          message: {
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            personaId: 'p-a',
            toolCalls: [
              {
                id: 'call_1',
                name: 'web_search',
                arguments: '{"query":"上海天气"}',
              },
            ],
          },
        },
      ];
      const agent: Agent = {
        run: async function* () {
          for (const ev of updates) {
            yield ev;
          }
        },
      } as unknown as Agent;

      const service = new ChatService(
        chatRepo as IChatRepository,
        contextBuilder as ContextBuilderService,
        personaRepo as IPersonaRepository,
        agent,
        makeMemoryStub()
      );

      const streamPushed: Array<{ done: boolean; toolCallName?: string }> = [];
      service.onMessageUpdate = (event) => {
        streamPushed.push({
          done: event.done,
          toolCallName: event.message.toolCalls?.[0]?.name,
        });
      };

      await service.sendMessage(chat.id, '帮我查天气');

      expect(streamPushed.some((e) => !e.done && e.toolCallName === 'web_search')).toBe(true);
      expect(chatRepo.addMessage).toHaveBeenCalled();
    });
  });

  describe('addPersonasToGroup', () => {
    it('合并去重并写回仓储', async () => {
      const chat = buildGroupChat({ personaIds: ['a', 'b'] });
      const updated = { ...chat, personaIds: ['a', 'b', 'c'] };

      const chatRepo: Partial<IChatRepository> = {
        findById: vi
          .fn()
          .mockResolvedValueOnce(chat)
          .mockResolvedValueOnce(updated),
        update: vi.fn().mockResolvedValue(undefined),
      };

      const contextBuilder: Partial<ContextBuilderService> = {};

      const service = new ChatService(
        chatRepo as IChatRepository,
        contextBuilder as ContextBuilderService,
        {} as IPersonaRepository,
        makeStubAgent(),
        makeMemoryStub()
      );

      const result = await service.addPersonasToGroup(chat.id, ['c', 'c', 'a']);

      expect(chatRepo.update).toHaveBeenCalledWith(chat.id, { personaIds: ['a', 'b', 'c'] });
      expect(result.personaIds).toEqual(['a', 'b', 'c']);
    });

    it('非群聊抛出错误', async () => {
      const single: Chat = {
        ...buildGroupChat(),
        type: 'single',
        personaIds: ['x'],
      };
      const chatRepo: Partial<IChatRepository> = {
        findById: vi.fn().mockResolvedValue(single),
      };
      const service = new ChatService(
        chatRepo as IChatRepository,
        {} as ContextBuilderService,
        {} as IPersonaRepository,
        makeStubAgent(),
        makeMemoryStub()
      );

      await expect(service.addPersonasToGroup('id', ['y'])).rejects.toThrow('group');
    });
  });
});
