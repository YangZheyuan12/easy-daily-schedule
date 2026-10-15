import type { SectionKey, TaskSectionKey } from './enums';
import { OTHER_KEY } from './enums';

/** 板块展示配置（图标用 emoji，避免引入图标库） */
export interface SectionConfig {
  key: SectionKey;
  name: string;
  icon: string;
  /**
   * 主色的**基准值**（设计稿色板）。
   * 仅用于需要真实 hex 的场合（SVG 属性、测试断言、导出）；
   * 板块被用户改色后，这里就是用户选中的那个 hex。
   */
  color: string;
  /** 浅色底色（基准值，同上） */
  tint: string;
  /**
   * 主色对应的 CSS 变量名，三主题取值不同（见 styles/index.css）。
   * 只在板块**没被改色**时是着色来源 —— 改色后走 `cssColor`。
   */
  cssVar: string;
  /**
   * **运行时着色的唯一来源**：没改色 = `rgb(var(--c-work))`（随主题变），
   * 改过色 = 用户选的 hex（三主题一致，这是「我自己定的色」应有的行为）。
   * 组件一律用 `sectionColor()` 取它，不要自己拼 `rgb(var(...))`。
   */
  cssColor: string;
  /** 运行时浅底：主色 12% 透明，天然适配深浅两种底 */
  cssTint: string;
  /**
   * 首页内联快速添加的 placeholder。
   * 统一格式「记录一项{板块名}…」—— 提示语直接说出「这一行会记到哪个板块」，
   * 用户不用回头确认自己在哪一组下面。改名后跟着变（见 `resolveSectionConfigs`）。
   */
  placeholder: string;
}

/** 内置色板（不含运行时着色字段，那两个由下面的 map 补上） */
type SectionPreset = Omit<SectionConfig, 'cssColor' | 'cssTint'>;

const SECTION_PRESETS: readonly SectionPreset[] = [
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
];

/** 板块内置的默认展示配置（用户没改过任何东西时看到的样子） */
export const SECTION_CONFIGS: readonly SectionConfig[] = SECTION_PRESETS.map((cfg) => ({
  ...cfg,
  cssColor: `rgb(var(${cfg.cssVar}))`,
  cssTint: `rgb(var(${cfg.cssVar}) / 0.12)`,
}));

/** 取该板块的运行时主色（可直接用于 `style`） */
export function sectionColor(config: Pick<SectionConfig, 'cssColor'>): string {
  return config.cssColor;
}

/** 取该板块的运行时浅底（可直接用于 `style`） */
export function sectionTint(config: Pick<SectionConfig, 'cssTint'>): string {
  return config.cssTint;
}

export const SECTION_CONFIG_MAP: Record<SectionKey, SectionConfig> = SECTION_CONFIGS.reduce(
  (acc, cfg) => {
    acc[cfg.key] = cfg;
    return acc;
  },
  {} as Record<SectionKey, SectionConfig>,
);

/* ------------------------------------------------------------------ */
/* 板块自定义（名称 / 颜色 / 图标）—— 数量固定为 4，用户只能改这三个字段  */
/* ------------------------------------------------------------------ */

/**
 * 一个板块可被用户改写的全部字段。
 *
 * 🔴 **键（work/study/fitness/life）不可改、数量固定为 4** —— 所有业务数据
 * （`Item.sectionId`、`Task.sectionId`、`TimeSlot.sectionId`、日历统计口径）都按这四个
 * 键存，允许增删会让「这条记录属于哪个板块」变成悬空引用。用户能改的只有**叫法与配色**。
 */
export interface SectionProfile {
  name: string;
  /**
   * `#RRGGBB`，**null = 用主题自带的板块色**（三套主题各自一份，跟随明暗）。
   *
   * 必须能表达「没改过」而不只是「改成了某个色」：改过色就该三主题一致
   * （这是用户自己定的色），没改过就必须继续走 `rgb(var(--c-work))`——
   * 否则三套主题各自的板块色板会被内置 hex 顶掉，换主题时板块色不再变化。
   */
  color: string | null;
  icon: string;
}

export type SectionProfileMap = Record<SectionKey, SectionProfile>;

/** 默认档案 = 内置配置的名字与图标，颜色为 null（= 沿用主题色，不钉死成 hex） */
export const DEFAULT_SECTION_PROFILES: SectionProfileMap = SECTION_CONFIGS.reduce(
  (acc, cfg) => {
    acc[cfg.key] = { name: cfg.name, color: null, icon: cfg.icon };
    return acc;
  },
  {} as SectionProfileMap,
);

/** 板块名的长度上限：日历时长条里「学习」只占 30px，四个字就已经顶格 */
export const SECTION_NAME_MAX = 6;

/** 取色板。12 色，深浅底上都看得清；前四个就是内置默认色 */
export const SECTION_COLOR_CHOICES: readonly string[] = [
  '#3B82F6',
  '#8B5CF6',
  '#F97316',
  '#10B981',
  '#F43F5E',
  '#EC4899',
  '#F59E0B',
  '#84CC16',
  '#14B8A6',
  '#0EA5E9',
  '#6366F1',
  '#64748B',
];

/** 图标候选。前四个是内置默认图标 */
export const SECTION_ICON_CHOICES: readonly string[] = [
  '💼',
  '📚',
  '🏃',
  '🌿',
  '🧠',
  '✍️',
  '🎨',
  '🎵',
  '🏠',
  '🍳',
  '💰',
  '🧘',
  '🛠️',
  '🎯',
  '📱',
  '🌙',
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** 给 6 位 hex 追加 alpha 通道（0–1 → 00–ff） */
function withAlpha(hex: string, ratio: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, ratio)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}

/** 单个板块档案的收敛：不认识的字段 / 空名字 → 回落到默认 */
export function normalizeSectionProfile(value: unknown, key: SectionKey): SectionProfile {
  const fallback = DEFAULT_SECTION_PROFILES[key];
  if (typeof value !== 'object' || value === null) return { ...fallback };
  const raw = value as Record<string, unknown>;

  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, SECTION_NAME_MAX) : '';
  const color = typeof raw.color === 'string' && HEX_COLOR.test(raw.color) ? raw.color : null;
  const icon = typeof raw.icon === 'string' && raw.icon.trim().length > 0 ? raw.icon.trim() : '';

  return {
    name: name.length > 0 ? name : fallback.name,
    // 颜色不合法 → null（回到主题色），而不是回落到某个 hex
    color,
    icon: icon.length > 0 ? icon : fallback.icon,
  };
}

/**
 * 整份档案的收敛（脏配置 / 旧版本 / 缺字段都能安全读回）。
 * 四个键**一定齐全**，缺哪个补哪个 —— 调用方不用再判空。
 */
export function normalizeSectionProfiles(value: unknown): SectionProfileMap {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return SECTION_CONFIGS.reduce((acc, cfg) => {
    acc[cfg.key] = normalizeSectionProfile(source[cfg.key], cfg.key);
    return acc;
  }, {} as SectionProfileMap);
}

/**
 * 把「内置配置 + 用户档案」合成最终展示配置。
 *
 * 纯函数、无副作用：**默认档案合成出来的结果与 `SECTION_CONFIGS` 逐字段相等**
 * （单测锁着），所以在没自定义过的设备上，全站渲染与加此功能前完全一致。
 *
 * 自定义过颜色 → 主色用 hex（三主题一致）；没自定义 → 仍走 `rgb(var(--c-*))`，
 * 这样三套主题各自的板块色板继续生效。
 */
export function resolveSectionConfigs(profiles: SectionProfileMap | null | undefined): SectionConfig[] {
  return SECTION_CONFIGS.map((cfg) => {
    const profile = profiles?.[cfg.key];
    const name = profile?.name ?? cfg.name;
    const icon = profile?.icon ?? cfg.icon;
    const placeholder = `记录一项${name}…`;

    /*
      用户改色 = 档案里有合法 hex。此时主色钉死成这个 hex（三主题一致 ——
      这是「我自己定的色」应有的行为），浅底用同一 hex + 12% alpha。
      没改色 / 脏值 → 继续走 `rgb(var(--c-*))`，三套主题各自的板块色板才不失效。
    */
    const raw = profile?.color;
    if (typeof raw === 'string' && HEX_COLOR.test(raw)) {
      return {
        key: cfg.key,
        name,
        icon,
        color: raw,
        tint: withAlpha(raw, 0.12),
        cssVar: cfg.cssVar,
        cssColor: raw,
        cssTint: withAlpha(raw, 0.12),
        placeholder,
      };
    }

    return { ...cfg, name, icon, placeholder };
  });
}

/**
 * 「其他」分组的展示配置。
 *
 * 刻意复用 `--c-ink-faint`（弱化墨色）而不是新造一个色：它在三套主题里都已定义，
 * 且语义正好是「不属于任何板块」—— 不给它一个彩色，用户才不会以为这也是个板块。
 */
/** 任务分组的展示配置（四大板块复用板块配置，「其他」是一份固定配置） */
export interface TaskSectionConfig {
  key: TaskSectionKey;
  name: string;
  cssVar: string;
  cssColor: string;
}

export const OTHER_SECTION: TaskSectionConfig = {
  key: OTHER_KEY,
  name: '其他',
  cssVar: '--c-ink-faint',
  cssColor: 'rgb(var(--c-ink-faint))',
};

/** 「其他」固定垫底，四大板块在前（顺序即展示顺序） */
export function resolveTaskSectionConfigs(
  configs: readonly SectionConfig[] = SECTION_CONFIGS,
): TaskSectionConfig[] {
  return [
    ...configs.map((cfg) => ({
      key: cfg.key as TaskSectionKey,
      name: cfg.name,
      cssVar: cfg.cssVar,
      cssColor: cfg.cssColor,
    })),
    OTHER_SECTION,
  ];
}

/**
 * 任务分组 → 展示配置。
 *
 * `configs` 默认是内置配置；**传了就用传的那份**（= 用户改过名/色后的配置）。
 * 组件请用 `useTaskSectionConfigs()`，它会订阅自定义设置。
 */
export function taskSectionConfig(
  key: TaskSectionKey,
  configs: readonly SectionConfig[] = SECTION_CONFIGS,
): TaskSectionConfig {
  if (key === OTHER_KEY) return OTHER_SECTION;
  const found = configs.find((cfg) => cfg.key === key);
  if (!found) return OTHER_SECTION;
  return { key: found.key, name: found.name, cssVar: found.cssVar, cssColor: found.cssColor };
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
