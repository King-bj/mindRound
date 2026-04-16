/**
 * 上下文构建服务
 * @description 根据 30 分钟时间窗口构建 API 请求上下文；群聊圆桌模式见 buildGroupRoundContext
 */
import type { Chat } from '../domain/Chat';
import type { MessageDTO } from '../domain/Chat';
import type { ChatMessage } from '../repositories/IApiRepository';
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

/**
 * 群聊单轮 API 上下文（已映射圆桌角色 + system + 收尾指令）
 */
export interface GroupRoundApiContext {
  /** 供 OpenAI 兼容 API 的 messages（含末尾 finalInstruction） */
  messages: ChatMessage[];
  /** system：人格 SKILL + 圆桌场景说明 */
  system: string;
}

/**
 * 圆桌模式收尾 user 指令：硬约束答用户 + 软引导交锋
 * @param speakerOrderIndex - 本轮中从 0 起，0 为首位人格
 * @param userQuestion - 时间窗内最后一条用户消息全文
 * @param previousSpeakerName - 上一位人格显示名；缺失时走降级文案
 */
export function buildFinalInstruction(
  speakerOrderIndex: number,
  userQuestion: string,
  previousSpeakerName: string | null
): string {
  const q = userQuestion.trim() || '（见上文[观众]消息）';
  const base = `【当前讨论焦点】用户[观众]提出的问题/陈述是："${q}"。`;

  if (speakerOrderIndex === 0) {
    return (
      base +
      `你是本轮讨论的首位发言人。请围绕上述焦点，给出你角色最核心、最独特的观点。`
    );
  }

  const prev = previousSpeakerName?.trim();
  if (!prev) {
    return (
      base +
      `请继续发言。**首要任务**：你必须先针对用户[观众]的问题提出你的见解。**绝对禁止**抛开用户问题只讨论他人的发言。在阐述完核心观点后，你可以简短地回应其他参与者已发表的看法。保持角色性格。`
    );
  }

  return (
    base +
    `在上一段发言中，${prev} 已经发表了看法。

**【你的发言结构要求】**
1. **首要任务**：你必须先针对用户[观众]的问题，提出你的见解（同意、反对或补充）。**绝对禁止**抛开用户问题只讨论他人的发言。
2. **互动加分**：在阐述完你的核心观点后，你可以简短地回应 ${prev} 的观点（例如：「关于${prev}提到的...，我倒觉得...」或「我不同意${prev}的看法，因为...」）。

记住：你是在参与一场**头脑风暴**，既要贡献自己的想法，也要聆听他人的声音。保持角色性格。`
  );
}

/**
 * 将仓库消息映射为圆桌 API 消息：他人 assistant → user 带标签
 */
export function mapGroupHistoryToApiMessages(
  raw: MessageDTO[],
  currentPersonaId: string,
  personaDisplayNames: Record<string, string>
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const msg of raw) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: `[观众]：${msg.content}` });
    } else if (msg.role === 'assistant') {
      const pid = msg.personaId ?? '';
      if (pid === currentPersonaId) {
        out.push({ role: 'assistant', content: msg.content });
      } else {
        const label = (personaDisplayNames[pid] ?? pid) || '其他参与者';
        out.push({ role: 'user', content: `[${label}]：${msg.content}` });
      }
    }
  }
  return out;
}

/**
 * 时间窗内最后一条用户消息（用于讨论焦点）
 */
export function getLastUserMessageContent(messages: MessageDTO[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  return '';
}

function buildRoundtableSystemAppend(personaName: string, otherPersonaNames: string): string {
  return `

[系统场景说明]
你现在身处一个名为「圆桌会谈」的多人群聊中。
你正在扮演：${personaName}。
你的听众既包括提出问题的[观众]，也包括其他几位正在旁听你发言的人格：${otherPersonaNames}。
请确保你的发言首先是说给[观众]听的答案，但你的语气和内容可以包含对其他在场者的回应。`;
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
   * 为群聊构建上下文（原始 DTO，与单聊共用逻辑；圆桌请求请用 buildGroupRoundContext）
   * @param chat - 会话
   * @param currentPersonaId - 当前发言的人格 ID
   * @returns 上下文
   */
  async buildForGroup(chat: Chat, currentPersonaId: string): Promise<Context> {
    return this.buildContext(chat.id, currentPersonaId);
  }

  /**
   * 构建群聊单轮「圆桌」API 上下文：角色重映射 + system + finalInstruction
   * @param chat - 群聊会话
   * @param currentPersonaId - 当前轮次发言的人格 ID
   * @param speakerOrderIndex - 本轮内顺序下标（0 起）
   * @param personaDisplayNames - 人格 id → 显示名（通常由通讯录 scan 一次得到）
   */
  async buildGroupRoundContext(
    chat: Chat,
    currentPersonaId: string,
    speakerOrderIndex: number,
    personaDisplayNames: Record<string, string>
  ): Promise<GroupRoundApiContext> {
    const rawMessages = await this.buildMessageContext(chat.id);
    const skill = this.options.includeSkill
      ? await this.personaRepo.getSkillContent(currentPersonaId)
      : '';

    const personaName = personaDisplayNames[currentPersonaId] ?? currentPersonaId;
    const otherIds = chat.personaIds.filter((id) => id !== currentPersonaId);
    const otherNames =
      otherIds.map((id) => personaDisplayNames[id] ?? id).join('、') || '（暂无）';

    const system = skill + buildRoundtableSystemAppend(personaName, otherNames);

    const mapped = mapGroupHistoryToApiMessages(rawMessages, currentPersonaId, personaDisplayNames);
    const userQuestion = getLastUserMessageContent(rawMessages);
    const prevId = speakerOrderIndex > 0 ? chat.personaIds[speakerOrderIndex - 1] : null;
    const prevName = prevId ? personaDisplayNames[prevId] ?? prevId : null;
    const finalInstruction = buildFinalInstruction(speakerOrderIndex, userQuestion, prevName);

    return {
      messages: [...mapped, { role: 'user', content: finalInstruction }],
      system,
    };
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
