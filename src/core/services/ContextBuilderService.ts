/**
 * 上下文构建服务
 * @description 按 30 分钟时间窗 + 人物卡 + 记忆，组装供 Agent 或 LLM 直调的上下文；
 * 群聊走圆桌映射：他人发言转成 user [名字]: 前缀；tool 轨迹一律过滤掉
 */
import type { Chat } from '../domain/Chat';
import type { MessageDTO } from '../domain/Chat';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IPersonaRepository } from '../repositories/IPersonaRepository';
import { DEFAULT_TIME_WINDOW_MINUTES } from '../utils/constants';
import { timestamp as isoNow } from '../utils';
import { stripModelThinkBlocks } from '../utils/messageContent';

/**
 * 上下文选项
 */
export interface ContextOptions {
  timeWindowMinutes: number;
  includeMemory: boolean;
  includeSkill: boolean;
}

const DEFAULT_OPTIONS: ContextOptions = {
  timeWindowMinutes: DEFAULT_TIME_WINDOW_MINUTES,
  includeMemory: true,
  includeSkill: true,
};

/**
 * 单聊上下文
 */
export interface Context {
  /** 时间窗内的消息（OpenAI 线格式） */
  messages: MessageDTO[];
  /** 记忆内容 */
  memory: string;
  /** 人格 SKILL 内容 */
  skill: string;
}

/**
 * 群聊单轮上下文（给 Agent）
 */
export interface GroupRoundContext {
  /** 已圆桌映射的 MessageDTO（末尾含 finalInstruction 作为 user 消息） */
  messages: MessageDTO[];
  /** system：人格 SKILL + 圆桌场景说明 */
  system: string;
}

/**
 * 圆桌模式收尾 user 指令：硬约束答用户 + 软引导交锋
 * @param speakerOrderIndex - 本轮中从 0 起，0 为首位人格
 * @param userQuestion - 时间窗内最后一条用户消息全文
 * @param previousSpeakerName - 上一位人格显示名；缺失时走降级文案
 * @param lockedPersonaName - 本轮唯一角色显示名（身份锁定）
 */
export function buildFinalInstruction(
  speakerOrderIndex: number,
  userQuestion: string,
  previousSpeakerName: string | null,
  lockedPersonaName: string
): string {
  const lock =
    `【身份锁定】本轮你唯一对应的角色是「${lockedPersonaName.trim() || '（见系统说明）'}」。` +
    `禁止以圆桌内其他任一人物的第一人称自称或冒充。\n\n`;
  const q = userQuestion.trim() || '（见上文[观众]消息）';
  const base = `【当前讨论焦点】用户[观众]提出的问题/陈述是："${q}"。`;

  if (speakerOrderIndex === 0) {
    return (
      lock +
      base +
      `你是本轮讨论的首位发言人。请围绕上述焦点，给出你角色最核心、最独特的观点。`
    );
  }

  const prev = previousSpeakerName?.trim();
  if (!prev) {
    return (
      lock +
      base +
      `请继续发言。**首要任务**：你必须先针对用户[观众]的问题提出你的见解。**绝对禁止**抛开用户问题只讨论他人的发言。在阐述完核心观点后，你可以简短地回应其他参与者已发表的看法。保持角色性格。`
    );
  }

  return (
    lock +
    base +
    `在上一段发言中，${prev} 已经发表了看法。

**【你的发言结构要求】**
1. **首要任务**：你必须先针对用户[观众]的问题，提出你的见解（同意、反对或补充）。**绝对禁止**抛开用户问题只讨论他人的发言。
2. **互动加分**：在阐述完你的核心观点后，你可以简短地回应 ${prev} 的观点（例如：「关于${prev}提到的...，我倒觉得...」或「我不同意${prev}的看法，因为...」）。

记住：你是在参与一场**头脑风暴**，既要贡献自己的想法，也要聆听他人的声音。保持角色性格。`
  );
}

/**
 * 将仓库消息映射为圆桌 MessageDTO：他人 assistant → user 带 [名字] 前缀；
 * 过滤掉所有 role==='tool' 与 assistant.toolCalls（圆桌不共享工具轨迹）
 */
export function mapGroupHistoryToAgentMessages(
  raw: MessageDTO[],
  currentPersonaId: string,
  personaDisplayNames: Record<string, string>
): MessageDTO[] {
  const out: MessageDTO[] = [];
  for (const msg of raw) {
    if (msg.role === 'tool') continue;
    if (msg.role === 'user') {
      out.push({
        role: 'user',
        content: `[观众]：${msg.content}`,
        timestamp: msg.timestamp,
      });
    } else if (msg.role === 'assistant') {
      const pid = msg.personaId ?? '';
      const body = stripModelThinkBlocks(msg.content);
      if (pid === currentPersonaId) {
        if (!body.trim()) continue;
        out.push({
          role: 'assistant',
          content: body,
          timestamp: msg.timestamp,
          personaId: pid,
        });
      } else {
        const label = (personaDisplayNames[pid] ?? pid) || '其他参与者';
        if (!body.trim()) continue;
        out.push({
          role: 'user',
          content: `[${label}]：${body}`,
          timestamp: msg.timestamp,
        });
      }
    }
  }
  return out;
}

/**
 * 时间窗内最后一条用户消息
 */
export function getLastUserMessageContent(messages: MessageDTO[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  return '';
}

/** 置于 SKILL 正文之前，避免长人格文档淹没「本轮是谁」 */
function buildRoundtableSystemLead(personaName: string, otherPersonaNames: string): string {
  return `[圆桌身份 — 必读]
本轮你唯一对应的角色是「${personaName}」。其他在场者仅作语境参考：${otherPersonaNames}。禁止在输出中混淆或冒用他人身份。

`;
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
   */
  async buildForChat(chat: Chat): Promise<Context> {
    const personaId = chat.personaIds[0];
    return this.buildContext(chat.id, personaId);
  }

  /**
   * 为群聊构建上下文（原始 DTO）
   */
  async buildForGroup(chat: Chat, currentPersonaId: string): Promise<Context> {
    return this.buildContext(chat.id, currentPersonaId);
  }

  /**
   * 构建群聊单轮「圆桌」Agent 上下文
   */
  async buildGroupRoundContext(
    chat: Chat,
    currentPersonaId: string,
    speakerOrderIndex: number,
    personaDisplayNames: Record<string, string>
  ): Promise<GroupRoundContext> {
    const rawMessages = await this.buildMessageContext(chat.id);
    const skill = this.options.includeSkill
      ? await this.personaRepo.getSkillContent(currentPersonaId)
      : '';

    const personaName = personaDisplayNames[currentPersonaId] ?? currentPersonaId;
    const otherIds = chat.personaIds.filter((id) => id !== currentPersonaId);
    const otherNames =
      otherIds.map((id) => personaDisplayNames[id] ?? id).join('、') || '（暂无）';

    const system =
      buildRoundtableSystemLead(personaName, otherNames) +
      skill +
      buildRoundtableSystemAppend(personaName, otherNames);

    const mapped = mapGroupHistoryToAgentMessages(
      rawMessages,
      currentPersonaId,
      personaDisplayNames
    );
    const userQuestion = getLastUserMessageContent(rawMessages);
    const prevId = speakerOrderIndex > 0 ? chat.personaIds[speakerOrderIndex - 1] : null;
    const prevName = prevId ? personaDisplayNames[prevId] ?? prevId : null;
    const finalInstruction = buildFinalInstruction(
      speakerOrderIndex,
      userQuestion,
      prevName,
      personaName
    );

    return {
      messages: [
        ...mapped,
        {
          role: 'user',
          content: finalInstruction,
          timestamp: isoNow(),
        },
      ],
      system,
    };
  }

  private async buildContext(chatId: string, personaId: string): Promise<Context> {
    const [messages, memory, skill] = await Promise.all([
      this.buildMessageContext(chatId),
      this.options.includeMemory ? this.chatRepo.getMemory(chatId) : Promise.resolve(''),
      this.options.includeSkill
        ? this.personaRepo.getSkillContent(personaId)
        : Promise.resolve(''),
    ]);

    return { messages, memory, skill };
  }

  private async buildMessageContext(chatId: string): Promise<MessageDTO[]> {
    const allMessages = await this.chatRepo.getMessages(chatId);
    const cutoff = new Date(Date.now() - this.options.timeWindowMinutes * 60 * 1000);

    return allMessages.filter((msg) => {
      const msgTime = new Date(msg.timestamp);
      return msgTime >= cutoff;
    });
  }

  updateOptions(options: Partial<ContextOptions>): void {
    Object.assign(this.options, options);
  }
}
