/**
 * 消息气泡组件
 * @description
 * 一个气泡 = `[折叠步骤行]` + `[markdown 正文]` + `[Sources chips 底条]`。
 * 设计对齐 ChatGPT：多轮工具调用坍缩为紧凑的状态行，底部一条引用 chips 条；
 * 失败步骤以红字短提示呈现；运行中步骤只靠 spinner 表达，不再叠加"正在输入…"。
 *
 * 兼容旧消息：当未提供 `steps` / `sources` 时仍按老路径渲染单条消息。
 */
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stripModelThinkBlocks } from '../../core/utils/messageContent';
import type { ToolCall } from '../../core/domain/Chat';
import type { SourceItem, TurnStep } from '../utils/turnAggregator';

interface MessageBubbleProps {
  /** 消息角色 */
  role: 'user' | 'assistant' | 'tool';
  /** 消息内容（assistant 回合聚合后的最终正文；user 的原文；tool 独立渲染时的结果文本） */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 发言者名称（群聊时显示） */
  speakerName?: string;
  /** 发言者头像 */
  speakerAvatar?: string | null;
  /**
   * 传统 assistant 消息的工具调用（无聚合路径时使用，与 steps 互斥；
   * 新聚合路径请使用 `steps` 与 `sources`）
   */
  toolCalls?: ToolCall[];
  /** tool 消息对应的工具名（role=tool 时使用） */
  toolName?: string;
  /** 该 tool 结果是否命中缓存 */
  cached?: boolean;
  /** 聚合后的步骤列表（新 UI 路径） */
  steps?: TurnStep[];
  /** 聚合后的来源 chips（新 UI 路径） */
  sources?: SourceItem[];
  /** 该回合是否仍有未完成的工具调用（尚未拿到 tool 结果） */
  hasRunningStep?: boolean;
}

/**
 * 格式化时间戳（无效则返回空，避免显示 Invalid Date）
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 方形头像：有图则展示图，否则展示首字
 */
function MessageAvatarFace({
  label,
  src,
}: {
  label: string;
  src?: string | null;
}) {
  const initial = (label || '?').slice(0, 1).toUpperCase();
  return (
    <div className="message-avatar" aria-hidden="true">
      {src ? (
        <img src={src} alt="" />
      ) : (
        <span className="message-avatar-fallback">{initial}</span>
      )}
    </div>
  );
}

/**
 * 旧版折叠卡（用于 role=tool 独立渲染 + 旧 assistant 兜底）
 */
function CollapsibleCard({
  title,
  preview,
  children,
  defaultOpen = false,
}: {
  title: string;
  preview?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`tool-card ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="tool-card-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-card-caret" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="tool-card-title">{title}</span>
        {!open && preview ? (
          <span className="tool-card-preview">{preview}</span>
        ) : null}
      </button>
      {open ? <div className="tool-card-body">{children}</div> : null}
    </div>
  );
}

function formatToolArgs(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '(无参数)';
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function oneLinePreview(raw: string): string {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= 80) return s;
  return s.slice(0, 80) + '…';
}

/** 单个步骤图标：根据 status 切换（运行中用 spinner） */
function StepIcon({ status }: { status: TurnStep['status'] }) {
  if (status === 'running') {
    return <span className="step-spinner" aria-hidden="true" />;
  }
  if (status === 'error') {
    return <span className="step-icon step-icon-err" aria-hidden="true">⚠</span>;
  }
  return <span className="step-icon step-icon-ok" aria-hidden="true">✓</span>;
}

/** 把单个 TurnStep 渲染成一行紧凑状态 */
function StepRow({ step }: { step: TurnStep }) {
  let verb = '';
  let detail = '';
  if (step.kind === 'search') {
    verb = '搜索';
    const q = step.query ? `"${step.query}"` : '';
    if (step.status === 'ok') {
      detail = `${q} · ${step.count ?? 0} 条`;
    } else if (step.status === 'running') {
      detail = q ? `${q} …` : '…';
    } else {
      detail = `${q} — ${step.error ?? '失败'}`;
    }
  } else if (step.kind === 'fetch') {
    verb = '已读';
    const shortUrl = shortenUrl(step.url);
    if (step.status === 'ok') {
      detail = `${shortUrl} · ${formatChars(step.chars ?? 0)}`;
    } else if (step.status === 'running') {
      detail = `${shortUrl} …`;
    } else {
      detail = `${shortUrl} — ${step.error ?? '失败'}`;
    }
  } else {
    verb = step.name;
    if (step.status === 'ok') {
      detail = step.preview ?? '';
    } else if (step.status === 'running') {
      detail = step.preview ? `${step.preview} …` : '…';
    } else {
      detail = step.error ?? '失败';
    }
  }
  return (
    <div className={`turn-step turn-step-${step.status}`}>
      <StepIcon status={step.status} />
      <span className="turn-step-verb">{verb}</span>
      <span className="turn-step-detail" title={detail}>
        {detail}
      </span>
    </div>
  );
}

/** 步骤区：默认折叠成一行总述，点开看详情 */
function StepsBlock({
  steps,
  running,
}: {
  steps: TurnStep[];
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  const summary = summarizeSteps(steps, running);
  return (
    <div className={`turn-steps ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="turn-steps-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {running ? (
          <span className="step-spinner" aria-hidden="true" />
        ) : (
          <span className="step-icon step-icon-dot" aria-hidden="true">●</span>
        )}
        <span className="turn-steps-summary-text">{summary}</span>
        <span className="turn-steps-caret" aria-hidden>
          {open ? '收起' : '详情'}
        </span>
      </button>
      {open ? (
        <div className="turn-steps-list">
          {steps.map((s) => (
            <StepRow key={s.callId} step={s} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 底部 Sources chips 条（ChatGPT 风格） */
function SourcesBar({ sources }: { sources: SourceItem[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="turn-sources" aria-label="来源">
      <span className="turn-sources-label">来源</span>
      <div className="turn-sources-chips">
        {sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="source-chip"
            title={`${s.title}\n${s.url}`}
          >
            <img
              className="source-chip-favicon"
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(
                s.domain
              )}&sz=32`}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            <span className="source-chip-domain">{s.domain}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  content,
  timestamp,
  speakerName,
  speakerAvatar,
  toolCalls,
  toolName,
  cached,
  steps,
  sources,
  hasRunningStep,
}) => {
  const timeStr = formatTime(timestamp);
  const isUser = role === 'user';
  const peerLabel = speakerName || '对方';

  // Hooks 必须在任何 early return 之前调用，保证每次渲染顺序一致
  const displayText = useMemo(() => {
    if (isUser) return content;
    return stripModelThinkBlocks(content);
  }, [content, isUser]);

  // tool 消息：独占一行的折叠卡片（仅当 UI 选择"单独渲染 tool 消息"时使用，
  // 新聚合路径下 tool 消息会被合并到 assistant 气泡的 steps 里，不会走这里）
  if (role === 'tool') {
    const title = `工具结果 · ${toolName ?? 'tool'}${cached ? '（缓存）' : ''}`;
    return (
      <div className="message-bubble message-tool">
        <CollapsibleCard
          title={title}
          preview={oneLinePreview(content)}
          defaultOpen={false}
        >
          <pre className="tool-card-content">{content}</pre>
        </CollapsibleCard>
        {timeStr ? <span className="message-time tool-time">{timeStr}</span> : null}
      </div>
    );
  }

  const hasText = displayText.trim().length > 0;
  const hasSteps = !!steps && steps.length > 0;
  const hasToolCalls = !!toolCalls && toolCalls.length > 0;
  const hasSources = !!sources && sources.length > 0;
  // 运行中指示：聚合路径直接读 hasRunningStep；兜底用 toolCalls 存在推断
  const running = hasRunningStep ?? (hasToolCalls && !hasText && !hasSteps);

  /**
   * 只有在"纯粹还没开始输出"时才显示气泡内"正在输入…"：
   * - 无正文、无 steps、无 toolCalls
   * 避免修复 typing 堆叠 bug：有 steps/toolCalls 时由 steps 区的 spinner 负责"进行中"语义。
   */
  const showTypingPlaceholder = !isUser && !hasText && !hasSteps && !hasToolCalls;

  const bubbleBody = (
    <div className={`message-bubble-body ${isUser ? 'user' : 'assistant'}`}>
      {isUser ? (
        <p className="message-text">{displayText}</p>
      ) : showTypingPlaceholder ? (
        <div
          className="message-md message-text message-bubble-typing-wrap"
          role="status"
          aria-live="polite"
        >
          <span className="message-bubble-typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>正在输入…</span>
        </div>
      ) : (
        <>
          {hasSteps ? (
            <StepsBlock steps={steps!} running={running} />
          ) : null}
          {hasText ? (
            <div className="message-md message-text">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayText}
              </ReactMarkdown>
            </div>
          ) : running && !hasSteps ? (
            // 旧路径兜底：有 toolCalls 但没走聚合路径，这里用 running 小标记替代 typing
            <div className="turn-running-hint" role="status" aria-live="polite">
              <span className="step-spinner" aria-hidden="true" />
              <span>处理中…</span>
            </div>
          ) : null}
          {!hasSteps && hasToolCalls ? (
            <div className="tool-calls-list">
              {toolCalls!.map((tc, i) => (
                <CollapsibleCard
                  key={tc.id || `${tc.name}-${i}`}
                  title={`调用 · ${tc.name || 'tool'}`}
                  preview={oneLinePreview(tc.arguments || '')}
                >
                  <pre className="tool-card-content">
                    {formatToolArgs(tc.arguments || '')}
                  </pre>
                </CollapsibleCard>
              ))}
            </div>
          ) : null}
          {hasSources ? <SourcesBar sources={sources!} /> : null}
        </>
      )}
    </div>
  );

  const meta = (
    <div className="message-content-wrapper">
      {!isUser && speakerName && <span className="message-sender">{speakerName}</span>}
      {bubbleBody}
      {timeStr ? <span className="message-time">{timeStr}</span> : null}
    </div>
  );

  if (isUser) {
    return (
      <div className="message-bubble message-user">
        {meta}
        <MessageAvatarFace label="我" src={null} />
      </div>
    );
  }

  return (
    <div className="message-bubble message-assistant">
      <MessageAvatarFace label={peerLabel} src={speakerAvatar} />
      {meta}
    </div>
  );
};

// ============ 辅助 ============

/**
 * 把一组 step 汇总成折叠时的单行摘要，如 "已搜索 2 次 · 已读 3 页" / "正在搜索…"
 */
function summarizeSteps(steps: TurnStep[], running: boolean): string {
  let searchOk = 0;
  let searchFail = 0;
  let searchRunning = 0;
  let fetchOk = 0;
  let fetchFail = 0;
  let fetchRunning = 0;
  let otherOk = 0;
  let otherFail = 0;
  let otherRunning = 0;
  for (const s of steps) {
    if (s.kind === 'search') {
      if (s.status === 'ok') searchOk++;
      else if (s.status === 'error') searchFail++;
      else searchRunning++;
    } else if (s.kind === 'fetch') {
      if (s.status === 'ok') fetchOk++;
      else if (s.status === 'error') fetchFail++;
      else fetchRunning++;
    } else {
      if (s.status === 'ok') otherOk++;
      else if (s.status === 'error') otherFail++;
      else otherRunning++;
    }
  }
  const parts: string[] = [];
  if (searchRunning > 0) parts.push(`搜索中 ${searchRunning}`);
  if (searchOk > 0) parts.push(`已搜索 ${searchOk}`);
  if (searchFail > 0) parts.push(`搜索失败 ${searchFail}`);
  if (fetchRunning > 0) parts.push(`抓取中 ${fetchRunning}`);
  if (fetchOk > 0) parts.push(`已读 ${fetchOk} 页`);
  if (fetchFail > 0) parts.push(`抓取失败 ${fetchFail}`);
  if (otherRunning > 0) parts.push(`工具 ${otherRunning} 运行中`);
  if (otherOk > 0) parts.push(`工具 ${otherOk} 完成`);
  if (otherFail > 0) parts.push(`工具 ${otherFail} 失败`);
  if (parts.length === 0) {
    return running ? '处理中…' : `${steps.length} 个步骤`;
  }
  return parts.join(' · ');
}

/** 友好展示 URL：host + 最多 24 字路径 */
function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname;
    const tail = path.length > 24 ? path.slice(0, 24) + '…' : path;
    return `${host}${tail}`;
  } catch {
    return url;
  }
}

function formatChars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k 字`;
  return `${n} 字`;
}
