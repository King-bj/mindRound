/**
 * 通讯录页面
 * @description 显示已导入的作者列表，支持搜索、刷新与导入 skill 包（桌面端）
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { User, EmptyContactsIllustration, Plus } from '../components/Icons';
import type { Persona } from '../../core/domain/Persona';
import type { IPersonaRepository } from '../../core/repositories/IPersonaRepository';
import type { IPersonaService } from '../../core/services/PersonaService';
import type { IPlatformAdapter } from '../../core/infrastructure/platforms/IPlatformAdapter';

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !!(w.__TAURI__ ?? w.__TAURI_INTERNALS__);
}

function toAvatarDisplayUrl(absolutePath: string | null): string | null {
  if (!absolutePath) {
    return null;
  }
  if (isTauriRuntime()) {
    try {
      return convertFileSrc(absolutePath);
    } catch {
      return absolutePath;
    }
  }
  return absolutePath;
}

interface ContactsPageProps {
  personaRepository: IPersonaRepository;
  personaService: IPersonaService;
  platformAdapter: IPlatformAdapter;
  onSelectPersona: (personaId: string) => void;
  onBack: () => void;
}

export const ContactsPage: React.FC<ContactsPageProps> = ({
  personaRepository,
  personaService,
  platformAdapter,
  onSelectPersona,
  onBack: _onBack,
}) => {
  void _onBack;
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importPersonaId, setImportPersonaId] = useState('');
  const [importDisplayName, setImportDisplayName] = useState('');
  const [importSourceFolder, setImportSourceFolder] = useState('');
  const [importAvatarPath, setImportAvatarPath] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSubmitting, setImportSubmitting] = useState(false);

  const canImport = isTauriRuntime();

  const loadPersonas = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await personaRepository.scan();
      setPersonas(loaded);
    } catch (err) {
      console.error('Failed to load personas:', err);
    } finally {
      setIsLoading(false);
    }
  }, [personaRepository]);

  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  const filteredPersonas = useMemo(
    () =>
      personas.filter((persona) =>
        persona.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [personas, searchQuery]
  );

  const pickSourceFolder = async () => {
    setImportError(null);
    const p = await platformAdapter.pickFolder();
    if (p) {
      setImportSourceFolder(p);
    }
  };

  const pickAvatarFile = async () => {
    setImportError(null);
    const p = await platformAdapter.openFilePicker({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (p) {
      setImportAvatarPath(p);
    }
  };

  const submitImport = async () => {
    setImportError(null);
    const id = importPersonaId.trim();
    const name = importDisplayName.trim();
    if (!id || !name || !importSourceFolder.trim()) {
      setImportError('请填写人物 ID、显示名称并选择 skill 文件夹');
      return;
    }
    setImportSubmitting(true);
    try {
      await personaService.importPersonaFromFolder({
        sourceFolderPath: importSourceFolder.trim(),
        personaId: id,
        displayName: name,
        avatarSourcePath: importAvatarPath,
      });
      setShowImport(false);
      setImportPersonaId('');
      setImportDisplayName('');
      setImportSourceFolder('');
      setImportAvatarPath(null);
      await loadPersonas();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportSubmitting(false);
    }
  };

  return (
    <div className="contacts-page-inner">
      <div className="wechat-search-bar" role="search">
        <input
          type="search"
          placeholder="搜索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="wechat-search-input"
          aria-label="搜索作者"
        />
      </div>

      {canImport && (
        <div className="contacts-import-bar">
          <button
            type="button"
            className="wechat-import-skill-btn"
            onClick={() => {
              setImportError(null);
              setShowImport(true);
            }}
            aria-label="导入 skill 包"
          >
            <Plus size={18} strokeWidth={2} />
            <span>导入人物</span>
          </button>
        </div>
      )}

      <div className="persona-list" role="list" aria-label="作者列表">
        {filteredPersonas.length === 0 && !isLoading ? (
          <div className="wechat-empty" role="status">
            <div className="wechat-empty-icon">
              <EmptyContactsIllustration />
            </div>
            <p className="wechat-empty-text">暂无作者</p>
            <p className="wechat-empty-hint">
              {canImport ? '使用「导入人物」添加 skill 包，或等待内置人物初始化' : '点击右上角 + 添加内置人物'}
            </p>
          </div>
        ) : (
          filteredPersonas.map((persona, index) => (
            <button
              key={persona.id}
              className="wechat-list-item"
              onClick={() => onSelectPersona(persona.id)}
              role="listitem"
              style={{ animationDelay: `${index * 50}ms` }}
              aria-label={`与 ${persona.name} 开始对话`}
            >
              <div className="wechat-avatar" aria-hidden="true">
                {toAvatarDisplayUrl(persona.avatar) ? (
                  <img src={toAvatarDisplayUrl(persona.avatar)!} alt="" />
                ) : (
                  <User size={20} strokeWidth={1.75} />
                )}
              </div>
              <div className="wechat-list-info">
                <span className="wechat-list-name">{persona.name}</span>
                {persona.description && (
                  <span className="wechat-list-desc">
                    {persona.description.substring(0, 50)}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {showImport && (
        <div
          className="import-persona-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-persona-title"
          onClick={() => !importSubmitting && setShowImport(false)}
        >
          <div
            className="import-persona-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="import-persona-title" className="import-persona-title">
              导入 skill 人物
            </h2>
            <p className="import-persona-hint">
              选择包含 SKILL.md 的文件夹，并设置在本应用中的显示名与可选头像。
            </p>
            <label className="import-persona-field">
              <span>人物 ID（目录名，英文/数字/横线）</span>
              <input
                type="text"
                value={importPersonaId}
                onChange={(e) => setImportPersonaId(e.target.value)}
                placeholder="例如 my-advisor-skill"
                autoComplete="off"
              />
            </label>
            <label className="import-persona-field">
              <span>显示名称</span>
              <input
                type="text"
                value={importDisplayName}
                onChange={(e) => setImportDisplayName(e.target.value)}
                placeholder="通讯录与对话中显示的名字"
                autoComplete="off"
              />
            </label>
            <div className="import-persona-field">
              <span>Skill 文件夹</span>
              <div className="import-persona-row">
                <input type="text" readOnly value={importSourceFolder} placeholder="未选择" />
                <button type="button" onClick={pickSourceFolder}>
                  选择文件夹
                </button>
              </div>
            </div>
            <div className="import-persona-field">
              <span>头像（可选）</span>
              <div className="import-persona-row">
                <input type="text" readOnly value={importAvatarPath ?? ''} placeholder="未选择" />
                <button type="button" onClick={pickAvatarFile}>
                  选择图片
                </button>
              </div>
            </div>
            {importError && <p className="import-persona-error">{importError}</p>}
            <div className="import-persona-actions">
              <button
                type="button"
                className="import-persona-cancel"
                onClick={() => setShowImport(false)}
                disabled={importSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="import-persona-confirm"
                onClick={submitImport}
                disabled={importSubmitting}
              >
                {importSubmitting ? '导入中…' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
