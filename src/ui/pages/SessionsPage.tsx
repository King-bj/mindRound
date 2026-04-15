/**
 * 会话列表页面
 * @description 显示所有会话，包含单聊和群聊
 */
import React, { useState, useEffect, useCallback } from 'react';
import type { Chat } from '../../core/domain/Chat';
import type { IChatService } from '../../core/services/ChatService';
import type { IPersonaRepository } from '../../core/repositories/IPersonaRepository';

interface SessionsPageProps {
  chatService: IChatService;
  personaRepository: IPersonaRepository;
  onSelectChat: (chatId: string) => void;
  onCreateGroup: () => void;
  onContacts: () => void;
}

/**
 * 格式化时间戳为友好显示
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
}

export const SessionsPage: React.FC<SessionsPageProps> = ({
  chatService,
  personaRepository,
  onSelectChat,
  onCreateGroup,
  onContacts,
}) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [personaNames, setPersonaNames] = useState<Record<string, string>>({});

  /**
   * 加载会话列表
   */
  const loadChats = useCallback(async () => {
    setIsLoading(true);
    try {
      // 通过 chatService 获取会话列表（需要实现 findAll）
      const allChats = await (chatService as unknown as { chatRepo: { findAll: () => Promise<Chat[]> } }).chatRepo.findAll();
      setChats(allChats);

      // 加载关联的人格名称
      const personas = await personaRepository.scan();
      const names: Record<string, string> = {};
      personas.forEach((p) => {
        names[p.id] = p.name;
      });
      setPersonaNames(names);
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [chatService, personaRepository]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  return (
    <div className="sessions-page">
      {/* 顶部栏 */}
      <header className="page-header">
        <button className="contacts-btn" onClick={onContacts}>
          通讯录
        </button>
        <h1 className="page-title">会话</h1>
        <button className="create-group-btn" onClick={onCreateGroup}>
          +
        </button>
      </header>

      {/* 会话列表 */}
      <div className="chat-list">
        {chats.length === 0 && !isLoading ? (
          <div className="empty-state">
            <p>暂无会话</p>
            <p className="empty-hint">从通讯录选择作者开始聊天</p>
          </div>
        ) : (
          chats.map((chat) => {
            const isGroup = chat.type === 'group';
            const displayName = isGroup
              ? chat.title
              : personaNames[chat.personaIds[0]] || chat.personaIds[0];

            return (
              <button
                key={chat.id}
                className="chat-item"
                onClick={() => onSelectChat(chat.id)}
              >
                <div className="chat-avatar">
                  {isGroup ? (
                    <span className="group-icon">👥</span>
                  ) : (
                    <span className="avatar-placeholder">
                      {displayName[0] || '?'}
                    </span>
                  )}
                </div>
                <div className="chat-info">
                  <div className="chat-header">
                    <span className="chat-name">{displayName}</span>
                    <span className="chat-time">{formatTimestamp(chat.updatedAt)}</span>
                  </div>
                  <span className="chat-preview">
                    {isGroup
                      ? `${chat.personaIds.length}人讨论`
                      : '点击开始对话'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
