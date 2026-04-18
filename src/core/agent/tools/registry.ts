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
