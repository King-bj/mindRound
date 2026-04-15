/**
 * 通讯录页面
 * @description 显示已导入的作者列表，支持搜索和刷新
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    <div className="contacts-page">
      <header className="page-header">
        <button className="back-btn" onClick={onBack}>
          ←
        </button>
        <h1 className="page-title">通讯录</h1>
        <button className="refresh-btn" onClick={loadPersonas} disabled={isLoading}>
          {isLoading ? '...' : '↻'}
        </button>
      </header>

      <div className="search-bar">
        <input
          type="text"
          placeholder="搜索作者"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="persona-list">
        {filteredPersonas.length === 0 && !isLoading ? (
          <div className="empty-state">
            <p>暂无作者</p>
            <p className="empty-hint">
              请将包含 SKILL.md 的文件夹复制到数据目录的 personae/
            </p>
          </div>
        ) : (
          filteredPersonas.map((persona) => (
            <button
              key={persona.id}
              className="persona-item"
              onClick={() => onSelectPersona(persona.id)}
            >
              <div className="persona-avatar">
                {persona.avatar ? (
                  <img src={persona.avatar} alt={persona.name} />
                ) : (
                  <span className="avatar-placeholder">{persona.name[0]}</span>
                )}
              </div>
              <div className="persona-info">
                <span className="persona-name">{persona.name}</span>
                {persona.description && (
                  <span className="persona-desc">{persona.description}</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
