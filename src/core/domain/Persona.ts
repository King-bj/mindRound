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
  /** 人格显示名称（中文） */
  displayName: string;
  /** 人格描述 */
  description: string;
  /** 标签 */
  tags?: string[];
}

/**
 * 解析 SKILL.md 的 frontmatter
 * @description 支持 YAML 多行块标量语法（| preserved, > folded）
 * @param content - SKILL.md 文件内容
 * @returns 解析后的元数据
 */
export function parseSkillFrontmatter(content: string): SkillMetadata {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return {
      name: '',
      displayName: '',
      description: '',
      tags: [],
    };
  }

  const frontmatter = frontmatterMatch[1];
  const result: SkillMetadata = {
    name: '',
    displayName: '',
    description: '',
    tags: [],
  };

  const lines = frontmatter.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (value === '|' || value === '>') {
      // YAML 多行块标量：收集后续缩进行
      const isFolded = value === '>';
      const blockLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        // 缩进行属于块标量（空行也保留）
        if (nextLine === '' || nextLine.startsWith('  ') || nextLine.startsWith('\t')) {
          blockLines.push(nextLine);
          i++;
        } else {
          break;
        }
      }
      const blockContent = parseBlockScalar(blockLines, isFolded);
      applyValue(result, key, blockContent);
    } else if (value.startsWith('|') || value.startsWith('>')) {
      // 块标量带修饰符（如 |-）
      const isFolded = value.startsWith('>');
      const blockLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine === '' || nextLine.startsWith('  ') || nextLine.startsWith('\t')) {
          blockLines.push(nextLine);
          i++;
        } else {
          break;
        }
      }
      const blockContent = parseBlockScalar(blockLines, isFolded);
      applyValue(result, key, blockContent);
    } else {
      applyValue(result, key, value);
      i++;
    }
  }

  return result;
}

/**
 * 解析 YAML 块标量内容
 * @param lines - 缩进行的数组
 * @param folded - 是否为折叠模式（>）
 * @returns 解析后的字符串
 */
function parseBlockScalar(lines: string[], folded: boolean): string {
  // 去除每行的公共缩进
  const minIndent = lines.reduce((min, line) => {
    if (line === '') return min;
    const indent = line.search(/\S/);
    return indent >= 0 ? Math.min(min, indent) : min;
  }, Infinity);

  const dedentedLines = lines.map((line) => {
    if (line === '') return '';
    return line.slice(minIndent === Infinity ? 0 : minIndent);
  });

  if (folded) {
    // > folded 模式：单换行变空格，空行保留
    let result = '';
    for (let j = 0; j < dedentedLines.length; j++) {
      if (dedentedLines[j] === '') {
        result += '\n';
      } else if (j > 0 && dedentedLines[j - 1] !== '') {
        result += ' ' + dedentedLines[j];
      } else {
        result += dedentedLines[j];
      }
    }
    return result.trim();
  } else {
    // | preserved 模式：保留换行
    return dedentedLines.join('\n').trim();
  }
}

/**
 * 将解析的值应用到 result 对象
 * @param result - 目标元数据对象
 * @param key - 字段名
 * @param value - 字段值
 */
function applyValue(result: SkillMetadata, key: string, value: string): void {
  if (key === 'name') {
    result.name = value;
  } else if (key === 'displayName') {
    result.displayName = value;
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
    name: metadata.displayName || metadata.name || id,
    description: metadata.description || '',
    avatar: avatarPath,
    tags: metadata.tags || [],
  };
}
