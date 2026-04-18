import { describe, expect, it, vi } from 'vitest';
import { ToolResultCache, CACHE_TTL_MS, canonicalStringify } from './ToolResultCache';
import type { IPlatformAdapter } from '../infrastructure/platforms/IPlatformAdapter';
import type { ITool } from './types';

function createMemoryPlatform() {
  const files = new Map<string, string>();
  const platform: Partial<IPlatformAdapter> = {
    getDataDir: vi.fn().mockResolvedValue('C:/mindround-data'),
    exists: vi.fn(async (path: string) => files.has(path)),
    readFile: vi.fn(async (path: string) => {
      const data = files.get(path);
      if (data == null) throw new Error('ENOENT');
      return data;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
  };
  return { platform: platform as IPlatformAdapter, files };
}

const CACHEABLE_TOOL: ITool = {
  name: 'read_file',
  description: 'read',
  parameters: { type: 'object' },
  permission: 'readonly-sandbox',
  cacheable: true,
  run: vi.fn(),
};

const NON_CACHE_TOOL: ITool = {
  name: 'write_file',
  description: 'write',
  parameters: { type: 'object' },
  permission: 'write',
  cacheable: false,
  run: vi.fn(),
};

describe('ToolResultCache', () => {
  it('参数顺序不同仍命中同一 key', async () => {
    const { platform } = createMemoryPlatform();
    const cache = new ToolResultCache(platform, () => Date.now(), async (raw) => raw);

    await cache.set('chat-1', CACHEABLE_TOOL, { b: 2, a: 1 }, 'ok');
    const hit = await cache.get('chat-1', CACHEABLE_TOOL, { a: 1, b: 2 });

    expect(hit).toBe('ok');
  });

  it('超过 14 天 TTL 不命中', async () => {
    const { platform } = createMemoryPlatform();
    let now = 1_000_000;
    const cache = new ToolResultCache(platform, () => now, async (raw) => raw);

    await cache.set('chat-ttl', CACHEABLE_TOOL, { path: 'a.md' }, 'stale');
    now += CACHE_TTL_MS + 1;
    const hit = await cache.get('chat-ttl', CACHEABLE_TOOL, { path: 'a.md' });

    expect(hit).toBeNull();
  });

  it('写类工具不缓存', async () => {
    const { platform, files } = createMemoryPlatform();
    const cache = new ToolResultCache(platform, () => Date.now(), async (raw) => raw);

    await cache.set('chat-write', NON_CACHE_TOOL, { path: 'note.md' }, 'noop');
    const hit = await cache.get('chat-write', NON_CACHE_TOOL, { path: 'note.md' });

    expect(hit).toBeNull();
    expect(files.size).toBe(0);
  });

  it('canonicalStringify 结果稳定', () => {
    expect(canonicalStringify({ b: 2, a: 1, c: { z: 1, y: 2 } })).toBe(
      canonicalStringify({ c: { y: 2, z: 1 }, a: 1, b: 2 })
    );
  });

  it('缓存命中时进程内镜像避免再次 readFile', async () => {
    const { platform } = createMemoryPlatform();
    const cache = new ToolResultCache(platform, () => Date.now(), async (raw) => raw);

    await cache.set('chat-mem', CACHEABLE_TOOL, { path: 'a.md' }, 'body');
    await cache.get('chat-mem', CACHEABLE_TOOL, { path: 'a.md' });
    const readFile = platform.readFile as ReturnType<typeof vi.fn>;
    readFile.mockClear();
    const hit = await cache.get('chat-mem', CACHEABLE_TOOL, { path: 'a.md' });

    expect(hit).toBe('body');
    expect(readFile).not.toHaveBeenCalled();
  });
});
