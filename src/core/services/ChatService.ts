/**
 * 聊天服务
 * @description 核心业务逻辑，处理消息发送、群聊编排等
 */
import type { Chat } from '../domain/Chat';
import { createUserMessage, createAssistantMessage, type Message } from '../domain/Message';
import type { MessageDTO } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IApiRepository, ChatRequest } from '../repositories/IApiRepository';
import type { ContextBuilderService } from './ContextBuilderService';
import { MEMORY_IDLE_THRESHOLD_MS } from '../utils/constants';

/** 记忆摘要提示词模板 */
const MEMORY_SUMMARIZER_PROMPT = `你是一名记忆整理助手。根据对话历史，提取关键信息追加到现有记忆中。
现有记忆：
{memory}

新对话：
{conversation}

请输出更新后的完整记忆（Markdown 格式）。`;

/**
 * 消息更新事件
 */
export interface MessageUpdateEvent {
  chatId: string;
  message: MessageDTO;
  done: boolean;
}

/**
 * 聊天服务接口
 */
export interface IChatService {
  /**
   * 发送消息
   * @param chatId - 会话 ID
   * @param content - 消息内容
   */
  sendMessage(chatId: string, content: string): Promise<void>;

  /**
   * 创建单聊
   * @param personaId - 人格 ID
   * @returns 创建的会话
   */
  createSingleChat(personaId: string): Promise<Chat>;

  /**
   * 创建群聊
   * @param title - 群聊标题
   * @param personaIds - 参与的人格 ID 列表
   * @returns 创建的会话
   */
  createGroupChat(title: string, personaIds: string[]): Promise<Chat>;

  /**
   * 获取会话历史
   * @param chatId - 会话 ID
   * @returns 消息列表
   */
  getHistory(chatId: string): Promise<MessageDTO[]>;

  /**
   * 消息更新事件（流式更新时触发）
   */
  onMessageUpdate?: (event: MessageUpdateEvent) => void;
}

export class ChatService implements IChatService {
  constructor(
    private chatRepo: IChatRepository,
    private apiRepo: IApiRepository,
    private contextBuilder: ContextBuilderService
  ) {}

  async sendMessage(chatId: string, content: string): Promise<void> {
    const userMsg = createUserMessage(content);
    await this.chatRepo.addMessage(chatId, this.messageToDTO(userMsg));

    const chat = await this.chatRepo.findById(chatId);
    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    const context = await this.contextBuilder.buildForChat(chat);
    const request = this.buildApiRequest(context);

    if (chat.type === 'single') {
      await this.streamAssistantReply(chatId, request, chat.personaIds[0]);
    } else {
      await this.runGroupChat(chat);
    }

    // 异步更新记忆，不阻塞主流程
    this.updateMemory(chat).catch((err) => {
      console.error('Memory update failed:', err);
    });
  }

  async createSingleChat(personaId: string): Promise<Chat> {
    return this.chatRepo.create({
      type: 'single',
      title: personaId,
      personaIds: [personaId],
      currentSpeakerIndex: 0,
    });
  }

  async createGroupChat(title: string, personaIds: string[]): Promise<Chat> {
    if (personaIds.length < 2) {
      throw new Error('Group chat requires at least 2 personas');
    }

    return this.chatRepo.create({
      type: 'group',
      title,
      personaIds,
      currentSpeakerIndex: 0,
    });
  }

  async getHistory(chatId: string): Promise<MessageDTO[]> {
    return this.chatRepo.getMessages(chatId);
  }

  onMessageUpdate?: (event: MessageUpdateEvent) => void;

  private async streamAssistantReply(
    chatId: string,
    request: ChatRequest,
    personaId: string
  ): Promise<void> {
    const assistantMsg = createAssistantMessage('', personaId);
    let fullContent = '';

    for await (const chunk of this.apiRepo.chat(request)) {
      fullContent += chunk;
      assistantMsg.content = fullContent;

      this.onMessageUpdate?.({
        chatId,
        message: this.messageToDTO(assistantMsg),
        done: false,
      });
    }

    await this.chatRepo.addMessage(chatId, this.messageToDTO(assistantMsg));

    this.onMessageUpdate?.({
      chatId,
      message: this.messageToDTO(assistantMsg),
      done: true,
    });
  }

  private async runGroupChat(chat: Chat): Promise<void> {
    const personaCount = chat.personaIds.length;
    let currentIndex = await this.chatRepo.getSpeakerIndex(chat.id);

    for (let i = 0; i < personaCount; i++) {
      const nextIndex = (currentIndex + 1) % personaCount;
      const nextPersonaId = chat.personaIds[nextIndex];

      const context = await this.contextBuilder.buildForGroup(chat, nextPersonaId);
      const request = this.buildApiRequest(context);

      await this.streamAssistantReply(chat.id, request, nextPersonaId);
      await this.chatRepo.updateSpeakerIndex(chat.id, nextIndex);
      currentIndex = nextIndex;
    }
  }

  private async updateMemory(chat: Chat): Promise<void> {
    const messages = await this.chatRepo.getMessages(chat.id);
    if (messages.length < 2) return;

    const lastMsgTime = new Date(messages[messages.length - 1].timestamp);
    const now = new Date();

    if (now.getTime() - lastMsgTime.getTime() < MEMORY_IDLE_THRESHOLD_MS) {
      return;
    }

    const currentMemory = await this.chatRepo.getMemory(chat.id);
    const summary = await this.summarizeMessages(messages, currentMemory);
    await this.chatRepo.updateMemory(chat.id, summary);
  }

  private async summarizeMessages(messages: MessageDTO[], currentMemory: string): Promise<string> {
    const conversation = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const prompt = MEMORY_SUMMARIZER_PROMPT
      .replace('{memory}', currentMemory)
      .replace('{conversation}', conversation);

    return this.apiRepo.chatComplete({
      messages: [{ role: 'user', content: prompt }],
    });
  }

  private buildApiRequest(context: { messages: MessageDTO[]; skill: string }): ChatRequest {
    return {
      messages: context.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      system: context.skill,
      stream: true,
    };
  }

  private messageToDTO(msg: Message): MessageDTO {
    return {
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      personaId: msg.personaId,
    };
  }
}
