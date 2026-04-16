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

  const handleChange = (field: keyof AppConfig, value: string) => {
    if (!formData) return;
    setFormData((prev) => (prev ? { ...prev, [field]: value } : null));
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
