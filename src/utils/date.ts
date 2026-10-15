/**
 * 日期工具（零依赖）。
 *
 * ⚠️ 关键约定：日期键一律基于**本地时区**。
 * 严禁使用 `toISOString().slice(0, 10)` —— 那会按 UTC 切分，
 * 在东八区会把「23:30」算成第二天，造成跨天错乱。
 */

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

/** Date → 'YYYY-MM-DD'（本地时区） */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' → Date（本地时区的当天 00:00:00） */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

/** 日期键加减天数，delta 可为负 */
export function shiftDateKey(key: string, delta: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

/** '10月15日 周三' */
export function formatDateLabel(key: string): string {
  const date = parseDateKey(key);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${month}月${day}日 ${weekday}`;
}

/** '10月15日' */
export function formatShortDate(key: string): string {
  const date = parseDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function weekdayLabel(key: string): string {
  return WEEKDAY_LABELS[parseDateKey(key).getDay()] ?? '';
}

export function isToday(key: string, now: Date = new Date()): boolean {
  return key === toDateKey(now);
}

/** 校验日期键格式 */
export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = parseDateKey(key);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === key;
}

/** 返回以 weekStart 为周一、长度为 7 的日期键数组 */
export function weekKeys(key: string): string[] {
  const date = parseDateKey(key);
  // getDay(): 0=周日，转换为「周一为 0」
  const offset = (date.getDay() + 6) % 7;
  const monday = shiftDateKey(key, -offset);
  return Array.from({ length: 7 }, (_, i) => shiftDateKey(monday, i));
}

/** 一周的范围文案：'10月13日 – 10月19日'（周视图的中间大字用） */
export function weekRangeLabel(key: string): string {
  const keys = weekKeys(key);
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return formatShortDate(key);
  return `${formatShortDate(first)} – ${formatShortDate(last)}`;
}

/**
 * 周范围的**单行**标签（日期导航中间那一行用）。
 *
 * 同月时后半段只写「日」：`10月12日–18日`；跨月才补月份：`10月30日–11月5日`。
 * 存在的理由很具体：`weekRangeLabel` 的完整写法在 24px 下会**折成两行**，
 * 把日期导航撑高、挤掉下面的内容。跨年不写年份 —— 一周最多跨一个年界，
 * 而「12月29日–1月4日」已经足够定位，加上年份反而又会长回去。
 */
export function weekRangeShortLabel(key: string): string {
  const keys = weekKeys(key);
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return formatShortDate(key);

  const a = parseDateKey(first);
  const b = parseDateKey(last);
  const left = `${a.getMonth() + 1}月${a.getDate()}日`;
  const right =
    a.getMonth() === b.getMonth() ? `${b.getDate()}日` : `${b.getMonth() + 1}月${b.getDate()}日`;
  return `${left}–${right}`;
}

/* ------------------------------------------------------------------ */
/* 月历（日历页用）                                                     */
/* ------------------------------------------------------------------ */

/** 月键，格式 'YYYY-MM' */
export type MonthKey = string;

/** 月历中的一个格子 */
export interface MonthCell {
  /** 该格对应的日期键 */
  dateKey: string;
  /** 显示用的「几号」 */
  day: number;
  /** true = 属于目标月；false = 前后补位的上月 / 下月日期 */
  inMonth: boolean;
}

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function toMonthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** 月键加减月数，delta 可为负。用 Date 的月份进位而不是手算，天然处理跨年 */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** '2026年10月' */
export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${year ?? 1970}年${month ?? 1}月`;
}

/**
 * 月历网格：固定 **42 格**（6 周 × 7 天），周一为第一列。
 *
 * 之所以固定 42 格而不是按实际周数（5 或 6 周）：切换月份时网格高度不跳变，
 * 否则下方的摘要卡会随之上下抖动，移动端观感很差。
 */
export function monthGrid(monthKey: string): MonthCell[] {
  const firstDay = `${monthKey}-01`;
  // getDay(): 0=周日 → 换算成「距本周一多少天」
  const offset = (parseDateKey(firstDay).getDay() + 6) % 7;
  const start = shiftDateKey(firstDay, -offset);
  return Array.from({ length: 42 }, (_, index) => {
    const dateKey = shiftDateKey(start, index);
    return {
      dateKey,
      day: parseDateKey(dateKey).getDate(),
      inMonth: toMonthKey(dateKey) === monthKey,
    };
  });
}

/**
 * 把「几号」这个选择夹到目标月里（切月份时用）。
 *
 * 目标月有那一天就原样保留（15 号 → 15 号）；没有就退到该月最后一天
 * （1 月 31 号 → 平年 2 月 28 号 / 闰年 2 月 29 号 / 4 月 30 号）。
 * 落在 `monthGrid` 的本月格子内是硬要求：摘要卡靠 `summaries[selectedDate]`
 * 取值，落到了格子外面就会退化成「这一天没有记录」的假象。
 */
export function clampDayToMonth(dateKey: string, monthKey: string): string {
  const cells = monthGrid(monthKey).filter((cell) => cell.inMonth);
  const day = Number(dateKey.slice(8, 10));
  const sameDay = cells.find((cell) => cell.day === day);
  if (sameDay) return sameDay.dateKey;
  return cells[cells.length - 1]?.dateKey ?? `${monthKey}-01`;
}

/**
 * 日期键是否在今天之后。
 * 日期键是定长的 'YYYY-MM-DD'，字典序即时间序，直接比较即可。
 */
export function isFutureDate(dateKey: string, now: Date = new Date()): boolean {
  return dateKey > toDateKey(now);
}

/* ------------------------------------------------------------------ */
/* 年历（日历页年视图用）                                               */
/* ------------------------------------------------------------------ */

/** 年键，格式 'YYYY' */
export type YearKey = string;

/** 'YYYY-MM-DD' → 'YYYY' */
export function toYearKey(dateKey: string): string {
  return dateKey.slice(0, 4);
}

/** 年键加减年数，delta 可为负 */
export function shiftYearKey(yearKey: string, delta: number): string {
  const year = Number(yearKey) || new Date().getFullYear();
  return String(year + delta);
}

/** '2026年' */
export function yearLabel(yearKey: string): string {
  return `${yearKey}年`;
}

/** 某年包含的 12 个月键，1 月 → 12 月 */
export function monthsInYear(yearKey: string): string[] {
  return Array.from({ length: 12 }, (_, index) => `${yearKey}-${String(index + 1).padStart(2, '0')}`);
}

/** 某年的起止日期键：1 月 1 日 → 12 月 31 日（闭区间，用于区间查询） */
export function yearRange(yearKey: string): { start: string; end: string } {
  return { start: `${yearKey}-01-01`, end: `${yearKey}-12-31` };
}

/* ------------------------------------------------------------------ */
/* 时间轴：分钟 ↔ HH:MM                                                  */
/* ------------------------------------------------------------------ */

/** 距当天 00:00 的分钟数 → 'HH:MM'（不足两位补零） */
export function minToHHMM(min: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(min)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 'HH:MM' → 距当天 00:00 的分钟数；非法输入回退为 0 */
export function hhmmToMin(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return 0;
  return h * 60 + m;
}

/**
 * 时间段文案。
 *
 * endMin 为 0 视为「未设定结束时间」，只显示起点；否则显示「起点–终点」。
 */
export function formatTimeRange(startMin: number, endMin: number): string {
  if (endMin === 0) return minToHHMM(startMin);
  return `${minToHHMM(startMin)}–${minToHHMM(endMin)}`;
}
