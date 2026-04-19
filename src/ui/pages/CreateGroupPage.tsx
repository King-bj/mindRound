/**
 * 创建群聊页面
 * @description 双栏选择多个作者：左侧通讯录与搜索，右侧已选与群名称（类微信发起群聊）
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { Persona } from '../../core/domain/Persona';
import type { IChatService } from '../../core/services/ChatService';
import type { IPersonaRepository } from '../../core/repositories/IPersonaRepository';
import { Search, X, ArrowLeft } from '../components/Icons';
import { toAvatarDisplayUrl } from '../utils/avatarUrl';

interface CreateGroupPageProps {
  chatService: IChatService;
  personaRepository: IPersonaRepository;
  onCreated: (chatId: string) => void;
  onBack: () => void;
}

const DEFAULT_GROUP_TITLE = '群聊';

export const CreateGroupPage: React.FC<CreateGroupPageProps> = ({
  chatService,
  personaRepository,
  onCreated,
  onBack,
}) => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const loaded = await personaRepository.scan();
      setPersonas(loaded);
    };
    load();
  }, [personaRepository]);

  const filteredPersonas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return personas;
    return personas.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [personas, searchQuery]);

  /** 保持选中顺序（Set 插入顺序）用于右侧列表展示 */
  const selectedOrdered = useMemo(() => {
    const byId = new Map(personas.map((p) => [p.id, p] as const));
    return Array.from(selectedIds)
      .map((id) => byId.get(id))
      .filter((p): p is Persona => p != null);
  }, [personas, selectedIds]);

  const togglePersona = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const removeSelected = (id: string) => {
    const next = new Set(selectedIds);
    next.delete(id);
    setSelectedIds(next);
  };

  const handleCreate = async () => {
    const title = groupName.trim() || DEFAULT_GROUP_TITLE;
    if (selectedIds.size < 2) return;

    setIsCreating(true);
    try {
      const chat = await chatService.createGroupChat(title, Array.from(selectedIds));
      onCreated(chat.id);
    } catch (err) {
      console.error('Failed to create group:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const canComplete = selectedIds.size >= 2 && !isCreating;

  return (
    <div className="create-group-page">
      <header className="create-group-top-bar">
        <button type="button" className="create-group-back" onClick={onBack} aria-label="返回">
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <span className="create-group-top-title">发起群聊</span>
        <span className="create-group-top-spacer" aria-hidden />
      </header>
      <div className="create-group-body">
        {/* 左栏：搜索 + 联系人 */}
        <aside className="create-group-column create-group-column-left" aria-label="选择联系人">
          <div className="wechat-search-bar create-group-search">
            <Search size={16} strokeWidth={2} className="create-group-search-icon" aria-hidden />
            <input
              type="search"
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="wechat-search-input create-group-search-input"
              aria-label="搜索联系人"
            />
          </div>

          <div className="create-group-contact-list" role="list">
            {filteredPersonas.length === 0 ? (
              <div className="create-group-empty" role="status">
                {personas.length === 0 ? '暂无作者，请先在通讯录添加' : '无匹配联系人'}
              </div>
            ) : (
              filteredPersonas.map((persona) => {
                const isSelected = selectedIds.has(persona.id);
                return (
                  <button
                    key={persona.id}
                    type="button"
                    className={`create-group-contact-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => togglePersona(persona.id)}
                    role="listitem"
                  >
                    <span
                      className={`create-group-checkbox ${isSelected ? 'checked' : ''}`}
                      aria-hidden
                    >
                      {isSelected ? '✓' : ''}
                    </span>
                    <div className="create-group-avatar">
                      {(() => {
                        const url = toAvatarDisplayUrl(persona.avatar);
                        return url ? (
                          <img src={url} alt="" />
                        ) : (
                          <span>{persona.name[0] || '?'}</span>
                        );
                      })()}
                    </div>
                    <span className="create-group-contact-name">{persona.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* 右栏：发起群聊、已选、群名、完成/取消 */}
        <section className="create-group-column create-group-column-right" aria-label="发起群聊">
          <header className="create-group-right-header">
            <div>
              <h1 className="create-group-right-title">发起群聊</h1>
              <p className="create-group-right-sub">
                已选择 {selectedIds.size} 个联系人
                {selectedIds.size < 2 ? '（至少选 2 人）' : ''}
              </p>
            </div>
          </header>

          <div className="create-group-selected-wrap">
            <ul className="create-group-selected-list" aria-label="已选联系人">
              {selectedOrdered.map((p) => (
                <li key={p.id} className="create-group-selected-item">
                  <div className="create-group-avatar small">
                    {(() => {
                      const url = toAvatarDisplayUrl(p.avatar);
                      return url ? <img src={url} alt="" /> : <span>{p.name[0] || '?'}</span>;
                    })()}
                  </div>
                  <span className="create-group-selected-name">{p.name}</span>
                  <button
                    type="button"
                    className="create-group-remove-btn"
                    onClick={() => removeSelected(p.id)}
                    aria-label={`移除 ${p.name}`}
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="create-group-name-block">
            <label htmlFor="create-group-name-input" className="create-group-name-label">
              群聊名称
            </label>
            <input
              id="create-group-name-input"
              type="text"
              className="create-group-name-field"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={DEFAULT_GROUP_TITLE}
              maxLength={30}
              aria-describedby="create-group-name-hint"
            />
            <p id="create-group-name-hint" className="create-group-name-hint">
              留空则使用「{DEFAULT_GROUP_TITLE}」
            </p>
          </div>

          <div className="create-group-actions">
            <button type="button" className="create-group-btn cancel" onClick={onBack}>
              取消
            </button>
            <button
              type="button"
              className="create-group-btn primary"
              onClick={handleCreate}
              disabled={!canComplete}
            >
              {isCreating ? '创建中…' : '完成'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
