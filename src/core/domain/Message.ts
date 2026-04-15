import { generateId, timestamp } from '../utils';

/**
 * 消息角色类型
 */
export type MessageRole = 'user' | 'assistant';

/**
 * 消息实体
 * @description 表示对话中的一条消息，支持用户消息和助手消息
 */
export interface Message {
  /** 消息 ID */
  id: string;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 助手消息所属的人格 ID（仅 assistant 角色有值） */
  personaId?: string;
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
 * @returns 助手消息对象
 */
export function createAssistantMessage(content: string, personaId: string): Message {
  return {
    id: generateId(),
    role: 'assistant',
    content,
    timestamp: timestamp(),
    personaId,
  };
}
