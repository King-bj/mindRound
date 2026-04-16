/**
 * ChatService 单元测试
 * @description 群聊轮次顺序、追加成员
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from './ChatService';
import type { Chat } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IApiRepository } from '../repositories/IApiRepository';
import type { ContextBuilderService } from './ContextBuilderService';

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

      const apiRepo: Partial<IApiRepository> = {
        chat: async function* () {
          yield 'ok';
        },
        chatComplete: vi.fn().mockResolvedValue(''),
      };

      const contextBuilder: Partial<ContextBuilderService> = {
        buildForChat: vi.fn().mockResolvedValue({
          messages: [],
          memory: '',
          skill: 'sys',
        }),
        buildForGroup: vi.fn().mockImplementation((_c, personaId: string) => {
          speakerOrder.push(personaId);
          return Promise.resolve({
            messages: [],
            memory: '',
            skill: 'sys',
          });
        }),
      };

      const service = new ChatService(
        chatRepo as IChatRepository,
        apiRepo as IApiRepository,
        contextBuilder as ContextBuilderService
      );

      await service.sendMessage(chat.id, '用户第一句');

      expect(speakerOrder).toEqual(['p-a', 'p-b', 'p-c']);
      expect(chatRepo.updateSpeakerIndex).toHaveBeenLastCalledWith(chat.id, 2);
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

      const apiRepo: Partial<IApiRepository> = {};
      const contextBuilder: Partial<ContextBuilderService> = {};

      const service = new ChatService(
        chatRepo as IChatRepository,
        apiRepo as IApiRepository,
        contextBuilder as ContextBuilderService
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
        {} as IApiRepository,
        {} as ContextBuilderService
      );

      await expect(service.addPersonasToGroup('id', ['y'])).rejects.toThrow('group');
    });
  });
});
