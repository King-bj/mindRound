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

const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';

type Page = 'sessions' | 'contacts' | 'chat' | 'settings' | 'create-group';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('sessions');
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const platformAdapter = useMemo(() => new MockAdapter(), []);
  const configRepo = useMemo(() => new FileConfigRepository(platformAdapter), [platformAdapter]);
  const chatRepo = useMemo(() => new FileChatRepository(platformAdapter), [platformAdapter]);
  const personaRepo = useMemo(() => new FilePersonaRepository(platformAdapter), [platformAdapter]);
  const apiRepo = useMemo(
    () => new HttpApiRepository(DEFAULT_API_BASE_URL, '', DEFAULT_MODEL),
    []
  );

  const contextBuilder = useMemo(
    () => new ContextBuilderService(chatRepo, personaRepo),
    [chatRepo, personaRepo]
  );
  const chatService = useMemo(
    () => new ChatService(chatRepo, apiRepo, contextBuilder),
    [chatRepo, apiRepo, contextBuilder]
  );
  const chatStore = useMemo(() => createChatStore(chatService), [chatService]);

  useEffect(() => {
    chatStore.loadChats();
  }, [chatStore]);

  const navigateTo = (page: Page, chatId?: string) => {
    setCurrentPage(page);
    if (chatId) {
      setCurrentChatId(chatId);
    }
  };

  const handleCreateSingleChat = async (personaId: string) => {
    const chat = await chatService.createSingleChat(personaId);
    navigateTo('chat', chat.id);
  };

  const handleGroupCreated = (chatId: string) => {
    navigateTo('chat', chatId);
  };

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

      <button className="settings-fab" onClick={handleOpenSettings}>
        ⚙
      </button>
    </div>
  );
}

export default App;
