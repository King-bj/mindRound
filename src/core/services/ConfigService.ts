/**
 * 配置服务
 * @description 封装应用配置的读取和更新逻辑
 */
import type { AppConfig } from '../repositories/IConfigRepository';
import type { IConfigRepository } from '../repositories/IConfigRepository';

/**
 * 配置服务接口
 */
export interface IConfigService {
  /**
   * 获取当前配置
   * @returns 应用配置
   */
  get(): Promise<AppConfig>;

  /**
   * 更新配置
   * @param config - 要更新的配置（部分更新）
   */
  update(config: Partial<AppConfig>): Promise<void>;

  /**
   * 获取 API 密钥
   * @returns API 密钥
   */
  getApiKey(): Promise<string>;

  /**
   * 设置 API 密钥
   * @param key - API 密钥
   */
  setApiKey(key: string): Promise<void>;
}

/**
 * 配置服务实现
 */
export class ConfigService implements IConfigService {
  constructor(private configRepo: IConfigRepository) {}

  async get(): Promise<AppConfig> {
    return this.configRepo.get();
  }

  async update(config: Partial<AppConfig>): Promise<void> {
    return this.configRepo.update(config);
  }

  async getApiKey(): Promise<string> {
    return this.configRepo.getApiKey();
  }

  async setApiKey(key: string): Promise<void> {
    return this.configRepo.setApiKey(key);
  }
}
