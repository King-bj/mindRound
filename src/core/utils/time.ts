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
