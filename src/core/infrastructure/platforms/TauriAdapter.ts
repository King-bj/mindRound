/**
 * Tauri 平台适配器
 * @description 通过 Tauri invoke 调用 Rust 命令实现平台特定操作
 */
import { open } from '@tauri-apps/plugin-dialog';
import type { AppConfig } from '../../repositories/IConfigRepository';
import type { IPlatformAdapter, FilePickerOptions } from './IPlatformAdapter';
import { MockAdapter } from './MockAdapter';

// Tauri 全局类型声明（Tauri 2 默认仅注入 __TAURI_INTERNALS__，withGlobalTauri 开启时才有 __TAURI__）
declare global {
  interface Window {
    __TAURI__?: {
      invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
    __TAURI_INTERNALS__?: {
      invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

/**
 * 检查是否在 Tauri 环境中
 */
function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !!(w.__TAURI__ ?? w.__TAURI_INTERNALS__);
}

/**
 * Tauri 平台适配器
 * @description 在 Tauri 环境中通过 invoke 调用 Rust 后端命令
 */
export class TauriAdapter implements IPlatformAdapter {
  private dataDir: string | null = null;

  /**
   * 获取数据目录
   * @returns 数据目录的绝对路径
   */
  async getDataDir(): Promise<string> {
    if (this.dataDir) {
      return this.dataDir;
    }
    const result = await this.invoke<string>('get_data_dir_command');
    this.dataDir = result;
    return result;
  }

  invalidateDataDirCache(): void {
    this.dataDir = null;
  }

  async getSettingsFilePath(): Promise<string> {
    return this.invoke<string>('get_settings_file_path');
  }

  async loadAppConfig(): Promise<AppConfig> {
    return this.invoke<AppConfig>('get_config');
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    await this.invoke('update_config', { config });
  }

  async pickFolder(): Promise<string | null> {
    if (!isTauriEnvironment()) {
      return null;
    }
    const result = await open({ directory: true, multiple: false });
    if (result === null) {
      return null;
    }
    if (Array.isArray(result)) {
      return result[0] ?? null;
    }
    return result;
  }

  async migrateUserData(from: string, to: string): Promise<void> {
    await this.invoke('migrate_user_data', { from, to });
  }

  /**
   * 获取日志目录
   * @returns 日志目录的绝对路径
   */
  async getLogsDir(): Promise<string> {
    const dataDir = await this.getDataDir();
    return `${dataDir}/logs`;
  }

  /**
   * 打开文件选择器
   * @param options - 选择器选项（扩展名过滤等）
   * @returns 选择的文件路径，null 表示取消
   */
  async openFilePicker(options?: FilePickerOptions): Promise<string | null> {
    if (!isTauriEnvironment()) {
      return null;
    }
    const result = await open({
      multiple: false,
      directory: options?.directory ?? false,
      filters: options?.filters,
    });
    if (result === null) {
      return null;
    }
    return Array.isArray(result) ? result[0] ?? null : result;
  }

  /**
   * 打开文件夹
   * @param path - 文件夹路径
   */
  async openFolder(path: string): Promise<void> {
    await this.invoke('open_folder', { path });
  }

  /**
   * 读取文件内容
   * @param path - 文件路径
   * @returns 文件内容
   */
  async readFile(path: string): Promise<string> {
    return await this.invoke<string>('read_file', { path });
  }

  /**
   * 写入文件内容
   * @param path - 文件路径
   * @param content - 文件内容
   */
  async writeFile(path: string, content: string): Promise<void> {
    await this.invoke('write_file', { path, content });
  }

  /**
   * 检查文件是否存在
   * @param path - 文件路径
   * @returns 是否存在
   */
  async exists(path: string): Promise<boolean> {
    return await this.invoke<boolean>('file_exists', { path });
  }

  /**
   * 创建目录
   * @param path - 目录路径
   */
  async mkdir(path: string): Promise<void> {
    await this.invoke('create_dir', { path });
  }

  /**
   * 删除文件
   * @param path - 文件路径
   */
  async deleteFile(path: string): Promise<void> {
    await this.invoke('delete_file', { path });
  }

  /**
   * 列出目录内容
   * @param path - 目录路径
   * @returns 文件/目录名列表
   */
  async listDir(path: string): Promise<string[]> {
    return await this.invoke<string[]>('list_dir', { path });
  }

  /**
   * 设置安全密钥（预留）
   * @param _key - 密钥名
   * @param _value - 密钥值
   */
  async setSecureKey(key: string, value: string): Promise<void> {
    void key;
    void value;
    // TODO: 实现安全存储
    // Tauri 2.0 可以使用 @tauri-apps/plugin-secure-storage
    console.warn('[TauriAdapter] setSecureKey not implemented yet');
  }

  /**
   * 获取安全密钥（预留）
   * @param _key - 密钥名
   * @returns 密钥值，不存在返回 null
   */
  async getSecureKey(key: string): Promise<string | null> {
    void key;
    // TODO: 实现安全存储
    console.warn('[TauriAdapter] getSecureKey not implemented yet');
    return null;
  }

  /**
   * 调用 Tauri 命令的内部方法
   * @param cmd - 命令名
   * @param args - 命令参数
   * @returns 命令执行结果
   */
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauriEnvironment()) {
      throw new Error(`[TauriAdapter] Cannot call "${cmd}" outside Tauri environment`);
    }
    if (window.__TAURI__?.invoke) {
      return await window.__TAURI__.invoke<T>(cmd, args);
    }
    return await window.__TAURI_INTERNALS__!.invoke<T>(cmd, args ?? {});
  }
}

/**
 * 创建平台适配器
 * @description 根据环境自动选择 TauriAdapter 或 MockAdapter
 */
export function createPlatformAdapter(): IPlatformAdapter {
  if (isTauriEnvironment()) {
    console.log('[PlatformAdapter] Using TauriAdapter');
    return new TauriAdapter();
  }
  console.log('[PlatformAdapter] Using MockAdapter (non-Tauri environment)');
  return new MockAdapter();
}
