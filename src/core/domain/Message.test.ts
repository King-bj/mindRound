import { describe, it, expect } from 'vitest';
import {
  createUserMessage,
  createAssistantMessage,
} from './Message';

describe('Message', () => {
  describe('createUserMessage', () => {
    it('should create a user message with correct properties', () => {
      const content = 'Hello, world!';
      const message = createUserMessage(content);

      expect(message.role).toBe('user');
      expect(message.content).toBe(content);
      expect(message.id).toBeTruthy();
      expect(message.timestamp).toBeTruthy();
    });

    it('should generate unique IDs for each message', () => {
      const msg1 = createUserMessage('first');
      const msg2 = createUserMessage('second');

      expect(msg1.id).not.toBe(msg2.id);
    });

    it('should have ISO timestamp format', () => {
      const message = createUserMessage('test');
      const timestamp = new Date(message.timestamp);

      expect(timestamp.toISOString()).toBe(message.timestamp);
    });
  });

  describe('createAssistantMessage', () => {
    it('should create an assistant message with personaId', () => {
      const content = 'I am an AI';
      const personaId = 'test-persona';
      const message = createAssistantMessage(content, personaId);

      expect(message.role).toBe('assistant');
      expect(message.content).toBe(content);
      expect(message.personaId).toBe(personaId);
      expect(message.id).toBeTruthy();
    });

    it('should generate different IDs for different personas', () => {
      const msg1 = createAssistantMessage('content', 'persona-1');
      const msg2 = createAssistantMessage('content', 'persona-2');

      expect(msg1.personaId).toBe('persona-1');
      expect(msg2.personaId).toBe('persona-2');
      expect(msg1.id).not.toBe(msg2.id);
    });
  });
});
