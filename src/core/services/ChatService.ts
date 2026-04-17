/**
 * 聊天服务
 * @description 核心业务：用户发消息 → Agent Loop（含工具调用）→ 持久化 + 流式通知 UI；
 * 群聊按 personaIds 顺序让每位成员各走一次 Agent。
 */
import type { Chat, MessageDTO } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type {
  IApiRepository,
  ChatMessage,
} from '../repositories/IApiRepository';
import type { IPersonaRepository } from '../repositories/IPersonaRepository';
import type { ContextBuilderService } from './ContextBuilderService';
import type { Agent } from '../agent/Agent';
import type { AgentInput } from '../agent/types';
import { MEMORY_IDLE_THRESHOLD_MS } from '../utils/constants';
import { timestamp } from '../utils';

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
  sendMessage(chatId: string, content: string): Promise<void>;
  createSingleChat(personaId: string): Promise<Chat>;
  createGroupChat(title: string, personaIds: string[]): Promise<Chat>;
  getHistory(chatId: string): Promise<MessageDTO[]>;
  getChats(): Promise<Chat[]>;
  getChatById(chatId: string): Promise<Chat | null>;
  addPersonasToGroup(chatId: string, newPersonaIds: string[]): Promise<Chat>;
  onMessageUpdate?: (event: MessageUpdateEvent) => void;
}

export class ChatService implements IChatService {
  constructor(
    private chatRepo: IChatRepository,
    private apiRepo: IApiRepository,
    private contextBuilder: ContextBuilderService,
    private personaRepo: IPersonaRepository,
    private agent: Agent
  ) {}

  onMessageUpdate?: (event: MessageUpdateEvent) => void;

  async sendMessage(chatId: string, content: string): Promise<void> {
    const userMsg: MessageDTO = {
      role: 'user',
      content,
      timestamp: timestamp(),
    };
    await this.chatRepo.addMessage(chatId, userMsg);
    this.onMessageUpdate?.({ chatId, message: userMsg, done: false });

    const chat = await this.chatRepo.findById(chatId);
    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    if (chat.type === 'single') {
      await this.runSingleChatTurn(chat);
    } else {
      await this.runGroupChat(chat);
    }

    this.updateMemory(chat).catch((err) => {
      console.error('Memory update failed:', err);
    });
  }

  async createSingleChat(personaId: string): Promise<Chat> {
    const related = await this.chatRepo.findByPersona(personaId);
    const existingSingle = related.find(
      (c) =>
        c.type === 'single' &&
        c.personaIds.length === 1 &&
        c.personaIds[0] === personaId
    );
    if (existingSingle) {
      return existingSingle;
    }
    const now = timestamp();
    return this.chatRepo.create({
      type: 'single',
      title: personaId,
      personaIds: [personaId],
      currentSpeakerIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  async createGroupChat(title: string, personaIds: string[]): Promise<Chat> {
    if (personaIds.length < 2) {
      throw new Error('Group chat requires at least 2 personas');
    }
    const now = timestamp();
    return this.chatRepo.create({
      type: 'group',
      title,
      personaIds,
      currentSpeakerIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  async getHistory(chatId: string): Promise<MessageDTO[]> {
    return this.chatRepo.getMessages(chatId);
  }

  async getChats(): Promise<Chat[]> {
    return this.chatRepo.findAll();
  }

  async getChatById(chatId: string): Promise<Chat | null> {
    return this.chatRepo.findById(chatId);
  }

  async addPersonasToGroup(chatId: string, newPersonaIds: string[]): Promise<Chat> {
    const chat = await this.chatRepo.findById(chatId);
    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }
    if (chat.type !== 'group') {
      throw new Error('addPersonasToGroup only applies to group chats');
    }
    const extra = [
      ...new Set(newPersonaIds.filter((id) => !chat.personaIds.includes(id))),
    ];
    if (extra.length === 0) {
      return chat;
    }
    const merged = [...chat.personaIds, ...extra];
    if (merged.length < 2) {
      throw new Error('Group chat requires at least 2 personas');
    }
    await this.chatRepo.update(chatId, { personaIds: merged });
    const updated = await this.chatRepo.findById(chatId);
    if (!updated) {
      throw new Error(`Chat not found after update: ${chatId}`);
    }
    return updated;
  }

  // ================= private =================

  private async runSingleChatTurn(chat: Chat): Promise<void> {
    const context = await this.contextBuilder.buildForChat(chat);
    const systemWithMemory =
      context.memory.trim().length > 0
        ? `${context.skill}\n\n[长期记忆]\n${context.memory}`
        : context.skill;

    const input: AgentInput = {
      system: systemWithMemory,
      messages: context.messages,
      chatId: chat.id,
      personaId: chat.personaIds[0],
    };
    await this.runAgent(chat.id, input);
  }

  private async runGroupChat(chat: Chat): Promise<void> {
    const personas = await this.personaRepo.scan();
    const personaDisplayNames: Record<string, string> = Object.fromEntries(
      personas.map((p) => [p.id, p.name] as const)
    );
    const personaCount = chat.personaIds.length;
    for (let i = 0; i < personaCount; i++) {
      const personaId = chat.personaIds[i];
      const ctx = await this.contextBuilder.buildGroupRoundContext(
        chat,
        personaId,
        i,
        personaDisplayNames
      );
      const input: AgentInput = {
        system: ctx.system,
        messages: ctx.messages,
        chatId: chat.id,
        personaId,
      };
      await this.runAgent(chat.id, input);
      await this.chatRepo.updateSpeakerIndex(chat.id, i);
    }
  }

  /**
   * 消费 Agent 流式事件：
   * - 对 assistant 文本，边流边推送给 UI（done=false）
   * - 完整的 assistant / tool 消息在 agent 产生 message_done 时写入仓库与 UI
   */
  private async runAgent(chatId: string, input: AgentInput): Promise<void> {
    let currentAssistant: MessageDTO | null = null;

    for await (const ev of this.agent.run(input)) {
      switch (ev.type) {
        case 'text_delta': {
          if (!currentAssistant) {
            currentAssistant = {
              role: 'assistant',
              content: '',
              timestamp: timestamp(),
              personaId: input.personaId,
            };
          }
          currentAssistant.content += ev.text;
          this.onMessageUpdate?.({
            chatId,
            message: currentAssistant,
            done: false,
          });
          break;
        }
        case 'tool_call_start': {
          if (!currentAssistant) {
            currentAssistant = {
              role: 'assistant',
              content: '',
              timestamp: timestamp(),
              personaId: input.personaId,
              toolCalls: [],
            };
          }
          const calls = [...(currentAssistant.toolCalls ?? [])];
          const existing = calls[ev.index] ?? {
            id: '',
            name: '',
            arguments: '',
          };
          calls[ev.index] = {
            ...existing,
            name: ev.name ?? existing.name,
          };
          currentAssistant.toolCalls = calls;
          this.onMessageUpdate?.({ chatId, message: currentAssistant, done: false });
          break;
        }
        case 'tool_call_arguments_delta': {
          if (!currentAssistant) {
            currentAssistant = {
              role: 'assistant',
              content: '',
              timestamp: timestamp(),
              personaId: input.personaId,
              toolCalls: [],
            };
          }
          const calls = [...(currentAssistant.toolCalls ?? [])];
          const existing = calls[ev.index] ?? {
            id: '',
            name: '',
            arguments: '',
          };
          calls[ev.index] = {
            ...existing,
            arguments: (existing.arguments ?? '') + ev.argumentsDelta,
          };
          currentAssistant.toolCalls = calls;
          this.onMessageUpdate?.({ chatId, message: currentAssistant, done: false });
          break;
        }
        case 'message_done': {
          const msg = ev.message;
          await this.chatRepo.addMessage(chatId, msg);
          this.onMessageUpdate?.({ chatId, message: msg, done: true });
          if (msg.role === 'assistant') {
            currentAssistant = null;
          }
          break;
        }
        case 'tool_executed':
          // 仅 UI 提示（缓存命中标记），实际 message 仍从 message_done 走
          break;
        case 'max_iterations_reached': {
          const msg: MessageDTO = {
            role: 'assistant',
            content: '[Agent 达到最大迭代次数，已停止]',
            timestamp: timestamp(),
            personaId: input.personaId,
          };
          await this.chatRepo.addMessage(chatId, msg);
          this.onMessageUpdate?.({ chatId, message: msg, done: true });
          break;
        }
        case 'error': {
          const msg: MessageDTO = {
            role: 'assistant',
            content: `[Agent 错误：${ev.error}]`,
            timestamp: timestamp(),
            personaId: input.personaId,
          };
          await this.chatRepo.addMessage(chatId, msg);
          this.onMessageUpdate?.({ chatId, message: msg, done: true });
          break;
        }
        default:
          break;
      }
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

  /**
   * 记忆摘要：把 tool 消息过滤掉；assistant.toolCalls 降维为占位文本
   */
  private async summarizeMessages(
    messages: MessageDTO[],
    currentMemory: string
  ): Promise<string> {
    const conversation = messages
      .map((m) => {
        if (m.role === 'tool') return null;
        if (m.role === 'assistant') {
          const toolNote =
            m.toolCalls && m.toolCalls.length > 0
              ? `[调用工具: ${m.toolCalls.map((t) => t.name).join(', ')}] `
              : '';
          return `assistant: ${toolNote}${m.content}`;
        }
        return `user: ${m.content}`;
      })
      .filter((x): x is string => !!x)
      .join('\n');

    const prompt = MEMORY_SUMMARIZER_PROMPT
      .replace('{memory}', currentMemory)
      .replace('{conversation}', conversation);

    const apiMessages: ChatMessage[] = [
      { role: 'user', content: prompt },
    ];

    return this.apiRepo.chatComplete({ messages: apiMessages });
  }
}
