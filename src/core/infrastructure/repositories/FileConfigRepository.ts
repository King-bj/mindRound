/**
 * 文件系统配置仓储
 * @description 基于 settings.json 的配置持久化实现
 */
import type { IConfigRepository, AppConfig } from '../../repositories/IConfigRepository';
import { DEFAULT_CONFIG } from '../../repositories/IConfigRepository';
import type { IPlatformAdapter } from '../platforms/IPlatformAdapter';

export class FileConfigRepository implements IConfigRepository {
  constructor(private platform: IPlatformAdapter) {}

  private get configPath(): string {
    return `${this.platform.getDataDir()}/settings.json`;
  }

  async get(): Promise<AppConfig> {
    try {
      const content = await this.platform.readFile(this.configPath);
      const saved = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...saved };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  async update(config: Partial<AppConfig>): Promise<void> {
    const current = await this.get();
    const updated = { ...current, ...config };
    await this.platform.writeFile(this.configPath, JSON.stringify(updated, null, 2));
  }

  async getApiKey(): Promise<string> {
    const config = await this.get();
    return config.apiKey;
  }

  async setApiKey(key: string): Promise<void> {
    await this.update({ apiKey: key });
  }
}
