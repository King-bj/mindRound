/**
 * 消息气泡组件
 * @description 微信风格：对方消息为「左侧头像 + 右侧气泡」；己方消息为「左侧气泡 + 右侧头像」
 */
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stripModelThinkBlocks } from '../../core/utils/messageContent';

interface MessageBubbleProps {
  /** 消息角色 */
  role: 'user' | 'assistant';
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 发言者名称（群聊时显示） */
  speakerName?: string;
  /** 发言者头像 */
  speakerAvatar?: string | null;
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

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  content,
  timestamp,
  speakerName,
  speakerAvatar,
}) => {
  const isUser = role === 'user';
  const peerLabel = speakerName || '对方';
  const timeStr = formatTime(timestamp);

  const displayText = useMemo(() => {
    if (isUser) return content;
    return stripModelThinkBlocks(content);
  }, [content, isUser]);

  const bubbleBody = (
    <div className={`message-bubble-body ${isUser ? 'user' : 'assistant'}`}>
      {isUser ? (
        <p className="message-text">{displayText}</p>
      ) : (
        <div className="message-md message-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText || '\u00a0'}</ReactMarkdown>
        </div>
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
