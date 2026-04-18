/**
 * 记忆服务
 * @description 管理会话长期记忆的更新和摘要
 */
import type { Chat } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IApiRepository } from '../repositories/IApiRepository';
import {
  MEMORY_SUMMARIZER_PROMPT,
  formatConversationForMemorySummary,
  isIdleEnoughForMemory,
} from './memoryConversation';

export interface IMemoryService {
  /**
   * 检查是否需要更新记忆
   * @param chat - 会话
   * @returns 是否需要更新
   */
  shouldUpdateMemory(chat: Chat): Promise<boolean>;

  /**
   * 摘要并保存记忆
   * @param chat - 会话
   */
  summarizeAndSave(chat: Chat): Promise<void>;
}

export class MemoryService implements IMemoryService {
  constructor(
    private chatRepo: IChatRepository,
    private apiRepo: IApiRepository
  ) {}

  /**
   * 判断是否需要更新记忆
   * 当会话空闲超过阈值时返回 true
   */
  async shouldUpdateMemory(chat: Chat): Promise<boolean> {
    const messages = await this.chatRepo.getMessages(chat.id);
    return isIdleEnoughForMemory(messages);
  }

  /**
   * 摘要并保存记忆
   * 调用 LLM 整理对话历史，追加到 memory.md
   */
  async summarizeAndSave(chat: Chat): Promise<void> {
    const messages = await this.chatRepo.getMessages(chat.id);
    if (!isIdleEnoughForMemory(messages)) {
      return;
    }

    const currentMemory = await this.chatRepo.getMemory(chat.id);

    const conversation = formatConversationForMemorySummary(messages);

    const prompt = MEMORY_SUMMARIZER_PROMPT
      .replace('{memory}', currentMemory)
      .replace('{conversation}', conversation);

    const summary = await this.apiRepo.chatComplete({
      messages: [{ role: 'user', content: prompt }],
    });

    await this.chatRepo.updateMemory(chat.id, summary);
  }
}
