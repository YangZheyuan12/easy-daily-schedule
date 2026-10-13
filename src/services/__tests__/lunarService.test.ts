import { describe, expect, it } from 'vitest';
import {
  formatLunarDay,
  formatLunarMonthDay,
  leapMonthOf,
  lunarMonthDays,
  lunarToSolar,
  solarToLunar,
  type LunarDate,
} from '@/services/lunar/lunarService';
import { MAX_LUNAR_YEAR, MIN_LUNAR_YEAR } from '@/services/lunar/lunarData';
import { shiftDateKey } from '@/utils/date';

/**
 * 农历换算的独立锚点测试。
 *
 * ⚠️ 反循环原则：下面的期望值全部是**外部已知事实的硬编码常量**，
 * 不是「跑一遍实现再把输出粘贴进来」。若实现与锚点冲突，应当报告冲突，
 * 而不是把锚点改成实现的样子。
 *
 * 锚点来源与置信度（详见交付报告）：
 * - 1900-01-31 = 正月初一（表自身历元，与 LUNAR_INFO 首年对齐）
 * - 2000-02-05 / 2024-02-10 / 2025-01-29 / 2026-02-17 = 各年春节（正月初一）
 * - 2024-09-17 / 2025-10-06 = 中秋（八月十五）
 * - 2025-05-31 / 2026-06-19 = 端午（五月初五）
 * - 2025 年有闰六月，2025-07-25 = 闰六月初一
 */

/** 硬编码锚点表：[公历日期键, 农历年, 农历月, 农历日, 是否闰月] */
const ANCHORS: readonly [string, number, number, number, boolean][] = [
  ['1900-01-31', 1900, 1, 1, false],
  ['2000-02-05', 2000, 1, 1, false],
  ['2024-02-10', 2024, 1, 1, false],
  ['2025-01-29', 2025, 1, 1, false],
  ['2026-02-17', 2026, 1, 1, false],
  ['2024-09-17', 2024, 8, 15, false],
  ['2025-10-06', 2025, 8, 15, false],
  ['2025-05-31', 2025, 5, 5, false],
  ['2026-06-19', 2026, 5, 5, false],
  ['2025-07-25', 2025, 6, 1, true],
];

describe('solarToLunar — 独立锚点', () => {
  it.each(ANCHORS)('%s → %i年%i月%i日 (闰=%s)', (dateKey, year, month, day, isLeap) => {
    expect(solarToLunar(dateKey)).toEqual({ year, month, day, isLeap } as LunarDate);
  });

  it('2025 年确实有闰六月，且闰月的 isLeap 被正确置位', () => {
    expect(leapMonthOf(2025)).toBe(6);
    const leapJuneFirst = solarToLunar('2025-07-25');
    expect(leapJuneFirst?.isLeap).toBe(true);
    expect(leapJuneFirst?.month).toBe(6);
  });

  it('2024 年无闰月（该年闰月为 0）', () => {
    expect(leapMonthOf(2024)).toBe(0);
  });
});

describe('lunarToSolar — 逆变换与闰月边界', () => {
  it.each(ANCHORS)('逆变换 %s ⇦ (%i,%i,%i,闰=%s)', (dateKey, year, month, day, isLeap) => {
    expect(lunarToSolar(year, month, day, isLeap)).toBe(dateKey);
  });

  it('申请不存在的闰月 → null（2025 只有闰六月，没有闰二月）', () => {
    expect(lunarToSolar(2025, 2, 1, true)).toBeNull();
  });

  it('申请存在的闰月 → 有效日期（2025 闰六月初一 = 2025-07-25）', () => {
    expect(lunarToSolar(2025, 6, 1, true)).toBe('2025-07-25');
  });

  it('闰月与平月是两天不同的日子（2025 六月初一 ≠ 闰六月初一）', () => {
    const plain = lunarToSolar(2025, 6, 1, false);
    const leap = lunarToSolar(2025, 6, 1, true);
    expect(plain).not.toBeNull();
    expect(leap).toBe('2025-07-25');
    expect(plain).not.toBe(leap);
  });

  it('非法组合一律 null：31 日 / 0 日 / 13 月 / 越界年', () => {
    expect(lunarToSolar(2025, 1, 31, false)).toBeNull();
    expect(lunarToSolar(2025, 1, 0, false)).toBeNull();
    expect(lunarToSolar(2025, 13, 1, false)).toBeNull();
    expect(lunarToSolar(MIN_LUNAR_YEAR - 1, 1, 1, false)).toBeNull();
    expect(lunarToSolar(MAX_LUNAR_YEAR + 1, 1, 1, false)).toBeNull();
  });
});

describe('公历 ↔ 农历 往返一致性（表内区间）', () => {
  it('2024-01-01 ~ 2026-12-31 共约 1096 天，逐日往返还原', () => {
    let key = '2024-01-01';
    const end = '2026-12-31';
    let checked = 0;
    while (key <= end) {
      const lunar = solarToLunar(key);
      expect(lunar, `${key} 应有农历结果`).not.toBeNull();
      const back = lunarToSolar(lunar!.year, lunar!.month, lunar!.day, lunar!.isLeap);
      expect(back, `${key} 往返失败`).toBe(key);
      checked += 1;
      key = shiftDateKey(key, 1);
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('跨年抽样往返一致（表两端附近）', () => {
    for (const key of ['1900-01-31', '1901-02-19', '1999-12-31', '2000-01-01', '2099-12-31', '2100-12-31']) {
      const lunar = solarToLunar(key);
      expect(lunar, `${key} 应有农历结果`).not.toBeNull();
      expect(lunarToSolar(lunar!.year, lunar!.month, lunar!.day, lunar!.isLeap)).toBe(key);
    }
  });
});

describe('formatLunarDay — 初一 / 十五 / 廿三 / 三十', () => {
  const cases: readonly [number, string][] = [
    [1, '初一'],
    [2, '初二'],
    [9, '初九'],
    [10, '初十'],
    [11, '十一'],
    [15, '十五'],
    [19, '十九'],
    [20, '二十'],
    [21, '廿一'],
    [23, '廿三'],
    [29, '廿九'],
    [30, '三十'],
  ];

  it.each(cases)('第 %i 天 → %s', (day, expected) => {
    expect(formatLunarDay({ year: 2025, month: 1, day, isLeap: false })).toBe(expected);
  });

  it('非法日号返回空串（不抛异常）', () => {
    expect(formatLunarDay({ year: 2025, month: 1, day: 0, isLeap: false })).toBe('');
    expect(formatLunarDay({ year: 2025, month: 1, day: 31, isLeap: false })).toBe('');
  });
});

describe('formatLunarMonthDay — 月名前缀 / 闰月前缀', () => {
  it('九月初三', () => {
    expect(formatLunarMonthDay({ year: 2025, month: 9, day: 3, isLeap: false })).toBe('九月初三');
  });

  it('正月初一 / 腊月初八 / 冬月初五', () => {
    expect(formatLunarMonthDay({ year: 2025, month: 1, day: 1, isLeap: false })).toBe('正月初一');
    expect(formatLunarMonthDay({ year: 2025, month: 12, day: 8, isLeap: false })).toBe('腊月初八');
    expect(formatLunarMonthDay({ year: 2025, month: 11, day: 5, isLeap: false })).toBe('冬月初五');
  });

  it('闰月带「闰」前缀：闰六月初一', () => {
    expect(formatLunarMonthDay({ year: 2025, month: 6, day: 1, isLeap: true })).toBe('闰六月初一');
  });
});

describe('lunarMonthDays — 腊月大小月由数据决定', () => {
  it('腊月天数是 29 或 30 之一，且 lunarMonthDays 与闰月判定自洽', () => {
    for (const year of [2024, 2025, 2026]) {
      const days = lunarMonthDays(year, 12, false);
      expect([29, 30]).toContain(days);
      // 无闰月的年份，闰月天数应为 0
      if (leapMonthOf(year) !== 12) expect(lunarMonthDays(year, 12, true)).toBe(0);
    }
  });
});
