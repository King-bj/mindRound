/**
 * 设置页面
 * @description API 配置和数据目录管理
 */
import React, { useState, useEffect } from 'react';
import type { IConfigRepository, AppConfig } from '../../core/repositories/IConfigRepository';
import type { IPlatformAdapter } from '../../core/infrastructure/platforms/IPlatformAdapter';
import type { HttpApiRepository } from '../../core/infrastructure/repositories/HttpApiRepository';

interface SettingsPageProps {
  configRepository: IConfigRepository;
  platformAdapter: IPlatformAdapter;
  apiRepository: HttpApiRepository;
  onBack: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  configRepository,
  platformAdapter,
  apiRepository,
  onBack,
}) => {
  const [formData, setFormData] = useState<AppConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const cfg = await configRepository.get();
      setFormData(cfg);
    };
    load();
  }, [configRepository]);

  const handlePickDataDir = async () => {
    try {
      const picked = await platformAdapter.pickFolder();
      if (picked) {
        setFormData((prev) => (prev ? { ...prev, dataDir: picked } : null));
      }
    } catch (err) {
      setSaveMessage('选择目录失败: ' + (err as Error).message);
    }
  };

  const handleOpenDataDir = async () => {
    const path = formData?.dataDir?.trim();
    if (!path) return;
    try {
      await platformAdapter.openFolder(path);
    } catch (err) {
      setSaveMessage('打开目录失败: ' + (err as Error).message);
    }
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const oldRoot = await platformAdapter.getDataDir();
      const normalized: AppConfig = {
        ...formData,
        dataDir: formData.dataDir.trim(),
      };
      await configRepository.update(normalized);
      setFormData(normalized);
      platformAdapter.invalidateDataDirCache?.();
      const newRoot = await platformAdapter.getDataDir();
      if (platformAdapter.migrateUserData && oldRoot !== newRoot) {
        await platformAdapter.migrateUserData(oldRoot, newRoot);
      }
      apiRepository.updateConfig(
        normalized.apiBaseUrl || 'https://api.openai.com/v1',
        normalized.apiKey,
        normalized.model || 'gpt-4o'
      );
      setSaveMessage('保存成功');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setSaveMessage('保存失败: ' + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = <K extends keyof AppConfig>(field: K, value: AppConfig[K]) => {
    if (!formData) return;
    setFormData((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const handleAddSandboxFolder = async () => {
    try {
      const picked = await platformAdapter.pickFolder();
      if (!picked || !formData) return;
      if (formData.sandboxFolders.includes(picked)) return;
      setFormData({
        ...formData,
        sandboxFolders: [...formData.sandboxFolders, picked],
      });
    } catch (err) {
      setSaveMessage('选择目录失败: ' + (err as Error).message);
    }
  };

  const handleRemoveSandboxFolder = (path: string) => {
    if (!formData) return;
    setFormData({
      ...formData,
      sandboxFolders: formData.sandboxFolders.filter((p) => p !== path),
    });
  };

  if (!formData) {
    return (
      <div className="settings-page">
        <div className="settings-loading">加载中...</div>
      </div>
    );
  }

  const hasDataDir = !!formData.dataDir?.trim();

  return (
    <div className="settings-page">
      <header className="page-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ←
        </button>
        <h1 className="page-title">设置</h1>
        <div className="header-spacer" />
      </header>

      <div className="settings-form">
        <section className="settings-section">
          <h2 className="section-title">API 配置</h2>

          <div className="form-group">
            <label className="form-label">Base URL</label>
            <input
              type="text"
              className="form-input"
              value={formData.apiBaseUrl}
              onChange={(e) => handleChange('apiBaseUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="form-group">
            <label className="form-label">API Key</label>
            <input
              type="password"
              className="form-input"
              value={formData.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Model</label>
            <input
              type="text"
              className="form-input"
              value={formData.model}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="gpt-4o"
            />
          </div>
        </section>

        <section className="settings-section">
          <h2 className="section-title">数据目录</h2>

          <div className="form-group">
            <label className="form-label">路径</label>
            <div className="input-with-button input-with-two-buttons">
              <input
                type="text"
                className="form-input"
                value={formData.dataDir}
                onChange={(e) => handleChange('dataDir', e.target.value)}
                placeholder="留空则使用应用默认目录"
              />
              <button
                type="button"
                className="icon-btn"
                onClick={handlePickDataDir}
                title="选择目录"
              >
                📂
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={handleOpenDataDir}
                disabled={!hasDataDir}
                title="在资源管理器中打开"
              >
                📁
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="section-title">Agent · 搜索引擎</h2>

          <div className="form-group">
            <label className="form-label">提供者</label>
            <select
              className="form-input"
              value={formData.searchProvider}
              onChange={(e) =>
                handleChange(
                  'searchProvider',
                  e.target.value as AppConfig['searchProvider']
                )
              }
            >
              <option value="ddg">DuckDuckGo（免 Key）</option>
              <option value="tavily">Tavily（需 API Key）</option>
              <option value="serper">Serper（需 API Key）</option>
            </select>
          </div>

          {formData.searchProvider !== 'ddg' && (
            <div className="form-group">
              <label className="form-label">搜索 API Key</label>
              <input
                type="password"
                className="form-input"
                value={formData.searchApiKey}
                onChange={(e) => handleChange('searchApiKey', e.target.value)}
                placeholder={
                  formData.searchProvider === 'tavily' ? 'tvly-...' : '您的 Serper API Key'
                }
              />
            </div>
          )}
        </section>

        <section className="settings-section">
          <h2 className="section-title">Agent · 工作沙箱</h2>
          <p className="form-label" style={{ color: '#6b7280', marginBottom: 8 }}>
            读取这些目录内的文件时不会弹窗确认。数据目录已默认纳入沙箱。
          </p>

          <div className="form-group">
            <div className="sandbox-folders">
              {formData.sandboxFolders.length === 0 && (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>（未添加）</div>
              )}
              {formData.sandboxFolders.map((p) => (
                <div key={p} className="sandbox-folder-row">
                  <span className="path" title={p}>
                    {p}
                  </span>
                  <button
                    type="button"
                    className="remove"
                    onClick={() => handleRemoveSandboxFolder(p)}
                    aria-label={`移除 ${p}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="sandbox-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="sandbox-add-btn"
                onClick={handleAddSandboxFolder}
              >
                + 添加工作目录
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="form-group">
            <button type="button" className="save-btn" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存'}
            </button>
            {saveMessage && (
              <span className={`save-message ${saveMessage.includes('失败') ? 'error' : ''}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </section>

        <section className="settings-section">
          <div className="version-info">
            <span>版本 0.0.1</span>
          </div>
        </section>
      </div>
    </div>
  );
};
