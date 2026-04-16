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
  private async getConfigPath(): Promise<string> {
    return `${await this.platform.getDataDir()}/settings.json`;
  }

  async get(): Promise<AppConfig> {
    try {
      const configPath = await this.getConfigPath();
      const content = await this.platform.readFile(configPath);
      const saved = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...saved };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  async update(config: Partial<AppConfig>): Promise<void> {
    const current = await this.get();
    const updated = { ...current, ...config };
    const configPath = await this.getConfigPath();
    await this.platform.writeFile(configPath, JSON.stringify(updated, null, 2));
  }

  async getApiKey(): Promise<string> {
    const config = await this.get();
    return config.apiKey;
  }

  async setApiKey(key: string): Promise<void> {
    await this.update({ apiKey: key });
  }
}
