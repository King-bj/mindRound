/**
 * 会话列表页面
 * @description 显示所有会话，包含单聊和群聊
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, EmptyChatsIllustration } from '../components/Icons';
import { formatRelativeTime } from '../../core/utils/time';
import type { Chat } from '../../core/domain/Chat';
import type { IChatService } from '../../core/services/ChatService';
import type { IPersonaRepository } from '../../core/repositories/IPersonaRepository';

interface SessionsPageProps {
  chatService: IChatService;
  personaRepository: IPersonaRepository;
  onSelectChat: (chatId: string) => void;
  onCreateGroup: () => void;
  onContacts: () => void;
  /** 桌面分栏时当前选中的会话（高亮列表项） */
  selectedChatId?: string | null;
}

export const SessionsPage: React.FC<SessionsPageProps> = ({
  chatService,
  personaRepository,
  onSelectChat,
  selectedChatId = null,
  // 预留功能参数：暂未实现
  onCreateGroup: _onCreateGroup,
  onContacts: _onContacts,
}) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [personaNames, setPersonaNames] = useState<Record<string, string>>({});

  const loadChats = useCallback(async () => {
    setIsLoading(true);
    try {
      const [allChats, personas] = await Promise.all([
        chatService.getChats(),
        personaRepository.scan(),
      ]);
      setChats(allChats);

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

  /** 单聊按人格去重（列表按更新时间排序，保留每人最新的一条；避免历史重复数据占两行） */
  const displayChats = useMemo(() => {
    const seenPersona = new Set<string>();
    return chats.filter((chat) => {
      if (chat.type !== 'single' || chat.personaIds.length !== 1) {
        return true;
      }
      const pid = chat.personaIds[0];
      if (seenPersona.has(pid)) {
        return false;
      }
      seenPersona.add(pid);
      return true;
    });
  }, [chats]);

  return (
    <div className="sessions-page-inner">
      <div className="wechat-search-bar" role="search">
        <input
          type="search"
          placeholder="搜索"
          className="wechat-search-input"
          aria-label="搜索会话"
        />
      </div>

      <div className="chat-list" role="list" aria-label="会话列表">
        {displayChats.length === 0 && !isLoading ? (
          <div className="wechat-empty" role="status">
            <div className="wechat-empty-icon">
              <EmptyChatsIllustration />
            </div>
            <p className="wechat-empty-text">暂无会话</p>
            <p className="wechat-empty-hint">
              从通讯录选择作者开始聊天
            </p>
          </div>
        ) : (
          displayChats.map((chat, index) => {
            const isGroup = chat.type === 'group';
            const displayName = isGroup
              ? chat.title
              : personaNames[chat.personaIds[0]] || chat.personaIds[0];

            const timeLabel = formatRelativeTime(chat.updatedAt);
            return (
              <button
                key={chat.id}
                className={`wechat-list-item${selectedChatId === chat.id ? ' active' : ''}`}
                onClick={() => onSelectChat(chat.id)}
                role="listitem"
                style={{ animationDelay: `${index * 50}ms` }}
                aria-label={`${displayName}${isGroup ? `，${chat.personaIds.length}人讨论组` : ''}`}
              >
                <div className="wechat-avatar" aria-hidden="true">
                  {isGroup ? (
                    <Users size={20} strokeWidth={1.75} />
                  ) : (
                    <span>{displayName[0] || '?'}</span>
                  )}
                </div>
                <div className="wechat-list-info">
                  <span className="wechat-list-name">{displayName}</span>
                  <span className="wechat-list-desc">
                    {isGroup
                      ? `${chat.personaIds.length}人讨论`
                      : '点击开始对话'}
                  </span>
                </div>
                {timeLabel ? (
                  <span className="wechat-list-time" aria-label={`最后活跃: ${timeLabel}`}>
                    {timeLabel}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
