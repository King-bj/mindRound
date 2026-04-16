/**
 * 人格列表组件
 * @description 显示人格列表，支持搜索过滤和选择
 */
import React from 'react';
import type { Persona } from '../../core/domain/Persona';
import { User } from './Icons';

export interface PersonaListProps {
  /** 人格列表 */
  personas: Persona[];
  /** 搜索查询 */
  searchQuery?: string;
  /** 加载状态 */
  isLoading?: boolean;
  /** 空状态文本 */
  emptyText?: string;
  /** 选择回调 */
  onSelect: (personaId: string) => void;
}

/**
 * 人格列表组件
 * @description 可控组件，接收 personas 和 searchQuery props
 */
export const PersonaList: React.FC<PersonaListProps> = ({
  personas,
  searchQuery = '',
  isLoading = false,
  emptyText = '暂无作者',
  onSelect,
}) => {
  const filteredPersonas = searchQuery.trim()
    ? personas.filter((persona) =>
        persona.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : personas;

  if (isLoading) {
    return (
      <div className="persona-list-loading" role="status" aria-label="加载中">
        <div className="wechat-empty-text">加载中...</div>
      </div>
    );
  }

  if (filteredPersonas.length === 0) {
    return (
      <div className="persona-list-empty" role="status">
        <div className="wechat-empty">
          <div className="wechat-empty-icon">
            <EmptyContactsIllustration />
          </div>
          <p className="wechat-empty-text">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="persona-list" role="list" aria-label="作者列表">
      {filteredPersonas.map((persona, index) => (
        <button
          key={persona.id}
          className="wechat-list-item"
          onClick={() => onSelect(persona.id)}
          role="listitem"
          style={{ animationDelay: `${index * 50}ms` }}
          aria-label={`与 ${persona.name} 开始对话`}
        >
          <div className="wechat-avatar" aria-hidden="true">
            {persona.avatar ? (
              <img src={persona.avatar} alt="" />
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
      ))}
    </div>
  );
};

/** 空状态插图 */
const EmptyContactsIllustration = () => (
  <svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="30" cy="28" r="14" fill="var(--avatar-bg)" stroke="var(--list-border)" strokeWidth="2"/>
    <circle cx="30" cy="24" r="6" fill="var(--tab-inactive)" opacity="0.4"/>
    <path d="M18 42 C18 36 24 32 30 32 C36 32 42 36 42 42" stroke="var(--tab-inactive)" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    <circle cx="55" cy="35" r="10" fill="var(--avatar-bg)" stroke="var(--list-border)" strokeWidth="2"/>
    <circle cx="55" cy="32" r="4" fill="var(--tab-inactive)" opacity="0.4"/>
    <path d="M47 45 C47 41 51 38 55 38 C59 38 63 41 63 45" stroke="var(--tab-inactive)" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    <circle cx="40" cy="58" r="8" fill="var(--tab-active)" opacity="0.15"/>
    <path d="M37 58 L39 60 L43 56" stroke="var(--tab-active)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
  </svg>
);
