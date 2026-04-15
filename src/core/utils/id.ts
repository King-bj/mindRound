/**
 * ID 生成工具
 */

/**
 * 生成唯一 ID
 * @param prefix - 可选前缀
 * @returns 唯一 ID 字符串
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 11);
  const id = `${timestamp}-${random}`;
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * 生成聊天会话 ID
 * @returns 聊天 ID
 */
export function generateChatId(): string {
  return generateId('chat');
}
