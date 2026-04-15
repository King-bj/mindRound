/**
 * 人格实体
 * @description 表示一个作者人格，包含名称、描述和技能文件
 */
export interface Persona {
  /** 人格 ID（目录名） */
  id: string;
  /** 人格名称 */
  name: string;
  /** 人格描述 */
  description: string;
  /** 头像路径（可选） */
  avatar: string | null;
  /** 标签列表 */
  tags: string[];
}

/**
 * SKILL.md 元数据（解析 frontmatter 获得）
 */
export interface SkillMetadata {
  /** 人格名称 */
  name: string;
  /** 人格描述 */
  description: string;
  /** 标签 */
  tags?: string[];
}

/**
 * 解析 SKILL.md 的 frontmatter
 * @param content - SKILL.md 文件内容
 * @returns 解析后的元数据
 */
export function parseSkillFrontmatter(content: string): SkillMetadata {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return {
      name: '',
      description: '',
      tags: [],
    };
  }

  const frontmatter = frontmatterMatch[1];
  const result: SkillMetadata = {
    name: '',
    description: '',
    tags: [],
  };

  const lines = frontmatter.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key === 'name') {
      result.name = value;
    } else if (key === 'description') {
      result.description = value;
    } else if (key === 'tags') {
      // 解析 tags: [tag1, tag2] 或 tags: tag1, tag2
      const tagsMatch = value.match(/\[(.*)\]/);
      if (tagsMatch) {
        result.tags = tagsMatch[1].split(',').map((t) => t.trim());
      } else if (value) {
        result.tags = value.split(',').map((t) => t.trim());
      }
    }
  }

  return result;
}

/**
 * 从 SKILL.md 内容创建 Persona
 * @param id - 人格 ID（目录名）
 * @param skillContent - SKILL.md 内容
 * @param avatarPath - 头像路径
 * @returns Persona 实体
 */
export function createPersonaFromSkill(
  id: string,
  skillContent: string,
  avatarPath: string | null
): Persona {
  const metadata = parseSkillFrontmatter(skillContent);

  return {
    id,
    name: metadata.name || id,
    description: metadata.description || '',
    avatar: avatarPath,
    tags: metadata.tags || [],
  };
}
