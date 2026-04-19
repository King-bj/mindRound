/**
 * 集思录应用入口
 * @description 桌面一体化侧栏 + 柔雾暖色主题；支持单聊和群聊
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { ContactsPage } from './ui/pages/ContactsPage';
import { SessionsPage } from './ui/pages/SessionsPage';
import { ChatPage } from './ui/pages/ChatPage';
import { SettingsPage } from './ui/pages/SettingsPage';
import { CreateGroupPage } from './ui/pages/CreateGroupPage';
import { MessageCircle, Users, Settings, Plus, ArrowLeft } from './ui/components/Icons';
import { PermissionConfirmDialog } from './ui/components/PermissionConfirmDialog';
import { createPlatformAdapter } from './core/infrastructure/platforms';
import { FileChatRepository } from './core/infrastructure/repositories/FileChatRepository';
import { FilePersonaRepository } from './core/infrastructure/repositories/FilePersonaRepository';
import { FileConfigRepository } from './core/infrastructure/repositories/FileConfigRepository';
import { HttpApiRepository } from './core/infrastructure/repositories/HttpApiRepository';
import { ChatService } from './core/services/ChatService';
import { MemoryService } from './core/services/MemoryService';
import { ContextBuilderService } from './core/services/ContextBuilderService';
import { PersonaService } from './core/services/PersonaService';
import { Agent } from './core/agent/Agent';
import { createDefaultRegistry } from './core/agent/tools/registry';
import {
  PermissionService,
  type PermissionPrompt,
  type PermissionDecision,
} from './core/agent/PermissionService';
import { ToolResultCache } from './core/agent/ToolResultCache';
import type { ToolRunContext } from './core/agent/types';
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
  const [platform] = useState<'desktop' | 'android'>(() => detectPlatform());
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  /** 递增后令侧栏 SessionsPage 重新拉取会话（新建单聊/群聊后立即出现） */
  const [sessionsListVersion, setSessionsListVersion] = useState(0);
  const [showSidePlusMenu, setShowSidePlusMenu] = useState(false);
  const sidePlusBtnRef = useRef<HTMLButtonElement>(null);
  const sidePlusMenuRef = useRef<HTMLDivElement>(null);
  const [permissionPrompt, setPermissionPrompt] =
    useState<PermissionPrompt | null>(null);
  const [permissionResolver, setPermissionResolver] = useState<
    ((d: PermissionDecision) => void) | null
  >(null);

  /** 与根布局 class 同步，供 #root / body 等平台样式使用 */
  useEffect(() => {
    document.body.classList.add(`platform-${platform}`);
  }, [platform]);

  /** 点击侧栏「＋」菜单外区域时关闭 */
  useEffect(() => {
    if (!showSidePlusMenu) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (sidePlusMenuRef.current?.contains(t)) return;
      if (sidePlusBtnRef.current?.contains(t)) return;
      setShowSidePlusMenu(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [showSidePlusMenu]);

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

  // ===== Agent 组件装配 =====
  const permissionService = useMemo(() => {
    const svc = new PermissionService(async () => {
      // sandbox 根：数据目录 + 用户额外配置的工作目录
      const dataDir = await platformAdapter.getDataDir();
      try {
        const cfg = await configRepo.get();
        const extras = Array.isArray(cfg.sandboxFolders) ? cfg.sandboxFolders : [];
        return [dataDir, ...extras.filter((p) => p && p.trim().length > 0)];
      } catch {
        return [dataDir];
      }
    });
    svc.confirmHandler = (prompt) =>
      new Promise<PermissionDecision>((resolve) => {
        setPermissionPrompt(prompt);
        setPermissionResolver(() => resolve);
      });
    return svc;
  }, [configRepo, platformAdapter]);

  const toolResultCache = useMemo(
    () => new ToolResultCache(platformAdapter),
    [platformAdapter]
  );

  const toolRegistry = useMemo(() => createDefaultRegistry(), []);

  const agent = useMemo(
    () =>
      new Agent({
        api: apiRepo,
        registry: toolRegistry,
        permission: permissionService,
        cache: toolResultCache,
        async getBaseToolContext(): Promise<Omit<ToolRunContext, 'allowOutsideSandbox'>> {
          const dataDir = await platformAdapter.getDataDir();
          let sandboxRoots: string[] = [dataDir];
          let searchProvider: ToolRunContext['searchProvider'] = 'ddg';
          let searchApiKey = '';
          try {
            const cfg = await configRepo.get();
            const extras = Array.isArray(cfg.sandboxFolders) ? cfg.sandboxFolders : [];
            sandboxRoots = [dataDir, ...extras.filter((p) => p && p.trim().length > 0)];
            searchProvider = cfg.searchProvider ?? 'ddg';
            searchApiKey = cfg.searchApiKey ?? '';
          } catch {
            // 默认沙箱与 DDG 不需要 key
          }
          return { sandboxRoots, searchProvider, searchApiKey };
        },
      }),
    [apiRepo, toolRegistry, permissionService, toolResultCache, configRepo, platformAdapter]
  );

  const memoryService = useMemo(
    () => new MemoryService(chatRepo, apiRepo),
    [chatRepo, apiRepo]
  );

  const chatService = useMemo(
    () => new ChatService(chatRepo, contextBuilder, personaRepo, agent, memoryService),
    [chatRepo, contextBuilder, personaRepo, agent, memoryService]
  );
  const personaService = useMemo(() => new PersonaService(personaRepo), [personaRepo]);
  const chatStore = useMemo(() => createChatStore(chatService), [chatService]);

  const handlePermissionDecide = (decision: PermissionDecision) => {
    if (permissionResolver) {
      permissionResolver(decision);
    }
    setPermissionPrompt(null);
    setPermissionResolver(null);
  };

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
    setSessionsListVersion((v) => v + 1);
    navigateToChat(chat.id);
  };

  const handleGroupCreated = (chatId: string) => {
    setShowCreateGroup(false);
    setSessionsListVersion((v) => v + 1);
    navigateToChat(chatId);
  };

  const permissionDialog = (
    <PermissionConfirmDialog
      prompt={permissionPrompt}
      onDecide={handlePermissionDecide}
    />
  );

  // 移动端：选中会话后全屏进入聊天（桌面端在「对话」分栏内展示，见下方 chats-split）
  if (currentChatId && platform === 'android') {
    return (
      <div className={`app platform-${platform}`}>
        <ChatPage
          chatId={currentChatId}
          chatService={chatService}
          personaRepository={personaRepo}
          onBack={() => setCurrentChatId(null)}
          showBackButton
        />
        {permissionDialog}
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
        {permissionDialog}
      </div>
    );
  }

  /** 桌面：侧栏「＋」菜单 — 发起群聊 */
  const openCreateGroupFromMenu = () => {
    setShowSidePlusMenu(false);
    setShowCreateGroup(true);
  };

  /** 桌面：侧栏「＋」菜单 — 通讯录 */
  const openContactsFromMenu = () => {
    setShowSidePlusMenu(false);
    handleTabChange('contacts');
  };

  return (
    <div className={`app-with-nav platform-${platform}`}>
      {platform === 'desktop' ? (
        <div className="chats-split">
          <aside className="side-panel" aria-label="会话与导航">
            <div className="side-brand">
              <div className="side-brand-logo" aria-hidden="true">
                <img src="/favicon.svg" alt="" width={28} height={28} />
              </div>
              <span className="side-brand-name">集思录</span>
            </div>

            <div className="side-search-row">
              <input
                type="search"
                className="side-search-input"
                placeholder="搜索"
                value={sessionSearchQuery}
                onChange={(e) => setSessionSearchQuery(e.target.value)}
                aria-label="搜索会话"
              />
              <div className="side-plus-wrap">
                <button
                  ref={sidePlusBtnRef}
                  type="button"
                  className="side-plus-btn"
                  aria-label="更多操作"
                  aria-expanded={showSidePlusMenu}
                  aria-haspopup="menu"
                  onClick={() => setShowSidePlusMenu((v) => !v)}
                >
                  <Plus size={22} strokeWidth={2.25} />
                </button>
                {showSidePlusMenu ? (
                  <div ref={sidePlusMenuRef} className="side-plus-menu" role="menu">
                    <button
                      type="button"
                      className="side-plus-menu-item"
                      role="menuitem"
                      onClick={openCreateGroupFromMenu}
                    >
                      发起群聊
                    </button>
                    <button
                      type="button"
                      className="side-plus-menu-item"
                      role="menuitem"
                      onClick={openContactsFromMenu}
                    >
                      通讯录
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="side-section-label">对话</div>

            <div className="side-panel-sessions-scroll">
              <SessionsPage
                chatService={chatService}
                personaRepository={personaRepo}
                onSelectChat={navigateToChat}
                onCreateGroup={() => setShowCreateGroup(true)}
                onContacts={() => handleTabChange('contacts')}
                selectedChatId={currentChatId}
                hideSearchBar
                filterQuery={sessionSearchQuery}
                listVersion={sessionsListVersion}
              />
            </div>

            <footer className="side-footer">
              <button
                type="button"
                className={`side-footer-btn${activeTab === 'settings' ? ' active' : ''}`}
                onClick={() => handleTabChange('settings')}
                aria-label="设置"
                aria-current={activeTab === 'settings' ? 'page' : undefined}
              >
                <Settings size={20} strokeWidth={2} />
                <span>设置</span>
              </button>
            </footer>
          </aside>

          <main className="main-content main-content-chat-split">
            {activeTab === 'chats' && (
              <div className="chat-detail-pane" aria-label="会话内容">
                {currentChatId ? (
                  <ChatPage
                    chatId={currentChatId}
                    chatService={chatService}
                    personaRepository={personaRepo}
                    onBack={() => setCurrentChatId(null)}
                    showBackButton={false}
                  />
                ) : (
                  <div className="chat-detail-empty" role="status">
                    <p className="chat-detail-empty-text">选择会话开始聊天</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'contacts' && (
              <div className="page-embed-in-split">
                <header className="wechat-header wechat-header-embed">
                  <button
                    type="button"
                    className="wechat-header-btn"
                    onClick={() => handleTabChange('chats')}
                    aria-label="返回对话"
                  >
                    <ArrowLeft size={20} strokeWidth={2} />
                  </button>
                  <h1 className="wechat-header-title">通讯录</h1>
                  <span className="wechat-header-btn-placeholder" aria-hidden />
                </header>
                <div className="page-content-nav page-content-embed">
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

            {activeTab === 'settings' && (
              <div className="page-embed-in-split">
                <header className="wechat-header wechat-header-embed">
                  <button
                    type="button"
                    className="wechat-header-btn"
                    onClick={() => handleTabChange('chats')}
                    aria-label="返回对话"
                  >
                    <ArrowLeft size={20} strokeWidth={2} />
                  </button>
                  <h1 className="wechat-header-title">设置</h1>
                  <span className="wechat-header-btn-placeholder" aria-hidden />
                </header>
                <div className="page-content-nav page-content-embed">
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
      ) : (
        <>
          {/* 移动端保留窄图标栏，便于切换对话 / 通讯录 / 设置 */}
          <nav className="left-nav" aria-label="主导航">
            <button
              type="button"
              className={`nav-item ${activeTab === 'chats' ? 'active' : ''}`}
              onClick={() => handleTabChange('chats')}
              aria-label="对话"
            >
              <MessageCircle size={24} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={`nav-item ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => handleTabChange('contacts')}
              aria-label="通讯录"
            >
              <Users size={24} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleTabChange('settings')}
              aria-label="设置"
            >
              <Settings size={24} strokeWidth={1.75} />
            </button>
          </nav>
          <main className="main-content">
            {activeTab === 'chats' && (
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
                  </div>
                </header>
                <div className="page-content-nav">
                  <SessionsPage
                    chatService={chatService}
                    personaRepository={personaRepo}
                    onSelectChat={navigateToChat}
                    onCreateGroup={() => setShowCreateGroup(true)}
                    onContacts={() => handleTabChange('contacts')}
                    listVersion={sessionsListVersion}
                  />
                </div>
              </div>
            )}

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
        </>
      )}

      {permissionDialog}
    </div>
  );
}

export default App;
