import { describe, it, expect } from 'vitest';
import {
  createChat,
  createChatFromMeta,
  chatToMeta,
  type Chat,
  type ChatMeta,
} from './Chat';

describe('Chat', () => {
  describe('createChat', () => {
    it('should create a single chat with correct properties', () => {
      const chat = createChat('single', 'Test Chat', ['persona-1']);

      expect(chat.type).toBe('single');
      expect(chat.title).toBe('Test Chat');
      expect(chat.personaIds).toEqual(['persona-1']);
      expect(chat.currentSpeakerIndex).toBe(0);
      expect(chat.id).toBeTruthy();
      expect(chat.id.startsWith('chat_')).toBe(true);
    });

    it('should create a group chat with multiple personas', () => {
      const chat = createChat('group', 'Group Chat', ['persona-1', 'persona-2', 'persona-3']);

      expect(chat.type).toBe('group');
      expect(chat.personaIds).toHaveLength(3);
      expect(chat.currentSpeakerIndex).toBe(0);
    });

    it('should set createdAt and updatedAt to the same value', () => {
      const chat = createChat('single', 'Test', ['persona-1']);

      expect(chat.createdAt).toBe(chat.updatedAt);
    });

    it('should generate unique IDs', () => {
      const chat1 = createChat('single', 'Chat 1', ['p1']);
      const chat2 = createChat('single', 'Chat 2', ['p2']);

      expect(chat1.id).not.toBe(chat2.id);
    });
  });

  describe('createChatFromMeta', () => {
    it('should create Chat from ChatMeta', () => {
      const meta: ChatMeta = {
        id: 'chat_123',
        type: 'single',
        title: 'Test Chat',
        personaIds: ['persona-1'],
        currentSpeakerIndex: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const chat = createChatFromMeta(meta);

      expect(chat.id).toBe(meta.id);
      expect(chat.type).toBe(meta.type);
      expect(chat.title).toBe(meta.title);
      expect(chat.personaIds).toEqual(meta.personaIds);
      expect(chat.currentSpeakerIndex).toBe(meta.currentSpeakerIndex);
      expect(chat.createdAt).toBe(meta.createdAt);
      expect(chat.updatedAt).toBe(meta.createdAt); // updatedAt = createdAt initially
    });
  });

  describe('chatToMeta', () => {
    it('should convert Chat to ChatMeta', () => {
      const chat: Chat = {
        id: 'chat_123',
        type: 'group',
        title: 'Group Chat',
        personaIds: ['p1', 'p2'],
        currentSpeakerIndex: 2,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };

      const meta = chatToMeta(chat);

      expect(meta.id).toBe(chat.id);
      expect(meta.type).toBe(chat.type);
      expect(meta.title).toBe(chat.title);
      expect(meta.personaIds).toEqual(chat.personaIds);
      expect(meta.currentSpeakerIndex).toBe(chat.currentSpeakerIndex);
      expect(meta.createdAt).toBe(chat.createdAt);
    });

    it('should round-trip through Chat and ChatMeta', () => {
      const originalMeta: ChatMeta = {
        id: 'chat_roundtrip',
        type: 'group',
        title: 'Roundtrip Test',
        personaIds: ['p1', 'p2', 'p3'],
        currentSpeakerIndex: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const chat = createChatFromMeta(originalMeta);
      const convertedMeta = chatToMeta(chat);

      expect(convertedMeta).toEqual(originalMeta);
    });
  });
});
