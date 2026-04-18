/**
 * 时间工具单测
 */
import { describe, it, expect } from 'vitest';
import { buildDateInstruction } from './time';

describe('buildDateInstruction', () => {
  it('按 Asia/Shanghai 输出 YYYY-MM-DD 与固定文案', () => {
    const fixed = new Date('2026-04-18T04:00:00.000Z');
    const s = buildDateInstruction(fixed);
    expect(s).toContain('[当前日期]');
    expect(s).toContain('2026-04-18');
    expect(s).toContain('UTC+8');
    expect(s).toContain('不要使用过期年份');
  });
});
