/**
 * 在系统默认浏览器 / 默认应用中打开 URL（Tauri 用 opener 插件；浏览器开发环境回退到 window.open）
 */
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauriRuntime } from '../../core/agent/invoke';

/**
 * 是否允许交给系统打开的绝对 URL（拦截 javascript: 等）
 */
function isSafeSystemUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const p = u.protocol.toLowerCase();
    return p === 'http:' || p === 'https:' || p === 'mailto:' || p === 'tel:';
  } catch {
    return false;
  }
}

/** Markdown 等场景：是否应对点击使用系统默认应用打开 */
export function shouldOpenExternally(href: string | undefined): boolean {
  if (!href) return false;
  return isSafeSystemUrl(href);
}

/**
 * @param url - 待打开的绝对地址
 */
export async function openInDefaultBrowser(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed || !isSafeSystemUrl(trimmed)) return;

  if (isTauriRuntime()) {
    await openUrl(trimmed);
    return;
  }
  window.open(trimmed, '_blank', 'noopener,noreferrer');
}
