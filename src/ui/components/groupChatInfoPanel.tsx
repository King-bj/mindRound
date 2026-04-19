/**
 * 群聊信息侧栏
 * @description 展示群成员，支持从通讯录勾选追加成员（类微信群资料）
 */
import React, { useState, useMemo } from 'react';
import type { Chat } from '../../core/domain/Chat';
import type { Persona } from '../../core/domain/Persona';
import { X, Plus, Search } from './Icons';
import { toAvatarDisplayUrl } from '../utils/avatarUrl';

export interface GroupChatInfoPanelProps {
  /** 是否显示 */
  isOpen: boolean;
  /** 当前群聊 */
  chat: Chat;
  /** 通讯录全部作者 */
  allPersonas: Persona[];
  /** 关闭侧栏 */
  onClose: () => void;
  /** 追加成员（已去重由服务层处理） */
  onAddPersonas: (personaIds: string[]) => Promise<void>;
}

/**
 * 群聊成员与添加成员侧栏
 */
export const GroupChatInfoPanel: React.FC<GroupChatInfoPanelProps> = ({
  isOpen,
  chat,
  allPersonas,
  onClose,
  onAddPersonas,
}) => {
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pickIds, setPickIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const memberSet = useMemo(() => new Set(chat.personaIds), [chat.personaIds]);

  const members = useMemo(() => {
    return chat.personaIds
      .map((id) => allPersonas.find((p) => p.id === id))
      .filter((p): p is Persona => p != null);
  }, [chat.personaIds, allPersonas]);

  const availableToAdd = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPersonas.filter((p) => {
      if (memberSet.has(p.id)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [allPersonas, memberSet, searchQuery]);

  const togglePick = (id: string) => {
    const next = new Set(pickIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPickIds(next);
  };

  const handleConfirmAdd = async () => {
    if (pickIds.size === 0) return;
    setIsSubmitting(true);
    try {
      await onAddPersonas(Array.from(pickIds));
      setPickIds(new Set());
      setShowAddPicker(false);
      setSearchQuery('');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="group-info-overlay" role="presentation">
      <button
        type="button"
        className="group-info-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <aside
        className="group-info-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-info-title"
      >
        <header className="group-info-header">
          <h2 id="group-info-title" className="group-info-title">
            {showAddPicker ? '添加成员' : '群成员'}
          </h2>
          <button
            type="button"
            className="group-info-close"
            onClick={() => {
              if (showAddPicker) {
                setShowAddPicker(false);
                setPickIds(new Set());
                setSearchQuery('');
              } else {
                onClose();
              }
            }}
            aria-label={showAddPicker ? '返回' : '关闭'}
          >
            <X size={22} strokeWidth={2} />
          </button>
        </header>

        {!showAddPicker ? (
          <div className="group-info-body">
            <p className="group-info-count">{chat.personaIds.length} 人</p>
            <ul className="group-info-member-list" aria-label="群成员列表">
              {members.map((p) => (
                <li key={p.id} className="group-info-member-row">
                  <div className="group-info-avatar">
                    {(() => {
                      const url = toAvatarDisplayUrl(p.avatar);
                      return url ? <img src={url} alt="" /> : <span>{p.name[0] || '?'}</span>;
                    })()}
                  </div>
                  <span className="group-info-member-name">{p.name}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="group-info-add-tile"
              onClick={() => setShowAddPicker(true)}
            >
              <span className="group-info-add-icon" aria-hidden>
                <Plus size={24} strokeWidth={2} />
              </span>
              <span>添加</span>
            </button>
          </div>
        ) : (
          <div className="group-info-add-section">
            <div className="wechat-search-bar group-info-search">
              <Search size={16} strokeWidth={2} className="create-group-search-icon" aria-hidden />
              <input
                type="search"
                className="wechat-search-input create-group-search-input"
                placeholder="搜索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="搜索可添加的联系人"
              />
            </div>
            <div className="group-info-pick-list" role="list">
              {availableToAdd.length === 0 ? (
                <p className="group-info-empty">没有可添加的联系人</p>
              ) : (
                availableToAdd.map((p) => {
                  const checked = pickIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`group-info-pick-row ${checked ? 'selected' : ''}`}
                      onClick={() => togglePick(p.id)}
                      role="listitem"
                    >
                      <span className={`create-group-checkbox ${checked ? 'checked' : ''}`} aria-hidden>
                        {checked ? '✓' : ''}
                      </span>
                      <div className="group-info-avatar small">
                        {(() => {
                          const url = toAvatarDisplayUrl(p.avatar);
                          return url ? <img src={url} alt="" /> : <span>{p.name[0] || '?'}</span>;
                        })()}
                      </div>
                      <span className="group-info-member-name">{p.name}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="group-info-add-actions">
              <button
                type="button"
                className="create-group-btn primary"
                disabled={pickIds.size === 0 || isSubmitting}
                onClick={handleConfirmAdd}
              >
                {isSubmitting ? '添加中…' : `确定 (${pickIds.size})`}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};
