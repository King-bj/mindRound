/**
 * 工具注册表：通用 7 件套 + Skill 资源 3 件套的集中挂载点
 */
import type { ITool, ToolRegistry } from '../types';
import type { OpenAITool } from '../../repositories/IApiRepository';
import type { IPersonaRepository } from '../../repositories/IPersonaRepository';
import { webSearchTool } from './webSearch';
import { webFetchTool } from './webFetch';
import { readFileTool } from './readFile';
import { writeFileTool } from './writeFile';
import { updateFileTool } from './updateFile';
import { searchFileTool } from './searchFile';
import { executeCommandTool } from './executeCommand';
import { createSkillTools } from './skillResources';

/** 各工具带独立泛型入参，数组整体加宽为 ITool 以满足注册表类型 */
const BUILTIN_TOOLS = [
  webSearchTool,
  webFetchTool,
  readFileTool,
  searchFileTool,
  writeFileTool,
  updateFileTool,
  executeCommandTool,
] as unknown as ITool[];

export interface RegistryDeps {
  /** 人格仓储；用于 list_skills / list_skill_resources / read_skill_resource */
  personaRepo: IPersonaRepository;
}

/**
 * 创建默认注册表
 * @description Skill 资源工具是协议 Level 1 / Level 3 的入口，必须挂载；
 * 因此 personaRepo 为必传依赖。
 */
export function createDefaultRegistry(deps: RegistryDeps): ToolRegistry {
  const byName = new Map<string, ITool>();
  for (const t of BUILTIN_TOOLS) {
    byName.set(t.name, t);
  }
  for (const t of createSkillTools(deps.personaRepo)) {
    byName.set(t.name, t);
  }

  return {
    get(name: string): ITool | undefined {
      return byName.get(name);
    },
    all(): ITool[] {
      return [...byName.values()];
    },
    schemas(): OpenAITool[] {
      return [...byName.values()].map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    },
  };
}

export { BUILTIN_TOOLS };
