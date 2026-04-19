/**
 * 单聊作者资料侧栏（Skill Level 1）
 * @description 展示 discovery card：头像、名称、描述、标签；不含 SKILL.md 正文
 */
import React from 'react';
import type { Persona } from '../../core/domain/Persona';
import { X } from './Icons';
import { toAvatarDisplayUrl } from '../utils/avatarUrl';

export interface PersonaInfoPanelProps {
  /** 是否显示 */
  isOpen: boolean;
  /** 当前单聊对应的人格；缺失时仍打开侧栏并提示 */
  persona: Persona | null;
  /** 关闭 */
  onClose: () => void;
}

/**
 * 右侧抽屉：作者 SKILL 元信息（Level 1）
 */
export const PersonaInfoPanel: React.FC<PersonaInfoPanelProps> = ({
  isOpen,
  persona,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="persona-info-overlay" role="presentation">
      <button
        type="button"
        className="persona-info-backdrop"
        aria-label="关闭作者资料"
        onClick={onClose}
      />
      <aside
        className="persona-info-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-info-title"
      >
        <header className="persona-info-header">
          <h2 id="persona-info-title" className="persona-info-title">
            作者资料
          </h2>
          <button type="button" className="persona-info-close" onClick={onClose} aria-label="关闭">
            <X size={22} strokeWidth={2} />
          </button>
        </header>

        <div className="persona-info-body">
          {persona ? (
            <>
              <div className="persona-info-avatar-large" aria-hidden>
                {(() => {
                  const url = toAvatarDisplayUrl(persona.avatar);
                  return url ? (
                    <img src={url} alt="" />
                  ) : (
                    <span>{persona.name[0] || '?'}</span>
                  );
                })()}
              </div>
              <h3 className="persona-info-name">{persona.name}</h3>
              <p className="persona-info-id" title="人格目录 ID">
                {persona.id}
              </p>
              <p className="persona-info-desc">{persona.description || '暂无描述'}</p>
              {persona.tags && persona.tags.length > 0 ? (
                <div className="persona-info-tags" aria-label="标签">
                  {persona.tags.map((tag) => (
                    <span key={tag} className="persona-info-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="persona-info-tags-empty">暂无标签</p>
              )}
            </>
          ) : (
            <p className="persona-info-missing" role="status">
              未找到作者信息
            </p>
          )}
        </div>
      </aside>
    </div>
  );
};
