/**
 * search_file 工具：递归搜索文件内容
 */
import type { ITool, ToolRunContext } from '../types';
import { invoke } from '../invoke';
import { isAbsolutePath, joinDataDir } from './pathResolve';

interface Args {
  pattern: string;
  path?: string;
  glob?: string;
  maxResults?: number;
}

interface SearchHit {
  path: string;
  line: number;
  preview: string;
}

export const searchFileTool: ITool<Args> = {
  name: 'search_file',
  description:
    '按正则 pattern 在目录内递归搜索文件内容。支持 glob 过滤（如 "*.ts"）。默认遵循 .gitignore。' +
    '相对路径或缺省时以数据目录为根。',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '正则表达式（Rust 语法）' },
      path: {
        type: 'string',
        description: '搜索根目录；缺省或相对路径以数据目录为基准',
      },
      glob: {
        type: 'string',
        description: 'glob 文件过滤，如 "*.md" 或 "**/*.ts"',
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: '最多返回匹配数，默认 50',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  permission: 'readonly-sandbox',
  cacheable: true,
  async run(args: Args, ctx: ToolRunContext): Promise<string> {
    const resolvedPath = resolveSearchPath(args.path, ctx.dataDir);
    const hits = await invoke<SearchHit[]>('agent_search_file', {
      args: {
        pattern: args.pattern,
        path: resolvedPath,
        glob: args.glob ?? null,
        max_results: args.maxResults ?? 50,
        allow_outside_sandbox: ctx.allowOutsideSandbox,
        sandbox_roots: ctx.sandboxRoots,
      },
    });
    if (hits.length === 0) {
      return `未找到匹配 /${args.pattern}/`;
    }
    return hits
      .map((h) => `${h.path}:${h.line}: ${h.preview}`)
      .join('\n');
  },
};

/**
 * 把 search_file 的可选 path 归一化为搜索根目录
 * @description 缺省 / "." / "/" 一律用数据目录；绝对路径原样；相对路径拼到数据目录下
 */
function resolveSearchPath(input: string | undefined, dataDir: string): string {
  const p = (input ?? '').trim();
  if (!p || p === '.' || p === './' || p === '/' || p === '\\') {
    return dataDir;
  }
  if (isAbsolutePath(p)) return p;
  return joinDataDir(dataDir, p);
}
