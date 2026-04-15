/**
 * 消息气泡组件
 * @description 渲染单条聊天消息，支持用户消息和助手消息
 */
import React from 'react';

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
 * 格式化时间戳
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  content,
  timestamp,
  speakerName,
  speakerAvatar,
}) => {
  const isUser = role === 'user';

  return (
    <div className={`message-bubble message-${role}`}>
      {!isUser && speakerAvatar && (
        <img
          src={speakerAvatar}
          alt={speakerName || 'avatar'}
          className="message-avatar"
        />
      )}

      <div className="message-content-wrapper">
        {!isUser && speakerName && (
          <span className="message-sender">{speakerName}</span>
        )}

        <div className={`message-bubble-body ${isUser ? 'user' : 'assistant'}`}>
          <p className="message-text">{content}</p>
        </div>

        <span className="message-time">{formatTime(timestamp)}</span>
      </div>

      {isUser && (
        <img
          src="/user-avatar.png"
          alt="me"
          className="message-avatar"
        />
      )}
    </div>
  );
};
