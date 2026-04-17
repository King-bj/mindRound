/**
 * 配置仓储接口
 * @description 定义应用配置的持久化操作
 */

/**
 * 应用配置
 */
export interface AppConfig {
  /** API 基础 URL */
  apiBaseUrl: string;
  /** API 密钥 */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** 数据目录路径 */
  dataDir: string;
  /** 搜索引擎（Agent 工具） */
  searchProvider: 'ddg' | 'tavily' | 'serper';
  /** 搜索引擎 API Key（DDG 不需要） */
  searchApiKey: string;
  /** 用户额外添加的 sandbox 工作目录（自动包含 dataDir） */
  sandboxFolders: string[];
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: AppConfig = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  dataDir: '',
  searchProvider: 'ddg',
  searchApiKey: '',
  sandboxFolders: [],
};

export interface IConfigRepository {
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
   * 获取 API 密钥（预留安全存储）
   * @returns API 密钥
   */
  getApiKey(): Promise<string>;

  /**
   * 设置 API 密钥（预留安全存储）
   * @param key - API 密钥
   */
  setApiKey(key: string): Promise<void>;
}
