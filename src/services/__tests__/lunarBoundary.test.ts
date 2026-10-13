import { describe, expect, it } from 'vitest';
import {
  formatLunarMonthDay,
  lunarToSolar,
  solarToLunar,
} from '@/services/lunar/lunarService';
import { MAX_LUNAR_YEAR, MIN_LUNAR_YEAR } from '@/services/lunar/lunarData';
import { getFestivalLine, getFestivals } from '@/services/festivalService';
import { solarTermOf } from '@/services/solarTermService';

/**
 * 边界测试：表覆盖区间 [1900-01-31, 2100-12-31] 之外一律「安全降级」——
 * 返回 null / []，绝不抛异常，也绝不返回一个看似合理的错误日期。
 *
 * 关键点：UI 侧调用 `formatLunarMonthDay` 之前必须先判空（下面的 lunarLineOf
 * 复刻了 hook 的守卫写法），因此越界日期不会把 null 传进格式化函数。
 */

describe('solarToLunar —— 区间边界', () => {
  it('表下界之前返回 null：1899-12-31 及其后一天（1900-01-30）', () => {
    expect(solarToLunar('1899-12-31')).toBeNull();
    expect(solarToLunar('1900-01-30')).toBeNull();
  });

  it('表上界之后返回 null：2101-01-01', () => {
    expect(solarToLunar('2101-01-01')).toBeNull();
    expect(solarToLunar('2101-12-31')).toBeNull();
  });

  it('区间端点本身有效（闭区间）：1900-01-31 与 2100-12-31', () => {
    expect(solarToLunar('1900-01-31')).not.toBeNull();
    expect(solarToLunar('2100-12-31')).not.toBeNull();
  });

  it('非法日期键返回 null（不抛异常）', () => {
    expect(solarToLunar('abc')).toBeNull();
    expect(solarToLunar('2025-02-30')).toBeNull();
    expect(solarToLunar('2025-13-01')).toBeNull();
    expect(solarToLunar('')).toBeNull();
  });
});

describe('lunarToSolar —— 区间边界', () => {
  it('年份越界返回 null', () => {
    expect(lunarToSolar(MIN_LUNAR_YEAR - 1, 1, 1)).toBeNull();
    expect(lunarToSolar(MAX_LUNAR_YEAR + 1, 1, 1)).toBeNull();
    expect(lunarToSolar(Number.NaN, 1, 1)).toBeNull();
  });

  it('窗口端点：下界 1900-01-31 与上界 2100-12-31', () => {
    expect(lunarToSolar(1900, 1, 1, false)).toBe('1900-01-31');
    expect(lunarToSolar(2100, 12, 1, false)).toBe('2100-12-31');
  });

  it('上界溢出返回 null：农历 2100 腊月初二…廿九落在 2101 年（读不回 → 不产出）', () => {
    // 农历 2100 年腊月初一 = 2100-12-31（窗口上界）；初二起溢出到 2101-01-xx
    expect(lunarToSolar(2100, 12, 2, false)).toBeNull();
    expect(lunarToSolar(2100, 12, 29, false)).toBeNull();
    expect(lunarToSolar(2100, 12, 30, false)).toBeNull(); // 该月非大月，本就 null
  });

  it('往返不变式：任意非 null 返回都能被 solarToLunar 还原（抽样 1900–2100）', () => {
    for (let year = MIN_LUNAR_YEAR; year <= MAX_LUNAR_YEAR; year += 1) {
      for (const month of [1, 6, 12]) {
        for (const isLeap of [false, true]) {
          for (const day of [1, 15, 29]) {
            const key = lunarToSolar(year, month, day, isLeap);
            if (key === null) continue; // 非法组合 / 溢出窗口：允许 null
            expect(
              solarToLunar(key),
              `lunarToSolar(${year},${month},${day},${isLeap}) → ${key} 往返失败`,
            ).toEqual({ year, month, day, isLeap });
          }
        }
      }
    }
  });
});

describe('getFestivals / getFestivalLine —— 区间边界', () => {
  it('1899-12-31 与 2101-01-01 → [] 与 null', () => {
    expect(getFestivals('1899-12-31')).toEqual([]);
    expect(getFestivals('2101-01-01')).toEqual([]);
    expect(getFestivalLine('1899-12-31')).toBeNull();
    expect(getFestivalLine('2101-01-01')).toBeNull();
  });
});

describe('solarTermOf —— 区间边界', () => {
  it('越界年份与非法日期 → null', () => {
    expect(solarTermOf('1899-12-31')).toBeNull();
    expect(solarTermOf('2101-01-01')).toBeNull();
    expect(solarTermOf('2101-04-05')).toBeNull();
    expect(solarTermOf('not-a-date')).toBeNull();
  });
});

describe('UI 守卫写法：越界时不把 null 传进格式化函数', () => {
  /** 复刻 useDayFestivals 的守卫：先判空再格式化 */
  function lunarLineOf(dateKey: string): string {
    const lunar = solarToLunar(dateKey);
    return lunar ? formatLunarMonthDay(lunar) : '';
  }

  it('越界 → 空串（无崩溃、无「Invalid Date」类脏文本）', () => {
    expect(lunarLineOf('1899-12-31')).toBe('');
    expect(lunarLineOf('2101-01-01')).toBe('');
    expect(lunarLineOf('abc')).toBe('');
  });

  it('区间内 → 正常文案', () => {
    expect(lunarLineOf('2025-10-06')).toBe('八月十五');
  });
});
