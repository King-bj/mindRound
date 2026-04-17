/**
 * 文件系统配置仓储
 * @description 基于 settings.json 的配置持久化实现
 */
import type { IConfigRepository, AppConfig } from '../../repositories/IConfigRepository';
import { DEFAULT_CONFIG } from '../../repositories/IConfigRepository';
import type { IPlatformAdapter } from '../platforms/IPlatformAdapter';

export class FileConfigRepository implements IConfigRepository {
  constructor(private platform: IPlatformAdapter) {}

  /**
   * 获取配置文件路径
   * @returns 配置文件的绝对路径
   */
  async get(): Promise<AppConfig> {
    try {
      return await this.platform.loadAppConfig();
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
