/**
 * 记忆实体
 * @description 表示会话的长期记忆内容
 */
export interface Memory {
  /** 会话 ID */
  chatId: string;
  /** 记忆内容（Markdown 格式） */
  content: string;
  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * 创建空记忆
 * @param chatId - 会话 ID
 * @returns 空的记忆对象
 */
export function createEmptyMemory(chatId: string): Memory {
  const now = new Date().toISOString();
  return {
    chatId,
    content: '# 对话记忆\n',
    updatedAt: now,
  };
}

/**
 * 更新记忆内容
 * @param memory - 记忆对象
 * @param content - 新内容
 * @returns 更新后的记忆
 */
export function updateMemoryContent(memory: Memory, content: string): Memory {
  return {
    ...memory,
    content,
    updatedAt: new Date().toISOString(),
  };
}
