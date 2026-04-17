/**
 * ContextBuilderService 圆桌群聊工具测试
 */
import { describe, it, expect } from 'vitest';
import {
  buildFinalInstruction,
  mapGroupHistoryToAgentMessages,
  getLastUserMessageContent,
} from './ContextBuilderService';
import type { MessageDTO } from '../domain/Chat';

describe('buildFinalInstruction', () => {
  const who = 'Paul Graham';

  it('speakerOrderIndex 0 时使用首位发言人文案', () => {
    const s = buildFinalInstruction(0, '你好', null, who);
    expect(s).toContain('身份锁定');
    expect(s).toContain(who);
    expect(s).toContain('首位发言人');
    expect(s).toContain('你好');
  });

  it('speakerOrderIndex 大于 0 时含首要任务与互动加分', () => {
    const s = buildFinalInstruction(1, '问题', '费曼', who);
    expect(s).toContain('身份锁定');
    expect(s).toContain('首要任务');
    expect(s).toContain('互动加分');
    expect(s).toContain('费曼');
    expect(s).toContain('在上一段发言中');
  });

  it('上一位显示名缺失时降级为不含「上一段」结构', () => {
    const s = buildFinalInstruction(1, 'Q', null, who);
    expect(s).toContain('首要任务');
    expect(s).not.toContain('在上一段发言中');
  });
});

describe('mapGroupHistoryToAgentMessages', () => {
  it('将他人 assistant 映射为 user 并带人格标签', () => {
    const raw: MessageDTO[] = [
      { role: 'user', content: '用户问', timestamp: '1' },
      { role: 'assistant', content: 'a说', timestamp: '2', personaId: 'p-a' },
    ];
    const msgs = mapGroupHistoryToAgentMessages(raw, 'p-b', {
      'p-a': 'Alpha',
      'p-b': 'Beta',
    });
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('[观众]：用户问');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toBe('[Alpha]：a说');
  });

  it('assistant 正文会剥离 redacted_thinking，不传入 API', () => {
    const raw: MessageDTO[] = [
      {
        role: 'assistant',
        content:
          '<redacted_thinking>\n内部错名\n</redacted_thinking>\n\n对外一句',
        timestamp: '1',
        personaId: 'p-a',
      },
    ];
    const msgs = mapGroupHistoryToAgentMessages(raw, 'p-b', { 'p-a': 'Alpha', 'p-b': 'Beta' });
    expect(msgs[0].content).toBe('[Alpha]：对外一句');
    expect(msgs[0].content).not.toContain('redacted_thinking');
  });

  it('当前人格的 assistant 保持 assistant', () => {
    const raw: MessageDTO[] = [
      { role: 'assistant', content: '我说', timestamp: '1', personaId: 'p-b' },
    ];
    const msgs = mapGroupHistoryToAgentMessages(raw, 'p-b', { 'p-b': 'Beta' });
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].content).toBe('我说');
  });

  it('tool 消息被完全滤掉，assistant.toolCalls 仅保留文本', () => {
    const raw: MessageDTO[] = [
      { role: 'user', content: 'Q', timestamp: '1' },
      {
        role: 'assistant',
        content: '让我查一下',
        timestamp: '2',
        personaId: 'p-b',
        toolCalls: [
          { id: 'c1', name: 'web_search', arguments: '{"query":"x"}' },
        ],
      },
      {
        role: 'tool',
        content: 'search result',
        timestamp: '3',
        toolCallId: 'c1',
        name: 'web_search',
      },
      {
        role: 'assistant',
        content: '查完了',
        timestamp: '4',
        personaId: 'p-b',
      },
    ];
    const msgs = mapGroupHistoryToAgentMessages(raw, 'p-b', { 'p-b': 'Beta' });
    // tool 消息被丢弃
    expect(msgs.some((m) => m.role === 'tool')).toBe(false);
    // 两条 assistant 都保留（内容非空）
    expect(msgs.filter((m) => m.role === 'assistant')).toHaveLength(2);
    // 所有保留的 assistant 均没有 toolCalls 字段
    expect(msgs.every((m) => !m.toolCalls)).toBe(true);
  });
});

describe('getLastUserMessageContent', () => {
  it('返回时间序中最后一条用户消息', () => {
    expect(
      getLastUserMessageContent([
        { role: 'user', content: '第一', timestamp: '1' },
        { role: 'assistant', content: 'x', timestamp: '2', personaId: 'p' },
        { role: 'user', content: '最后', timestamp: '3' },
      ])
    ).toBe('最后');
  });
});
