/**
 * 头像绝对路径 → WebView 可加载 URL
 * @description Tauri WebView 出于安全考虑不能直接加载 `file://` 或裸 Windows 路径，
 * 必须经 `convertFileSrc` 转成 `asset://localhost/...`。浏览器/移动端非 Tauri 环境下原样返回。
 */
import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * 是否在 Tauri WebView 中运行
 * @description Tauri 2 默认不注入 `window.__TAURI__`（需 `withGlobalTauri`），但会注入 `__TAURI_INTERNALS__`。
 */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !!(w.__TAURI__ ?? w.__TAURI_INTERNALS__);
}

/**
 * 把 persona.avatar 等"绝对文件路径"转成 `<img src>` 可用的 URL
 * @param absolutePath - 绝对路径；空值原样返回
 * @returns Tauri 下的 asset 协议 URL，或非 Tauri 下的原路径
 */
export function toAvatarDisplayUrl(absolutePath: string | null | undefined): string | null {
  if (!absolutePath) {
    return null;
  }
  if (isTauriRuntime()) {
    try {
      return convertFileSrc(absolutePath);
    } catch {
      return absolutePath;
    }
  }
  return absolutePath;
}
