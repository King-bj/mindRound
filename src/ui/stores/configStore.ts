/**
 * 配置状态管理
 * @description 使用 Zustand 管理应用配置的全局状态
 */
import { create } from 'zustand';
import type { AppConfig } from '../../core/repositories/IConfigRepository';
import type { IConfigService } from '../../core/services/ConfigService';

interface ConfigState {
  /** 当前配置 */
  config: AppConfig | null;
  /** 加载状态 */
  isLoading: boolean;
  /** 保存状态 */
  isSaving: boolean;
  /** 错误信息 */
  error: string | null;
}

interface ConfigActions {
  /** 加载配置 */
  loadConfig: () => Promise<void>;
  /** 更新配置 */
  updateConfig: (config: Partial<AppConfig>) => Promise<void>;
  /** 清除错误 */
  clearError: () => void;
}

type ConfigStore = ConfigState & ConfigActions;

/**
 * 创建配置 Store
 * @param configService - 配置服务实例
 * @returns Zustand store
 */
export function createConfigStore(configService: IConfigService) {
  return create<ConfigStore>((set, get) => ({
    // State
    config: null,
    isLoading: false,
    isSaving: false,
    error: null,

    // Actions
    loadConfig: async () => {
      set({ isLoading: true, error: null });
      try {
        const config = await configService.get();
        set({ config, isLoading: false });
      } catch (err) {
        set({ error: (err as Error).message, isLoading: false });
      }
    },

    updateConfig: async (config: Partial<AppConfig>) => {
      set({ isSaving: true, error: null });
      try {
        await configService.update(config);
        const currentConfig = get().config;
        if (currentConfig) {
          set({ config: { ...currentConfig, ...config }, isSaving: false });
        } else {
          set({ isSaving: false });
        }
      } catch (err) {
        set({ error: (err as Error).message, isSaving: false });
      }
    },

    clearError: () => set({ error: null }),
  }));
}
