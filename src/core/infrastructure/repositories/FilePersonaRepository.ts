/**
 * 文件系统人格仓储
 * @description 基于本地 personae 目录；列表依赖 personae-index.json，SKILL 正文仅 getSkillContent 按需读取
 */
import type { IPersonaRepository } from '../../repositories/IPersonaRepository';
import type { Persona, SkillResource } from '../../domain/Persona';
import {
  SKILL_RESOURCE_ROOTS,
  assertSafeSkillResourcePath,
  createPersonaFromSkill,
} from '../../domain/Persona';
import {
  type PersonaIndexEntry,
  type PersonaIndexFile,
  PERSONA_INDEX_FILENAME,
  parsePersonaIndexJson,
  serializePersonaIndex,
} from '../../domain/PersonaIndex';
import type { IPlatformAdapter } from '../platforms/IPlatformAdapter';

export class FilePersonaRepository implements IPersonaRepository {
  constructor(private platform: IPlatformAdapter) {}

  private async getPersonasDir(): Promise<string> {
    return `${await this.platform.getDataDir()}/personae`;
  }

  private async getIndexPath(): Promise<string> {
    return `${await this.platform.getDataDir()}/${PERSONA_INDEX_FILENAME}`;
  }

  private async resolveAvatarAbsolute(
    personasDir: string,
    id: string,
    indexAvatarPath: string | null
  ): Promise<string | null> {
    const base = `${personasDir}/${id}`;
    if (indexAvatarPath) {
      const p = `${base}/${indexAvatarPath}`;
      if (await this.platform.exists(p)) {
        return p;
      }
    }
    const fallback = `${base}/avatar.png`;
    if (await this.platform.exists(fallback)) {
      return fallback;
    }
    return null;
  }

  private personaFromIndexEntry(entry: PersonaIndexEntry, avatarAbs: string | null): Persona {
    return {
      id: entry.id,
      name: entry.displayName,
      description: entry.description,
      avatar: avatarAbs,
      tags: entry.tags,
    };
  }

  private async loadIndexFile(): Promise<PersonaIndexFile | null> {
    const path = await this.getIndexPath();
    if (!(await this.platform.exists(path))) {
      return null;
    }
    try {
      const raw = await this.platform.readFile(path);
      return parsePersonaIndexJson(raw);
    } catch {
      return null;
    }
  }

  private async saveIndexFile(index: PersonaIndexFile): Promise<void> {
    const path = await this.getIndexPath();
    await this.platform.writeFile(path, serializePersonaIndex(index));
  }

  /**
   * 遍历 personae 子目录，从 SKILL 解析并写回索引（迁移/无索引时）
   */
  private async rebuildIndexFromDisk(): Promise<PersonaIndexFile> {
    const personasDir = await this.getPersonasDir();
    const entries: PersonaIndexEntry[] = [];
    let dirNames: string[] = [];
    try {
      dirNames = await this.platform.listDir(personasDir);
    } catch {
      return { version: 1, entries: [] };
    }

    for (const id of dirNames) {
      const skillPath = `${personasDir}/${id}/SKILL.md`;
      if (!(await this.platform.exists(skillPath))) {
        continue;
      }
      const content = await this.platform.readFile(skillPath);
      const p = createPersonaFromSkill(id, content, null);
      const avatarPath = (await this.platform.exists(`${personasDir}/${id}/avatar.png`))
        ? 'avatar.png'
        : null;
      entries.push({
        id,
        displayName: p.name,
        description: p.description,
        tags: p.tags,
        avatarPath,
      });
    }
    entries.sort((a, b) => a.id.localeCompare(b.id));
    const file: PersonaIndexFile = { version: 1, entries };
    await this.saveIndexFile(file);
    return file;
  }

  async scan(): Promise<Persona[]> {
    try {
      const personasDir = await this.getPersonasDir();
      if (!(await this.platform.exists(personasDir))) {
        return [];
      }

      let index = await this.loadIndexFile();
      if (!index || index.entries.length === 0) {
        index = await this.rebuildIndexFromDisk();
      }

      const byId = new Map(index.entries.map((e) => [e.id, e] as const));
      let dirNames: string[] = [];
      try {
        dirNames = await this.platform.listDir(personasDir);
      } catch {
        return [];
      }

      const out: Persona[] = [];
      for (const id of dirNames.sort((a, b) => a.localeCompare(b))) {
        const skillPath = `${personasDir}/${id}/SKILL.md`;
        if (!(await this.platform.exists(skillPath))) {
          continue;
        }

        const entry = byId.get(id);
        if (entry) {
          const avatarAbs = await this.resolveAvatarAbsolute(personasDir, id, entry.avatarPath);
          out.push(this.personaFromIndexEntry(entry, avatarAbs));
        } else {
          const content = await this.platform.readFile(skillPath);
          const avatarAbs = await this.resolveAvatarAbsolute(personasDir, id, null);
          out.push(createPersonaFromSkill(id, content, avatarAbs));
        }
      }
      return out;
    } catch (err) {
      console.error('[FilePersonaRepository] scan() error:', err);
      return [];
    }
  }

  async findById(id: string): Promise<Persona | null> {
    try {
      const personasDir = await this.getPersonasDir();
      const skillPath = `${personasDir}/${id}/SKILL.md`;
      if (!(await this.platform.exists(skillPath))) {
        return null;
      }

      let index = await this.loadIndexFile();
      if (!index) {
        index = await this.rebuildIndexFromDisk();
      }
      const entry = index.entries.find((e) => e.id === id);
      if (entry) {
        const avatarAbs = await this.resolveAvatarAbsolute(personasDir, id, entry.avatarPath);
        return this.personaFromIndexEntry(entry, avatarAbs);
      }

      const content = await this.platform.readFile(skillPath);
      const avatarAbs = await this.resolveAvatarAbsolute(personasDir, id, null);
      return createPersonaFromSkill(id, content, avatarAbs);
    } catch {
      return null;
    }
  }

  async findAll(): Promise<Persona[]> {
    return this.scan();
  }

  async getSkillContent(personaId: string): Promise<string> {
    const personasDir = await this.getPersonasDir();
    const skillPath = `${personasDir}/${personaId}/SKILL.md`;
    return this.platform.readFile(skillPath);
  }

  async listSkillResources(skillId: string): Promise<SkillResource[]> {
    const personasDir = await this.getPersonasDir();
    const skillDir = `${personasDir}/${skillId}`;
    if (!(await this.platform.exists(skillDir))) {
      return [];
    }

    const out: SkillResource[] = [];
    for (const root of SKILL_RESOURCE_ROOTS) {
      const rootAbs = `${skillDir}/${root}`;
      if (!(await this.platform.exists(rootAbs))) {
        continue;
      }
      const kind: SkillResource['kind'] =
        root === 'references' ? 'reference' : 'example';
      await this.collectFiles(rootAbs, root, kind, out);
    }

    out.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return out;
  }

  async readSkillResource(skillId: string, relPath: string): Promise<string> {
    assertSafeSkillResourcePath(relPath);
    const personasDir = await this.getPersonasDir();
    const skillDir = `${personasDir}/${skillId}`;
    if (!(await this.platform.exists(skillDir))) {
      throw new Error(`skill 不存在：${skillId}`);
    }
    const target = `${skillDir}/${relPath}`;
    if (!(await this.platform.exists(target))) {
      throw new Error(`资源不存在：${relPath}`);
    }
    return this.platform.readFile(target);
  }

  /**
   * 递归采集目录下的资源文件
   * @description 跳过元文件（README/LICENSE/SKILL/avatar/二进制），
   * 通过尝试 listDir 来区分文件与目录，避免依赖 stat 接口。
   */
  private async collectFiles(
    absPath: string,
    relPath: string,
    kind: SkillResource['kind'],
    out: SkillResource[]
  ): Promise<void> {
    let names: string[];
    try {
      names = await this.platform.listDir(absPath);
    } catch {
      return;
    }
    for (const name of names) {
      if (isMetaName(name)) continue;
      const childAbs = `${absPath}/${name}`;
      const childRel = `${relPath}/${name}`;
      if (isLikelyDirectoryName(name)) {
        // 优先按"无扩展名"判定为目录，递归
        await this.collectFiles(childAbs, childRel, kind, out);
        continue;
      }
      // 走到这里默认按文件处理；若读不到正文则当目录尝试
      if (isTextResourceName(name)) {
        out.push({ kind, relPath: childRel });
        continue;
      }
      // 兜底：未知扩展名一律忽略，避免把图片等二进制塞给模型
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(_id: string): Promise<void> {
    throw new Error('Delete not implemented in MVP');
  }

  onChange?: (personas: Persona[]) => void;
}

/**
 * 跳过的元文件（不计入 Level 3 资源）
 * @description SKILL.md、README、LICENSE、avatar.* 在协议层有特殊语义，
 * 而 *.png/*.jpg 等二进制对模型也无意义。
 */
function isMetaName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === 'skill.md') return true;
  if (lower === 'readme.md' || lower === 'readme') return true;
  if (lower === 'license' || lower === 'license.md') return true;
  if (lower.startsWith('avatar.')) return true;
  if (lower === '.ds_store' || lower === 'thumbs.db') return true;
  return false;
}

/** 已知文本扩展名才视作可读资源 */
function isTextResourceName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.json') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.yml')
  );
}

/** 没有点号或以已知非文本结尾时按目录处理 */
function isLikelyDirectoryName(name: string): boolean {
  // 隐藏目录和无扩展名条目按目录尝试递归
  if (!name.includes('.')) return true;
  return false;
}
