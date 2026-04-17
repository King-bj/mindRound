import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpApiRepository } from './HttpApiRepository';
import type { ChatStreamEvent } from '../../repositories/IApiRepository';

function buildSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
}

async function collect(it: AsyncGenerator<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const ev of it) {
    events.push(ev);
  }
  return events;
}

describe('HttpApiRepository SSE', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('将分块 SSE 解析为 text/tool_call/done 事件序列', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"web_search"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"query\\":\\"ai\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(buildSseStream(sseChunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const repo = new HttpApiRepository('https://api.example.com/v1', 'k', 'gpt-4o');
    const events = await collect(
      repo.chat({
        messages: [{ role: 'user', content: 'hi' }],
      })
    );

    expect(events).toContainEqual({ type: 'text_delta', text: 'Hel' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'lo' });
    expect(events).toContainEqual({
      type: 'tool_call_delta',
      index: 0,
      id: 'call_1',
      name: 'web_search',
      argumentsDelta: undefined,
    });
    expect(events).toContainEqual({
      type: 'tool_call_delta',
      index: 0,
      id: undefined,
      name: undefined,
      argumentsDelta: '{"query":"ai"}',
    });
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'tool_calls' });
  });

  it('HTTP 非 2xx 时抛出错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('bad request', {
          status: 400,
        })
      )
    );
    const repo = new HttpApiRepository('https://api.example.com/v1', 'k', 'gpt-4o');

    await expect(
      collect(
        repo.chat({
          messages: [{ role: 'user', content: 'x' }],
        })
      )
    ).rejects.toThrow('API error: 400');
  });
});
