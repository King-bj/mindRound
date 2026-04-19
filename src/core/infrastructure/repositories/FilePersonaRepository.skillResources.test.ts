import { describe, it, expect, beforeEach } from 'vitest';
import { FilePersonaRepository } from './FilePersonaRepository';
import { MockAdapter } from '../platforms/MockAdapter';

describe('FilePersonaRepository · Skill Resources', () => {
  let adapter: MockAdapter;
  let repo: FilePersonaRepository;
  const dataDir = '/test-data';
  const skillId = 'sample-skill';
  const skillRoot = `${dataDir}/personae/${skillId}`;

  beforeEach(async () => {
    adapter = new MockAdapter();
    adapter.reset();
    adapter.setDataDir(dataDir);
    await adapter.mkdir(`${dataDir}/personae`);
    await adapter.mkdir(skillRoot);
    await adapter.writeFile(
      `${skillRoot}/SKILL.md`,
      '---\nname: Sample\ndescription: 测试用\n---\n身份卡。'
    );
    await adapter.writeFile(`${skillRoot}/LICENSE`, 'MIT');
    await adapter.writeFile(`${skillRoot}/README.md`, '# README');
    await adapter.writeFile(`${skillRoot}/avatar.png`, 'fake binary');

    await adapter.mkdir(`${skillRoot}/references/research`);
    await adapter.writeFile(
      `${skillRoot}/references/research/01-writings.md`,
      '# 写作研究'
    );
    await adapter.writeFile(
      `${skillRoot}/references/research/02-conversations.md`,
      '# 对话研究'
    );
    await adapter.mkdir(`${skillRoot}/examples`);
    await adapter.writeFile(
      `${skillRoot}/examples/demo-2026.md`,
      '# 示例对话'
    );
    // 一个二进制噪音文件应被忽略（无文本扩展名）
    await adapter.writeFile(`${skillRoot}/examples/cover.jpg`, 'binary');

    repo = new FilePersonaRepository(adapter);
  });

  describe('listSkillResources', () => {
    it('递归列出 references/** 与 examples/** 下的文本资源', async () => {
      const list = await repo.listSkillResources(skillId);
      const paths = list.map((r) => r.relPath);

      expect(paths).toContain('references/research/01-writings.md');
      expect(paths).toContain('references/research/02-conversations.md');
      expect(paths).toContain('examples/demo-2026.md');
    });

    it('正确标注 kind 字段', async () => {
      const list = await repo.listSkillResources(skillId);
      const refs = list.filter((r) => r.kind === 'reference');
      const exs = list.filter((r) => r.kind === 'example');
      expect(refs.length).toBe(2);
      expect(exs.length).toBe(1);
    });

    it('跳过元文件（SKILL.md / README.md / LICENSE / avatar.*）', async () => {
      const list = await repo.listSkillResources(skillId);
      const paths = list.map((r) => r.relPath);
      expect(paths.every((p) => !p.endsWith('SKILL.md'))).toBe(true);
      expect(paths.every((p) => !p.toLowerCase().includes('readme'))).toBe(true);
      expect(paths.every((p) => !p.toLowerCase().includes('license'))).toBe(true);
      expect(paths.every((p) => !p.toLowerCase().includes('avatar'))).toBe(true);
    });

    it('忽略未知扩展名的文件（如 cover.jpg）', async () => {
      const list = await repo.listSkillResources(skillId);
      const paths = list.map((r) => r.relPath);
      expect(paths.every((p) => !p.endsWith('.jpg'))).toBe(true);
    });

    it('skill 不存在时返回空数组', async () => {
      const list = await repo.listSkillResources('not-exist');
      expect(list).toEqual([]);
    });

    it('结果按 relPath 升序', async () => {
      const list = await repo.listSkillResources(skillId);
      const paths = list.map((r) => r.relPath);
      const sorted = [...paths].sort((a, b) => a.localeCompare(b));
      expect(paths).toEqual(sorted);
    });
  });

  describe('readSkillResource', () => {
    it('读取合法的 references 路径', async () => {
      const content = await repo.readSkillResource(
        skillId,
        'references/research/01-writings.md'
      );
      expect(content).toBe('# 写作研究');
    });

    it('读取合法的 examples 路径', async () => {
      const content = await repo.readSkillResource(skillId, 'examples/demo-2026.md');
      expect(content).toBe('# 示例对话');
    });

    it('拒绝路径穿越（..）', async () => {
      await expect(
        repo.readSkillResource(skillId, 'references/../SKILL.md')
      ).rejects.toThrow(/非法段/);
    });

    it('拒绝绝对路径', async () => {
      await expect(repo.readSkillResource(skillId, '/etc/passwd')).rejects.toThrow(
        /相对路径/
      );
    });

    it('拒绝反斜杠分隔符', async () => {
      await expect(
        repo.readSkillResource(skillId, 'references\\research\\01-writings.md')
      ).rejects.toThrow(/反斜杠/);
    });

    it('拒绝越出 references / examples 的根', async () => {
      await expect(repo.readSkillResource(skillId, 'SKILL.md')).rejects.toThrow(
        /必须以 references/
      );
    });

    it('skill 不存在时报错', async () => {
      await expect(
        repo.readSkillResource('not-exist', 'references/research/01-writings.md')
      ).rejects.toThrow(/skill 不存在/);
    });

    it('文件不存在时报错', async () => {
      await expect(
        repo.readSkillResource(skillId, 'references/research/99-nonexistent.md')
      ).rejects.toThrow(/资源不存在/);
    });
  });
});
