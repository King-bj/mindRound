/**
 * 平台适配器接口
 * @description 抽象平台特定操作，隔离平台差异
 */
export interface FilePickerOptions {
  /** 允许的文件类型 */
  filters?: { name: string; extensions: string[] }[];
  /** 是否选择目录 */
  directory?: boolean;
}

export interface IPlatformAdapter {
  /**
   * 获取数据目录路径
   * @returns 数据目录的绝对路径
   */
  getDataDir(): Promise<string>;

  /**
   * `settings.json` 绝对路径（固定于应用数据目录，与内容根分离）
   */
  getSettingsFilePath(): Promise<string>;

  /**
   * 原生文件夹选择对话框
   * @returns 所选目录绝对路径，取消则为 null
   */
  pickFolder(): Promise<string | null>;

  /**
   * 将 personae/chats 从旧内容根迁移到新根（Tauri 专用）
   */
  migrateUserData?(from: string, to: string): Promise<void>;

  /**
   * 清除 getDataDir 缓存，配置中的 dataDir 变更后调用
   */
  invalidateDataDirCache?(): void;

  /**
   * 获取日志目录路径
   * @returns 日志目录的绝对路径
   */
  getLogsDir(): Promise<string>;

  /**
   * 打开文件选择器
   * @param options - 选择器选项
   * @returns 选择的文件路径，null 表示取消
   */
  openFilePicker(options?: FilePickerOptions): Promise<string | null>;

  /**
   * 打开文件夹
   * @param path - 文件夹路径
   */
  openFolder(path: string): Promise<void>;

  /**
   * 读取文件内容
   * @param path - 文件路径
   * @returns 文件内容
   */
  readFile(path: string): Promise<string>;

  /**
   * 写入文件内容
   * @param path - 文件路径
   * @param content - 文件内容
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * 检查文件是否存在
   * @param path - 文件路径
   * @returns 是否存在
   */
  exists(path: string): Promise<boolean>;

  /**
   * 创建目录
   * @param path - 目录路径
   */
  mkdir(path: string): Promise<void>;

  /**
   * 删除文件
   * @param path - 文件路径
   */
  deleteFile(path: string): Promise<void>;

  /**
   * 列出目录内容
   * @param path - 目录路径
   * @returns 文件/目录名列表
   */
  listDir(path: string): Promise<string[]>;

  /**
   * 设置安全密钥（预留）
   * @param key - 密钥名
   * @param value - 密钥值
   */
  setSecureKey(key: string, value: string): Promise<void>;

  /**
   * 获取安全密钥（预留）
   * @param key - 密钥名
   * @returns 密钥值，不存在返回 null
   */
  getSecureKey(key: string): Promise<string | null>;
}
