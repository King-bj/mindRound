import { describe, expect, it } from 'vitest';
import { compactOldToolMessages, trimMessages } from './ContextTrimmer';
import type { MessageDTO } from '../domain/Chat';

function ts(i: number): string {
  return new Date(2026, 0, 1, 0, 0, i).toISOString();
}

describe('ContextTrimmer', () => {
  it('多工具并发场景仅折叠较老 tool 结果', () => {
    const messages: MessageDTO[] = [
      { role: 'user', content: 'Q1', timestamp: ts(1) },
      {
        role: 'assistant',
        content: '',
        timestamp: ts(2),
        toolCalls: [
          { id: 'a1', name: 'web_search', arguments: '{"query":"x"}' },
          { id: 'a2', name: 'web_fetch', arguments: '{"url":"https://a.com"}' },
        ],
      },
      { role: 'tool', content: 'search old', timestamp: ts(3), toolCallId: 'a1', name: 'web_search' },
      { role: 'tool', content: 'fetch old', timestamp: ts(4), toolCallId: 'a2', name: 'web_fetch' },
      { role: 'assistant', content: 'A1', timestamp: ts(5) },
      { role: 'user', content: 'Q2', timestamp: ts(6) },
      { role: 'assistant', content: '', timestamp: ts(7), toolCalls: [{ id: 'b1', name: 'read_file', arguments: '{"path":"a.md"}' }] },
      { role: 'tool', content: 'recent read', timestamp: ts(8), toolCallId: 'b1', name: 'read_file' },
      { role: 'assistant', content: 'A2', timestamp: ts(9) },
    ];

    const compacted = compactOldToolMessages(messages);
    expect(compacted[2].content).toContain('工具结果已折叠');
    expect(compacted[3].content).toContain('工具结果已折叠');
    expect(compacted[7].content).toBe('recent read');
  });

  it('纯文本消息不应被改写', () => {
    const messages: MessageDTO[] = [
      { role: 'user', content: 'u1', timestamp: ts(1) },
      { role: 'assistant', content: 'a1', timestamp: ts(2) },
      { role: 'user', content: 'u2', timestamp: ts(3) },
      { role: 'assistant', content: 'a2', timestamp: ts(4) },
    ];
    expect(compactOldToolMessages(messages)).toEqual(messages);
  });

  it('工具链场景在超长时按 user 边界截断', () => {
    const messages: MessageDTO[] = [
      { role: 'user', content: 'start', timestamp: ts(1) },
      { role: 'assistant', content: '', timestamp: ts(2), toolCalls: [{ id: 'c1', name: 'search_file', arguments: '{"pattern":"x"}' }] },
      { role: 'tool', content: 'chain-1', timestamp: ts(3), toolCallId: 'c1', name: 'search_file' },
      { role: 'assistant', content: '', timestamp: ts(4), toolCalls: [{ id: 'c2', name: 'read_file', arguments: '{"path":"x"}' }] },
      { role: 'tool', content: 'chain-2', timestamp: ts(5), toolCallId: 'c2', name: 'read_file' },
      { role: 'assistant', content: 'final', timestamp: ts(6) },
      { role: 'user', content: 'next', timestamp: ts(7) },
      { role: 'assistant', content: 'answer', timestamp: ts(8) },
    ];

    const trimmed = trimMessages(messages, { maxMessages: 5 });
    expect(trimmed.length).toBeLessThanOrEqual(5);
    expect(trimmed[0].role).toBe('user');
  });
});
