/**
 * Tauri invoke 薄包装：统一环境校验
 */
import { invoke as tauriInvoke } from '@tauri-apps/api/core';

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !!(w.__TAURI__ ?? w.__TAURI_INTERNALS__);
}

/**
 * 调用 Tauri 命令；非 Tauri 环境直接抛错，避免静默失败
 */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`[agent] 无法在非 Tauri 环境调用 "${cmd}"`);
  }
  return tauriInvoke<T>(cmd, args);
}
