import { describe, expect, it } from 'vitest';
import { buildTurnViews, parseFetchSource, parseSearchSources } from './turnAggregator';
import type { MessageDTO } from '../../core/domain/Chat';

function webSearchContent(items: Array<{ title: string; url: string; snippet: string }>): string {
  return items
    .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`)
    .join('\n\n');
}

describe('turnAggregator', () => {
  it('user 消息独立成组', () => {
    const msgs: MessageDTO[] = [
      { role: 'user', content: 'hello', timestamp: 't1' },
      { role: 'user', content: 'world', timestamp: 't2' },
    ];
    const views = buildTurnViews(msgs);
    expect(views).toHaveLength(2);
    expect(views[0].grouped).toBe(false);
    expect(views[0].content).toBe('hello');
    expect(views[1].content).toBe('world');
  });

  it('同一 turnId 下的 assistant + tool 被合并为一个气泡', () => {
    const turnId = 'turn_abc';
    const msgs: MessageDTO[] = [
      { role: 'user', content: '查一下', timestamp: 't0' },
      {
        role: 'assistant',
        content: '好的，我去查',
        timestamp: 't1',
        turnId,
        toolCalls: [{ id: 'c1', name: 'web_search', arguments: '{"query":"foo"}' }],
      },
      {
        role: 'tool',
        content: webSearchContent([
          { title: 'Foo One', url: 'https://foo.com/one', snippet: 's1' },
          { title: 'Foo Two', url: 'https://bar.com/two', snippet: 's2' },
        ]),
        timestamp: 't2',
        turnId,
        toolCallId: 'c1',
        name: 'web_search',
      },
      {
        role: 'assistant',
        content: '',
        timestamp: 't3',
        turnId,
        toolCalls: [{ id: 'c2', name: 'web_fetch', arguments: '{"url":"https://foo.com/one"}' }],
      },
      {
        role: 'tool',
        content: '# https://foo.com/one\n[status: 200]\n\n# Foo Page\n\nbody text here',
        timestamp: 't4',
        turnId,
        toolCallId: 'c2',
        name: 'web_fetch',
      },
      {
        role: 'assistant',
        content: '最终回答：foo 就是 foo',
        timestamp: 't5',
        turnId,
      },
    ];

    const views = buildTurnViews(msgs);
    // user + 一个 assistant 合并气泡
    expect(views).toHaveLength(2);
    const bubble = views[1];
    expect(bubble.grouped).toBe(true);
    expect(bubble.content).toContain('好的');
    expect(bubble.content).toContain('最终回答');
    expect(bubble.steps).toHaveLength(2);
    const [search, fetchStep] = bubble.steps;
    expect(search.kind).toBe('search');
    expect(search.status).toBe('ok');
    expect(search.kind === 'search' && search.count).toBe(2);
    expect(search.kind === 'search' && search.query).toBe('foo');
    expect(fetchStep.kind).toBe('fetch');
    expect(fetchStep.status).toBe('ok');
    // 来源按域名去重：foo.com + bar.com
    const domains = bubble.sources.map((s) => s.domain);
    expect(domains).toContain('foo.com');
    expect(domains).toContain('bar.com');
  });

  it('tool 以 Error: 开头时 step 标记为 error', () => {
    const turnId = 'turn_err';
    const msgs: MessageDTO[] = [
      {
        role: 'assistant',
        content: '',
        timestamp: 't1',
        turnId,
        toolCalls: [{ id: 'c1', name: 'web_search', arguments: '{"query":"x"}' }],
      },
      {
        role: 'tool',
        content: 'Error: 所有搜索引擎都失败了：DDG·html rate_limited(HTTP 429)',
        timestamp: 't2',
        turnId,
        toolCallId: 'c1',
        name: 'web_search',
      },
    ];
    const views = buildTurnViews(msgs);
    expect(views).toHaveLength(1);
    const step = views[0].steps[0];
    expect(step.status).toBe('error');
    expect(step.error).toContain('DDG');
    // 失败的搜索不贡献 source
    expect(views[0].sources).toHaveLength(0);
    expect(views[0].hasRunningStep).toBe(false);
  });

  it('toolCall 尚未回结果时 step 为 running 且 hasRunningStep=true', () => {
    const msgs: MessageDTO[] = [
      {
        role: 'assistant',
        content: '我想想…',
        timestamp: 't1',
        turnId: 'tr',
        toolCalls: [{ id: 'c1', name: 'web_search', arguments: '{"query":"y"}' }],
      },
    ];
    const views = buildTurnViews(msgs);
    expect(views[0].steps[0].status).toBe('running');
    expect(views[0].hasRunningStep).toBe(true);
  });

  it('无 turnId 的旧消息走兼容路径：各自独立成组', () => {
    const msgs: MessageDTO[] = [
      { role: 'assistant', content: 'hi', timestamp: 't1' },
      { role: 'tool', content: 'res', timestamp: 't2', toolCallId: 'c1', name: 'web_search' },
    ];
    const views = buildTurnViews(msgs);
    expect(views).toHaveLength(2);
    expect(views[0].grouped).toBe(false);
    expect(views[1].grouped).toBe(false);
  });

  it('parseSearchSources 能解析标准格式', () => {
    const content = webSearchContent([
      { title: 'A', url: 'https://a.com/x', snippet: 's1' },
      { title: 'B', url: 'https://b.com/y', snippet: 's2' },
    ]);
    const out = parseSearchSources(content);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ url: 'https://a.com/x', domain: 'a.com', title: 'A' });
    expect(out[1].domain).toBe('b.com');
  });

  it('parseFetchSource 从 web_fetch 头部抽 URL', () => {
    const content = '# https://docs.example.com/about\n[status: 200]\n\n# About Me\n\n正文…';
    const src = parseFetchSource(content);
    expect(src).not.toBeNull();
    expect(src!.url).toBe('https://docs.example.com/about');
    expect(src!.domain).toBe('docs.example.com');
    expect(src!.title).toBe('About Me');
  });
});
