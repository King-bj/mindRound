/**
 * 消息气泡组件
 * @description 微信风格：对方消息为「左侧头像 + 右侧气泡」；己方消息为「左侧气泡 + 右侧头像」；
 * Agent 化后新增：assistant 可能携带 toolCalls（渲染为折叠卡），role=tool 渲染为独立折叠结果卡
 */
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stripModelThinkBlocks } from '../../core/utils/messageContent';
import type { ToolCall } from '../../core/domain/Chat';

interface MessageBubbleProps {
  /** 消息角色 */
  role: 'user' | 'assistant' | 'tool';
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 发言者名称（群聊时显示） */
  speakerName?: string;
  /** 发言者头像 */
  speakerAvatar?: string | null;
  /** assistant 消息的工具调用（非空时展示折叠卡列表） */
  toolCalls?: ToolCall[];
  /** tool 消息对应的工具名（role=tool 时使用） */
  toolName?: string;
  /** 该 tool 结果是否命中缓存 */
  cached?: boolean;
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

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  content,
  timestamp,
  speakerName,
  speakerAvatar,
  toolCalls,
  toolName,
  cached,
}) => {
  const timeStr = formatTime(timestamp);

  // tool 消息：独占一行的折叠卡片
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

  const isUser = role === 'user';
  const peerLabel = speakerName || '对方';

  const displayText = useMemo(() => {
    if (isUser) return content;
    return stripModelThinkBlocks(content);
  }, [content, isUser]);

  const hasText = displayText.trim().length > 0;
  const hasToolCalls = !!toolCalls && toolCalls.length > 0;

  const bubbleBody = (
    <div className={`message-bubble-body ${isUser ? 'user' : 'assistant'}`}>
      {isUser ? (
        <p className="message-text">{displayText}</p>
      ) : displayText.trim() === '' ? (
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
          {hasText || !hasToolCalls ? (
            <div className="message-md message-text">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayText || '\u00a0'}
              </ReactMarkdown>
            </div>
          ) : null}
          {hasToolCalls ? (
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
