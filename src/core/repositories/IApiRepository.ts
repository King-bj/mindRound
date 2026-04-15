/**
 * API 仓储接口
 * @description 定义与 LLM API 的交互操作
 */

/**
 * 聊天请求
 */
export interface ChatRequest {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 系统提示（人格 SKILL 内容） */
  system?: string;
  /** 是否流式响应 */
  stream?: boolean;
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 角色: system, user, assistant */
  role: 'system' | 'user' | 'assistant';
  /** 消息内容 */
  content: string;
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  /** 回复内容 */
  content: string;
  /** 是否完成 */
  done: boolean;
}

export interface IApiRepository {
  /**
   * 发送聊天请求（流式）
   * @param request - 聊天请求
   * @returns 异步生成器，逐块返回内容
   */
  chat(request: ChatRequest): AsyncGenerator<string>;

  /**
   * 发送聊天请求（非流式）
   * @param request - 聊天请求
   * @returns 完整回复内容
   */
  chatComplete(request: ChatRequest): Promise<string>;

  /**
   * 健康检查
   * @returns API 是否可用
   */
  healthCheck(): Promise<boolean>;
}
