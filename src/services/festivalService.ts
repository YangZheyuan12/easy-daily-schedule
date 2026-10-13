import { isValidDateKey, parseDateKey } from '@/utils/date';
import { MAX_LUNAR_YEAR, MIN_LUNAR_YEAR } from './lunar/lunarData';
import { leapMonthOf, lunarMonthDays, solarToLunar } from './lunar/lunarService';
import { solarTermOf } from './solarTermService';

/**
 * 内置节日查询（纯函数，零依赖、零浏览器 API）。
 *
 * 覆盖四类：农历传统节日 / 公历节日 / 西方节日（含规则型）/ 二十四节气。
 * **不含**法定节假日与调休（「休 / 班」是另一套数据，本阶段不做）。
 *
 * ------------------------------------------------------------------
 * 去重规则（重要）
 * ------------------------------------------------------------------
 * 「清明」既是二十四节气、又被当作传统节日。为避免同一天出现两遍，
 * 它**只**由节气通道产出（`kind: 'term'`），**不**写进 `LUNAR_FESTIVALS`。
 * 冬至 / 夏至等同理，只作为节气存在（`kind: 'term'`）。
 * 因此 `getFestivals()` 对任一日期返回的名称**不会有重复项**。
 *
 * ------------------------------------------------------------------
 * 优先级（用于 getFestivalLine 取前两名）
 * ------------------------------------------------------------------
 *   农历传统节日 (lunar) > 公历节日 (solar) > 西方节日 (western) > 节气 (term)
 * getFestivals 即按此顺序 push，调用方 `slice(0, 2)` 即可取到最高优先级的两个。
 */

export type FestivalKind = 'lunar' | 'solar' | 'western' | 'term';

export interface Festival {
  name: string;
  kind: FestivalKind;
  /**
   * 是否「大节」。当前用于展示强调；Phase 2 的自定义纪念日会复用这个标记。
   * 判定：明确的传统大节 + 元旦 / 劳动节 / 国庆 + 清明。
   */
  major: boolean;
}

/* ------------------------------------------------------------------ */
/* 数据表                                                              */
/* ------------------------------------------------------------------ */

interface FixedFestival {
  month: number;
  day: number;
  name: string;
  major: boolean;
}

/**
 * 农历传统节日（按农历月日匹配；闰月不计）。
 * ⚠️ 不含清明（见文件头去重规则）；除夕是「腊月最后一天」，由算法动态判定，见下文。
 */
const LUNAR_FESTIVALS: readonly FixedFestival[] = [
  { month: 1, day: 1, name: '春节', major: true },
  { month: 1, day: 15, name: '元宵节', major: true },
  { month: 2, day: 2, name: '龙抬头', major: false },
  { month: 5, day: 5, name: '端午节', major: true },
  { month: 7, day: 7, name: '七夕', major: true },
  { month: 7, day: 15, name: '中元节', major: false },
  { month: 8, day: 15, name: '中秋节', major: true },
  { month: 9, day: 9, name: '重阳节', major: true },
  { month: 12, day: 8, name: '腊八节', major: false },
  { month: 12, day: 23, name: '小年', major: false },
];

/** 公历节日（按公历月日匹配） */
const SOLAR_FESTIVALS: readonly FixedFestival[] = [
  { month: 1, day: 1, name: '元旦', major: true },
  { month: 3, day: 8, name: '妇女节', major: false },
  { month: 3, day: 12, name: '植树节', major: false },
  { month: 5, day: 1, name: '劳动节', major: true },
  { month: 5, day: 4, name: '青年节', major: false },
  { month: 6, day: 1, name: '儿童节', major: false },
  { month: 7, day: 1, name: '建党节', major: false },
  { month: 8, day: 1, name: '建军节', major: false },
  { month: 9, day: 10, name: '教师节', major: false },
  { month: 10, day: 1, name: '国庆节', major: true },
];

/** 西方节日（固定公历月日） */
const WESTERN_FIXED_FESTIVALS: readonly FixedFestival[] = [
  { month: 2, day: 14, name: '情人节', major: false },
  { month: 10, day: 31, name: '万圣节', major: false },
  { month: 12, day: 24, name: '平安夜', major: false },
  { month: 12, day: 25, name: '圣诞', major: false },
];

/** 西方「规则型」节日：某月第 n 个星期几 */
interface RuleFestival {
  month: number;
  /** 0 = 周日 … 6 = 周六（与 `Date#getDay` 对齐） */
  weekday: number;
  /** 第几个（1 起） */
  nth: number;
  name: string;
  major: boolean;
}

const WESTERN_RULE_FESTIVALS: readonly RuleFestival[] = [
  { month: 5, weekday: 0, nth: 2, name: '母亲节', major: false },
  { month: 6, weekday: 0, nth: 3, name: '父亲节', major: false },
  { month: 11, weekday: 4, nth: 4, name: '感恩节', major: false },
];

/* ------------------------------------------------------------------ */
/* 辅助                                                                */
/* ------------------------------------------------------------------ */

/** `year` 年 `month` 月里第 `nth` 个 `weekday` 是几号 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): number {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const firstOccurrence = 1 + ((weekday - firstWeekday + 7) % 7);
  return firstOccurrence + (nth - 1) * 7;
}

/**
 * 除夕判定：**该年腊月的最后一天**（大月 30 / 小月 29，由农历表决定，绝不写死）。
 *
 * 闰腊月极罕见但口径上取「该农历年最后一个月的最后一天」：
 * 若该年闰腊月，则除夕落在闰腊月的最后一天。
 */
function isLunarNewYearEve(lunarMonth: number, lunarDay: number, lunarYear: number, isLeap: boolean): boolean {
  if (lunarMonth !== 12) return false;
  const leap = leapMonthOf(lunarYear);
  const isFinalTwelfth = leap === 12 ? isLeap : !isLeap;
  if (!isFinalTwelfth) return false;
  const lastDay = lunarMonthDays(lunarYear, 12, leap === 12);
  return lastDay > 0 && lunarDay === lastDay;
}

/* ------------------------------------------------------------------ */
/* 查询                                                                */
/* ------------------------------------------------------------------ */

/**
 * 日期键当天的全部内置节日，**按优先级排序**：
 * 农历传统节日 > 公历节日 > 西方节日 > 节气。
 * 越界 / 非法输入 → `[]`（不抛异常）。
 */
export function getFestivals(dateKey: string): Festival[] {
  if (!isValidDateKey(dateKey)) return [];
  const date = parseDateKey(dateKey);
  const year = date.getFullYear();
  if (year < MIN_LUNAR_YEAR || year > MAX_LUNAR_YEAR) return [];

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const result: Festival[] = [];

  // 1) 农历传统节日（含除夕）——闰月不匹配固定农历节日
  const lunar = solarToLunar(dateKey);
  if (lunar) {
    if (!lunar.isLeap) {
      const hit = LUNAR_FESTIVALS.find((f) => f.month === lunar.month && f.day === lunar.day);
      if (hit) result.push({ name: hit.name, kind: 'lunar', major: hit.major });
    }
    if (isLunarNewYearEve(lunar.month, lunar.day, lunar.year, lunar.isLeap)) {
      result.push({ name: '除夕', kind: 'lunar', major: true });
    }
  }

  // 2) 公历节日
  const solarHit = SOLAR_FESTIVALS.find((f) => f.month === month && f.day === day);
  if (solarHit) result.push({ name: solarHit.name, kind: 'solar', major: solarHit.major });

  // 3) 西方节日：固定月日 + 规则型
  const westernHit = WESTERN_FIXED_FESTIVALS.find((f) => f.month === month && f.day === day);
  if (westernHit) result.push({ name: westernHit.name, kind: 'western', major: westernHit.major });
  for (const rule of WESTERN_RULE_FESTIVALS) {
    if (rule.month === month && nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.nth) === day) {
      result.push({ name: rule.name, kind: 'western', major: rule.major });
    }
  }

  // 4) 节气（清明在此产出，且**仅此一次**；见文件头去重规则）
  const term = solarTermOf(dateKey);
  if (term) result.push({ name: term, kind: 'term', major: term === '清明' });

  return result;
}

/**
 * 供 UI 直接使用的一行文案：取优先级最高的**至多 2 个**节日名，用 `' · '` 连接。
 * 当天没有任何节日 → `null`。
 */
export function getFestivalLine(dateKey: string): string | null {
  const names = getFestivals(dateKey)
    .slice(0, 2)
    .map((festival) => festival.name);
  return names.length > 0 ? names.join(' · ') : null;
}
