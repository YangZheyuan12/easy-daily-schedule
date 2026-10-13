import { create } from 'zustand';
import { repos } from '@/store/bootstrap';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  getThemeMeta,
  normalizeTheme,
  type ThemeId,
} from './themes';

interface ThemeState {
  theme: ThemeId;
  /** 首次从存储读回来之前为 false，避免把默认值又写回去覆盖用户选择 */
  hydrated: boolean;
  setTheme: (id: ThemeId) => void;
  hydrate: () => Promise<void>;
}

/**
 * 当前主题。
 *
 * 持久化走 `repos.settings`（localStorage），不在这里直接碰存储 API ——
 * 迁移小程序时只替换 SettingsRepository 实现即可，本文件无需改动。
 *
 * 注意：这里**只管状态**，写 DOM（data-theme / meta theme-color）交由
 * `useApplyTheme` 在 UI 层完成，保持 store 可测试。
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,
  hydrated: false,

  setTheme(id) {
    if (get().theme === id) return;
    set({ theme: id });
    // 写入失败只影响「下次打开是否记住」，不能因为它打断当前交互
    void repos.settings.set(THEME_STORAGE_KEY, id).catch(() => undefined);
  },

  async hydrate() {
    if (get().hydrated) return;
    const stored = await repos.settings.get<unknown>(THEME_STORAGE_KEY, DEFAULT_THEME);
    set({ theme: normalizeTheme(stored), hydrated: true });
  },
}));

/** 便于在非 React 场景（如启动脚本）读取当前主题元信息 */
export function currentThemeMeta() {
  return getThemeMeta(useThemeStore.getState().theme);
}
