/**
 * 通讯录页面
 * @description 显示已导入的作者列表，支持搜索和刷新
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, EmptyContactsIllustration } from '../components/Icons';
import type { Persona } from '../../core/domain/Persona';
import type { IPersonaRepository } from '../../core/repositories/IPersonaRepository';

interface ContactsPageProps {
  personaRepository: IPersonaRepository;
  onSelectPersona: (personaId: string) => void;
  onBack: () => void;
}

export const ContactsPage: React.FC<ContactsPageProps> = ({
  personaRepository,
  onSelectPersona,
  onBack,
}) => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

      <div className="persona-list" role="list" aria-label="作者列表">
        {filteredPersonas.length === 0 && !isLoading ? (
          <div className="wechat-empty" role="status">
            <div className="wechat-empty-icon">
              <EmptyContactsIllustration />
            </div>
            <p className="wechat-empty-text">暂无作者</p>
            <p className="wechat-empty-hint">
              点击右上角 + 添加内置人物
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
          ))
        )}
      </div>
    </div>
  );
};
