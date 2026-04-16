/**
 * 轻量人物索引（personae-index.json）
 * @description 列表/通讯录只读索引，避免对每个 SKILL.md 全文读取；正文仍按需 getSkillContent
 */

/** 与数据目录下的 personae/ 并列 */
export const PERSONA_INDEX_FILENAME = 'personae-index.json';

export interface PersonaIndexEntry {
  id: string;
  displayName: string;
  description: string;
  tags: string[];
  /** 相对 persona 目录的路径，如 avatar.png；null 表示未在索引中记录，可回退探测文件 */
  avatarPath: string | null;
}

export interface PersonaIndexFile {
  version: number;
  entries: PersonaIndexEntry[];
}

export function parsePersonaIndexJson(raw: string): PersonaIndexFile | null {
  try {
    const data = JSON.parse(raw) as PersonaIndexFile;
    if (!data || typeof data.version !== 'number' || !Array.isArray(data.entries)) {
      return null;
    }
    return {
      version: data.version,
      entries: data.entries.map((e) => ({
        id: String(e.id),
        displayName: String(e.displayName ?? ''),
        description: typeof e.description === 'string' ? e.description : '',
        tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
        avatarPath:
          e.avatarPath === undefined || e.avatarPath === null ? null : String(e.avatarPath),
      })),
    };
  } catch {
    return null;
  }
}

export function serializePersonaIndex(index: PersonaIndexFile): string {
  return JSON.stringify(index, null, 2);
}
