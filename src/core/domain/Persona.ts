/**
 * 人格实体（Skill Discovery Card / Manifest）
 * @description 对应 Anthropic Agent Skills 协议中的 Level 1 信息：
 * 仅 frontmatter 中的 name + description + tags 等元数据，不含 SKILL.md 正文。
 * 圆桌中其他在场者只暴露这层信息，避免长文本互相污染。
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
 * Skill Level 3 资源元数据
 * @description references/** 与 examples/** 下的可按需读取文件。
 * 通过 list_skill_resources / read_skill_resource 工具暴露给模型。
 * 不携带 size 字段以避免列举时的额外 IO；read_skill_resource 自带上限。
 */
export interface SkillResource {
  /** 资源类别：references 表示研究材料，examples 表示示例对话/输出 */
  kind: 'reference' | 'example';
  /** 相对 skill 目录的路径，如 "references/research/01-writings.md" */
  relPath: string;
}

/**
 * Skill 资源根目录前缀白名单
 * @description Level 3 仅允许从 references/ 与 examples/ 读取，避免
 * 模型通过相对路径越界访问其他人格目录或宿主敏感文件。
 */
export const SKILL_RESOURCE_ROOTS = ['references', 'examples'] as const;

/**
 * 校验 Skill 资源相对路径合法性，非法时抛错
 * @description 防御点：
 * - 必须是相对路径（拒绝绝对路径 / 盘符 / 反斜杠）
 * - 不允许 `..` 段做路径穿越
 * - 必须以 references/ 或 examples/ 开头
 * - 至少要有一段子路径（不能裸目录）
 * @param relPath - 调用者提供的相对路径
 */
export function assertSafeSkillResourcePath(relPath: string): void {
  if (typeof relPath !== 'string') {
    throw new Error('skill resource path 必须是字符串');
  }
  const trimmed = relPath.trim();
  if (trimmed === '') {
    throw new Error('skill resource path 不可为空');
  }
  if (trimmed.includes('\\')) {
    throw new Error(`skill resource path 不允许反斜杠：${relPath}`);
  }
  if (trimmed.startsWith('/')) {
    throw new Error(`skill resource path 必须为相对路径：${relPath}`);
  }
  // 拒绝 Windows 盘符（C:）
  if (/^[a-zA-Z]:/.test(trimmed)) {
    throw new Error(`skill resource path 必须为相对路径：${relPath}`);
  }
  const segments = trimmed.split('/');
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') {
      throw new Error(`skill resource path 含非法段「${seg}」：${relPath}`);
    }
  }
  const root = segments[0];
  if (!(SKILL_RESOURCE_ROOTS as readonly string[]).includes(root)) {
    throw new Error(
      `skill resource path 必须以 ${SKILL_RESOURCE_ROOTS.join(' / ')} 开头：${relPath}`
    );
  }
  if (segments.length < 2) {
    throw new Error(`skill resource path 缺少子路径：${relPath}`);
  }
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
