import { describe, it, expect, beforeEach } from 'vitest';
import { createSkillTools } from './skillResources';
import type { ITool, ToolRunContext } from '../types';
import type { IPersonaRepository } from '../../repositories/IPersonaRepository';
import { assertSafeSkillResourcePath, type Persona, type SkillResource } from '../../domain/Persona';

function makePersona(id: string, name: string, description = '', tags: string[] = []): Persona {
  return { id, name, description, avatar: null, tags };
}

function makeRepo(overrides: Partial<IPersonaRepository> = {}): IPersonaRepository {
  const personas: Persona[] = [
    makePersona('a-skill', 'Alpha', 'alpha desc', ['t1']),
    makePersona('b-skill', 'Beta', 'beta desc', ['t2']),
  ];
  const resources: Record<string, SkillResource[]> = {
    'a-skill': [
      { kind: 'reference', relPath: 'references/research/01.md' },
      { kind: 'example', relPath: 'examples/demo.md' },
    ],
    'b-skill': [],
  };
  const fileBodies: Record<string, Record<string, string>> = {
    'a-skill': {
      'references/research/01.md': '# Alpha 研究',
      'examples/demo.md': '# Alpha 示例',
    },
  };
  return {
    async scan() {
      return personas;
    },
    async findById(id: string) {
      return personas.find((p) => p.id === id) ?? null;
    },
    async findAll() {
      return personas;
    },
    async getSkillContent() {
      return '';
    },
    async listSkillResources(id: string) {
      return resources[id] ?? [];
    },
    async readSkillResource(id: string, relPath: string) {
      assertSafeSkillResourcePath(relPath);
      const body = fileBodies[id]?.[relPath];
      if (body === undefined) throw new Error('资源不存在：' + relPath);
      return body;
    },
    async delete() {
      throw new Error('not implemented');
    },
    ...overrides,
  };
}

const ctx: ToolRunContext = {
  sandboxRoots: ['/'],
  dataDir: '/',
  allowOutsideSandbox: false,
  searchProvider: 'ddg',
  searchApiKey: '',
};

function findTool(tools: ITool[], name: string): ITool {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

describe('createSkillTools', () => {
  let tools: ITool[];

  beforeEach(() => {
    tools = createSkillTools(makeRepo());
  });

  it('返回 list_skills / list_skill_resources / read_skill_resource 三件套', () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['list_skill_resources', 'list_skills', 'read_skill_resource']);
  });

  it('全部为 read-any + cacheable，避免触发权限弹框', () => {
    for (const t of tools) {
      expect(t.permission).toBe('read-any');
      expect(t.cacheable).toBe(true);
    }
  });

  describe('list_skills', () => {
    it('返回所有 discovery card', async () => {
      const tool = findTool(tools, 'list_skills');
      const out = await tool.run({}, ctx);
      const parsed = JSON.parse(out) as { skills: { id: string }[] };
      expect(parsed.skills.map((s) => s.id).sort()).toEqual(['a-skill', 'b-skill']);
    });

    it('支持 tag 过滤', async () => {
      const tool = findTool(tools, 'list_skills');
      const out = await tool.run({ tag: 't1' }, ctx);
      const parsed = JSON.parse(out) as { skills: { id: string }[] };
      expect(parsed.skills.map((s) => s.id)).toEqual(['a-skill']);
    });
  });

  describe('list_skill_resources', () => {
    it('返回该 skill 的资源元数据', async () => {
      const tool = findTool(tools, 'list_skill_resources');
      const out = await tool.run({ skill_id: 'a-skill' }, ctx);
      const parsed = JSON.parse(out) as {
        skill_id: string;
        resources: SkillResource[];
      };
      expect(parsed.skill_id).toBe('a-skill');
      expect(parsed.resources).toHaveLength(2);
      expect(parsed.resources.some((r) => r.kind === 'reference')).toBe(true);
    });

    it('skill 不存在时返回错误描述', async () => {
      const tool = findTool(tools, 'list_skill_resources');
      const out = await tool.run({ skill_id: 'ghost' }, ctx);
      const parsed = JSON.parse(out) as { error?: string };
      expect(parsed.error).toBeTruthy();
    });

    it('skill_id 为空时抛错', async () => {
      const tool = findTool(tools, 'list_skill_resources');
      await expect(tool.run({ skill_id: '   ' }, ctx)).rejects.toThrow(
        /skill_id 不能为空/
      );
    });
  });

  describe('read_skill_resource', () => {
    it('读取合法资源', async () => {
      const tool = findTool(tools, 'read_skill_resource');
      const out = await tool.run(
        { skill_id: 'a-skill', path: 'references/research/01.md' },
        ctx
      );
      expect(out).toContain('# Alpha 研究');
      expect(out).toContain('skill:a-skill');
      expect(out).toContain('references/research/01.md');
    });

    it('参数缺失时抛错', async () => {
      const tool = findTool(tools, 'read_skill_resource');
      await expect(tool.run({ skill_id: '', path: 'a' }, ctx)).rejects.toThrow(
        /skill_id 不能为空/
      );
      await expect(
        tool.run({ skill_id: 'a-skill', path: '' }, ctx)
      ).rejects.toThrow(/path 不能为空/);
    });

    it('仓储拒绝越界路径时直接传播错误', async () => {
      const tool = findTool(tools, 'read_skill_resource');
      await expect(
        tool.run(
          { skill_id: 'a-skill', path: 'references/../SKILL.md' },
          ctx
        )
      ).rejects.toThrow(/非法段/);
    });
  });
});
