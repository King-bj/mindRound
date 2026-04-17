/**
 * 长上下文裁剪
 * @description 对已经走完 30 分钟时间窗的消息列表做进一步折叠：
 * 1. 最近 2 轮 assistant 的工具轨迹（assistant.toolCalls + 对应 tool 消息）保留完整内容
 * 2. 更早的 `role:'tool'` 内容替换为占位字符串（保持协议对齐）
 * 3. 若仍超过 `maxMessages`（默认 50）则从前往后按 user 边界裁剪
 */
import type { MessageDTO } from '../domain/Chat';

export interface TrimOptions {
  /** 保留最近 N 轮 assistant 的完整工具轨迹 */
  keepRecentAssistantRounds: number;
  /** 最大消息数上限（超过则按 user 边界截断） */
  maxMessages: number;
  /** 折叠后 tool 内容的占位模板（${name} 会被替换为工具名） */
  placeholderTemplate: string;
}

export const DEFAULT_TRIM_OPTIONS: TrimOptions = {
  keepRecentAssistantRounds: 2,
  maxMessages: 50,
  placeholderTemplate: '[工具结果已折叠。如需请重新调用 ${name}]',
};

/**
 * 执行上下文裁剪
 */
export function trimMessages(
  messages: MessageDTO[],
  options: Partial<TrimOptions> = {}
): MessageDTO[] {
  const opts = { ...DEFAULT_TRIM_OPTIONS, ...options };
  const compacted = compactOldToolMessages(messages, opts);
  return capByUserBoundary(compacted, opts.maxMessages);
}

/**
 * 标记"保留完整工具轨迹"的分界点；分界点之前的 tool 消息内容替换为占位
 */
export function compactOldToolMessages(
  messages: MessageDTO[],
  options: TrimOptions = DEFAULT_TRIM_OPTIONS
): MessageDTO[] {
  if (messages.length === 0) return messages;

  // 从末尾反向走，数到 keepRecentAssistantRounds 个 assistant，之前的视为"旧轨迹"
  let seen = 0;
  let boundaryIndex = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      seen++;
      if (seen >= options.keepRecentAssistantRounds) {
        boundaryIndex = i;
        break;
      }
    }
  }

  // 若 assistant 数量不足 keepRecent，则全部保留
  if (seen < options.keepRecentAssistantRounds) {
    return messages;
  }

  return messages.map((m, i) => {
    if (i >= boundaryIndex) return m;
    if (m.role === 'tool') {
      return {
        ...m,
        content: options.placeholderTemplate.replace(
          '${name}',
          m.name ?? 'tool'
        ),
      };
    }
    return m;
  });
}

/**
 * 从列表头部按 user 边界截断到 `maxMessages` 以内
 * @description 不砍掉一半 assistant + tool 配对，确保 OpenAI 协议健康
 */
export function capByUserBoundary(
  messages: MessageDTO[],
  maxMessages: number
): MessageDTO[] {
  if (messages.length <= maxMessages) return messages;
  let start = messages.length - maxMessages;
  while (start < messages.length && messages[start].role !== 'user') {
    start++;
  }
  if (start >= messages.length) {
    // 没有 user 边界可用 → 保险起见保留最后一条
    return messages.slice(-1);
  }
  return messages.slice(start);
}
