import { describe, it, expect } from 'vitest';
import {
  parseSkillFrontmatter,
  createPersonaFromSkill,
} from './Persona';

describe('Persona', () => {
  describe('parseSkillFrontmatter', () => {
    it('should parse valid frontmatter with name and description', () => {
      const content = `---
name: 乔布斯
description: 苹果联合创始人
---
You are a product designer...`;

      const metadata = parseSkillFrontmatter(content);

      expect(metadata.name).toBe('乔布斯');
      expect(metadata.description).toBe('苹果联合创始人');
    });

    it('should parse frontmatter with tags array', () => {
      const content = `---
name: 马斯克
description: 特斯拉CEO
tags: [创新, 科技, 太空]
---
You are an entrepreneur...`;

      const metadata = parseSkillFrontmatter(content);

      expect(metadata.name).toBe('马斯克');
      expect(metadata.tags).toEqual(['创新', '科技', '太空']);
    });

    it('should parse frontmatter with comma-separated tags', () => {
      const content = `---
name: 测试
description: Test
tags: tag1, tag2, tag3
---
Content here`;

      const metadata = parseSkillFrontmatter(content);

      expect(metadata.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return empty values when no frontmatter', () => {
      const content = `No frontmatter here
Just plain content`;

      const metadata = parseSkillFrontmatter(content);

      expect(metadata.name).toBe('');
      expect(metadata.description).toBe('');
      expect(metadata.tags).toEqual([]);
    });

    it('should handle partial frontmatter', () => {
      const content = `---
name: 仅名称
---
Content without description`;

      const metadata = parseSkillFrontmatter(content);

      expect(metadata.name).toBe('仅名称');
      expect(metadata.description).toBe('');
    });

    it('should handle empty frontmatter', () => {
      const content = `---
---
Content after empty frontmatter`;

      const metadata = parseSkillFrontmatter(content);

      expect(metadata.name).toBe('');
      expect(metadata.description).toBe('');
    });

    it('should parse YAML multiline block scalar (| preserved)', () => {
      const content = `---
name: steve-jobs-perspective
displayName: 乔布斯
description: |
  史蒂夫·乔布斯的思维框架与表达方式。
  用途：作为思维顾问。
  第三行内容。
---
Content here`;

      const metadata = parseSkillFrontmatter(content);

      expect(metadata.name).toBe('steve-jobs-perspective');
      expect(metadata.displayName).toBe('乔布斯');
      expect(metadata.description).toContain('史蒂夫·乔布斯的思维框架');
      expect(metadata.description).toContain('第三行内容');
    });

    it('should parse displayName field', () => {
      const content = `---
name: feynman-perspective
displayName: 费曼
description: 物理学家
---
Content`;

      const metadata = parseSkillFrontmatter(content);

      expect(metadata.name).toBe('feynman-perspective');
      expect(metadata.displayName).toBe('费曼');
    });
  });

  describe('createPersonaFromSkill', () => {
    const skillContent = `---
name: 乔布斯
description: 苹果联合创始人
tags: [设计, 创新]
---

You are Steve Jobs...`;

    it('should create persona with parsed metadata', () => {
      const persona = createPersonaFromSkill('steve-jobs', skillContent, null);

      expect(persona.id).toBe('steve-jobs');
      expect(persona.name).toBe('乔布斯');
      expect(persona.description).toBe('苹果联合创始人');
      expect(persona.tags).toEqual(['设计', '创新']);
      expect(persona.avatar).toBeNull();
    });

    it('should prefer displayName over name', () => {
      const contentWithDisplayName = `---
name: feynman-perspective
displayName: 费曼
description: 物理学家
---
Content`;

      const persona = createPersonaFromSkill('feynman-skill', contentWithDisplayName, null);

      expect(persona.name).toBe('费曼');
    });

    it('should use id as fallback name when not in frontmatter', () => {
      const contentWithoutName = `---
description: No name here
---
Content`;

      const persona = createPersonaFromSkill('my-persona-id', contentWithoutName, null);

      expect(persona.name).toBe('my-persona-id');
    });

    it('should set avatar when provided', () => {
      const avatar = '/path/to/avatar.png';
      const persona = createPersonaFromSkill('test', skillContent, avatar);

      expect(persona.avatar).toBe(avatar);
    });

    it('should handle empty tags when not provided', () => {
      const contentNoTags = `---
name: Test
description: Test desc
---
Content`;

      const persona = createPersonaFromSkill('test', contentNoTags, null);

      expect(persona.tags).toEqual([]);
    });
  });
});
