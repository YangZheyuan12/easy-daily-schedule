/**
 * 主题元数据。
 *
 * 这是**纯数据模块**：不含任何浏览器 API，可被 domain / services 安全引用。
 * 配色本体在 `src/styles/index.css` 的 `[data-theme='<id>']` 里，
 * 这里只描述「有哪几套、叫什么、色板上预览哪三个点」。
 */

export type ThemeId = 'paper' | 'plain' | 'nocturne';

export interface ThemeMeta {
  id: ThemeId;
  /** 切换器里显示的名字 */
  label: string;
  /** 一句话气质定位 */
  tagline: string;
  /**
   * 色板预览用的三个 hex：底色 / 面 / 重音。
   * ⚠️ 必须与 CSS 变量保持一致，改 CSS 时记得同步这里。
   */
  swatch: { app: string; surface: string; accent: string };
  /** 该主题的圆角尺度，用于在切换器上体现形态差异 */
  radius: number;
  /** 浏览器 UI（地址栏 / PWA 状态栏）染色 */
  browserColor: string;
}

/** C 为主方案，所以它是默认值 */
export const DEFAULT_THEME: ThemeId = 'paper';

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'paper',
    label: '纸感暖白',
    tagline: '日记本 · 纸片卡片 + 木质重音',
    swatch: { app: '#FBF8F2', surface: '#FFFEFA', accent: '#9C6B3F' },
    radius: 14,
    browserColor: '#FBF8F2',
  },
  {
    id: 'plain',
    label: '素白极简',
    tagline: '效率机器 · 无卡片，靠细线切分',
    swatch: { app: '#FFFFFF', surface: '#F7F7F8', accent: '#111114' },
    radius: 4,
    browserColor: '#FFFFFF',
  },
  {
    id: 'nocturne',
    label: '夜航微光',
    tagline: '夜间专注 · 卡片发光，无线条',
    swatch: { app: '#0B0E14', surface: '#161B24', accent: '#5B8CFF' },
    radius: 20,
    browserColor: '#0B0E14',
  },
] as const;

const IDS: readonly string[] = THEMES.map((t) => t.id);

/** 把任意输入（脏配置 / 旧版本值）收敛成合法主题 id */
export function normalizeTheme(value: unknown): ThemeId {
  return typeof value === 'string' && IDS.includes(value) ? (value as ThemeId) : DEFAULT_THEME;
}

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** 切换器 / 防闪烁脚本共用的持久化 key（与 LocalSettingsRepository 的 PREFIX 拼接） */
export const THEME_STORAGE_KEY = 'theme';
