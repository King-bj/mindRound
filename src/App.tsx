/**
 * MindRound 应用入口
 * @description 微信风格聊天应用，支持单聊和群聊
 */
import { useState, useEffect, useMemo } from 'react';
import { ContactsPage, SessionsPage, ChatPage, SettingsPage, CreateGroupPage } from './ui/pages';
import { MockAdapter } from './core/infrastructure/platforms/MockAdapter';
import { FileChatRepository } from './core/infrastructure/repositories/FileChatRepository';
import { FilePersonaRepository } from './core/infrastructure/repositories/FilePersonaRepository';
import { FileConfigRepository } from './core/infrastructure/repositories/FileConfigRepository';
import { HttpApiRepository } from './core/infrastructure/repositories/HttpApiRepository';
import { ChatService } from './core/services/ChatService';
import { ContextBuilderService } from './core/services/ContextBuilderService';
import { createChatStore } from './ui/stores/chatStore';
import './App.css';

/**
 * 页面类型
 */
type Page = 'sessions' | 'contacts' | 'chat' | 'settings' | 'create-group';

/**
 * 应用组件
 */
function App() {
  const [currentPage, setCurrentPage] = useState<Page>('sessions');
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // 依赖注入的实例
  const platformAdapter = useMemo(() => new MockAdapter(), []);
  const configRepo = useMemo(() => new FileConfigRepository(platformAdapter), [platformAdapter]);
  const chatRepo = useMemo(() => new FileChatRepository(platformAdapter), [platformAdapter]);
  const personaRepo = useMemo(() => new FilePersonaRepository(platformAdapter), [platformAdapter]);

  // API 仓储需要初始配置
  const [apiRepo] = useState(() => new HttpApiRepository(
    'https://api.openai.com/v1',
    '',
    'gpt-4o'
  ));

  const contextBuilder = useMemo(
    () => new ContextBuilderService(chatRepo, personaRepo),
    [chatRepo, personaRepo]
  );
  const chatService = useMemo(
    () => new ChatService(chatRepo, apiRepo, contextBuilder),
    [chatRepo, apiRepo, contextBuilder]
  );
  const chatStore = useMemo(() => createChatStore(chatService), [chatService]);

  // 加载会话列表
  useEffect(() => {
    chatStore.loadChats();
  }, [chatStore]);

  /**
   * 导航到指定页面
   */
  const navigateTo = (page: Page, chatId?: string) => {
    setCurrentPage(page);
    if (chatId) {
      setCurrentChatId(chatId);
    }
  };

  /**
   * 创建单聊
   */
  const handleCreateSingleChat = async (personaId: string) => {
    await chatStore.createSingleChat(personaId);
    // 获取刚创建的会话
    const chats = await (chatService as unknown as { chatRepo: { findAll: () => Promise<unknown[]> } }).chatRepo.findAll();
    if (chats.length > 0) {
      navigateTo('chat', (chats[0] as { id: string }).id);
    } else {
      navigateTo('sessions');
    }
  };

  /**
   * 创建群聊完成
   */
  const handleGroupCreated = (chatId: string) => {
    navigateTo('chat', chatId);
  };

  /**
   * 进入设置页面
   */
  const handleOpenSettings = () => {
    navigateTo('settings');
  };

  return (
    <div className="app">
      {currentPage === 'sessions' && (
        <SessionsPage
          chatService={chatService}
          personaRepository={personaRepo}
          onSelectChat={(id) => navigateTo('chat', id)}
          onCreateGroup={() => navigateTo('create-group')}
          onContacts={() => navigateTo('contacts')}
        />
      )}

      {currentPage === 'contacts' && (
        <ContactsPage
          personaRepository={personaRepo}
          onSelectPersona={(id) => handleCreateSingleChat(id)}
          onBack={() => navigateTo('sessions')}
        />
      )}

      {currentPage === 'chat' && currentChatId && (
        <ChatPage
          chatId={currentChatId}
          chatService={chatService}
          personaRepository={personaRepo}
          onBack={() => navigateTo('sessions')}
        />
      )}

      {currentPage === 'settings' && (
        <SettingsPage
          configRepository={configRepo}
          platformAdapter={platformAdapter}
          onBack={() => navigateTo('sessions')}
        />
      )}

      {currentPage === 'create-group' && (
        <CreateGroupPage
          chatService={chatService}
          personaRepository={personaRepo}
          onCreated={handleGroupCreated}
          onBack={() => navigateTo('sessions')}
        />
      )}

      {/* 设置入口（始终可见） */}
      <button className="settings-fab" onClick={handleOpenSettings}>
        ⚙
      </button>
    </div>
  );
}

export default App;
