/**
 * Mock 平台适配器
 * @description 用于测试环境的模拟实现，所有数据存储在内存中
 */
import type { IPlatformAdapter, FilePickerOptions } from './IPlatformAdapter';

/**
 * 内存文件系统模拟
 */
class InMemoryFileSystem {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set(['/']);

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    // 确保父目录存在
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      this.dirs.add(current);
    }
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
    // 创建父目录
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      this.dirs.add(current);
    }
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async listDir(path: string): Promise<string[]> {
    const result: string[] = [];
    const prefix = path.endsWith('/') ? path : path + '/';

    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relative = filePath.slice(prefix.length);
        const firstSlash = relative.indexOf('/');
        const name = firstSlash === -1 ? relative : relative.slice(0, firstSlash);
        if (name && !result.includes(name)) {
          result.push(name);
        }
      }
    }

    for (const dir of this.dirs) {
      if (dir.startsWith(prefix) && dir !== path) {
        const relative = dir.slice(prefix.length);
        const firstSlash = relative.indexOf('/');
        const name = firstSlash === -1 ? relative : relative.slice(0, firstSlash);
        if (name && !result.includes(name)) {
          result.push(name);
        }
      }
    }

    return result;
  }

  clear(): void {
    this.files.clear();
    this.dirs.clear();
    this.dirs.add('/');
  }
}

export class MockAdapter implements IPlatformAdapter {
  private dataDir = '/mock-data';
  private fs: InMemoryFileSystem;

  constructor() {
    this.fs = new InMemoryFileSystem();
  }

  async getDataDir(): Promise<string> {
    return this.dataDir;
  }

  async getLogsDir(): Promise<string> {
    return '/mock-logs';
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async openFilePicker(_options?: FilePickerOptions): Promise<string | null> {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async openFolder(_path: string): Promise<void> {
    // Mock: no-op
  }

  async readFile(path: string): Promise<string> {
    return this.fs.readFile(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.fs.writeFile(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.fs.exists(path);
  }

  async mkdir(path: string): Promise<void> {
    await this.fs.mkdir(path);
  }

  async deleteFile(path: string): Promise<void> {
    await this.fs.deleteFile(path);
  }

  async listDir(path: string): Promise<string[]> {
    return this.fs.listDir(path);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setSecureKey(_key: string, _value: string): Promise<void> {
    // Mock: no-op
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSecureKey(_key: string): Promise<string | null> {
    return null;
  }

  /**
   * 重置模拟文件系统（用于测试）
   */
  reset(): void {
    this.fs.clear();
  }

  /**
   * 预设模拟数据（用于测试）
   */
  setDataDir(path: string): void {
    this.dataDir = path;
  }
}
