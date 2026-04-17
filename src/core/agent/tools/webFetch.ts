/**
 * web_fetch 工具：拉取 URL 并转为 Markdown
 */
import type { ITool } from '../types';
import { invoke } from '../invoke';

interface Args {
  url: string;
  maxChars?: number;
}

interface FetchResult {
  url: string;
  status: number;
  content_type: string;
  markdown: string;
  truncated: boolean;
}

export const webFetchTool: ITool<Args> = {
  name: 'web_fetch',
  description:
    '拉取单个公开网页 URL 并转换成 Markdown。仅允许 http/https 公网地址，拒绝本地/内网地址。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要抓取的 http/https URL' },
      maxChars: {
        type: 'integer',
        minimum: 500,
        maximum: 60000,
        description: 'Markdown 最大字符数，超出截断，默认 16000',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  permission: 'read-any',
  cacheable: true,
  async run(args: Args): Promise<string> {
    if (!args.url || !/^https?:\/\//i.test(args.url)) {
      throw new Error('url 必须是 http/https');
    }
    const r = await invoke<FetchResult>('agent_web_fetch', {
      args: { url: args.url, max_chars: args.maxChars ?? 16000 },
    });
    const header = `# ${r.url}\n[status: ${r.status}${r.truncated ? ', truncated' : ''}]`;
    return `${header}\n\n${r.markdown}`;
  },
};
