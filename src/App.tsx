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
import { MessageCircle, Users, Settings, Plus, Search } from './ui/components/Icons';
import { createPlatformAdapter } from './core/infrastructure/platforms';
import { FileChatRepository } from './core/infrastructure/repositories/FileChatRepository';
import { FilePersonaRepository } from './core/infrastructure/repositories/FilePersonaRepository';
import { FileConfigRepository } from './core/infrastructure/repositories/FileConfigRepository';
import { HttpApiRepository } from './core/infrastructure/repositories/HttpApiRepository';
import { ChatService } from './core/services/ChatService';
import { ContextBuilderService } from './core/services/ContextBuilderService';
import { PersonaService } from './core/services/PersonaService';
import { createChatStore } from './ui/stores/chatStore';
import './App.css';

type TabType = 'chats' | 'contacts' | 'settings';

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
 * 是否在 Tauri WebView 中运行
 * @description Tauri 2 默认不注入 `window.__TAURI__`（需 `withGlobalTauri`），但会注入 `__TAURI_INTERNALS__`。
 * 若仅用 `__TAURI__` 判断，桌面端会误判为非 Tauri，再结合 UA 可能被当成移动端而套用 `platform-android`（#root 430px）。
 */
function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !!(w.__TAURI__ ?? w.__TAURI_INTERNALS__);
}

/**
 * 检测平台类型
 * - Tauri 桌面（Windows/macOS/Linux）：始终 desktop，根布局全宽
 * - Tauri Android（APK）：android，手机列宽
 * - 普通浏览器：按 UA 区分移动 / 桌面
 */
function detectPlatform(): 'desktop' | 'android' {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUa = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isAndroidUa = /android/i.test(userAgent);

  if (isTauriRuntime()) {
    return isAndroidUa ? 'android' : 'desktop';
  }

  if (isAndroidUa || isMobileUa) {
    return 'android';
  }

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
    () => new ChatService(chatRepo, apiRepo, contextBuilder, personaRepo),
    [chatRepo, apiRepo, contextBuilder, personaRepo]
  );
  const personaService = useMemo(() => new PersonaService(personaRepo), [personaRepo]);
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

  // 移动端：选中会话后全屏进入聊天（桌面端在「对话」分栏内展示，见下方 chats-split）
  if (currentChatId && platform === 'android') {
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
    <div className={`app-with-nav platform-${platform}`}>
      {/* 左侧导航栏 */}
      <nav className="left-nav">
        <button
          className={`nav-item ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => handleTabChange('chats')}
          aria-label="对话"
        >
          <MessageCircle size={24} strokeWidth={1.75} />
        </button>
        <button
          className={`nav-item ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => handleTabChange('contacts')}
          aria-label="通讯录"
        >
          <Users size={24} strokeWidth={1.75} />
        </button>
        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabChange('settings')}
          aria-label="设置"
        >
          <Settings size={24} strokeWidth={1.75} />
        </button>
      </nav>

      {/* 右侧内容区 */}
      <main className="main-content">
        {/* 对话 Tab：桌面 = 左会话列表 + 右空白/聊天；移动 = 全宽列表 */}
        {activeTab === 'chats' && platform === 'desktop' && (
          <div className="chats-split">
            <div className="sessions-column">
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
              <div className="sessions-column-scroll">
                <SessionsPage
                  chatService={chatService}
                  personaRepository={personaRepo}
                  onSelectChat={navigateToChat}
                  onCreateGroup={() => setShowCreateGroup(true)}
                  onContacts={() => handleTabChange('contacts')}
                  selectedChatId={currentChatId}
                />
              </div>
            </div>
            <div className="chat-detail-pane" aria-label="会话内容">
              {currentChatId ? (
                <ChatPage
                  chatId={currentChatId}
                  chatService={chatService}
                  personaRepository={personaRepo}
                  onBack={() => setCurrentChatId(null)}
                />
              ) : (
                <div className="chat-detail-empty" role="status">
                  <p className="chat-detail-empty-text">选择会话开始聊天</p>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'chats' && platform !== 'desktop' && (
          <div className="page-with-nav">
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
            <div className="page-content-nav">
              <SessionsPage
                chatService={chatService}
                personaRepository={personaRepo}
                onSelectChat={navigateToChat}
                onCreateGroup={() => setShowCreateGroup(true)}
                onContacts={() => handleTabChange('contacts')}
              />
            </div>
          </div>
        )}

        {/* 通讯录 Tab - 人格列表 */}
        {activeTab === 'contacts' && (
          <div className="page-with-nav">
            <header className="wechat-header">
              <h1 className="wechat-header-title">通讯录</h1>
            </header>
            <div className="page-content-nav">
              <ContactsPage
                personaRepository={personaRepo}
                personaService={personaService}
                platformAdapter={platformAdapter}
                onSelectPersona={handleCreateSingleChat}
                onBack={() => handleTabChange('chats')}
              />
            </div>
          </div>
        )}

        {/* 设置 Tab */}
        {activeTab === 'settings' && (
          <div className="page-with-nav">
            <header className="wechat-header">
              <h1 className="wechat-header-title">设置</h1>
            </header>
            <div className="page-content-nav">
              <SettingsPage
                configRepository={configRepo}
                platformAdapter={platformAdapter}
                apiRepository={apiRepo}
                onBack={() => handleTabChange('chats')}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
