/**
 * read_file 工具：读取文件内容
 */
import type { ITool, ToolRunContext } from '../types';
import { invoke } from '../invoke';
import { resolveToolPath } from './pathResolve';

interface Args {
  path: string;
}

interface ReadResult {
  path: string;
  content: string;
  truncated: boolean;
  is_binary: boolean;
  size: number;
}

export const readFileTool: ITool<Args> = {
  name: 'read_file',
  description:
    '读取指定路径的文件内容（文本按原文返回，二进制返回 hex 预览）。' +
    '相对路径默认在数据目录内查找：含子目录的相对路径直接拼接，纯文件名会在数据目录下递归匹配（多个同名文件时取修改时间最新的一个）；' +
    'sandbox 外的绝对路径需要用户弹框确认。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          '绝对路径，或数据目录相对路径，或纯文件名（会在数据目录下递归查找）',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  permission: 'readonly-sandbox',
  cacheable: true,
  async run(args: Args, ctx: ToolRunContext): Promise<string> {
    const resolvedPath = await resolveToolPath(args.path, ctx.dataDir, 'read');
    const r = await invoke<ReadResult>('agent_read_file', {
      args: {
        path: resolvedPath,
        allow_outside_sandbox: ctx.allowOutsideSandbox,
        sandbox_roots: ctx.sandboxRoots,
      },
    });
    const tag = r.truncated
      ? `\n\n[截断：显示前 ${r.content.length} / ${r.size} 字节]`
      : '';
    return `# ${r.path}\n\n${r.content}${tag}`;
  },
};
