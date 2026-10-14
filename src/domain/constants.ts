import type { SectionKey, TaskSectionKey } from './enums';
import { OTHER_KEY } from './enums';

/** 板块展示配置（图标用 emoji，避免引入图标库） */
export interface SectionConfig {
  key: SectionKey;
  name: string;
  icon: string;
  /**
   * 主色的**基准值**（设计稿色板）。
   * 仅用于需要真实 hex 的场合（SVG 属性、测试断言、导出）。
   * 组件着色请用 `sectionColor()` —— 它取的是当前主题下的实际值。
   */
  color: string;
  /** 浅色底色（基准值，同上） */
  tint: string;
  /**
   * 主色对应的 CSS 变量名，三主题取值不同（见 styles/index.css）。
   * 这是运行时着色的**唯一来源**。
   */
  cssVar: string;
  /**
   * 首页内联快速添加的 placeholder。
   * 统一格式「记录一{量词}{板块}…」—— 提示语直接说出「这一行会记到哪个板块」，
   * 用户不用回头确认自己在哪一组下面。
   */
  placeholder: string;
}

export const SECTION_CONFIGS: readonly SectionConfig[] = [
  { key: 'work', name: '工作', icon: '💼', color: '#3B82F6', tint: '#EFF6FF', cssVar: '--c-work', placeholder: '记录一项工作…' },
  { key: 'study', name: '学习', icon: '📚', color: '#8B5CF6', tint: '#F5F3FF', cssVar: '--c-study', placeholder: '记录一项学习…' },
  {
    key: 'fitness',
    name: '健身',
    icon: '🏃',
    color: '#F97316',
    tint: '#FFF7ED',
    cssVar: '--c-fitness',
    placeholder: '记录一项健身…',
  },
  { key: 'life', name: '生活', icon: '🌿', color: '#10B981', tint: '#ECFDF5', cssVar: '--c-life', placeholder: '记录一项生活…' },
] as const;

/** 取当前主题下该板块的实际主色（可直接用于 `style`） */
export function sectionColor(config: Pick<SectionConfig, 'cssVar'>): string {
  return `rgb(var(${config.cssVar}))`;
}

/** 取当前主题下该板块的浅底（主色 12% 透明，天然适配深浅两种底） */
export function sectionTint(config: Pick<SectionConfig, 'cssVar'>): string {
  return `rgb(var(${config.cssVar}) / 0.12)`;
}

export const SECTION_CONFIG_MAP: Record<SectionKey, SectionConfig> = SECTION_CONFIGS.reduce(
  (acc, cfg) => {
    acc[cfg.key] = cfg;
    return acc;
  },
  {} as Record<SectionKey, SectionConfig>,
);

/**
 * 「其他」分组的展示配置。
 *
 * 刻意复用 `--c-ink-faint`（弱化墨色）而不是新造一个色：它在三套主题里都已定义，
 * 且语义正好是「不属于任何板块」—— 不给它一个彩色，用户才不会以为这也是个板块。
 */
export const OTHER_SECTION = {
  key: OTHER_KEY,
  name: '其他',
  cssVar: '--c-ink-faint',
} as const;

/** 任务分组 → 展示配置（四大板块复用板块配置，「其他」走 OTHER_SECTION） */
export function taskSectionConfig(key: TaskSectionKey): { key: TaskSectionKey; name: string; cssVar: string } {
  if (key === OTHER_KEY) return OTHER_SECTION;
  return SECTION_CONFIG_MAP[key];
}

/** 同步到今日页时真正会落进板块的分组（「其他」不在其中） */
export function isSyncableSection(key: TaskSectionKey): key is SectionKey {
  return key !== OTHER_KEY;
}

/** 同层排序步长。中点插入 = (prev.order + next.order) / 2 */
export const ORDER_STEP = 1000;

/**
 * 展示顺序：`order` 为主，`order` 相同时按创建时间兜底。
 *
 * 放在 domain 而不是仓储层 —— 「谁排在前面」是业务规则，不是存储细节。
 * store（重排后要据此算新 order）与仓储（读出时排序）必须用同一份，
 * 各写一遍迟早会漂移。
 */
export function compareByOrder(
  a: { order: number; createdAt: number },
  b: { order: number; createdAt: number },
): number {
  return a.order - b.order || a.createdAt - b.createdAt;
}

/** 输入防抖落盘时间（ms） */
export const DEBOUNCE_MS = 500;

/** 删除后的撤销窗口（ms） */
export const UNDO_WINDOW_MS = 5000;

/** 层级软上限：超过时给出提示但不阻断操作 */
export const MAX_LEVEL = 8;

/** 软删记录的保留时长：超过后在启动时物理清理 */
export const PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** 首页板块卡片上预览的条目数 */
export const PREVIEW_ITEM_COUNT = 2;

/** 日期键格式示例，仅用于文档与测试 */
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
