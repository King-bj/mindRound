/**
 * 设置页面
 * @description API 配置和数据目录管理
 */
import React, { useState, useEffect } from 'react';
import type { IConfigRepository, AppConfig } from '../../core/repositories/IConfigRepository';
import type { IPlatformAdapter } from '../../core/infrastructure/platforms/IPlatformAdapter';

interface SettingsPageProps {
  configRepository: IConfigRepository;
  platformAdapter: IPlatformAdapter;
  onBack: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  configRepository,
  platformAdapter,
  onBack,
}) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [formData, setFormData] = useState({
    apiBaseUrl: '',
    apiKey: '',
    model: '',
    dataDir: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  /**
   * 加载配置
   */
  useEffect(() => {
    const load = async () => {
      const cfg = await configRepository.get();
      setConfig(cfg);
      setFormData({
        apiBaseUrl: cfg.apiBaseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        dataDir: cfg.dataDir,
      });
    };
    load();
  }, [configRepository]);

  /**
   * 打开数据目录
   */
  const handleOpenDataDir = async () => {
    if (formData.dataDir) {
      await platformAdapter.openFolder(formData.dataDir);
    }
  };

  /**
   * 保存配置
   */
  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await configRepository.update(formData);
      setSaveMessage('保存成功');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setSaveMessage('保存失败: ' + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (!config) {
    return (
      <div className="settings-page">
        <div className="settings-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {/* 顶部栏 */}
      <header className="page-header">
        <button className="back-btn" onClick={onBack}>
          ←
        </button>
        <h1 className="page-title">设置</h1>
        <div style={{ width: '40px' }} />
      </header>

      {/* 设置表单 */}
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
            <div className="input-with-button">
              <input
                type="text"
                className="form-input"
                value={formData.dataDir}
                onChange={(e) => handleChange('dataDir', e.target.value)}
                placeholder="数据目录路径"
              />
              <button
                className="icon-btn"
                onClick={handleOpenDataDir}
                disabled={!formData.dataDir}
                title="打开数据目录"
              >
                📂
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="form-group">
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={isSaving}
            >
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
