/**
 * API 仓储接口
 * @description 定义与 OpenAI 兼容 LLM API 的交互；支持工具（function calling）与结构化流式事件
 */

/**
 * OpenAI function tool schema
 * @description 直接对应 chat completions 请求体的 tools[i]
 */
export interface OpenAIFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    /** JSON Schema（Draft 7 子集） */
    parameters: Record<string, unknown>;
  };
}

export type OpenAITool = OpenAIFunctionTool;

/**
 * OpenAI 线格式的工具调用（序列化用）
 */
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 聊天消息（OpenAI 兼容格式）
 * @description role='tool' 必须带 tool_call_id；assistant 可带 tool_calls
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** assistant 消息的工具调用 */
  tool_calls?: ChatToolCall[];
  /** tool 消息回应的调用 ID */
  tool_call_id?: string;
  /** tool 消息的工具名（某些实现要求） */
  name?: string;
}

/**
 * 聊天请求
 */
export interface ChatRequest {
  /** 消息列表（不含 system） */
  messages: ChatMessage[];
  /** 系统提示（会作为 messages[0] 注入） */
  system?: string;
  /** 是否流式响应（chat 方法固定 true） */
  stream?: boolean;
  /** 可用工具列表（OpenAI function tool schema） */
  tools?: OpenAITool[];
}

/**
 * 流式事件（chat 方法 yield 的 item）
 */
export type ChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_call_delta';
      /** 对应 OpenAI delta.tool_calls[i].index，同一个工具调用的多次 delta 共享 index */
      index: number;
      /** 工具调用 ID（通常只在第一条 delta 出现） */
      id?: string;
      /** 工具名（通常只在第一条 delta 出现） */
      name?: string;
      /** 增量入参字符串片段，需按 index 聚合 */
      argumentsDelta?: string;
    }
  | {
      type: 'done';
      /** OpenAI finish_reason */
      finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null;
    };

export interface IApiRepository {
  /**
   * 流式聊天
   * @param request - 聊天请求
   * @returns 结构化事件异步生成器（text_delta / tool_call_delta / done）
   */
  chat(request: ChatRequest): AsyncGenerator<ChatStreamEvent>;

  /**
   * 非流式聊天（用于 memory 摘要等不需要工具的场景）
   * @returns 完整回复文本
   */
  chatComplete(request: ChatRequest): Promise<string>;

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;
}
