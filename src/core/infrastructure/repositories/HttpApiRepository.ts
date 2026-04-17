/**
 * HTTP API 仓储
 * @description OpenAI 兼容 API 实现，支持流式响应与工具调用（function calling）
 */
import type {
  IApiRepository,
  ChatRequest,
  ChatMessage,
  ChatStreamEvent,
} from '../../repositories/IApiRepository';

interface OpenAIDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface OpenAIChoice {
  delta?: OpenAIDelta;
  message?: { content?: string | null };
  finish_reason?: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
  index?: number;
}

interface OpenAIStreamChunk {
  choices?: OpenAIChoice[];
}

interface OpenAICompletion {
  choices?: OpenAIChoice[];
}

export class HttpApiRepository implements IApiRepository {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model;
  }

  updateConfig(baseUrl: string, apiKey: string, model: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model;
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const body = this.buildRequestBody(request, true);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason: ChatStreamEvent & { type: 'done' } = {
      type: 'done',
      finishReason: null,
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 以 \n\n 分隔事件，单事件可能跨 chunk，需要缓冲到双换行
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const ev of this.parseEvent(rawEvent, finishReason)) {
            if (ev.type === 'done') {
              finishReason = ev;
            } else {
              yield ev;
            }
          }
        }
      }

      // flush 剩余（通常是空）
      if (buffer.trim().length > 0) {
        for (const ev of this.parseEvent(buffer, finishReason)) {
          if (ev.type === 'done') {
            finishReason = ev;
          } else {
            yield ev;
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }

    yield finishReason;
  }

  async chatComplete(request: ChatRequest): Promise<string> {
    const body = this.buildRequestBody(request, false);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data: OpenAICompletion = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 解析单个 SSE 事件（可能含多行 `data:` 行）
   */
  private *parseEvent(
    rawEvent: string,
    currentDone: ChatStreamEvent & { type: 'done' }
  ): Generator<ChatStreamEvent> {
    for (const line of rawEvent.split('\n')) {
      const trimmed = line.trimEnd();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trimStart();
      if (data.length === 0) continue;
      if (data === '[DONE]') {
        yield currentDone;
        return;
      }
      let parsed: OpenAIStreamChunk;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = parsed.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta ?? {};
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        yield { type: 'text_delta', text: delta.content };
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const ev: ChatStreamEvent = {
            type: 'tool_call_delta',
            index: tc.index,
            id: tc.id,
            name: tc.function?.name,
            argumentsDelta: tc.function?.arguments,
          };
          yield ev;
        }
      }
      if (choice.finish_reason != null) {
        yield { type: 'done', finishReason: choice.finish_reason };
      }
    }
  }

  /**
   * 构造 chat/completions 请求体
   */
  private buildRequestBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
    const messages = this.buildMessages(request);
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream,
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = 'auto';
    }
    return body;
  }

  private buildMessages(request: ChatRequest): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (request.system && request.system.length > 0) {
      messages.push({ role: 'system', content: request.system });
    }
    messages.push(...request.messages);
    return messages;
  }
}
