/**
 * 上下文构建服务
 * @description 根据 30 分钟时间窗口构建 API 请求上下文
 */
import type { Chat } from '../domain/Chat';
import type { MessageDTO } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IPersonaRepository } from '../repositories/IPersonaRepository';
import { DEFAULT_TIME_WINDOW_MINUTES } from '../utils/constants';

/**
 * 上下文选项
 */
export interface ContextOptions {
  /** 时间窗口分钟数，默认 30 */
  timeWindowMinutes: number;
  /** 是否包含记忆 */
  includeMemory: boolean;
  /** 是否包含人格 */
  includeSkill: boolean;
}

/**
 * 默认选项
 */
const DEFAULT_OPTIONS: ContextOptions = {
  timeWindowMinutes: DEFAULT_TIME_WINDOW_MINUTES,
  includeMemory: true,
  includeSkill: true,
};

/**
 * 构建后的上下文
 */
export interface Context {
  /** 时间窗口内的消息 */
  messages: MessageDTO[];
  /** 记忆内容 */
  memory: string;
  /** 人格 SKILL 内容 */
  skill: string;
}

export class ContextBuilderService {
  constructor(
    private chatRepo: IChatRepository,
    private personaRepo: IPersonaRepository,
    private options: ContextOptions = DEFAULT_OPTIONS
  ) {}

  /**
   * 为单聊构建上下文
   * @param chat - 会话
   * @returns 上下文
   */
  async buildForChat(chat: Chat): Promise<Context> {
    const personaId = chat.personaIds[0];
    return this.buildContext(chat.id, personaId);
  }

  /**
   * 为群聊构建上下文
   * @param chat - 会话
   * @param currentPersonaId - 当前发言的人格 ID
   * @returns 上下文
   */
  async buildForGroup(chat: Chat, currentPersonaId: string): Promise<Context> {
    return this.buildContext(chat.id, currentPersonaId);
  }

  /**
   * 内部方法：构建上下文
   */
  private async buildContext(chatId: string, personaId: string): Promise<Context> {
    const [messages, memory, skill] = await Promise.all([
      this.buildMessageContext(chatId),
      this.options.includeMemory ? this.chatRepo.getMemory(chatId) : Promise.resolve(''),
      this.options.includeSkill ? this.personaRepo.getSkillContent(personaId) : Promise.resolve(''),
    ]);

    return { messages, memory, skill };
  }

  /**
   * 构建消息上下文（30 分钟时间窗口）
   */
  private async buildMessageContext(chatId: string): Promise<MessageDTO[]> {
    const allMessages = await this.chatRepo.getMessages(chatId);
    const cutoff = new Date(Date.now() - this.options.timeWindowMinutes * 60 * 1000);

    return allMessages.filter((msg) => {
      const msgTime = new Date(msg.timestamp);
      return msgTime >= cutoff;
    });
  }

  /**
   * 更新选项
   */
  updateOptions(options: Partial<ContextOptions>): void {
    Object.assign(this.options, options);
  }
}
