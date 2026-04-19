/**
 * update_file 工具：按 oldString → newString 做精确替换
 */
import type { ITool, ToolRunContext } from '../types';
import { invoke } from '../invoke';
import { resolveToolPath } from './pathResolve';

interface Args {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

interface UpdateResult {
  replacements: number;
}

export const updateFileTool: ITool<Args> = {
  name: 'update_file',
  description:
    '在指定文件中把 oldString 精确替换为 newString。当 oldString 不唯一且 replaceAll=false 时报错。写操作始终需要用户弹框确认。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目标文件路径' },
      oldString: {
        type: 'string',
        description: '要被替换的原始字符串，需包含足够上下文保证唯一性',
      },
      newString: {
        type: 'string',
        description: '替换后的新字符串',
      },
      replaceAll: {
        type: 'boolean',
        description: '是否替换所有出现，默认 false（仅替换第一处）',
      },
    },
    required: ['path', 'oldString', 'newString'],
    additionalProperties: false,
  },
  permission: 'write',
  cacheable: false,
  async run(args: Args, ctx: ToolRunContext): Promise<string> {
    const resolvedPath = await resolveToolPath(args.path, ctx.dataDir, 'read');
    const r = await invoke<UpdateResult>('agent_update_file', {
      args: {
        path: resolvedPath,
        old_string: args.oldString,
        new_string: args.newString,
        replace_all: args.replaceAll ?? false,
        allow_outside_sandbox: ctx.allowOutsideSandbox,
        sandbox_roots: ctx.sandboxRoots,
      },
    });
    return `已替换 ${r.replacements} 处（${resolvedPath}）`;
  },
};
