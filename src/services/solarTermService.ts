import { isValidDateKey, parseDateKey } from '@/utils/date';
import { MAX_LUNAR_YEAR, MIN_LUNAR_YEAR } from './lunar/lunarData';

/**
 * 二十四节气查询（纯函数，零依赖、零浏览器 API）。
 *
 * ------------------------------------------------------------------
 * 算法（2026-10 重写：修正「節氣 ±1 天」缺陷）
 * ------------------------------------------------------------------
 * 节气由**太阳视黄经**定义：当太阳视黄经达到 15° 的整数倍时的瞬间即为交节时刻，
 * 「几号」必须按**北京时间（UTC+8）**取日历日。旧实现用「1900 基准 + 平均回归年」
 * 的紧凑表再取 `getUTCDate()`，既丢了北京时区、又累积了回归年漂移 → 个别年份差一天。
 *
 * 现在改为「算瞬间 → 定北京日」两步：
 *   1. 用 Meeus《Astronomical Algorithms》第 25 章 low-accuracy 太阳位置算视黄经：
 *        n = 自 J2000.0 起的天数
 *        L = 280.460 + 0.9856474·n         （平黄经，度）
 *        g = 357.528 + 0.9856003·n         （平近点角，度）
 *        λ = L + 1.915·sin g + 0.020·sin 2g（视黄经，度，归一化到 [0,360)）
 *      精度 ~0.01°（≈15 分钟）。
 *      ΔT（TT−UT）在 1900–2100 区间 ≤ ~100 s，远小于本精度对应的时间误差，
 *      **故这里有意忽略 ΔT**（不做 TT/UT 修正）。
 *   2. 24 个节气对应 λ = (285 + 15·k) mod 360，k = 0..23，与 `SOLAR_TERMS`
 *      的下标一一对应（下标 0 = 小寒 = 285°；6 = 清明 = 15°；11 = 夏至 = 90°；
 *      17 = 秋分 = 180°；23 = 冬至 = 270°）。
 *   3. 对目标 λ 用**牛顿迭代**在 `[Y-01-01, Y-12-31]` 内求解交节瞬间；每个节气在
 *      该公历年内有且只有一个根（太阳黄经单调增，节气彼此相隔约 15.2 天）。
 *   4. 把瞬间换成**北京**日历日：**全程纯整数运算，不使用 `Date`** ——
 *      先算出儒略日 JD，+8/24 后再用 Fliegel–Van Flandern 整数算法转回 (Y,M,D)。
 *      旧缺陷正是「UTC 日号 / 本地时区」混用，这里从根上杜绝。
 * ------------------------------------------------------------------
 */

/** 24 个节气名，下标 0 = 小寒（与 λ = (285 + 15·k) mod 360 一一对应） */
export const SOLAR_TERMS: readonly string[] = [
  '小寒',
  '大寒',
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至',
];

const DEG = Math.PI / 180;

/** J2000.0 历元的儒略日（2000-01-01 12:00 TT/UT，本例不区分） */
const JULIAN_DAY_J2000 = 2451545;

/** 太阳平黄经日均变化率（度/日，Meeus ch.25） */
const MEAN_LONGITUDE_RATE = 0.9856474;

/** 太阳平近点角日均变化率（度/日，Meeus ch.25） */
const MEAN_ANOMALY_RATE = 0.9856003;

/** 北京时间相对 UT 的偏移（日） */
const BEIJING_OFFSET_DAYS = 8 / 24;

/**
 * 播种用：太阳视黄经在「1 月 1 日 00:00」附近约 280°。
 * 仅用于给出牛顿迭代的初值，不需要精确 —— 误差控制在 ~1 天内，迭代会收敛到正确根。
 */
const LONGITUDE_AT_NEW_YEAR = 280;

/** 归一化到 [0, 360) */
function normalize360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** 归一化到 (-180, 180]，用于求根时消除 360° 环绕带来的不连续 */
function normalize180(deg: number): number {
  const r = normalize360(deg);
  return r > 180 ? r - 360 : r;
}

/** 太阳视黄经（度，[0,360)）；入参 n = 自 J2000.0 起的天数 */
function apparentSolarLongitude(n: number): number {
  const L = 280.46 + MEAN_LONGITUDE_RATE * n;
  const g = (357.528 + MEAN_ANOMALY_RATE * n) * DEG;
  return normalize360(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

/** 视黄经对 n 的解析导数（度/日），供牛顿迭代用（比常数近似收敛更快更稳） */
function apparentLongitudeRate(n: number): number {
  const g = (357.528 + MEAN_ANOMALY_RATE * n) * DEG;
  return (
    MEAN_LONGITUDE_RATE +
    1.915 * MEAN_ANOMALY_RATE * DEG * Math.cos(g) +
    0.02 * 2 * MEAN_ANOMALY_RATE * DEG * Math.cos(2 * g)
  );
}

/**
 * 公历 (Y,M,D) → 儒略日号 JDN（Gregorian，纯整数）。
 * 例：jdnFromGregorian(2000, 1, 1) === 2451545。
 */
function jdnFromGregorian(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * 儒略日号 JDN → 公历 (Y,M,D)（Fliegel–Van Flandern 逆算法，纯整数）。
 * 是 `jdnFromGregorian` 的严格逆运算。
 */
function civilFromJdn(jdn: number): { year: number; month: number; day: number } {
  let l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  l -= Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  return { year, month, day };
}

/** 第 `index` 个节气（0 = 小寒）对应的太阳视黄经（度） */
function targetLongitude(index: number): number {
  return normalize360(285 + 15 * index);
}

/**
 * 求解公历年 `year` 第 `index` 个节气的交节瞬间，返回其**北京**日历日。
 * 纯整数得到日期，完全不使用 `Date`。
 */
function solarTermBeijingDate(
  year: number,
  index: number,
): { year: number; month: number; day: number } {
  const target = targetLongitude(index);

  // 初值：从该年 1 月 1 日 00:00 起，按视黄经日均变化率推一个大致的日数
  const jan1Jd = jdnFromGregorian(year, 1, 1) - 0.5;
  let n =
    jan1Jd -
    JULIAN_DAY_J2000 +
    normalize360(target - LONGITUDE_AT_NEW_YEAR) / MEAN_LONGITUDE_RATE;

  // 牛顿迭代：f(n) = normalize180(λ(n) − target)，f'(n) ≈ 视黄经增速
  for (let i = 0; i < 12; i += 1) {
    const residual = normalize180(apparentSolarLongitude(n) - target);
    if (Math.abs(residual) < 1e-7) break;
    n -= residual / apparentLongitudeRate(n);
  }

  // 瞬间的儒略日 → 北京时间日号 → 公历日期（全部整数，无 Date）
  const jd = JULIAN_DAY_J2000 + n;
  const jdn = Math.floor(jd + 0.5 + BEIJING_OFFSET_DAYS);
  return civilFromJdn(jdn);
}

/** (year, index) → 已算好的北京日期；节气与其日期是确定性映射，做一次记忆化 */
const termDateCache = new Map<number, { year: number; month: number; day: number }>();

/** 带缓存的 `solarTermBeijingDate` */
function termDate(year: number, index: number): { year: number; month: number; day: number } {
  const cacheKey = year * SOLAR_TERMS.length + index;
  const cached = termDateCache.get(cacheKey);
  if (cached) return cached;
  const computed = solarTermBeijingDate(year, index);
  termDateCache.set(cacheKey, computed);
  return computed;
}

/** 第 `index` 个节气（0 = 小寒）在 `year` 年的公历日号（1–31）；越界序号返回 0 */
export function solarTermDayOfMonth(year: number, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= SOLAR_TERMS.length) return 0;
  if (!Number.isInteger(year)) return 0;
  return termDate(year, index).day;
}

/**
 * 日期键当天的节气名；不是节气日 / 越界 / 非法输入 → `null`。
 *
 * 一个公历日最多落一个节气（同月两个节气之间恒隔 ~15 天），故命中即返回。
 * 为保证节气落在正确的公历年，只在 1900–2100 内查询（与农历表区间一致）。
 */
export function solarTermOf(dateKey: string): string | null {
  if (!isValidDateKey(dateKey)) return null;
  const date = parseDateKey(dateKey);
  const year = date.getFullYear();
  if (year < MIN_LUNAR_YEAR || year > MAX_LUNAR_YEAR) return null;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const firstIndex = (month - 1) * 2; // 该月两个节气的起始下标

  for (const index of [firstIndex, firstIndex + 1]) {
    if (termDate(year, index).day === day) return SOLAR_TERMS[index] ?? null;
  }
  return null;
}
