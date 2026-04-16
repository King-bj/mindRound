/**
 * 聊天页面
 * @description 单聊和群聊共用的聊天界面
 */
import React, { useState, useEffect, useRef } from 'react';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInput } from '../components/ChatInput';
import { GroupChatInfoPanel } from '../components/groupChatInfoPanel';
import { ArrowLeft, MoreHorizontal } from '../components/Icons';
import type { Chat, MessageDTO } from '../../core/domain/Chat';
import type { Persona } from '../../core/domain/Persona';
import type { IChatService } from '../../core/services/ChatService';
import type { IPersonaRepository } from '../../core/repositories/IPersonaRepository';

interface ChatPageProps {
  chatId: string;
  chatService: IChatService;
  personaRepository: IPersonaRepository;
  onBack: () => void;
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
}) => {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [personaMap, setPersonaMap] = useState<Record<string, PersonaInfo>>({});
  const [allPersonas, setAllPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
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
      <header className="wechat-header" role="banner">
        <button
          className="wechat-header-btn"
          onClick={onBack}
          aria-label="返回"
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
        <h1 className="wechat-header-title">{getTitle()}</h1>
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
          <span className="wechat-header-btn-placeholder" aria-hidden />
        )}
      </header>

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
        {messages.map((msg, index) => {
          const persona = msg.personaId ? personaMap[msg.personaId] : undefined;
          return (
            <MessageBubble
              key={`${msg.timestamp}-${index}`}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              speakerName={persona?.name}
              speakerAvatar={persona?.avatar}
            />
          );
        })}
        {/* 等待助手首包前显示；流式开始后由助手气泡展示，避免与「正在输入」叠在顶部 */}
        {isSending && !messages.some((m) => m.role === 'assistant') && (
          <div className="typing-indicator" role="status" aria-live="polite">
            <span>正在输入...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <ChatInput onSend={handleSend} disabled={isSending} />
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
    </div>
  );
};
