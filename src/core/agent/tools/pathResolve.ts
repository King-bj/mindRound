/**
 * Agent 文件工具的路径归一化
 * @description 模型给的 `path` 入参可能是三种形态：
 * 1. 绝对路径（Windows 盘符 / POSIX `/` / UNC `\\?\`）—— 原样保留，沿用旧的 sandbox 校验。
 * 2. 含目录分隔符的相对路径（如 `personae/foo/avatar.png`）—— 拼到数据目录下，
 *    调用方已经表达"我知道在哪个子目录"，无需递归。
 * 3. 裸文件名（如 `mindRound-from-zero-to-one.md`）—— 在 dataDir 下递归查找：
 *    - 0 个匹配：报错
 *    - >=1 个匹配：选 mtime 最新的那一个（Rust 侧已按 mtime 降序排列）
 *
 * @see [src-tauri/src/commands/fs.rs] agent_resolve_data_path
 */
import { invoke } from '../invoke';

/** Rust agent_resolve_data_path 的返回 */
interface ResolveDataPathResult {
  matches: string[];
}

/**
 * 是否绝对路径
 * @description 同时识别 Windows 盘符（`C:\` 或 `C:/`）、POSIX 绝对路径（`/`）、
 * UNC 路径（`\\?\` 或 `\\server\share`）。
 */
export function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  if (p.startsWith('/')) return true;
  if (p.startsWith('\\\\')) return true;
  return false;
}

/**
 * 是否裸文件名（不含任何目录分隔符）
 */
export function isBareName(p: string): boolean {
  return !p.includes('/') && !p.includes('\\');
}

/**
 * 把相对路径拼到数据目录下，归一化分隔符
 */
export function joinDataDir(dataDir: string, rel: string): string {
  const base = dataDir.replace(/[\\/]+$/, '');
  const tail = rel.replace(/^[\\/]+/, '');
  return `${base}/${tail}`;
}

/**
 * 解析 Agent 文件工具的 `path` 入参为绝对路径
 * @param input - 模型给的原始 path
 * @param dataDir - 数据目录绝对路径（来自 ToolRunContext.dataDir）
 * @param mode - 'read' 时裸文件名走递归查找；'write' 时直接落到 `dataDir/<name>`
 * @returns 归一化后的绝对路径字符串
 * @throws 当 mode='read' 且裸文件名查找命中 0 条时
 */
export async function resolveToolPath(
  input: string,
  dataDir: string,
  mode: 'read' | 'write' = 'read'
): Promise<string> {
  const p = (input ?? '').trim();
  if (!p) return p;
  if (isAbsolutePath(p)) return p;

  if (!isBareName(p)) {
    return joinDataDir(dataDir, p);
  }

  // 裸文件名：write 模式直接落到 dataDir 根；read 模式递归查找
  if (mode === 'write') {
    return joinDataDir(dataDir, p);
  }

  const r = await invoke<ResolveDataPathResult>('agent_resolve_data_path', {
    args: { name: p, data_dir: dataDir },
  });
  if (r.matches.length === 0) {
    throw new Error(`在数据目录下未找到文件：${p}`);
  }
  // 多个同名文件时，Rust 已按 mtime 降序返回，直接取最新的一条
  return r.matches[0];
}
