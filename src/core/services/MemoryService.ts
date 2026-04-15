/**
 * 记忆服务
 * @description 管理会话长期记忆的更新和摘要
 */
import type { Chat } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IApiRepository } from '../repositories/IApiRepository';
import { MEMORY_IDLE_THRESHOLD_MS } from '../utils/constants';

/** 记忆摘要提示词模板 */
const MEMORY_SUMMARIZER_PROMPT = `你是一名记忆整理助手。根据对话历史，提取关键信息追加到现有记忆中。
现有记忆：
{memory}

新对话：
{conversation}

请输出更新后的完整记忆（Markdown 格式）。`;

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

    if (messages.length < 2) {
      return false;
    }

    const lastMessage = messages[messages.length - 1];
    const lastMsgTime = new Date(lastMessage.timestamp);
    const now = new Date();

    return now.getTime() - lastMsgTime.getTime() >= MEMORY_IDLE_THRESHOLD_MS;
  }

  /**
   * 摘要并保存记忆
   * 调用 LLM 整理对话历史，追加到 memory.md
   */
  async summarizeAndSave(chat: Chat): Promise<void> {
    if (!(await this.shouldUpdateMemory(chat))) {
      return;
    }

    const messages = await this.chatRepo.getMessages(chat.id);
    const currentMemory = await this.chatRepo.getMemory(chat.id);

    const conversation = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const prompt = MEMORY_SUMMARIZER_PROMPT
      .replace('{memory}', currentMemory)
      .replace('{conversation}', conversation);

    const summary = await this.apiRepo.chatComplete({
      messages: [{ role: 'user', content: prompt }],
    });

    await this.chatRepo.updateMemory(chat.id, summary);
  }
}
