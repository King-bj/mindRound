import { generateChatId, timestamp } from '../utils';

/**
 * 会话类型
 */
export type ChatType = 'single' | 'group';

/**
 * 会话实体
 * @description 表示一个聊天会话，支持单聊和群聊
 */
export interface Chat {
  /** 会话 ID */
  id: string;
  /** 会话类型 */
  type: ChatType;
  /** 会话标题（单聊显示人格名称，群聊显示群名称） */
  title: string;
  /** 参与的人格 ID 列表 */
  personaIds: string[];
  /** 当前发言者索引（群聊用） */
  currentSpeakerIndex: number;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * 会话元数据（用于持久化）
 */
export interface ChatMeta {
  id: string;
  type: 'single' | 'group';
  title: string;
  personaIds: string[];
  currentSpeakerIndex: number;
  createdAt: string;
}

/**
 * 消息历史（用于持久化）
 */
export interface MessagesData {
  messages: MessageDTO[];
}

/**
 * 消息 DTO（用于持久化）
 */
export interface MessageDTO {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  personaId?: string;
}

/**
 * 从 ChatMeta 创建 Chat
 * @param meta - 会话元数据
 * @returns Chat 实体
 */
export function createChatFromMeta(meta: ChatMeta): Chat {
  return {
    ...meta,
    updatedAt: meta.createdAt,
  };
}

/**
 * 创建新会话
 * @param type - 会话类型
 * @param title - 会话标题
 * @param personaIds - 参与的人格 ID 列表
 * @returns 新会话对象
 */
export function createChat(
  type: ChatType,
  title: string,
  personaIds: string[]
): Chat {
  const now = timestamp();
  return {
    id: generateChatId(),
    type,
    title,
    personaIds,
    currentSpeakerIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 从 Chat 转换为 ChatMeta
 * @param chat - Chat 实体
 * @returns ChatMeta
 */
export function chatToMeta(chat: Chat): ChatMeta {
  return {
    id: chat.id,
    type: chat.type,
    title: chat.title,
    personaIds: chat.personaIds,
    currentSpeakerIndex: chat.currentSpeakerIndex,
    createdAt: chat.createdAt,
  };
}

