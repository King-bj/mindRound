/**
 * write_file 工具：覆盖写文件（父目录自动创建）
 */
import type { ITool, ToolRunContext } from '../types';
import { invoke } from '../invoke';
import { resolveToolPath } from './pathResolve';

interface Args {
  path: string;
  content: string;
}

export const writeFileTool: ITool<Args> = {
  name: 'write_file',
  description:
    '将给定内容覆盖写入指定路径（父目录会自动创建）。写操作始终需要用户弹框确认。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目标文件路径' },
      content: { type: 'string', description: '写入内容（字符串）' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  permission: 'write',
  cacheable: false,
  async run(args: Args, ctx: ToolRunContext): Promise<string> {
    const resolvedPath = await resolveToolPath(args.path, ctx.dataDir, 'write');
    const bytes = await invoke<number>('agent_write_file', {
      args: {
        path: resolvedPath,
        content: args.content,
        allow_outside_sandbox: ctx.allowOutsideSandbox,
        sandbox_roots: ctx.sandboxRoots,
      },
    });
    return `已写入 ${resolvedPath}（${bytes} 字节）`;
  },
};
