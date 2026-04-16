/**
 * MindRound 应用入口
 * @description 微信风格聊天应用，支持单聊和群聊
 */
import { useState, useEffect, useMemo } from 'react';
import { ContactsPage } from './ui/pages/ContactsPage';
import { SessionsPage } from './ui/pages/SessionsPage';
import { ChatPage } from './ui/pages/ChatPage';
import { SettingsPage } from './ui/pages/SettingsPage';
import { CreateGroupPage } from './ui/pages/CreateGroupPage';
import { TabBar } from './ui/components/TabBar';
import { Plus, Search } from './ui/components/Icons';
import type { TabType } from './ui/components/TabBar';
import { createPlatformAdapter } from './core/infrastructure/platforms';
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

/**
 * 将保存的配置同步到 HttpApiRepository
 * @param configRepo - 配置仓储
 * @param apiRepo - API 仓储
 */
async function syncApiConfig(
  configRepo: FileConfigRepository,
  apiRepo: HttpApiRepository
): Promise<void> {
  try {
    const config = await configRepo.get();
    apiRepo.updateConfig(
      config.apiBaseUrl || DEFAULT_API_BASE_URL,
      config.apiKey,
      config.model || DEFAULT_MODEL
    );
  } catch {
    // 配置读取失败时使用默认值
  }
}

/**
 * 检测平台类型
 * - Android: 检测移动设备或 Android WebView
 * - Desktop: 其他情况（桌面窗口）
 */
function detectPlatform(): 'desktop' | 'android' {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isAndroid = /android/i.test(userAgent);

  // 在 Tauri 环境中，可以通过 window.__TAURI__ 检测
  const isTauri = !!(window as Window & { __TAURI__?: unknown }).__TAURI__;

  // Android 设备 或 移动端 WebView
  if (isAndroid || (isMobile && !isTauri)) {
    return 'android';
  }

  // 桌面客户端
  return 'desktop';
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [platform, setPlatform] = useState<'desktop' | 'android'>('desktop');

  // 检测平台
  useEffect(() => {
    const detectedPlatform = detectPlatform();
    setPlatform(detectedPlatform);
    document.body.classList.add(`platform-${detectedPlatform}`);
  }, []);

  const platformAdapter = useMemo(() => createPlatformAdapter(), []);
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
    chatStore.getState().loadChats();
  }, [chatStore]);

  // 初始化时从配置文件加载 API 设置
  useEffect(() => {
    syncApiConfig(configRepo, apiRepo);
  }, [configRepo, apiRepo]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setCurrentChatId(null);
    setShowCreateGroup(false);
  };

  const navigateToChat = (chatId: string) => {
    setCurrentChatId(chatId);
    setActiveTab('chats');
  };

  const handleCreateSingleChat = async (personaId: string) => {
    const chat = await chatService.createSingleChat(personaId);
    navigateToChat(chat.id);
  };

  const handleGroupCreated = (chatId: string) => {
    setShowCreateGroup(false);
    navigateToChat(chatId);
  };

  // 聊天页面（从任意 Tab 进入）
  if (currentChatId) {
    return (
      <div className={`app platform-${platform}`}>
        <ChatPage
          chatId={currentChatId}
          chatService={chatService}
          personaRepository={personaRepo}
          onBack={() => setCurrentChatId(null)}
        />
      </div>
    );
  }

  // 创建群聊页面
  if (showCreateGroup) {
    return (
      <div className={`app platform-${platform}`}>
        <CreateGroupPage
          chatService={chatService}
          personaRepository={personaRepo}
          onCreated={handleGroupCreated}
          onBack={() => setShowCreateGroup(false)}
        />
      </div>
    );
  }

  return (
    <div className={`app platform-${platform}`}>
      {/* 对话 Tab - 会话列表 */}
      {activeTab === 'chats' && (
        <div className="page-with-tab-bar">
          <header className="wechat-header">
            <h1 className="wechat-header-title">对话</h1>
            <div className="wechat-header-actions">
              <button
                className="wechat-header-btn"
                onClick={() => setShowCreateGroup(true)}
                aria-label="发起群聊"
              >
                <Plus size={20} strokeWidth={2} />
              </button>
              <button className="wechat-header-btn" aria-label="搜索">
                <Search size={18} strokeWidth={2} />
              </button>
            </div>
          </header>
          <div className="page-content">
            <SessionsPage
              chatService={chatService}
              personaRepository={personaRepo}
              onSelectChat={navigateToChat}
              onCreateGroup={() => setShowCreateGroup(true)}
              onContacts={() => setActiveTab('contacts')}
            />
          </div>
        </div>
      )}

      {/* 通讯录 Tab - 人格列表 */}
      {activeTab === 'contacts' && (
        <div className="page-with-tab-bar">
          <header className="wechat-header">
            <h1 className="wechat-header-title">通讯录</h1>
          </header>
          <div className="page-content">
            <ContactsPage
              personaRepository={personaRepo}
              onSelectPersona={handleCreateSingleChat}
              onBack={() => setActiveTab('chats')}
            />
          </div>
        </div>
      )}

      {/* 设置 Tab */}
      {activeTab === 'settings' && (
        <div className="page-with-tab-bar">
          <header className="wechat-header">
            <h1 className="wechat-header-title">设置</h1>
          </header>
          <div className="page-content">
            <SettingsPage
              configRepository={configRepo}
              platformAdapter={platformAdapter}
              apiRepository={apiRepo}
              onBack={() => setActiveTab('chats')}
            />
          </div>
        </div>
      )}

      {/* 底部导航栏 */}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default App;
