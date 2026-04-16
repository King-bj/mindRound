/**
 * 人格状态管理
 * @description 使用 Zustand 管理人格相关的全局状态
 */
import { create } from 'zustand';
import type { Persona } from '../../core/domain/Persona';
import type { IPersonaService } from '../../core/services/PersonaService';

interface PersonaState {
  /** 人格列表 */
  personas: Persona[];
  /** 搜索查询 */
  searchQuery: string;
  /** 加载状态 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
}

interface PersonaActions {
  /** 加载人格列表 */
  loadPersonas: () => Promise<void>;
  /** 设置搜索查询 */
  setSearchQuery: (query: string) => void;
  /** 获取过滤后的人格列表 */
  getFilteredPersonas: () => Persona[];
  /** 清除错误 */
  clearError: () => void;
}

type PersonaStore = PersonaState & PersonaActions;

/**
 * 创建人格 Store
 * @param personaService - 人格服务实例
 * @returns Zustand store
 */
export function createPersonaStore(personaService: IPersonaService) {
  return create<PersonaStore>((set, get) => ({
    // State
    personas: [],
    searchQuery: '',
    isLoading: false,
    error: null,

    // Actions
    loadPersonas: async () => {
      set({ isLoading: true, error: null });
      try {
        const personas = await personaService.scanPersonas();
        set({ personas, isLoading: false });
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false });
      }
    },

    setSearchQuery: (query: string) => {
      set({ searchQuery: query });
    },

    getFilteredPersonas: () => {
      const { personas, searchQuery } = get();
      if (!searchQuery.trim()) {
        return personas;
      }
      const lowerQuery = searchQuery.toLowerCase();
      return personas.filter((persona) =>
        persona.name.toLowerCase().includes(lowerQuery)
      );
    },

    clearError: () => set({ error: null }),
  }));
}
