/**
 * 工具注册表：7 件套的集中挂载点
 */
import type { ITool, ToolRegistry } from '../types';
import type { OpenAITool } from '../../repositories/IApiRepository';
import { webSearchTool } from './webSearch';
import { webFetchTool } from './webFetch';
import { readFileTool } from './readFile';
import { writeFileTool } from './writeFile';
import { updateFileTool } from './updateFile';
import { searchFileTool } from './searchFile';
import { executeCommandTool } from './executeCommand';

const BUILTIN_TOOLS: ITool[] = [
  webSearchTool as ITool,
  webFetchTool as ITool,
  readFileTool as ITool,
  searchFileTool as ITool,
  writeFileTool as ITool,
  updateFileTool as ITool,
  executeCommandTool as ITool,
];

/**
 * 创建默认注册表
 */
export function createDefaultRegistry(): ToolRegistry {
  const byName = new Map<string, ITool>();
  for (const t of BUILTIN_TOOLS) {
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
