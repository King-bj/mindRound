/**
 * read_file 工具：读取文件内容
 */
import type { ITool, ToolRunContext } from '../types';
import { invoke } from '../invoke';

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
    '读取指定路径的文件内容（文本按原文返回，二进制返回 hex 预览）。sandbox 外的路径需要用户弹框确认。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '绝对或相对路径；相对路径以应用工作目录解析',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  permission: 'readonly-sandbox',
  cacheable: true,
  async run(args: Args, ctx: ToolRunContext): Promise<string> {
    const r = await invoke<ReadResult>('agent_read_file', {
      args: {
        path: args.path,
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
