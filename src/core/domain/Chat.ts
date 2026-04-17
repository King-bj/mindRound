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
 * 消息角色
 * @description user / assistant 是传统对话；tool 是工具执行结果
 */
export type MessageRole = 'user' | 'assistant' | 'tool';

/**
 * OpenAI 线格式的工具调用
 * @description arguments 是 JSON 字符串（由模型生成，可能不合法）
 */
export interface ToolCall {
  /** OpenAI 分配的调用 ID，用于匹配 tool 结果 */
  id: string;
  /** 函数名 */
  name: string;
  /** JSON 字符串形式的入参 */
  arguments: string;
}

/**
 * 消息历史（用于持久化）
 */
export interface MessagesData {
  messages: MessageDTO[];
}

/**
 * 消息 DTO（OpenAI 线格式，直接持久化）
 * @description 一个 MessageDTO 对应 OpenAI API 的一条消息
 */
export interface MessageDTO {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容（assistant 纯 tool_calls 时为空串，tool 为执行结果文本） */
  content: string;
  /** ISO 时间戳 */
  timestamp: string;
  /** assistant 消息所属人格 ID */
  personaId?: string;
  /** assistant 消息产生的工具调用（含则表示本轮想调工具） */
  toolCalls?: ToolCall[];
  /** tool 消息回应的工具调用 ID（对应 OpenAI 协议 tool_call_id） */
  toolCallId?: string;
  /** tool 消息的工具名（冗余，方便 UI 展示） */
  name?: string;
  /** 工具结果是否来自缓存（仅 UI 展示用，不随 API 发送） */
  cached?: boolean;
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
