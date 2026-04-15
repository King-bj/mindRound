/**
 * 聊天页面
 * @description 单聊和群聊共用的聊天界面
 */
import React, { useState, useEffect, useRef } from 'react';
import { MessageBubble } from '../components/MessageBubble';
import { ChatInput } from '../components/ChatInput';
import type { Chat, MessageDTO } from '../../core/domain/Chat';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    return () => {
      cancelled = true;
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
      const history = await chatService.getHistory(chatId);
      setMessages(history);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  const getTitle = () => {
    if (!chat) return '加载中...';
    if (chat.type === 'group') return chat.title;
    return personaMap[chat.personaIds[0]]?.name || chat.personaIds[0];
  };

  if (isLoading) {
    return (
      <div className="chat-page">
        <div className="chat-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <header className="page-header">
        <button className="back-btn" onClick={onBack}>
          ←
        </button>
        <h1 className="page-title">{getTitle()}</h1>
        <button className="menu-btn">⋯</button>
      </header>

      {error && (
        <div className="chat-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="message-list">
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
        {isSending && (
          <div className="typing-indicator">
            <span>正在输入...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <ChatInput onSend={handleSend} disabled={isSending} />
      </div>
    </div>
  );
};
