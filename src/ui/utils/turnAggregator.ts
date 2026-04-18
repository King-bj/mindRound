/**
 * 回合视图聚合器
 * @description 把持久化的 `MessageDTO[]` 按 `turnId` 聚合成若干 `TurnView`，
 * 每个 `TurnView` 对应 UI 上的一个 assistant 气泡：
 *   - `bubble`：气泡壳消息（首个 assistant，用于头像 / 发言者 / 时间戳）
 *   - `content`：该回合所有 assistant 消息正文按 `\n` 拼接后的最终文本
 *   - `steps`：每个工具调用的状态行（搜索/抓取/一般工具）
 *   - `sources`：从 `web_search` / `web_fetch` 结果里抽出的"来源"
 *
 * 兼容性：旧消息没有 turnId，按单条消息各自成组（保持现有渲染行为）。
 */
import type { MessageDTO, ToolCall } from '../../core/domain/Chat';

/**
 * 一个工具步骤（渲染为折叠行）
 */
export type TurnStep =
  | {
      kind: 'search';
      /** 工具调用 ID，用于 React key */
      callId: string;
      /** 搜索词（解析失败则为空） */
      query: string;
      /** 结果条数（仅成功时） */
      count?: number;
      status: 'running' | 'ok' | 'error';
      /** 错误简要（status==='error' 时） */
      error?: string;
    }
  | {
      kind: 'fetch';
      callId: string;
      url: string;
      /** 返回 markdown 的字符数（仅成功时） */
      chars?: number;
      status: 'running' | 'ok' | 'error';
      error?: string;
    }
  | {
      kind: 'tool';
      callId: string;
      /** 通用工具名 */
      name: string;
      /** 单行参数预览 */
      preview?: string;
      status: 'running' | 'ok' | 'error';
      error?: string;
    };

/**
 * 来源条目（底部 Sources chips）
 */
export interface SourceItem {
  /** 绝对 URL */
  url: string;
  /** host 域名（去 www.） */
  domain: string;
  /** 标题（若无则回落为 url） */
  title: string;
  /** 是否命中缓存，UI 可选展示 */
  cached?: boolean;
}

/**
 * 一个回合的聚合视图
 */
export interface TurnView {
  /** 分组键：turnId 或 fallback 合成 key */
  key: string;
  /** 是否"真正一个回合"（有 turnId 且 >=1 条消息，跨多条聚合） */
  grouped: boolean;
  /** 气泡壳：首个 assistant 或唯一消息（供头像/发言者/时间使用） */
  bubble: MessageDTO;
  /** 该回合 assistant 正文（多个片段按换行拼接；可为空串） */
  content: string;
  /** 工具步骤列表（按时间顺序） */
  steps: TurnStep[];
  /** 来源 chips（按域名去重，保留首次出现） */
  sources: SourceItem[];
  /** 该回合中是否仍有未完成的工具调用（没有对应 tool 消息） */
  hasRunningStep: boolean;
}

/**
 * 对外主入口：把消息流切成 UI 可直接渲染的 "turn 视图" 数组
 *
 * 规则：
 * - `role==='user'` 永远独立成组（单独气泡）
 * - `assistant` + `tool` 按 turnId 分组；没有 turnId 的退回旧行为：单消息一组
 */
export function buildTurnViews(messages: MessageDTO[]): TurnView[] {
  const out: TurnView[] = [];
  // turnId → 正在累积中的 TurnView（只对 assistant/tool 生效）
  const pending = new Map<string, TurnView>();

  const flush = (key: string): void => {
    const v = pending.get(key);
    if (v) {
      finalizeTurnView(v);
      out.push(v);
      pending.delete(key);
    }
  };

  for (const msg of messages) {
    if (msg.role === 'user') {
      // user 消息打断所有正在累积的 turn，各自 flush，然后独立成组
      for (const k of Array.from(pending.keys())) flush(k);
      out.push({
        key: `u-${msg.timestamp}-${out.length}`,
        grouped: false,
        bubble: msg,
        content: msg.content,
        steps: [],
        sources: [],
        hasRunningStep: false,
      });
      continue;
    }

    const turnId = msg.turnId;
    if (!turnId) {
      // 兼容旧消息：单独成组
      for (const k of Array.from(pending.keys())) flush(k);
      out.push({
        key: `legacy-${msg.timestamp}-${out.length}-${msg.role}`,
        grouped: false,
        bubble: msg,
        content: msg.role === 'assistant' ? msg.content : '',
        steps: msg.role === 'assistant' ? toolCallsToRunningSteps(msg.toolCalls) : [],
        sources: [],
        hasRunningStep:
          msg.role === 'assistant' && (msg.toolCalls?.length ?? 0) > 0,
      });
      continue;
    }

    let view = pending.get(turnId);
    if (!view) {
      view = {
        key: turnId,
        grouped: true,
        bubble: msg.role === 'assistant' ? msg : fallbackBubble(msg),
        content: '',
        steps: [],
        sources: [],
        hasRunningStep: false,
      };
      pending.set(turnId, view);
    }

    if (msg.role === 'assistant') {
      // 第一条 assistant 作为 bubble；后续迭代只追加正文与步骤
      if (view.bubble.role !== 'assistant') {
        view.bubble = msg;
      }
      if (msg.content && msg.content.trim().length > 0) {
        view.content = view.content
          ? `${view.content}\n${msg.content}`
          : msg.content;
      }
      // assistant 的 toolCalls 先转为"running" step；tool 到达时再补状态
      for (const tc of msg.toolCalls ?? []) {
        if (!view.steps.some((s) => s.callId === tc.id)) {
          view.steps.push(toolCallToRunningStep(tc));
        }
      }
    } else if (msg.role === 'tool') {
      // 根据 toolCallId 找到对应 step 并回填
      const idx = view.steps.findIndex((s) => s.callId === msg.toolCallId);
      const isError = msg.content.startsWith('Error:') || msg.content.startsWith('[Agent 错误');
      if (idx >= 0) {
        view.steps[idx] = decorateStepWithResult(view.steps[idx], msg, isError);
      } else {
        // 理论上不会出现（toolCall 先于 tool）；兜底构造一个通用 step
        view.steps.push({
          kind: 'tool',
          callId: msg.toolCallId ?? `t-${msg.timestamp}`,
          name: msg.name ?? 'tool',
          status: isError ? 'error' : 'ok',
          error: isError ? shortErrorHint(msg.content) : undefined,
        });
      }
      // 同时把 tool 结果里可抽到的来源塞到 sources
      appendSourcesFromTool(view, msg);
    }
  }

  // 剩余还在累积的 turn 也 flush 出去（流式中断也能看到部分结果）
  for (const k of Array.from(pending.keys())) flush(k);
  return out;
}

/**
 * assistant 消息里每个 toolCall 暂时标记为 running，等对应 tool 消息到达时再回填
 */
function toolCallsToRunningSteps(calls: ToolCall[] | undefined): TurnStep[] {
  return (calls ?? []).map(toolCallToRunningStep);
}

function toolCallToRunningStep(tc: ToolCall): TurnStep {
  if (tc.name === 'web_search') {
    const query = parseArgString(tc.arguments, 'query');
    return {
      kind: 'search',
      callId: tc.id,
      query,
      status: 'running',
    };
  }
  if (tc.name === 'web_fetch') {
    const url = parseArgString(tc.arguments, 'url');
    return {
      kind: 'fetch',
      callId: tc.id,
      url,
      status: 'running',
    };
  }
  return {
    kind: 'tool',
    callId: tc.id,
    name: tc.name,
    preview: oneLinePreview(tc.arguments),
    status: 'running',
  };
}

/**
 * 在 running step 上叠加 tool 结果（成功/失败、计数、字符数）
 */
function decorateStepWithResult(
  step: TurnStep,
  msg: MessageDTO,
  isError: boolean
): TurnStep {
  if (isError) {
    return { ...step, status: 'error', error: shortErrorHint(msg.content) };
  }
  if (step.kind === 'search') {
    return { ...step, status: 'ok', count: countSearchResults(msg.content) };
  }
  if (step.kind === 'fetch') {
    return { ...step, status: 'ok', chars: approxChars(msg.content) };
  }
  return { ...step, status: 'ok' };
}

/** 从 tool 结果里抽取来源 chips，按域名去重追加到 view.sources */
function appendSourcesFromTool(view: TurnView, msg: MessageDTO): void {
  if (msg.content.startsWith('Error:')) return;
  let items: SourceItem[] = [];
  if (msg.name === 'web_search') {
    items = parseSearchSources(msg.content);
  } else if (msg.name === 'web_fetch') {
    const item = parseFetchSource(msg.content);
    if (item) items = [item];
  }
  for (const it of items) {
    if (view.sources.some((s) => s.domain === it.domain)) continue;
    view.sources.push({ ...it, cached: msg.cached });
  }
}

// =================== 解析器 ===================

/**
 * 解析 `web_search` 的文本结果（由 [webSearch.ts](src/core/agent/tools/webSearch.ts) 生成）：
 *   [1] title
 *       url
 *       snippet
 *
 *   [2] ...
 */
export function parseSearchSources(content: string): SourceItem[] {
  const blocks = content.split(/\n{2,}/);
  const out: SourceItem[] = [];
  for (const block of blocks) {
    // 块内首行 [N] 标题；第二个非空行 URL；其余为 snippet
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) continue;
    const titleMatch = lines[0].match(/^\[\d+\]\s*(.*)$/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim() || lines[0];
    const url = lines[1];
    if (!/^https?:\/\//i.test(url)) continue;
    const domain = urlHost(url);
    if (!domain) continue;
    out.push({ url, domain, title });
  }
  return out;
}

/**
 * 解析 `web_fetch` 的文本结果头部：`# <url>\n[status: ...]\n\n<markdown>...`
 */
export function parseFetchSource(content: string): SourceItem | null {
  const firstLine = content.split('\n', 1)[0] ?? '';
  const m = firstLine.match(/^#\s+(https?:\/\/\S+)/i);
  if (!m) return null;
  const url = m[1];
  const domain = urlHost(url);
  if (!domain) return null;
  // 尝试从 markdown 里找第一个 h1/h2 作为 title，否则 domain
  const titleLine = content.split('\n').find((l) => /^#{1,2}\s+\S/.test(l) && !/^#\s+https?:/i.test(l));
  const title = titleLine?.replace(/^#{1,2}\s+/, '').trim() || domain;
  return { url, domain, title };
}

function countSearchResults(content: string): number {
  const matches = content.match(/^\[\d+\]/gm);
  return matches ? matches.length : 0;
}

function approxChars(content: string): number {
  // 扣掉我们自己拼的 header `# url\n[status: ...]\n\n` 以及「同域内链」尾部
  const bodyStart = content.indexOf('\n\n');
  const afterHeader = bodyStart >= 0 ? content.slice(bodyStart + 2) : content;
  const linksIdx = afterHeader.indexOf('\n---\n[同域内链');
  const body = linksIdx >= 0 ? afterHeader.slice(0, linksIdx) : afterHeader;
  return body.length;
}

function shortErrorHint(content: string): string {
  const firstLine = content.replace(/^Error:\s*/, '').split('\n', 1)[0] ?? '';
  return firstLine.slice(0, 120);
}

function parseArgString(raw: string, key: string): string {
  try {
    const obj = JSON.parse(raw || '{}') as Record<string, unknown>;
    const v = obj[key];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

function oneLinePreview(raw: string): string {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= 60) return s;
  return s.slice(0, 60) + '…';
}

function urlHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function fallbackBubble(msg: MessageDTO): MessageDTO {
  // tool 消息没有 persona / content，这里先用 tool 的时间戳凑一个空 assistant 壳
  // 在 UI 层如果首个消息是 tool（理论罕见），也能正常渲染
  return {
    role: 'assistant',
    content: '',
    timestamp: msg.timestamp,
    turnId: msg.turnId,
  };
}

function finalizeTurnView(v: TurnView): void {
  v.hasRunningStep = v.steps.some((s) => s.status === 'running');
}
