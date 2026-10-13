import { isValidDateKey, parseDateKey } from '@/utils/date';
import { LUNAR_INFO, MAX_LUNAR_YEAR, MIN_LUNAR_YEAR } from './lunarData';

/**
 * 农历换算（纯函数，零依赖、零浏览器 API）。
 *
 * 数据源：`lunarData.LUNAR_INFO`（1900–2100 压缩表）。
 * 基准：**1900-01-31 = 农历 1900 年正月初一**（公历 1900-01-31 与表首年对齐）。
 *
 * ⚠️ 时区约定：入参/出参的日期键一律是**本地时区**的 `'YYYY-MM-DD'`。
 * 严禁 `toISOString().slice(0, 10)`（UTC 切分会跨天错位）；
 * 与公历的日差一律用 `Date.UTC(日历分量)` 计算，绕开本地时区与夏令时。
 *
 * ⚠️ 越界（早于 1900-01-31 或晚于 2100-12-31）一律返回 `null` —— 绝不抛异常，
 * 也绝不返回一个「看起来合理但错误」的日期。**且正反向严格对称**：
 * `lunarToSolar` 不在可读窗口内也返回 `null`，保证非空返回恒可往返
 * （见下方 `SUPPORTED_SOLAR_MIN` / `SUPPORTED_SOLAR_MAX`）。
 */

/** 农历日期（`month` 1–12；`isLeap` 标记该月是否为闰月） */
export interface LunarDate {
  year: number;
  month: number;
  day: number;
  isLeap: boolean;
}

const DAY_MS = 86_400_000;

/** 公历基准：1900-01-31（作为 UTC 毫秒，避免本地时区 / 夏令时干扰） */
const BASE_UTC_MS = Date.UTC(1900, 0, 31);

/**
 * 本模块支持的**公历窗口**（含端点）—— `solarToLunar` 能读出的公历日期范围。
 *
 * 下界 = 表的历元 1900-01-31（农历 1900 年正月初一）；
 * 上界 = 2100-12-31：农历 2100 年正月初一为 2100-02-09，`solarToLunar` 之年守卫
 * 只接受到「公历 2100 年」，因此 2101-01-01 起一律读不出。
 *
 * 定义此窗口是为了让反向的 `lunarToSolar` 与之**严格对称**：农历 2100 年腊月
 * 初二…廿九落在公历 2101 年，这些日期读不回，`lunarToSolar` 对它们必须返回 `null`，
 * 而不是产出一个 `solarToLunar` 无法还原的孤日。
 */
export const SUPPORTED_SOLAR_MIN = '1900-01-31';

/** 见 `SUPPORTED_SOLAR_MIN`。 */
export const SUPPORTED_SOLAR_MAX = '2100-12-31';

/* ------------------------------------------------------------------ */
/* 表查询                                                              */
/* ------------------------------------------------------------------ */

/** 取农历年条目；越界返回 null */
function infoOf(year: number): number | null {
  if (!Number.isInteger(year) || year < MIN_LUNAR_YEAR || year > MAX_LUNAR_YEAR) return null;
  return LUNAR_INFO[year - MIN_LUNAR_YEAR] ?? null;
}

/** 农历年 `year` 的闰月月份（1–12）；无闰月返回 0 */
export function leapMonthOf(year: number): number {
  const info = infoOf(year);
  if (info === null) return 0;
  const leap = info & 0xf;
  return leap >= 1 && leap <= 12 ? leap : 0;
}

/** 农历年 `year` 的闰月天数；无闰月返回 0 */
function leapDaysOf(year: number): number {
  const info = infoOf(year);
  if (info === null || leapMonthOf(year) === 0) return 0;
  return (info & 0x10000) === 0 ? 29 : 30;
}

/** 农历年 `year` 第 `month` 个**平月**的天数（29 / 30） */
function plainMonthDays(year: number, month: number): number {
  const info = infoOf(year);
  if (info === null || month < 1 || month > 12) return 0;
  return (info & (0x10000 >> month)) === 0 ? 29 : 30;
}

/**
 * 农历某月的天数（29 / 30）；非法组合返回 0。
 *
 * 导出给 `festivalService` 计算「除夕」（腊月最后一天），
 * 让「腊月 30 天还是 29 天」由数据决定而不是写死。
 */
export function lunarMonthDays(year: number, month: number, isLeap = false): number {
  if (month < 1 || month > 12) return 0;
  if (isLeap) return leapMonthOf(year) === month ? leapDaysOf(year) : 0;
  return plainMonthDays(year, month);
}

/** 农历一年（含闰月）的总天数 */
function lunarYearDays(year: number): number {
  let sum = 0;
  for (let month = 1; month <= 12; month += 1) sum += plainMonthDays(year, month);
  return sum + leapDaysOf(year);
}

/* ------------------------------------------------------------------ */
/* 公历 → 农历                                                         */
/* ------------------------------------------------------------------ */

/** UTC 毫秒 → 本地语义的日期键（用 UTC 分量读出，避免时区漂移） */
function utcMsToDateKey(ms: number): string {
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 公历日期键 → 农历日期；越界 / 非法输入返回 `null`。
 *
 * **支持的公历窗口（含端点）：`SUPPORTED_SOLAR_MIN`(1900-01-31) … `SUPPORTED_SOLAR_MAX`(2100-12-31)。**
 * 窗口外（更早或更晚）一律返回 `null`，绝不抛异常、绝不给出错误日期。
 */
export function solarToLunar(dateKey: string): LunarDate | null {
  if (!isValidDateKey(dateKey)) return null;
  const date = parseDateKey(dateKey);
  const solarYear = date.getFullYear();
  if (solarYear < MIN_LUNAR_YEAR || solarYear > MAX_LUNAR_YEAR) return null;

  // 用日历年分量算 UTC 差值：与本地时区 / 夏令时完全解耦
  const diffDays = Math.round(
    (Date.UTC(solarYear, date.getMonth(), date.getDate()) - BASE_UTC_MS) / DAY_MS,
  );
  if (diffDays < 0) return null; // 早于 1900-01-31，表外

  // 逐农历年扣减，定位农历年与「年内第几天」
  let offset = diffDays;
  let lunarYear = MIN_LUNAR_YEAR;
  for (; lunarYear <= MAX_LUNAR_YEAR; lunarYear += 1) {
    const days = lunarYearDays(lunarYear);
    if (offset < days) break;
    offset -= days;
  }
  if (lunarYear > MAX_LUNAR_YEAR) return null;

  // 逐月扣减，定位农历月 / 日；闰月紧跟在「闰月月份」那个平月之后
  const leap = leapMonthOf(lunarYear);
  const hasLeap = leap > 0;
  let month = 1;
  let isLeap = false;
  let resolved = false;
  let day = 1;

  while (true) {
    const days = lunarMonthDays(lunarYear, isLeap ? leap : month, isLeap);
    if (offset < days) {
      day = offset + 1;
      resolved = true;
      break;
    }
    offset -= days;

    if (hasLeap && !isLeap && month === leap) {
      isLeap = true; // 平月 `leap` 之后进入闰月，月号不变
    } else {
      isLeap = false;
      month += 1;
      if (month > 12) break;
    }
  }

  if (!resolved) return null;
  return { year: lunarYear, month, day, isLeap };
}

/* ------------------------------------------------------------------ */
/* 农历 → 公历                                                         */
/* ------------------------------------------------------------------ */

/**
 * 农历 → 公历日期键；非法组合返回 `null`。
 *
 * **支持的公历窗口（含端点）：`SUPPORTED_SOLAR_MIN`(1900-01-31) … `SUPPORTED_SOLAR_MAX`(2100-12-31)。**
 * 结果只要落在这个窗口之外就返回 `null`（例如 2100 年腊月初二…廿九会溢出到 2101 年）。
 * 由此得到不变式：对任意非 `null` 返回 `key`，
 * `solarToLunar(key)` 都能往返还原回本函数的入参。（与 `solarToLunar` 严格对称）
 *
 * - 年份越界 / 月或日非法 → `null`（不抛异常）
 * - `isLeap = true` 但该年并没有这个闰月（如 2025 申请闰二月）→ `null`
 * - 日超出该月实际天数（如小月申请 30 日）→ `null`
 * - 换算结果早于 1900-01-31 或晚于 2100-12-31 → `null`
 */
export function lunarToSolar(
  year: number,
  month: number,
  day: number,
  isLeap = false,
): string | null {
  if (!Number.isInteger(year) || year < MIN_LUNAR_YEAR || year > MAX_LUNAR_YEAR) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1) return null;

  const maxDay = lunarMonthDays(year, month, isLeap);
  if (maxDay === 0 || day > maxDay) return null;

  // 从 1900 年正月初一累计天数
  let offset = 0;
  for (let y = MIN_LUNAR_YEAR; y < year; y += 1) offset += lunarYearDays(y);

  const leap = leapMonthOf(year);
  for (let m = 1; m < month; m += 1) {
    offset += plainMonthDays(year, m);
    if (leap === m) offset += leapDaysOf(year);
  }
  if (isLeap) offset += plainMonthDays(year, month); // 闰月在平月之后
  offset += day - 1;

  const key = utcMsToDateKey(BASE_UTC_MS + offset * DAY_MS);
  // 与 solarToLunar 的可读窗口严格对称：溢出窗口的日期读不回，故不产出，
  // 保证「非 null 返回 ⇒ 可往返」。（日期键定长，字典序即时间序）
  if (key < SUPPORTED_SOLAR_MIN || key > SUPPORTED_SOLAR_MAX) return null;
  return key;
}

/* ------------------------------------------------------------------ */
/* 格式化                                                              */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  '正月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '冬月',
  '腊月',
] as const;

/** 数字 → 汉字（1–10；仅用于拼日期） */
const CN_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const;

/** 农历日 → 「初三」「十五」「廿三」「三十」 */
export function formatLunarDay(l: LunarDate): string {
  const d = l.day;
  if (!Number.isInteger(d) || d < 1 || d > 30) return '';
  if (d === 10) return '初十';
  if (d === 20) return '二十';
  if (d === 30) return '三十';
  if (d < 10) return `初${CN_DIGITS[d]}`;
  if (d < 20) return `十${CN_DIGITS[d - 10]}`;
  return `廿${CN_DIGITS[d - 20]}`;
}

/** 农历月日 → 「九月初三」「闰六月初一」 */
export function formatLunarMonthDay(l: LunarDate): string {
  if (!Number.isInteger(l.month) || l.month < 1 || l.month > 12) return '';
  const day = formatLunarDay(l);
  if (!day) return '';
  return `${l.isLeap ? '闰' : ''}${MONTH_NAMES[l.month - 1]}${day}`;
}
