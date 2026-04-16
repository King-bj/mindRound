import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryService } from './MemoryService';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IApiRepository } from '../repositories/IApiRepository';

// Mock implementation helpers
function createMockChatRepo(overrides: Partial<IChatRepository> = {}): IChatRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMessage: vi.fn(),
    getMessages: vi.fn().mockResolvedValue([]),
    getMemory: vi.fn().mockResolvedValue('# 对话记忆\n'),
    updateMemory: vi.fn(),
    getSpeakerIndex: vi.fn().mockResolvedValue(0),
    updateSpeakerIndex: vi.fn(),
    findByPersona: vi.fn().mockResolvedValue([]),
    findRecent: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as IChatRepository;
}

function createMockApiRepo(overrides: Partial<IApiRepository> = {}): IApiRepository {
  return {
    chat: vi.fn(),
    chatComplete: vi.fn().mockResolvedValue('# 摘要\n- 关键点'),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as IApiRepository;
}

describe('MemoryService', () => {
  let memoryService: MemoryService;
  let mockChatRepo: IChatRepository;
  let mockApiRepo: IApiRepository;

  beforeEach(() => {
    mockChatRepo = createMockChatRepo();
    mockApiRepo = createMockApiRepo();
    memoryService = new MemoryService(mockChatRepo, mockApiRepo);
  });

  describe('shouldUpdateMemory', () => {
    it('should return false when chat has fewer than 2 messages', async () => {
      mockChatRepo.getMessages = vi.fn().mockResolvedValue([
        { role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      ]);

      const result = await memoryService.shouldUpdateMemory({
        id: 'chat_1',
        type: 'single',
        title: 'Test',
        personaIds: ['p1'],
        currentSpeakerIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(result).toBe(false);
    });

    it('should return true when last message is older than 5 minutes', async () => {
      const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      mockChatRepo.getMessages = vi.fn().mockResolvedValue([
        { role: 'user', content: 'Hello', timestamp: oldTimestamp },
        { role: 'assistant', content: 'Hi', timestamp: oldTimestamp },
      ]);

      const result = await memoryService.shouldUpdateMemory({
        id: 'chat_1',
        type: 'single',
        title: 'Test',
        personaIds: ['p1'],
        currentSpeakerIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(result).toBe(true);
    });

    it('should return false when last message is within 5 minutes', async () => {
      const recentTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      mockChatRepo.getMessages = vi.fn().mockResolvedValue([
        { role: 'user', content: 'Hello', timestamp: recentTimestamp },
        { role: 'assistant', content: 'Hi', timestamp: recentTimestamp },
      ]);

      const result = await memoryService.shouldUpdateMemory({
        id: 'chat_1',
        type: 'single',
        title: 'Test',
        personaIds: ['p1'],
        currentSpeakerIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(result).toBe(false);
    });
  });

  describe('summarizeAndSave', () => {
    it('should not call API when shouldUpdateMemory returns false', async () => {
      const recentTimestamp = new Date(Date.now() - 1 * 60 * 1000).toISOString();
      mockChatRepo.getMessages = vi.fn().mockResolvedValue([
        { role: 'user', content: 'Hello', timestamp: recentTimestamp },
        { role: 'assistant', content: 'Hi', timestamp: recentTimestamp },
      ]);

      await memoryService.summarizeAndSave({
        id: 'chat_1',
        type: 'single',
        title: 'Test',
        personaIds: ['p1'],
        currentSpeakerIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(mockApiRepo.chatComplete).not.toHaveBeenCalled();
    });

    it('should call API to summarize when idle', async () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mockChatRepo.getMessages = vi.fn().mockResolvedValue([
        { role: 'user', content: 'Hello', timestamp: oldTimestamp },
        { role: 'assistant', content: 'Hi there', timestamp: oldTimestamp },
      ]);
      mockChatRepo.getMemory = vi.fn().mockResolvedValue('# 已有记忆\n');

      await memoryService.summarizeAndSave({
        id: 'chat_1',
        type: 'single',
        title: 'Test',
        personaIds: ['p1'],
        currentSpeakerIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(mockApiRepo.chatComplete).toHaveBeenCalled();
    });

    it('should update memory with summary', async () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mockChatRepo.getMessages = vi.fn().mockResolvedValue([
        { role: 'user', content: 'Hello', timestamp: oldTimestamp },
        { role: 'assistant', content: 'Hi there', timestamp: oldTimestamp },
      ]);
      mockChatRepo.getMemory = vi.fn().mockResolvedValue('# 已有记忆\n');
      mockApiRepo.chatComplete = vi.fn().mockResolvedValue('# 新摘要\n- 关键点');

      await memoryService.summarizeAndSave({
        id: 'chat_1',
        type: 'single',
        title: 'Test',
        personaIds: ['p1'],
        currentSpeakerIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(mockChatRepo.updateMemory).toHaveBeenCalledWith('chat_1', '# 新摘要\n- 关键点');
    });
  });
});
