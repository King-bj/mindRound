/**
 * 聊天状态管理
 * @description 使用 Zustand 管理聊天相关的全局状态
 */
import { create } from 'zustand';
import type { Chat } from '../../core/domain/Chat';
import type { MessageDTO } from '../../core/domain/Chat';
import type { IChatService, MessageUpdateEvent } from '../../core/services/ChatService';

interface ChatState {
  /** 会话列表 */
  chats: Chat[];
  /** 当前会话 */
  currentChat: Chat | null;
  /** 当前消息列表 */
  messages: MessageDTO[];
  /** 加载状态 */
  isLoading: boolean;
  /** 正在发送消息 */
  isSending: boolean;
  /** 错误信息 */
  error: string | null;
}

interface ChatActions {
  /** 加载会话列表 */
  loadChats: () => Promise<void>;
  /** 选择会话 */
  selectChat: (id: string) => Promise<void>;
  /** 发送消息 */
  sendMessage: (content: string) => Promise<void>;
  /** 创建单聊 */
  createSingleChat: (personaId: string) => Promise<void>;
  /** 创建群聊 */
  createGroupChat: (title: string, personaIds: string[]) => Promise<void>;
  /** 处理消息更新 */
  handleMessageUpdate: (event: MessageUpdateEvent) => void;
  /** 清除错误 */
  clearError: () => void;
}

type ChatStore = ChatState & ChatActions;

/**
 * 创建聊天 Store
 * @param chatService - 聊天服务实例
 * @returns Zustand store
 */
export function createChatStore(chatService: IChatService) {
  // 设置消息更新回调
  chatService.onMessageUpdate = (event) => {
    getState().handleMessageUpdate(event);
  };

  const getState = () => store.getState() as ChatStore;

  const store = create<ChatStore>((set, get) => ({
    // State
    chats: [],
    currentChat: null,
    messages: [],
    isLoading: false,
    isSending: false,
    error: null,

    // Actions
    loadChats: async () => {
      set({ isLoading: true, error: null });
      try {
        const chats = await chatService.getChats();
        set({ chats, isLoading: false });
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false });
      }
    },

    selectChat: async (id: string) => {
      set({ isLoading: true, error: null });
      try {
        const messages = await chatService.getHistory(id);
        set({ messages, isLoading: false });
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false });
      }
    },

    sendMessage: async (content: string) => {
      const { currentChat } = get();
      if (!currentChat || !content.trim()) return;

      set({ isSending: true, error: null });
      try {
        await chatService.sendMessage(currentChat.id, content);
        set({ isSending: false });
      } catch (err) {
        set({ error: (err as Error).message, isSending: false });
      }
    },

    createSingleChat: async (personaId: string) => {
      set({ isLoading: true, error: null });
      try {
        const chat = await chatService.createSingleChat(personaId);
        set((state) => ({
          chats: [chat, ...state.chats],
          currentChat: chat,
          messages: [],
          isLoading: false,
        }));
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false });
      }
    },

    createGroupChat: async (title: string, personaIds: string[]) => {
      set({ isLoading: true, error: null });
      try {
        const chat = await chatService.createGroupChat(title, personaIds);
        set((state) => ({
          chats: [chat, ...state.chats],
          currentChat: chat,
          messages: [],
          isLoading: false,
        }));
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false });
      }
    },

    handleMessageUpdate: (event: MessageUpdateEvent) => {
      const { currentChat, messages } = get();
      if (!currentChat || event.chatId !== currentChat.id) return;

      const existingIndex = messages.findIndex(
        (m) => m.timestamp === event.message.timestamp && m.role === event.message.role
      );

      if (existingIndex >= 0) {
        // 更新现有消息
        const updated = [...messages];
        updated[existingIndex] = event.message;
        set({ messages: updated });
      } else if (event.done) {
        // 新消息且已完成
        set({ messages: [...messages, event.message] });
      }
      // 流式中且不是现有消息，不添加到列表（等待完成）
    },

    clearError: () => set({ error: null }),
  }));

  return store;
}
