import { create } from 'zustand';
import { repos } from '@/store/bootstrap';
import {
  DEFAULT_SECTION_PROFILES,
  normalizeSectionProfiles,
  resolveSectionConfigs,
  type SectionConfig,
  type SectionProfileMap,
} from '@/domain/constants';
import type { SectionKey } from '@/domain/enums';

/**
 * 板块自定义（名称 / 颜色 / 图标）。
 *
 * 数量**固定为 4**、`key` 不可改 —— 见 `SectionProfile` 上的说明：
 * 业务数据按这四个键存，允许增删会制造悬空引用。用户能改的只有叫法与配色。
 *
 * 持久化走 `repos.settings`（localStorage），与主题 / 时间轴时间窗同一套偏好机制；
 * store 只管状态，不碰存储 API（迁移小程序时只换 SettingsRepository 实现）。
 *
 * `configs` 是**派生值**（内置配置 + 用户档案合成），在每次写入时一起算好：
 * 组件拿到的就是可直接渲染的最终配置，不必每行自己 resolve 一遍。
 */
export const SECTION_PROFILE_KEY = 'sectionProfiles';

interface SectionProfileState {
  profiles: SectionProfileMap;
  /** 派生：合成后的展示配置（组件渲染的唯一来源） */
  configs: readonly SectionConfig[];
  /** 首次从存储读回前为 false，避免默认值又写回去覆盖用户选择 */
  hydrated: boolean;
  setName: (key: SectionKey, name: string) => void;
  setColor: (key: SectionKey, color: string) => void;
  setIcon: (key: SectionKey, icon: string) => void;
  /** 单个板块恢复默认（名字空了不好用，给一条退路） */
  resetOne: (key: SectionKey) => void;
  resetAll: () => void;
  hydrate: () => Promise<void>;
}

export const useSectionProfileStore = create<SectionProfileState>((set, get) => {
  /** 内存更新 + 派生 configs + 持久化（写失败只影响「下次是否记住」） */
  const persist = (profiles: SectionProfileMap) => {
    set({ profiles, configs: resolveSectionConfigs(profiles) });
    void repos.settings.set(SECTION_PROFILE_KEY, profiles).catch(() => undefined);
  };

  /*
    改单个字段：**先归一化再落盘**。
    归一化会兜住两种脏输入 —— 名字被清空（组头会变成一片空白）、颜色不是合法
    hex（整条会渲染成透明）。两者都回落到该板块的默认值，
    所以「改坏了」的最坏结果只是回到出厂状态，不会出现空标题或看不见的色点。
  */
  const patch = (key: SectionKey, part: Partial<SectionProfileMap[SectionKey]>) => {
    const current = get().profiles;
    const merged = normalizeSectionProfiles({ ...current, [key]: { ...current[key], ...part } });
    persist(merged);
  };

  return {
    profiles: DEFAULT_SECTION_PROFILES,
    configs: resolveSectionConfigs(DEFAULT_SECTION_PROFILES),
    hydrated: false,

    setName(key, name) {
      patch(key, { name });
    },

    setColor(key, color) {
      patch(key, { color });
    },

    setIcon(key, icon) {
      patch(key, { icon });
    },

    resetOne(key) {
      const current = get().profiles;
      persist({ ...current, [key]: { ...DEFAULT_SECTION_PROFILES[key] } });
    },

    resetAll() {
      persist({ ...DEFAULT_SECTION_PROFILES });
    },

    async hydrate() {
      if (get().hydrated) return;
      const stored = await repos.settings.get<unknown>(SECTION_PROFILE_KEY, null);
      const profiles = normalizeSectionProfiles(stored);
      set({ profiles, configs: resolveSectionConfigs(profiles), hydrated: true });
    },
  };
});

/** 非 React 场景读取当前板块配置（如导出 / 启动脚本） */
export function selectSectionConfigs(): readonly SectionConfig[] {
  return useSectionProfileStore.getState().configs;
}
