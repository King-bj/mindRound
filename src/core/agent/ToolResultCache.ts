/**
 * 工具结果缓存
 * @description Per-chat 持久化，避免多轮对话里重复执行同一查询/读取
 */
import type { ITool } from './types';
import type { IPlatformAdapter } from '../infrastructure/platforms/IPlatformAdapter';

/** 缓存 TTL：14 天 */
export const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  /** 工具名 */
  name: string;
  /** 参数规范化 JSON（便于 debug；实际命中仅看 key） */
  argsPreview: string;
  /** 缓存内容 */
  content: string;
  /** 写入时间戳（ms） */
  ts: number;
}

type CacheFile = Record<string, CacheEntry>;

export interface IToolResultCache {
  get(
    chatId: string,
    tool: ITool,
    args: Record<string, unknown>
  ): Promise<string | null>;
  set(
    chatId: string,
    tool: ITool,
    args: Record<string, unknown>,
    content: string
  ): Promise<void>;
}

export class ToolResultCache implements IToolResultCache {
  /** 同 chatId 的并发 set 串行化，避免同一文件读写竞争 */
  private writeQueue = new Map<string, Promise<void>>();

  /** 进程内镜像，减少同一会话反复读盘/解析 */
  private memByChat = new Map<string, CacheFile>();

  constructor(
    private platform: IPlatformAdapter,
    /** 可注入的时钟，便于测试 TTL */
    private now: () => number = Date.now,
    /** 可注入的哈希函数（默认 Web Crypto SHA-256），便于测试 */
    private hasher: (input: string) => Promise<string> = defaultSha256
  ) {}

  async get(
    chatId: string,
    tool: ITool,
    args: Record<string, unknown>
  ): Promise<string | null> {
    if (!tool.cacheable) return null;
    const key = await this.key(tool, args);
    const file = await this.readFile(chatId);
    const entry = file[key];
    if (!entry) return null;
    if (this.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.content;
  }

  async set(
    chatId: string,
    tool: ITool,
    args: Record<string, unknown>,
    content: string
  ): Promise<void> {
    if (!tool.cacheable) return;
    const pending = this.writeQueue.get(chatId) ?? Promise.resolve();
    const next = pending.then(async () => {
      const key = await this.key(tool, args);
      const file = await this.readFile(chatId);
      file[key] = {
        name: tool.name,
        argsPreview: canonicalStringify(args).slice(0, 200),
        content,
        ts: this.now(),
      };
      await this.writeFile(chatId, file);
    });
    this.writeQueue.set(
      chatId,
      next.finally(() => {
        if (this.writeQueue.get(chatId) === next) this.writeQueue.delete(chatId);
      })
    );
    return next;
  }

  private async key(
    tool: ITool,
    args: Record<string, unknown>
  ): Promise<string> {
    const raw = `${tool.name}\u0000${canonicalStringify(args)}`;
    return this.hasher(raw);
  }

  private async cachePath(chatId: string): Promise<string> {
    const dataDir = await this.platform.getDataDir();
    return `${dataDir}/chats/${chatId}/tool_cache.json`;
  }

  private async readFile(chatId: string): Promise<CacheFile> {
    const cached = this.memByChat.get(chatId);
    if (cached) return cached;

    const path = await this.cachePath(chatId);
    if (!(await this.platform.exists(path))) {
      this.memByChat.set(chatId, {});
      return {};
    }
    try {
      const raw = await this.platform.readFile(path);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        console.warn(`[ToolResultCache] JSON 解析失败，忽略缓存: ${path}`, e);
        this.memByChat.set(chatId, {});
        return {};
      }
      if (!isCacheFile(parsed)) {
        console.warn(`[ToolResultCache] 缓存文件结构无效，忽略: ${path}`);
        this.memByChat.set(chatId, {});
        return {};
      }
      this.memByChat.set(chatId, parsed);
      return parsed;
    } catch (e) {
      console.warn(`[ToolResultCache] 读取缓存失败 (${chatId}):`, e);
      this.memByChat.set(chatId, {});
      return {};
    }
  }

  private async writeFile(chatId: string, data: CacheFile): Promise<void> {
    this.memByChat.set(chatId, data);
    const path = await this.cachePath(chatId);
    await this.platform.writeFile(path, JSON.stringify(data, null, 2));
  }
}

/**
 * 规范化 JSON：对象按 key 排序，数组保持原序；递归处理
 */
export function canonicalStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    return '[' + v.map((x) => canonicalStringify(x)).join(',') + ']';
  }
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`)
      .join(',') +
    '}'
  );
}

/** Web Crypto SHA-256 → hex 字符串 */
export async function defaultSha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const arr = new Uint8Array(hash);
  let hex = '';
  for (const b of arr) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function isCacheFile(v: unknown): v is CacheFile {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
