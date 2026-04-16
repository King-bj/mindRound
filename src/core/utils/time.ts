/**
 * 时间工具
 */

/**
 * 生成 ISO 格式时间戳
 * @returns ISO 8601 格式时间戳
 */
export function timestamp(): string {
  return new Date().toISOString();
}

/**
 * 格式化相对时间显示
 * @param timestamp - ISO 时间戳
 * @returns 相对时间字符串（如"今天14:23"、"昨天"、"3天前"）
 */
export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
}
