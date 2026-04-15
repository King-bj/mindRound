import { describe, it, expect } from 'vitest';
import {
  createEmptyMemory,
  updateMemoryContent,
} from './Memory';

describe('Memory', () => {
  describe('createEmptyMemory', () => {
    it('should create memory with chatId', () => {
      const memory = createEmptyMemory('chat_123');
      expect(memory.chatId).toBe('chat_123');
    });

    it('should have default empty content', () => {
      const memory = createEmptyMemory('chat_123');
      expect(memory.content).toBe('# 对话记忆\n');
    });

    it('should set updatedAt timestamp', () => {
      const before = new Date();
      const memory = createEmptyMemory('chat_123');
      const after = new Date();

      expect(memory.updatedAt).toBeTruthy();
      const updatedDate = new Date(memory.updatedAt);
      expect(updatedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(updatedDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('updateMemoryContent', () => {
    it('should update content', () => {
      const memory = createEmptyMemory('chat_123');
      const updated = updateMemoryContent(memory, '# 新记忆\n- 关键点');

      expect(updated.content).toBe('# 新记忆\n- 关键点');
      expect(updated.chatId).toBe('chat_123');
    });

    it('should update timestamp', async () => {
      const memory = createEmptyMemory('chat_123');
      const originalUpdatedAt = memory.updatedAt;

      // Wait to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      const updated = updateMemoryContent(memory, '# Updated');

      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });
  });
});
