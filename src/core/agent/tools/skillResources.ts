/**
 * Skill 资源工具：协议 Level 1 / Level 3 渐进披露的入口
 * @description
 * 这一组工具让模型在对话中按需查阅其他 skill 的元信息或本人/他人 skill 的
 * references / examples。约束：
 * - 只读，限定在 personae/<id>/{references,examples}/** 内
 * - 路径校验在 FilePersonaRepository.readSkillResource 中由
 *   assertSafeSkillResourcePath 强制
 * - 永远在数据目录内，permission 类设为 read-any（无需弹框）
 */
import type { IPersonaRepository } from '../../repositories/IPersonaRepository';
import type { ITool } from '../types';

interface ListSkillsArgs {
  /** 预留：未来支持按 tag 过滤 */
  tag?: string;
}

interface ListSkillResourcesArgs {
  skill_id: string;
}

interface ReadSkillResourceArgs {
  skill_id: string;
  path: string;
}

/**
 * 构造 Skill 资源工具三件套
 * @param personaRepo - 人格仓储，承载实际的目录访问与路径校验
 * @returns 工具列表，可直接挂到 ToolRegistry
 */
export function createSkillTools(personaRepo: IPersonaRepository): ITool[] {
  /**
   * list_skills：返回所有 Skill 的 discovery card（id / name / description / tags）
   */
  const listSkillsTool: ITool<ListSkillsArgs> = {
    name: 'list_skills',
    description:
      [
        '列出当前数据目录下全部可用的 Skill（人格）的 discovery card。',
        '返回 id / name / description / tags 元数据，不返回 SKILL.md 正文。',
        '用于在圆桌中了解其他在场者的画像，或在引述/反驳他人观点前快速对照他们的定位。',
      ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: '可选：仅返回 tags 中包含该词的 skill',
        },
      },
      additionalProperties: false,
    },
    permission: 'read-any',
    cacheable: true,
    async run(args: ListSkillsArgs): Promise<string> {
      const personas = await personaRepo.findAll();
      const filtered = args?.tag
        ? personas.filter((p) => p.tags?.includes(args.tag as string))
        : personas;
      const cards = filtered.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        tags: p.tags,
      }));
      return JSON.stringify({ skills: cards }, null, 2);
    },
  };

  /**
   * list_skill_resources：列出一个 Skill 的 Level 3 资源
   */
  const listSkillResourcesTool: ITool<ListSkillResourcesArgs> = {
    name: 'list_skill_resources',
    description:
      [
        '列出指定 Skill 的 Level 3 资源（references/** 与 examples/**）。',
        '返回相对路径列表，本身不包含正文，仅作为 read_skill_resource 的索引。',
        '当你需要查阅某 skill 的研究材料、示例对话以加深引用质量时调用。',
      ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: '目标 Skill 的 ID（即 personae 下的目录名）',
        },
      },
      required: ['skill_id'],
      additionalProperties: false,
    },
    permission: 'read-any',
    cacheable: true,
    async run(args: ListSkillResourcesArgs): Promise<string> {
      const skillId = (args?.skill_id ?? '').trim();
      if (!skillId) throw new Error('skill_id 不能为空');
      const persona = await personaRepo.findById(skillId);
      if (!persona) {
        return JSON.stringify({ skill_id: skillId, resources: [], error: 'skill 不存在' });
      }
      const resources = await personaRepo.listSkillResources(skillId);
      return JSON.stringify(
        {
          skill_id: skillId,
          name: persona.name,
          resources,
        },
        null,
        2
      );
    },
  };

  /**
   * read_skill_resource：读取一个 Level 3 资源文件正文
   */
  const readSkillResourceTool: ITool<ReadSkillResourceArgs> = {
    name: 'read_skill_resource',
    description:
      [
        '读取指定 Skill 下某个 Level 3 资源文件的正文。',
        'path 必须是相对 skill 目录的路径，且只能落在 references/** 或 examples/** 内（越界会报错）。',
        '在你需要直接引用研究材料、示例对话片段时使用。',
      ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: '目标 Skill 的 ID（即 personae 下的目录名）',
        },
        path: {
          type: 'string',
          description:
            '相对 skill 目录的路径，必须以 references/ 或 examples/ 开头，例如 references/research/03-expression-dna.md',
        },
      },
      required: ['skill_id', 'path'],
      additionalProperties: false,
    },
    permission: 'read-any',
    cacheable: true,
    async run(args: ReadSkillResourceArgs): Promise<string> {
      const skillId = (args?.skill_id ?? '').trim();
      const path = (args?.path ?? '').trim();
      if (!skillId) throw new Error('skill_id 不能为空');
      if (!path) throw new Error('path 不能为空');
      const content = await personaRepo.readSkillResource(skillId, path);
      return `# skill:${skillId} :: ${path}\n\n${content}`;
    },
  };

  return [listSkillsTool, listSkillResourcesTool, readSkillResourceTool];
}
