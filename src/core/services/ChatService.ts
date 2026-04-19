/**
 * 聊天服务
 * @description 核心业务：用户发消息 → Agent Loop（含工具调用）→ 持久化 + 流式通知 UI；
 * 群聊按 personaIds 顺序让每位成员各走一次 Agent。
 */
import type { Chat, MessageDTO } from '../domain/Chat';
import { createChat } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IPersonaRepository } from '../repositories/IPersonaRepository';
import type { ContextBuilderService } from './ContextBuilderService';
import type { IMemoryService } from './MemoryService';
import type { Agent } from '../agent/Agent';
import type { AgentInput } from '../agent/types';
import { mergeToolCallDelta } from '../agent/types';
import { timestamp } from '../utils';

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
    private contextBuilder: ContextBuilderService,
    private personaRepo: IPersonaRepository,
    private agent: Agent,
    private memoryService: IMemoryService
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

    this.memoryService.summarizeAndSave(chat).catch((err) => {
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
    const { id: _omitId, ...payload } = createChat('single', personaId, [personaId]);
    void _omitId;
    return this.chatRepo.create(payload);
  }

  async createGroupChat(title: string, personaIds: string[]): Promise<Chat> {
    if (personaIds.length < 2) {
      throw new Error('Group chat requires at least 2 personas');
    }
    const { id: _omitId, ...payload } = createChat('group', title, personaIds);
    void _omitId;
    return this.chatRepo.create(payload);
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
    const input: AgentInput = {
      system: context.system,
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
   * Agent 每轮先 yield message_start，此处仅补全 toolCalls 数组。
   */
  private prepareStreamingAssistant(
    current: MessageDTO | null,
    withToolCalls: boolean
  ): MessageDTO {
    if (!current) {
      throw new Error('Agent must emit message_start before text_delta or tool_call_*');
    }
    if (withToolCalls && current.toolCalls === undefined) {
      current.toolCalls = [];
    }
    return current;
  }

  /**
   * 消费 Agent 流式事件：
   * - 对 assistant 文本，边流边推送给 UI（done=false，经短节流合并）
   * - 完整的 assistant / tool 消息在 agent 产生 message_done 时写入仓库与 UI
   */
  private async runAgent(chatId: string, input: AgentInput): Promise<void> {
    let currentAssistant: MessageDTO | null = null;

    let streamUiTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingStreamEvent: MessageUpdateEvent | null = null;

    const scheduleStreamUiUpdate = (event: MessageUpdateEvent): void => {
      pendingStreamEvent = event;
      if (streamUiTimer != null) return;
      streamUiTimer = setTimeout(() => {
        streamUiTimer = null;
        const ev = pendingStreamEvent;
        pendingStreamEvent = null;
        if (ev) this.onMessageUpdate?.(ev);
      }, 24);
    };

    const flushStreamUiUpdate = (): void => {
      if (streamUiTimer != null) {
        clearTimeout(streamUiTimer);
        streamUiTimer = null;
      }
      const ev = pendingStreamEvent;
      pendingStreamEvent = null;
      if (ev) this.onMessageUpdate?.(ev);
    };

    try {
      for await (const ev of this.agent.run(input)) {
        switch (ev.type) {
          case 'message_start': {
            if (ev.role !== 'assistant') break;
            currentAssistant = {
              role: 'assistant',
              content: '',
              timestamp: ev.timestamp,
              personaId: ev.personaId,
              turnId: ev.turnId,
            };
            break;
          }
          case 'text_delta': {
            currentAssistant = this.prepareStreamingAssistant(
              currentAssistant,
              false
            );
            currentAssistant.content += ev.text;
            scheduleStreamUiUpdate({
              chatId,
              message: currentAssistant,
              done: false,
            });
            break;
          }
          case 'tool_call_start': {
            currentAssistant = this.prepareStreamingAssistant(
              currentAssistant,
              true
            );
            const calls = [...(currentAssistant.toolCalls ?? [])];
            mergeToolCallDelta(calls, {
              index: ev.index,
              name: ev.name,
            });
            currentAssistant.toolCalls = calls;
            scheduleStreamUiUpdate({
              chatId,
              message: currentAssistant,
              done: false,
            });
            break;
          }
          case 'tool_call_arguments_delta': {
            currentAssistant = this.prepareStreamingAssistant(
              currentAssistant,
              true
            );
            const calls = [...(currentAssistant.toolCalls ?? [])];
            mergeToolCallDelta(calls, {
              index: ev.index,
              argumentsDelta: ev.argumentsDelta,
            });
            currentAssistant.toolCalls = calls;
            scheduleStreamUiUpdate({
              chatId,
              message: currentAssistant,
              done: false,
            });
            break;
          }
          case 'message_done': {
            flushStreamUiUpdate();
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
            flushStreamUiUpdate();
            const msg: MessageDTO = {
              role: 'assistant',
              content: '[Agent 达到最大迭代次数，已停止]',
              timestamp: timestamp(),
              personaId: input.personaId,
              turnId: ev.turnId,
            };
            await this.chatRepo.addMessage(chatId, msg);
            this.onMessageUpdate?.({ chatId, message: msg, done: true });
            break;
          }
          case 'error': {
            flushStreamUiUpdate();
            const msg: MessageDTO = {
              role: 'assistant',
              content: `[Agent 错误：${ev.error}]`,
              timestamp: timestamp(),
              personaId: input.personaId,
              turnId: ev.turnId,
            };
            await this.chatRepo.addMessage(chatId, msg);
            this.onMessageUpdate?.({ chatId, message: msg, done: true });
            break;
          }
          default:
            break;
        }
      }
    } finally {
      flushStreamUiUpdate();
    }
  }
}
