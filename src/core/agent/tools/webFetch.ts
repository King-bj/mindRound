/**
 * web_fetch 工具：拉取 URL 并转为 Markdown
 */
import type { ITool } from '../types';
import { invoke } from '../invoke';

interface Args {
  url: string;
  maxChars?: number;
}

/**
 * Rust agent_web_fetch 返回的结构
 */
interface FetchResult {
  url: string;
  status: number;
  content_type: string;
  markdown: string;
  truncated: boolean;
  /** 同域内链 Top N，供模型继续深挖子页 */
  links?: Array<{ url: string; text: string }>;
}

export const webFetchTool: ITool<Args> = {
  name: 'web_fetch',
  description:
    [
      '拉取单个公开网页 URL 并转换成 Markdown。仅允许 http/https 公网地址，拒绝本地/内网地址。',
      '返回末尾附带「同域内链·TopN」清单：如果你需要获取该站点的完整画像（例如作者站点/文档），',
      '请从内链里挑 2~5 条最相关的子页（如 /about、/blog、/projects、/resume、/docs）继续 `web_fetch`，',
      '再给出回答；不要只看首页就下结论。',
    ].join(' '),
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
    const linksSection = formatLinksSection(r.links ?? []);
    return `${header}\n\n${r.markdown}${linksSection}`;
  },
};

/**
 * 将同域内链列表渲染为"附录式"区块，方便模型选择 2~5 条继续抓
 */
function formatLinksSection(links: Array<{ url: string; text: string }>): string {
  if (links.length === 0) return '';
  const lines = links.slice(0, 20).map((l, i) => {
    const text = (l.text || '').replace(/\s+/g, ' ').trim();
    const label = text.length > 0 ? text : '(无锚文本)';
    return `${i + 1}. ${label} — ${l.url}`;
  });
  return `\n\n---\n[同域内链·Top${lines.length}]\n${lines.join('\n')}`;
}
