/**
 * 创建群聊页面
 * @description 选择多个作者并设置群名称
 */
import React, { useState, useEffect } from 'react';
import type { Persona } from '../../core/domain/Persona';
import type { IChatService } from '../../core/services/ChatService';
import type { IPersonaRepository } from '../../core/repositories/IPersonaRepository';

interface CreateGroupPageProps {
  chatService: IChatService;
  personaRepository: IPersonaRepository;
  onCreated: (chatId: string) => void;
  onBack: () => void;
}

export const CreateGroupPage: React.FC<CreateGroupPageProps> = ({
  chatService,
  personaRepository,
  onCreated,
  onBack,
}) => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const loaded = await personaRepository.scan();
      setPersonas(loaded);
    };
    load();
  }, [personaRepository]);

  const togglePersona = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleCreate = async () => {
    if (selectedIds.size < 2 || !groupName.trim()) return;

    setIsCreating(true);
    try {
      const chat = await chatService.createGroupChat(groupName, Array.from(selectedIds));
      onCreated(chat.id);
    } catch (err) {
      console.error('Failed to create group:', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="create-group-page">
      <header className="page-header">
        <button className="back-btn" onClick={onBack}>
          ←
        </button>
        <h1 className="page-title">新建群聊</h1>
        <button
          className="done-btn"
          onClick={handleCreate}
          disabled={selectedIds.size < 2 || !groupName.trim() || isCreating}
        >
          {isCreating ? '...' : '完成'}
        </button>
      </header>

      <div className="group-name-section">
        <input
          type="text"
          className="group-name-input"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="输入群聊名称"
          maxLength={30}
        />
      </div>

      <div className="selection-hint">
        已选择 {selectedIds.size} 人（至少选2人）
      </div>

      <div className="persona-select-list">
        {personas.map((persona) => {
          const isSelected = selectedIds.has(persona.id);
          return (
            <button
              key={persona.id}
              className={`persona-select-item ${isSelected ? 'selected' : ''}`}
              onClick={() => togglePersona(persona.id)}
            >
              <div className="persona-avatar">
                {persona.avatar ? (
                  <img src={persona.avatar} alt={persona.name} />
                ) : (
                  <span className="avatar-placeholder">{persona.name[0]}</span>
                )}
              </div>
              <span className="persona-name">{persona.name}</span>
              <span className={`check-indicator ${isSelected ? 'checked' : ''}`}>
                {isSelected ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
