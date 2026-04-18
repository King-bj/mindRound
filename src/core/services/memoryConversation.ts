/**
 * 长期记忆摘要：提示词与会话文本格式化
 * @description 由 MemoryService 使用；ChatService 仅通过 IMemoryService 触发摘要，不直接依赖本模块
 */
import type { MessageDTO } from '../domain/Chat';
import { MEMORY_IDLE_THRESHOLD_MS } from '../utils/constants';
import { stripModelThinkBlocks } from '../utils/messageContent';

/** 记忆摘要提示词模板 */
export const MEMORY_SUMMARIZER_PROMPT = `你是一名记忆整理助手。根据对话历史，提取关键信息追加到现有记忆中。
现有记忆：
{memory}

新对话：
{conversation}

请输出更新后的完整记忆（Markdown 格式）。`;

/**
 * 是否满足「会话空闲」条件，可触发记忆摘要
 * @note 若在用户一轮对话刚结束立刻调用，最后一条消息时间戳通常很新，本检查多为 false；需要摘要时应用定时器、单独入口或调整判定（例如相对「上一轮」尾部）。
 */
export function isIdleEnoughForMemory(
  messages: MessageDTO[],
  nowMs: number = Date.now()
): boolean {
  if (messages.length < 2) return false;
  const last = messages[messages.length - 1];
  return nowMs - new Date(last.timestamp).getTime() >= MEMORY_IDLE_THRESHOLD_MS;
}

/**
 * 将消息历史格式化为记忆摘要用的对话文本
 * @description 过滤 tool；assistant 的 toolCalls 降维为占位；正文剥离思考块
 */
export function formatConversationForMemorySummary(messages: MessageDTO[]): string {
  return messages
    .map((m) => {
      if (m.role === 'tool') return null;
      if (m.role === 'assistant') {
        const toolNote =
          m.toolCalls && m.toolCalls.length > 0
            ? `[调用工具: ${m.toolCalls.map((t) => t.name).join(', ')}] `
            : '';
        const body = stripModelThinkBlocks(m.content);
        return `assistant: ${toolNote}${body}`;
      }
      return `user: ${m.content}`;
    })
    .filter((x): x is string => !!x)
    .join('\n');
}
