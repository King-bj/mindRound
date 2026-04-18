/**
 * 系统浏览器打开 URL 工具单测
 */
import { describe, it, expect } from 'vitest';
import { shouldOpenExternally } from './openInDefaultBrowser';

describe('shouldOpenExternally', () => {
  it('允许 http(s) / mailto / tel', () => {
    expect(shouldOpenExternally('https://example.com/x')).toBe(true);
    expect(shouldOpenExternally('http://localhost:5173')).toBe(true);
    expect(shouldOpenExternally('mailto:a@b.com')).toBe(true);
    expect(shouldOpenExternally('tel:+1')).toBe(true);
  });

  it('拒绝 javascript: 与相对路径', () => {
    expect(shouldOpenExternally('javascript:alert(1)')).toBe(false);
    expect(shouldOpenExternally('/docs')).toBe(false);
    expect(shouldOpenExternally('')).toBe(false);
    expect(shouldOpenExternally(undefined)).toBe(false);
  });
});
