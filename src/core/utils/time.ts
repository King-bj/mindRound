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
/**
 * 生成注入到 Agent system prompt 的「当前日期」说明（按 Asia/Shanghai，即 UTC+8）。
 * @description 避免模型用训练数据里的过期年份构造 `web_search` 查询词。
 * @param now - 可选基准时间（默认 `new Date()`），便于单测注入固定时刻
 * @returns 一段中文系统指令，末尾无多余换行
 */
export function buildDateInstruction(now: Date = new Date()): string {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return (
    `[当前日期]\n` +
    `今天是 ${dateStr}（UTC+8）。涉及「最新 / 最近 / 现在」的查询，请围绕这个日期理解时间，不要使用过期年份。`
  );
}

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
