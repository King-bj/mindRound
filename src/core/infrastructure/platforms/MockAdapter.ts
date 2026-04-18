/**
 * Mock 平台适配器
 * @description 用于测试环境的模拟实现，所有数据存储在内存中
 */
import { createPersonaFromSkill } from '../../domain/Persona';
import { serializePersonaIndex, type PersonaIndexFile } from '../../domain/PersonaIndex';
import type { AppConfig } from '../../repositories/IConfigRepository';
import { DEFAULT_CONFIG } from '../../repositories/IConfigRepository';
import type { IPlatformAdapter, FilePickerOptions } from './IPlatformAdapter';

// 使用 Vite import.meta.glob 动态导入所有 persona SKILL.md 文件
const personaModules = import.meta.glob('../../personae/*/SKILL.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/**
 * 内存文件系统模拟
 */
class InMemoryFileSystem {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set(['/']);

  async writeFile(path: string, content: string): Promise<void> {
    this.writeFileSync(path, content);
  }

  writeFileSync(path: string, content: string): void {
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
    this.mkdirSync(path);
  }

  mkdirSync(path: string): void {
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

  listFiles(): string[] {
    return [...this.files.keys()];
  }
}

export class MockAdapter implements IPlatformAdapter {
  private dataDir = '/mock-data';
  /** 与内容根分离，模拟存储根下的 settings.json / credentials.json */
  private readonly settingsFilePath = '/mock-app-data/settings.json';
  private readonly credentialsFilePath = '/mock-app-data/credentials.json';
  private fs: InMemoryFileSystem;

  constructor() {
    this.fs = new InMemoryFileSystem();
    this.preloadBuiltInPersonasSync();
  }

  /**
   * 预加载内置 Persona 到内存文件系统（同步）
   * @description 使用 import.meta.glob 动态扫描 personae/ 目录
   */
  private preloadBuiltInPersonasSync(): void {
    // 从 glob 路径中提取 persona ID 并写入文件系统
    // 路径格式: ../../personae/{id}/SKILL.md
    const personaPattern = /personae\/([^/]+)\/SKILL\.md$/;

    this.fs.mkdirSync(`${this.dataDir}/personae`);

    const indexEntries: PersonaIndexFile['entries'] = [];

    for (const [path, content] of Object.entries(personaModules)) {
      const match = path.match(personaPattern);
      if (match) {
        const id = match[1];
        const personaDir = `${this.dataDir}/personae/${id}`;
        this.fs.mkdirSync(personaDir);
        this.fs.writeFileSync(`${personaDir}/SKILL.md`, content);
        const p = createPersonaFromSkill(id, content, null);
        indexEntries.push({
          id,
          displayName: p.name,
          description: p.description,
          tags: p.tags,
          avatarPath: null,
        });
      }
    }

    indexEntries.sort((a, b) => a.id.localeCompare(b.id));
    const indexFile: PersonaIndexFile = { version: 1, entries: indexEntries };
    this.fs.writeFileSync(`${this.dataDir}/personae-index.json`, serializePersonaIndex(indexFile));
  }

  async getDataDir(): Promise<string> {
    return this.dataDir;
  }

  invalidateDataDirCache(): void {
    // 内存模式无缓存
  }

  async getSettingsFilePath(): Promise<string> {
    return this.settingsFilePath;
  }

  async loadAppConfig(): Promise<AppConfig> {
    const merged: AppConfig = { ...DEFAULT_CONFIG };
    try {
      const raw = await this.readFile(this.settingsFilePath);
      const s = JSON.parse(raw) as Partial<AppConfig>;
      if (typeof s.apiBaseUrl === 'string') merged.apiBaseUrl = s.apiBaseUrl;
      if (typeof s.model === 'string') merged.model = s.model;
      if (typeof s.dataDir === 'string') merged.dataDir = s.dataDir;
      if (s.searchProvider === 'tavily' || s.searchProvider === 'serper' || s.searchProvider === 'ddg') {
        merged.searchProvider = s.searchProvider;
      }
      if (typeof s.searchApiKey === 'string') merged.searchApiKey = s.searchApiKey;
      if (Array.isArray(s.sandboxFolders)) {
        merged.sandboxFolders = s.sandboxFolders.filter((p): p is string => typeof p === 'string');
      }
    } catch {
      /* 缺失或非 JSON */
    }
    try {
      const raw = await this.readFile(this.credentialsFilePath);
      const c = JSON.parse(raw) as { apiKey?: string };
      if (typeof c.apiKey === 'string') merged.apiKey = c.apiKey;
    } catch {
      /* 缺失 */
    }
    if (!merged.dataDir?.trim()) {
      merged.dataDir = await this.getDataDir();
    }
    return merged;
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    await this.mkdir('/mock-app-data');
    const { apiKey, ...rest } = config;
    await this.writeFile(this.settingsFilePath, JSON.stringify(rest, null, 2));
    await this.writeFile(this.credentialsFilePath, JSON.stringify({ apiKey }, null, 2));
  }

  async pickFolder(): Promise<string | null> {
    return null;
  }

  async migrateUserData(from: string, to: string): Promise<void> {
    void from;
    void to;
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
