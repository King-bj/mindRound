/**
 * web_search 工具：调用 Rust 后端执行搜索，返回前 N 条结果
 */
import type { ITool, ToolRunContext } from '../types';
import { invoke } from '../invoke';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface Args {
  query: string;
  maxResults?: number;
}

export const webSearchTool: ITool<Args> = {
  name: 'web_search',
  description:
    [
      '通过搜索引擎查询互联网。返回若干条搜索结果（标题/URL/摘要）。适合用于查最新资讯、找资料页面 URL。',
      '查询「最新 / 最近」类资讯时，若无特殊需要，query 不必写死年份；系统会在 system 中告知你当前日期。',
      '搜索结果给出的 URL 通常是站点首页；如果你需要了解某站点的完整画像（例如作者的博客/个人站），',
      '请搭配 `web_fetch`：先抓首页，再从返回的「同域内链」里挑 2~5 条相关子页（如 /about /blog /projects）继续抓，综合后再回答。',
    ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: '最多返回结果数，默认 5',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  permission: 'read-any',
  cacheable: true,
  async run(args: Args, ctx: ToolRunContext): Promise<string> {
    const query = (args.query ?? '').trim();
    if (!query) throw new Error('query 不能为空');

    const results = await invoke<SearchResult[]>('agent_web_search', {
      args: {
        query,
        max_results: args.maxResults ?? 5,
        provider: ctx.searchProvider,
        api_key: ctx.searchApiKey || null,
      },
    });

    if (results.length === 0) {
      return `未找到相关结果（query="${query}"）`;
    }
    return results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`
      )
      .join('\n\n');
  },
};
