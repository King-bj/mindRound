/**
 * ContextBuilderService 圆桌群聊工具测试
 */
import { describe, it, expect } from 'vitest';
import {
  ContextBuilderService,
  buildFinalInstruction,
  buildOthersPresentBlock,
  buildSkillActiveBlock,
  mapGroupHistoryToAgentMessages,
  getLastUserMessageContent,
} from './ContextBuilderService';
import type { Chat, MessageDTO } from '../domain/Chat';
import type { Persona } from '../domain/Persona';
import type { IChatRepository } from '../repositories/IChatRepository';
import type { IPersonaRepository } from '../repositories/IPersonaRepository';

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

// ===================== Skill protocol blocks =====================

function makePersona(id: string, name: string, description = ''): Persona {
  return { id, name, description, avatar: null, tags: [] };
}

describe('buildSkillActiveBlock', () => {
  it('包含 [SKILL ACTIVE] 头与 SKILL 正文', () => {
    const p = makePersona('pg-skill', 'Paul Graham', '创业 essayist');
    const out = buildSkillActiveBlock(p, '正文一行');
    expect(out).toContain('[SKILL ACTIVE]');
    expect(out).toContain('id: pg-skill');
    expect(out).toContain('name: Paul Graham');
    expect(out).toContain('description: 创业 essayist');
    expect(out).toContain('正文一行');
  });

  it('description 多行被压成一行', () => {
    const p = makePersona('x', 'X', '第一行\n第二行');
    const out = buildSkillActiveBlock(p, '');
    expect(out).toContain('description: 第一行 第二行');
  });
});

describe('buildOthersPresentBlock', () => {
  it('空列表返回空串', () => {
    expect(buildOthersPresentBlock([])).toBe('');
  });

  it('多人时一人一行，含 id / name / description', () => {
    const out = buildOthersPresentBlock([
      makePersona('a', 'Alpha', 'alpha desc'),
      makePersona('b', 'Beta', 'beta desc'),
    ]);
    expect(out).toContain('[OTHERS PRESENT]');
    expect(out).toContain('- a (Alpha): alpha desc');
    expect(out).toContain('- b (Beta): beta desc');
    expect(out).toContain('list_skill_resources');
    expect(out).toContain('read_skill_resource');
    // 不应包含 SKILL.md 正文
    expect(out).not.toContain('正文');
  });
});

// ===================== ContextBuilderService 集成 =====================

interface Stores {
  messagesByChat: Record<string, MessageDTO[]>;
  memoryByChat: Record<string, string>;
  personas: Persona[];
  skills: Record<string, string>;
}

function makeChatRepo(stores: Stores): IChatRepository {
  return {
    async create() {
      throw new Error('n/a');
    },
    async findById() {
      return null;
    },
    async findAll() {
      return [];
    },
    async update() {},
    async delete() {},
    async addMessage() {},
    async getMessages(chatId: string) {
      return stores.messagesByChat[chatId] ?? [];
    },
    async getMemory(chatId: string) {
      return stores.memoryByChat[chatId] ?? '';
    },
    async updateMemory() {},
    async getSpeakerIndex() {
      return 0;
    },
    async updateSpeakerIndex() {},
    async findByPersona() {
      return [];
    },
    async findRecent() {
      return [];
    },
  };
}

function makePersonaRepo(stores: Stores): IPersonaRepository {
  return {
    async scan() {
      return stores.personas;
    },
    async findAll() {
      return stores.personas;
    },
    async findById(id: string) {
      return stores.personas.find((p) => p.id === id) ?? null;
    },
    async getSkillContent(id: string) {
      return stores.skills[id] ?? '';
    },
    async listSkillResources() {
      return [];
    },
    async readSkillResource() {
      throw new Error('n/a');
    },
    async delete() {},
  };
}

function buildChat(overrides: Partial<Chat> = {}): Chat {
  const now = new Date().toISOString();
  return {
    id: 'chat-1',
    type: 'group',
    title: '圆桌',
    personaIds: ['a', 'b', 'c'],
    currentSpeakerIndex: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ContextBuilderService.buildForChat (单聊)', () => {
  it('system 含 [SKILL ACTIVE] 与 SKILL 正文，不含 [OTHERS PRESENT] / [ROUNDTABLE SCENE]', async () => {
    const stores: Stores = {
      messagesByChat: { 'chat-s': [] },
      memoryByChat: { 'chat-s': '' },
      personas: [makePersona('pg', 'Paul Graham', 'essayist')],
      skills: { pg: 'SKILL 正文 PG' },
    };
    const builder = new ContextBuilderService(
      makeChatRepo(stores),
      makePersonaRepo(stores)
    );
    const chat = buildChat({ id: 'chat-s', type: 'single', personaIds: ['pg'] });
    const ctx = await builder.buildForChat(chat);
    expect(ctx.system).toContain('[SKILL ACTIVE]');
    expect(ctx.system).toContain('id: pg');
    expect(ctx.system).toContain('SKILL 正文 PG');
    expect(ctx.system).not.toContain('[OTHERS PRESENT]');
    expect(ctx.system).not.toContain('[ROUNDTABLE SCENE]');
  });

  it('memory 非空时 system 含 [MEMORY] 块', async () => {
    const stores: Stores = {
      messagesByChat: { 'chat-s': [] },
      memoryByChat: { 'chat-s': '记得用户偏好简短回答' },
      personas: [makePersona('pg', 'PG')],
      skills: { pg: '正文' },
    };
    const builder = new ContextBuilderService(
      makeChatRepo(stores),
      makePersonaRepo(stores)
    );
    const chat = buildChat({ id: 'chat-s', type: 'single', personaIds: ['pg'] });
    const ctx = await builder.buildForChat(chat);
    expect(ctx.system).toContain('[MEMORY]');
    expect(ctx.system).toContain('记得用户偏好简短回答');
  });
});

describe('ContextBuilderService.buildGroupRoundContext (圆桌)', () => {
  const stores: Stores = {
    messagesByChat: {
      'chat-g': [{ role: 'user', content: '请讨论 X', timestamp: new Date().toISOString() }],
    },
    memoryByChat: {},
    personas: [
      makePersona('pg', 'Paul Graham', 'essayist'),
      makePersona('jobs', 'Steve Jobs', 'designer'),
      makePersona('feynman', 'Feynman', 'physicist'),
    ],
    skills: {
      pg: 'PG SKILL 正文',
      jobs: 'JOBS SKILL 正文',
      feynman: 'FEYNMAN SKILL 正文',
    },
  };

  function makeBuilder() {
    return new ContextBuilderService(
      makeChatRepo(stores),
      makePersonaRepo(stores)
    );
  }

  it('当前发言人正文进入 system，其他人仅以 discovery card 出现', async () => {
    const builder = makeBuilder();
    const chat = buildChat({ id: 'chat-g', personaIds: ['pg', 'jobs', 'feynman'] });
    const ctx = await builder.buildGroupRoundContext(chat, 'pg', 0, {
      pg: 'Paul Graham',
      jobs: 'Steve Jobs',
      feynman: 'Feynman',
    });
    expect(ctx.system).toContain('[SKILL ACTIVE]');
    expect(ctx.system).toContain('id: pg');
    expect(ctx.system).toContain('PG SKILL 正文');
    expect(ctx.system).toContain('[OTHERS PRESENT]');
    expect(ctx.system).toContain('- jobs (Steve Jobs)');
    expect(ctx.system).toContain('- feynman (Feynman)');
    // 关键不变量：他人 SKILL 正文不应出现在 system 中
    expect(ctx.system).not.toContain('JOBS SKILL 正文');
    expect(ctx.system).not.toContain('FEYNMAN SKILL 正文');
  });

  it('包含 [ROUNDTABLE SCENE] 与 finalInstruction 末条', async () => {
    const builder = makeBuilder();
    const chat = buildChat({ id: 'chat-g', personaIds: ['pg', 'jobs'] });
    const ctx = await builder.buildGroupRoundContext(chat, 'jobs', 1, {
      pg: 'Paul Graham',
      jobs: 'Steve Jobs',
    });
    expect(ctx.system).toContain('[ROUNDTABLE SCENE]');
    expect(ctx.system).toContain('Steve Jobs');
    const last = ctx.messages[ctx.messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('身份锁定');
    expect(last.content).toContain('Steve Jobs');
  });

  it('独自一人圆桌时 [OTHERS PRESENT] 块缺省', async () => {
    const builder = makeBuilder();
    const chat = buildChat({ id: 'chat-g', personaIds: ['pg'] });
    const ctx = await builder.buildGroupRoundContext(chat, 'pg', 0, { pg: 'PG' });
    expect(ctx.system).not.toContain('[OTHERS PRESENT]');
  });
});
