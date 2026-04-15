/**
 * 会话仓储接口
 * @description 定义会话数据的持久化操作，支持文件系统实现，未来可扩展为数据库或云存储
 */
import type { Chat, MessageDTO } from '../domain/Chat';

export interface IChatRepository {
  /**
   * 创建新会话
   * @param chat - 会话数据（不含 ID）
   * @returns 创建后的完整会话
   */
  create(chat: Omit<Chat, 'id'>): Promise<Chat>;

  /**
   * 根据 ID 查询会话
   * @param id - 会话 ID
   * @returns 会话对象，不存在返回 null
   */
  findById(id: string): Promise<Chat | null>;

  /**
   * 查询所有会话
   * @returns 会话列表
   */
  findAll(): Promise<Chat[]>;

  /**
   * 更新会话
   * @param id - 会话 ID
   * @param data - 要更新的数据
   */
  update(id: string, data: Partial<Chat>): Promise<void>;

  /**
   * 删除会话
   * @param id - 会话 ID
   */
  delete(id: string): Promise<void>;

  /**
   * 添加消息到会话
   * @param chatId - 会话 ID
   * @param message - 消息 DTO
   */
  addMessage(chatId: string, message: MessageDTO): Promise<void>;

  /**
   * 获取会话的所有消息
   * @param chatId - 会话 ID
   * @returns 消息列表
   */
  getMessages(chatId: string): Promise<MessageDTO[]>;

  /**
   * 获取会话的长期记忆
   * @param chatId - 会话 ID
   * @returns 记忆内容
   */
  getMemory(chatId: string): Promise<string>;

  /**
   * 更新会话的长期记忆
   * @param chatId - 会话 ID
   * @param content - 记忆内容
   */
  updateMemory(chatId: string, content: string): Promise<void>;

  /**
   * 获取当前发言者索引
   * @param chatId - 会话 ID
   * @returns 发言者索引
   */
  getSpeakerIndex(chatId: string): Promise<number>;

  /**
   * 更新当前发言者索引
   * @param chatId - 会话 ID
   * @param index - 发言者索引
   */
  updateSpeakerIndex(chatId: string, index: number): Promise<void>;

  /**
   * 根据人格查询相关会话
   * @param personaId - 人格 ID
   * @returns 相关会话列表
   */
  findByPersona(personaId: string): Promise<Chat[]>;

  /**
   * 查询最近的会话
   * @param limit - 返回数量限制
   * @returns 最近的会话列表
   */
  findRecent(limit: number): Promise<Chat[]>;

  /** 变更事件回调（预留） */
  onChange?: (chatId: string) => void;
}
