import { describe, it, expect, beforeEach } from 'vitest';
import type { Chat } from '../../domain/Chat';
import { FileChatRepository } from './FileChatRepository';
import { MockAdapter } from '../platforms/MockAdapter';

describe('FileChatRepository', () => {
  let repo: FileChatRepository;
  let adapter: MockAdapter;

  function makeChatDraft(
    overrides: Partial<Omit<Chat, 'id'>> = {}
  ): Omit<Chat, 'id'> {
    return {
      type: 'single',
      title: 'Test',
      personaIds: ['p1'],
      currentSpeakerIndex: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.setDataDir('/test-data');
    repo = new FileChatRepository(adapter);
  });

  describe('create', () => {
    it('should create a new chat with generated ID', async () => {
      const chatData = makeChatDraft({
        type: 'single',
        title: 'Test Chat',
        personaIds: ['persona-1'],
      });

      const chat = await repo.create(chatData);

      expect(chat.id).toBeTruthy();
      expect(chat.id.startsWith('chat_')).toBe(true);
      expect(chat.type).toBe('single');
      expect(chat.title).toBe('Test Chat');
      expect(chat.personaIds).toEqual(['persona-1']);
    });

    it('should create chat directory structure', async () => {
      const chat = await repo.create(makeChatDraft());

      const exists = await adapter.exists(`/test-data/chats/${chat.id}`);
      expect(exists).toBe(true);
    });

    it('should create meta.json, messages.json, and memory.md', async () => {
      const chat = await repo.create(makeChatDraft());

      const metaExists = await adapter.exists(`/test-data/chats/${chat.id}/meta.json`);
      const messagesExists = await adapter.exists(`/test-data/chats/${chat.id}/messages.json`);
      const memoryExists = await adapter.exists(`/test-data/chats/${chat.id}/memory.md`);

      expect(metaExists).toBe(true);
      expect(messagesExists).toBe(true);
      expect(memoryExists).toBe(true);
    });
  });

  describe('findById', () => {
    it('should find created chat by ID', async () => {
      const created = await repo.create(makeChatDraft({ title: 'Find Me' }));

      const found = await repo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Find Me');
    });

    it('should return null for non-existent chat', async () => {
      const found = await repo.findById('non-existent-id');

      expect(found).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('should add message to chat', async () => {
      const chat = await repo.create(makeChatDraft());

      await repo.addMessage(chat.id, {
        role: 'user',
        content: 'Hello',
        timestamp: '2024-01-01T00:00:00.000Z',
      });

      const messages = await repo.getMessages(chat.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello');
    });

    it('should append multiple messages', async () => {
      const chat = await repo.create(makeChatDraft());

      await repo.addMessage(chat.id, {
        role: 'user',
        content: 'First',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      await repo.addMessage(chat.id, {
        role: 'assistant',
        content: 'Second',
        timestamp: '2024-01-01T00:00:01.000Z',
        personaId: 'p1',
      });

      const messages = await repo.getMessages(chat.id);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
    });
  });

  describe('getMessages', () => {
    it('should return empty array for new chat', async () => {
      const chat = await repo.create(makeChatDraft());

      const messages = await repo.getMessages(chat.id);

      expect(messages).toEqual([]);
    });
  });

  describe('getMemory', () => {
    it('should return default memory content', async () => {
      const chat = await repo.create(makeChatDraft());

      const memory = await repo.getMemory(chat.id);

      expect(memory).toBe('# 对话记忆\n');
    });
  });

  describe('updateMemory', () => {
    it('should update memory content', async () => {
      const chat = await repo.create(makeChatDraft());

      await repo.updateMemory(chat.id, '# 新记忆\n- 关键点1');

      const memory = await repo.getMemory(chat.id);
      expect(memory).toBe('# 新记忆\n- 关键点1');
    });
  });

  describe('getSpeakerIndex / updateSpeakerIndex', () => {
    it('should return 0 for new chat', async () => {
      const chat = await repo.create(makeChatDraft());

      const index = await repo.getSpeakerIndex(chat.id);

      expect(index).toBe(0);
    });

    it('should update and retrieve speaker index', async () => {
      const chat = await repo.create(
        makeChatDraft({
          type: 'group',
          title: 'Group',
          personaIds: ['p1', 'p2', 'p3'],
        })
      );

      await repo.updateSpeakerIndex(chat.id, 2);
      const index = await repo.getSpeakerIndex(chat.id);

      expect(index).toBe(2);
    });
  });

  describe('findAll', () => {
    it('should return all created chats', async () => {
      const chat1 = await repo.create(makeChatDraft({ title: 'Chat 1' }));

      const chat2 = await repo.create(makeChatDraft({ title: 'Chat 2' }));

      const all = await repo.findAll();

      // Should contain both chats
      expect(all.length).toBeGreaterThanOrEqual(2);
      const ids = all.map((c) => c.id);
      expect(ids).toContain(chat1.id);
      expect(ids).toContain(chat2.id);
    });

    it('should return empty array when no chats', async () => {
      const emptyAdapter = new MockAdapter();
      emptyAdapter.setDataDir('/empty-data');
      const emptyRepo = new FileChatRepository(emptyAdapter);

      const all = await emptyRepo.findAll();

      expect(all).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update chat properties', async () => {
      const chat = await repo.create(makeChatDraft({ title: 'Original Title' }));

      await repo.update(chat.id, { title: 'Updated Title' });

      const found = await repo.findById(chat.id);
      expect(found!.title).toBe('Updated Title');
    });
  });
});
