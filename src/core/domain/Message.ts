import { generateId, timestamp } from '../utils';
import type { MessageRole, ToolCall } from './Chat';

export type { MessageRole, ToolCall } from './Chat';

/**
 * 消息实体（UI / 业务内部用，比 MessageDTO 多一个 id）
 * @description role 复用 MessageDTO：user / assistant / tool
 */
export interface Message {
  /** 消息 ID（UI 内部唯一标识，不随持久化） */
  id: string;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 助手消息所属的人格 ID（仅 assistant 角色有值） */
  personaId?: string;
  /** assistant 消息的工具调用 */
  toolCalls?: ToolCall[];
  /** tool 消息回应的工具调用 ID */
  toolCallId?: string;
  /** tool 消息的工具名 */
  name?: string;
}

/**
 * 创建用户消息
 * @param content - 消息内容
 * @returns 用户消息对象
 */
export function createUserMessage(content: string): Message {
  return {
    id: generateId(),
    role: 'user',
    content,
    timestamp: timestamp(),
  };
}

/**
 * 创建助手消息
 * @param content - 消息内容
 * @param personaId - 人格 ID
 * @param toolCalls - 可选，该轮请求的工具调用
 * @returns 助手消息对象
 */
export function createAssistantMessage(
  content: string,
  personaId: string,
  toolCalls?: ToolCall[]
): Message {
  return {
    id: generateId(),
    role: 'assistant',
    content,
    timestamp: timestamp(),
    personaId,
    toolCalls,
  };
}

/**
 * 创建工具结果消息
 * @param toolCallId - 对应 assistant.toolCalls[i].id
 * @param name - 工具名（冗余，便于 UI 展示）
 * @param content - 工具执行结果（传给模型的字符串）
 * @returns 工具结果消息
 */
export function createToolMessage(
  toolCallId: string,
  name: string,
  content: string
): Message {
  return {
    id: generateId(),
    role: 'tool',
    content,
    timestamp: timestamp(),
    toolCallId,
    name,
  };
}
