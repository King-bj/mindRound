/**
 * 聊天页面
 * @description 单聊和群聊共用的聊天界面
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInput } from '../components/ChatInput';
import { GroupChatInfoPanel } from '../components/groupChatInfoPanel';
import { PersonaInfoPanel } from '../components/PersonaInfoPanel';
import { ArrowLeft, MoreHorizontal, Search } from '../components/Icons';
import type { Chat, MessageDTO } from '../../core/domain/Chat';
import type { Persona } from '../../core/domain/Persona';
import type { IChatService } from '../../core/services/ChatService';
import type { IPersonaRepository } from '../../core/repositories/IPersonaRepository';
import { buildTurnViews } from '../utils/turnAggregator';

interface ChatPageProps {
  chatId: string;
  chatService: IChatService;
  personaRepository: IPersonaRepository;
  onBack: () => void;
  /** 为 false 时隐藏左上角返回（桌面分栏内由侧栏承担导航） */
  showBackButton?: boolean;
}

interface PersonaInfo {
  id: string;
  name: string;
  avatar: string | null;
}

export const ChatPage: React.FC<ChatPageProps> = ({
  chatId,
  chatService,
  personaRepository,
  onBack,
  showBackButton = true,
}) => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [personaMap, setPersonaMap] = useState<Record<string, PersonaInfo>>({});
  const [allPersonas, setAllPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPersonaPanel, setShowPersonaPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loadChat = async () => {
      setIsLoading(true);
      try {
        const [history, chatData, personas] = await Promise.all([
          chatService.getHistory(chatId),
          chatService.getChatById(chatId),
          personaRepository.scan(),
        ]);
        if (cancelled) return;

        setMessages(history);
        setChat(chatData);

        setAllPersonas(personas);
        const map: Record<string, PersonaInfo> = {};
        personas.forEach((p) => {
          map[p.id] = { id: p.id, name: p.name, avatar: p.avatar };
        });
        setPersonaMap(map);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadChat();

    // 订阅流式消息更新
    chatService.onMessageUpdate = (event) => {
      if (cancelled || event.chatId !== chatId) return;

      setMessages((prev) => {
        const existingIndex = prev.findIndex(
          (m) => m.timestamp === event.message.timestamp && m.role === event.message.role
        );

        if (existingIndex >= 0) {
          // 更新现有消息（流式追加）
          const updated = [...prev];
          updated[existingIndex] = event.message;
          return updated;
        } else {
          // 新消息
          return [...prev, event.message];
        }
      });

      if (event.done) {
        setIsSending(false);
      }
    };

    return () => {
      cancelled = true;
      chatService.onMessageUpdate = undefined;
    };
  }, [chatId, chatService, personaRepository]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * 把线性 `messages` 按 `turnId` 聚合成若干回合视图：
   * - 同一 Agent.run 产生的 assistant + tool 消息合并为一个气泡
   * - 旧消息无 `turnId` → 单条消息一个气泡（兼容老数据）
   */
  const turnViews = useMemo(() => buildTurnViews(messages), [messages]);

  /** 对话框内搜索：按正文过滤回合视图 */
  const visibleTurns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return turnViews;
    return turnViews.filter((view) => {
      const text = view.grouped ? view.content : view.bubble.content;
      return text.toLowerCase().includes(q);
    });
  }, [turnViews, searchQuery]);

  const searchHighlight =
    showSearch && searchQuery.trim().length > 0 ? searchQuery : undefined;

  const handleSend = async (content: string) => {
    if (!content.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    try {
      await chatService.sendMessage(chatId, content);
    } catch (err) {
      setError((err as Error).message);
      setIsSending(false);
    }
    // 不需要手动加载历史 - 流式更新回调会处理
  };

  /**
   * 群聊追加成员后刷新会话元数据与人格映射
   */
  const handleAddGroupPersonas = async (personaIds: string[]) => {
    const updated = await chatService.addPersonasToGroup(chatId, personaIds);
    setChat(updated);
    const personas = await personaRepository.scan();
    setAllPersonas(personas);
    const map: Record<string, PersonaInfo> = {};
    personas.forEach((p) => {
      map[p.id] = { id: p.id, name: p.name, avatar: p.avatar };
    });
    setPersonaMap(map);
  };

  const getTitle = () => {
    if (!chat) return '加载中...';
    if (chat.type === 'group') return chat.title;
    return personaMap[chat.personaIds[0]]?.name || chat.personaIds[0];
  };

  if (isLoading) {
    return (
      <div className="chat-page">
        <div className="chat-loading" role="status" aria-live="polite">加载中...</div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <header className="wechat-header chat-page-header" role="banner">
        <div className="chat-page-header-left">
          {showBackButton ? (
            <button
              type="button"
              className="wechat-header-btn"
              onClick={onBack}
              aria-label="返回"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          ) : (
            <span className="wechat-header-btn-placeholder" aria-hidden />
          )}
        </div>
        <div className="chat-page-header-center">
          <h1 className="wechat-header-title chat-page-header-title">{getTitle()}</h1>
        </div>
        <div className="chat-page-header-right">
          <button
            type="button"
            className={`wechat-header-btn${showSearch ? '' : ' chat-page-header-icon-muted'}`}
            aria-label="搜索消息"
            aria-expanded={showSearch}
            onClick={() => {
              setShowSearch((v) => {
                if (v) setSearchQuery('');
                return !v;
              });
            }}
          >
            <Search size={18} strokeWidth={2} />
          </button>
          {chat?.type === 'group' ? (
            <button
              type="button"
              className="wechat-header-btn"
              aria-label="群资料与成员"
              aria-expanded={showGroupPanel}
              onClick={() => setShowGroupPanel((v) => !v)}
            >
              <MoreHorizontal size={20} strokeWidth={2} />
            </button>
          ) : (
            <button
              type="button"
              className="wechat-header-btn"
              aria-label="作者资料"
              aria-expanded={showPersonaPanel}
              onClick={() => setShowPersonaPanel((v) => !v)}
            >
              <MoreHorizontal size={20} strokeWidth={2} />
            </button>
          )}
        </div>
      </header>

      {showSearch ? (
        <div className="chat-search-bar" role="search">
          <Search size={16} strokeWidth={2} className="chat-search-icon" aria-hidden />
          <input
            type="search"
            className="chat-search-input"
            placeholder="搜索消息内容…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="搜索消息内容"
          />
          <span className="chat-search-count" aria-live="polite">
            {searchQuery.trim()
              ? `匹配 ${visibleTurns.length} 条`
              : `共 ${turnViews.length} 条`}
          </span>
          <button
            type="button"
            className="chat-search-close"
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
            aria-label="关闭搜索"
          >
            ×
          </button>
        </div>
      ) : null}

      {error && (
        <div className="chat-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="关闭错误提示">
            ×
          </button>
        </div>
      )}

      <div
        className="message-list"
        role="log"
        aria-label="聊天消息"
        aria-live="polite"
      >
        {visibleTurns.map((view) => {
          const msg = view.bubble;
          const persona = msg.personaId ? personaMap[msg.personaId] : undefined;
          return (
            <MessageBubble
              key={view.key}
              role={msg.role}
              content={view.grouped ? view.content : msg.content}
              timestamp={msg.timestamp}
              speakerName={persona?.name}
              speakerAvatar={persona?.avatar}
              toolCalls={view.grouped ? undefined : msg.toolCalls}
              toolName={msg.name}
              cached={msg.cached}
              steps={view.grouped ? view.steps : undefined}
              sources={view.grouped ? view.sources : undefined}
              hasRunningStep={view.grouped ? view.hasRunningStep : undefined}
              highlight={searchHighlight}
            />
          );
        })}
        {/* 等待助手首包前显示；流式开始后由助手气泡展示，避免与「正在输入」叠在顶部 */}
        {isSending && !messages.some(
          (m) => m.role === 'assistant' || m.role === 'tool'
        ) && (
          <div className="typing-indicator" role="status" aria-live="polite">
            <span>正在输入...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <ChatInput
          onSend={handleSend}
          disabled={isSending}
        />
      </div>

      {chat?.type === 'group' && (
        <GroupChatInfoPanel
          isOpen={showGroupPanel}
          chat={chat}
          allPersonas={allPersonas}
          onClose={() => setShowGroupPanel(false)}
          onAddPersonas={handleAddGroupPersonas}
        />
      )}

      {chat?.type === 'single' && (
        <PersonaInfoPanel
          isOpen={showPersonaPanel}
          persona={allPersonas.find((p) => p.id === chat.personaIds[0]) ?? null}
          onClose={() => setShowPersonaPanel(false)}
        />
      )}
    </div>
  );
};
