/**
 * 文件系统配置仓储
 * @description 基于 settings.json 的配置持久化实现
 */
import type { IConfigRepository, AppConfig } from '../../repositories/IConfigRepository';
import { DEFAULT_CONFIG } from '../../repositories/IConfigRepository';
import type { IPlatformAdapter } from '../platforms/IPlatformAdapter';

/**
 * Tauri `get_config` 等后端可能只返回部分字段；旧版 settings.json 也可能缺字段。
 * 必须与 DEFAULT 合并并保证数组/枚举合法，否则设置页访问 sandboxFolders 会抛错白屏。
 */
function mergeAppConfig(raw: Partial<AppConfig>): AppConfig {
  const merged = { ...DEFAULT_CONFIG, ...raw };
  const searchProvider: AppConfig['searchProvider'] =
    merged.searchProvider === 'tavily' ||
    merged.searchProvider === 'serper' ||
    merged.searchProvider === 'ddg'
      ? merged.searchProvider
      : DEFAULT_CONFIG.searchProvider;
  const sandboxFolders = Array.isArray(merged.sandboxFolders)
    ? merged.sandboxFolders.filter((p): p is string => typeof p === 'string')
    : DEFAULT_CONFIG.sandboxFolders;
  return {
    ...merged,
    searchProvider,
    searchApiKey:
      typeof merged.searchApiKey === 'string'
        ? merged.searchApiKey
        : DEFAULT_CONFIG.searchApiKey,
    sandboxFolders,
  };
}

export class FileConfigRepository implements IConfigRepository {
  constructor(private platform: IPlatformAdapter) {}

  /**
   * 获取配置文件路径
   * @returns 配置文件的绝对路径
   */
  async get(): Promise<AppConfig> {
    try {
      const raw = await this.platform.loadAppConfig();
      return mergeAppConfig(raw);
    } catch (err) {
      console.error('[FileConfigRepository] loadAppConfig failed:', err);
      return { ...DEFAULT_CONFIG };
    }
  }

  async update(config: Partial<AppConfig>): Promise<void> {
    const current = await this.get();
    const updated = { ...current, ...config };
    await this.platform.saveAppConfig(updated);
  }

  async getApiKey(): Promise<string> {
    const config = await this.get();
    return config.apiKey;
  }

  async setApiKey(key: string): Promise<void> {
    await this.update({ apiKey: key });
  }
}
