import { describe, expect, it } from 'vitest';
import { LUNAR_INFO, MAX_LUNAR_YEAR, MIN_LUNAR_YEAR } from '@/services/lunar/lunarData';
import {
  leapMonthOf,
  lunarMonthDays,
  lunarToSolar,
  solarToLunar,
} from '@/services/lunar/lunarService';

/**
 * LUNAR_INFO 全表「结构不变量」测试 —— 覆盖 1900–2100 **全部 201 年**。
 *
 * 为什么要这个文件：既有的 `lunarService.test.ts` / `lunarBoundary.test.ts` 只把
 * 少数年份（1900 / 2000 / 2024 / 2025 / 2026 等）钉成锚点，**非锚点年份的表位若被
 * 改坏，可能没有任何用例变红**（工程实现者自己报告了这个覆盖缺口）。
 * 这里补的是「无论哪一年，结构都必须自洽」的兜底约束，用来抓「大面积表损坏」。
 *
 * ⚠️ 诚实声明（不要粉饰）：
 * 本文件的多数不变量是**同义反复**——`lunarToSolar` / `solarToLunar` / `lunarMonthDays`
 * 都从同一张 `LUNAR_INFO` 解码，任何「两侧互相印证」的断言都不会因为表本身出错而失败，
 * 只会在**代码路径之间不一致**（例如累加循环与逐个扣减循环写岔）时才失败。
 * 换言之：**本文件无法发现「表是错的、但自洽」的损坏**。真正能发现表错的只有外部锚点
 * （见 `lunarFactsAnchor.test.ts`）。下面每条都标注了它是「真不变量」还是「同义反复」。
 */

const YEARS: readonly number[] = Array.from(
  { length: MAX_LUNAR_YEAR - MIN_LUNAR_YEAR + 1 },
  (_, i) => MIN_LUNAR_YEAR + i,
);

/** 两个 'YYYY-MM-DD'（语义都是「日」）之间的整数天数差 */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 某农历年的总天数（12 个平月 + 可能的闰月），完全由导出的支点函数得出 */
function yearLengthByMonths(year: number): number {
  let sum = 0;
  for (let m = 1; m <= 12; m += 1) sum += lunarMonthDays(year, m, false);
  const leap = leapMonthOf(year);
  if (leap > 0) sum += lunarMonthDays(year, leap, true);
  return sum;
}

describe('LUNAR_INFO — 表本身的形态（真不变量）', () => {
  it('表长恰为 201 项，覆盖 1900–2100 每年一项', () => {
    expect(MAX_LUNAR_YEAR - MIN_LUNAR_YEAR + 1).toBe(201);
    expect(LUNAR_INFO).toHaveLength(201);
  });

  it('没有任何一项是 0 / 负数 / 非整数（0x0000 之类的坏条目不存在）', () => {
    // 真不变量：与实现无关，纯看原始数字。
    LUNAR_INFO.forEach((info, index) => {
      expect(Number.isInteger(info), `LUNAR_INFO[${index}] 非整数: ${info}`).toBe(true);
      expect(info, `LUNAR_INFO[${index}] 非法: ${info}`).toBeGreaterThan(0);
    });
  });

  it('闰月下标恒为 0 或落在 1..12（全 201 年）', () => {
    // 真不变量：闰月下标是 4 位，合法域只有 0..12；13..15 是坏值。
    for (const y of YEARS) {
      const leap = leapMonthOf(y);
      const ok = leap === 0 || (leap >= 1 && leap <= 12);
      expect(ok, `${y} 的闰月下标非法: ${leap}`).toBe(true);
    }
  });

  it('每个平月天数恒为 29 或 30（全 201 年 × 12 月）', () => {
    for (const y of YEARS) {
      for (let m = 1; m <= 12; m += 1) {
        expect([29, 30], `${y}-${m} 天数非法`).toContain(lunarMonthDays(y, m, false));
      }
      const leap = leapMonthOf(y);
      if (leap > 0) {
        expect([29, 30], `${y} 闰 ${leap} 月天数非法`).toContain(lunarMonthDays(y, leap, true));
      }
    }
  });
});

describe('年长范围与一致性', () => {
  it('每年总天数（含闰月）落在 353..385 的合理区间（全 201 年）', () => {
    // 真不变量：一个农历年恒为 12 或 13 个朔望月，353..385 是公认的物理区间。
    // 能抓住「大面积位损坏导致年长离谱」的情况（±1 天的单点损坏抓不到，见文首声明）。
    for (const y of YEARS) {
      const len = yearLengthByMonths(y);
      expect(len, `${y} 年长越界: ${len}`).toBeGreaterThanOrEqual(353);
      expect(len, `${y} 年长越界: ${len}`).toBeLessThanOrEqual(385);
    }
  });

  it('年长一致性：月长之和 == 该年正月初一…次年正月初一的天数（1900..2099）', () => {
    /*
      与需求一致地写出这条「最强单点检查」。但必须诚实说明：
      `lunarToSolar` 的 offset 正是累加 `lunarYearDays`（= 同一批月长位），
      所以等号两侧来自同一张表的同一次解码 —— 这条断言在**表被改坏时仍然恒成立**，
      它是「代码两条路径互相一致」的检查，不是「表对不对」的检查。
    */
    for (let y = MIN_LUNAR_YEAR; y < MAX_LUNAR_YEAR; y += 1) {
      const start = lunarToSolar(y, 1, 1, false);
      const next = lunarToSolar(y + 1, 1, 1, false);
      expect(start, `${y} 正月初一应存在`).not.toBeNull();
      expect(next, `${y + 1} 正月初一应存在`).not.toBeNull();

      const gap = dayDiff(start!, next!);
      expect(gap, `${y} 年长与月长之和不一致`).toBe(yearLengthByMonths(y));
    }
  });
});

describe('月长交替规则的裁定（用真实表数据判定，不猜测）', () => {
  it('「不得连续两个 30 天月」是伪不变量：真实表中大量存在（故不予断言）', () => {
    /*
      需求允许「若能精确表述交替规则就写，否则跳过并说明」。
      实测：真实表中连续两个 30 天大月共 332 例（如 1900 年七月+八月），
      连续两个 29 天小月共 222 例（如 2010 年六月+七月，有外部万年历佐证）。
      既然真实表本身就不满足交替，任何「交替」断言都是错的 → 不写。
    */
    let consecutive30 = 0;
    let consecutive29 = 0;
    for (const y of YEARS) {
      const seq: number[] = [];
      const leap = leapMonthOf(y);
      for (let m = 1; m <= 12; m += 1) {
        seq.push(lunarMonthDays(y, m, false));
        if (leap === m) seq.push(lunarMonthDays(y, m, true));
      }
      for (let i = 1; i < seq.length; i += 1) {
        if (seq[i] === 30 && seq[i - 1] === 30) consecutive30 += 1;
        if (seq[i] === 29 && seq[i - 1] === 29) consecutive29 += 1;
      }
    }
    expect(consecutive30).toBeGreaterThan(100);
    expect(consecutive29).toBeGreaterThan(100);
  });
});

describe('全表往返一致性（对全部 201 年）', () => {
  it.each(YEARS)('%i：正月初一 & 腊月初一 往返还原', (y) => {
    for (const month of [1, 12]) {
      const key = lunarToSolar(y, month, 1, false);
      expect(key, `lunarToSolar(${y},${month},1) 应存在`).not.toBeNull();
      expect(solarToLunar(key!)).toEqual({ year: y, month, day: 1, isLeap: false });
    }
  });

  it('闰月存在性：lunarToSolar(y, leapMonthOf(y), 1, true) 恰在 leapMonthOf(y)!==0 时非空', () => {
    for (const y of YEARS) {
      const leap = leapMonthOf(y);
      const result = lunarToSolar(y, leap, 1, true);
      if (leap === 0) {
        expect(result, `${y} 无闰月却换算出闰月日期`).toBeNull();
      } else {
        expect(result, `${y} 有闰 ${leap} 月却换不出日期`).not.toBeNull();
        expect(solarToLunar(result!)).toEqual({ year: y, month: leap, day: 1, isLeap: true });
      }
    }
  });
});

describe('逐日连续性扫描（代码路径一致性）', () => {
  const SAMPLE = [1900, 1912, 1950, 1995, 2000, 2010, 2035, 2060, 2088] as const; // 2100 单列（顶部边界）

  /** 期望的月序：1..12，闰月紧跟在「闰月月号」那个平月之后 */
  function expectedMonths(y: number): { month: number; isLeap: boolean; len: number }[] {
    const expected: { month: number; isLeap: boolean; len: number }[] = [];
    const leap = leapMonthOf(y);
    for (let m = 1; m <= 12; m += 1) {
      expected.push({ month: m, isLeap: false, len: lunarMonthDays(y, m, false) });
      if (leap === m) expected.push({ month: m, isLeap: true, len: lunarMonthDays(y, m, true) });
    }
    return expected;
  }

  /** 从正月初一逐日走完该农历年，把连续相同 (month,isLeap) 的日聚成一段 */
  function scan(y: number) {
    const start = lunarToSolar(y, 1, 1, false)!;
    const expected = expectedMonths(y);
    const total = expected.reduce((sum, s) => sum + s.len, 0);
    const observed: { month: number; isLeap: boolean; len: number }[] = [];
    let key = start;
    let truncatedAt: string | null = null;
    for (let i = 0; i < total; i += 1) {
      // 表只覆盖到 2100-12-31；更晚的公历日 solarToLunar 返回 null，按截断处理
      if (key > '2100-12-31') {
        truncatedAt = key;
        break;
      }
      const lunar = solarToLunar(key);
      expect(lunar, `${key} 在农历 ${y} 年内不应为 null`).not.toBeNull();
      const last = observed[observed.length - 1];
      if (last && last.month === lunar!.month && last.isLeap === lunar!.isLeap) {
        last.len += 1;
      } else {
        observed.push({ month: lunar!.month, isLeap: lunar!.isLeap, len: 1 });
      }
      const [yy, mm, dd] = key.split('-').map(Number);
      const nextDay = new Date(Date.UTC(yy!, mm! - 1, dd! + 1));
      key = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(
        nextDay.getUTCDate(),
      ).padStart(2, '0')}`;
    }
    return { expected, observed, truncatedAt };
  }

  it.each(SAMPLE)('%i：整年逐日扫描的月序 / 月长 / 闰月位置自洽', (y) => {
    const { expected, observed, truncatedAt } = scan(y);
    expect(truncatedAt, `${y} 不应触发顶部截断`).toBeNull();
    expect(observed).toEqual(expected);
  });

  it('2100：逐日扫描在 2101-01-01 截断；反向 lunarToSolar 亦不越界（对称，缺陷已闭合）', () => {
    /*
      2026-10 修复：农历 2100 年从 2100-02-09 起，腊月初一落在 2100-12-31，
      腊月初二…廿九会溢出到公历 2101-01-01…2101-01-28 —— 超出 `solarToLunar` 可读的
      公历窗口（1900-01-31 … 2100-12-31）。修复前 `lunarToSolar` 不设上界守卫，
      能产出这些 2101 日期，而 `solarToLunar` 读不回，形成「能写出、读不回」的不对称。
      现在 `lunarToSolar` 对溢出窗口的结果返回 null，正反向严格对称。
    */
    const { expected, observed, truncatedAt } = scan(2100);
    // 除「被截断的最后一月（腊月，只剩初一 1 天）」外，前面各整月必须完全吻合
    const fullyCovered = observed.slice(0, -1);
    expect(fullyCovered).toEqual(expected.slice(0, fullyCovered.length));
    const lastObserved = observed[observed.length - 1]!;
    const lastExpected = expected[observed.length - 1]!;
    expect({ month: lastObserved.month, isLeap: lastObserved.isLeap }).toEqual({
      month: lastExpected.month,
      isLeap: lastExpected.isLeap,
    });
    expect(lastObserved.len).toBe(1); // 只覆盖到腊月初一（2100-12-31）
    expect(lastObserved.len).toBeLessThan(lastExpected.len);
    expect(truncatedAt).toBe('2101-01-01');

    // 上界守卫：腊月初二起溢出窗口 → 必须 null（旧实现会返回 2101-01-02 … 2101-01-28）
    expect(lunarToSolar(2100, 12, 2, false)).toBeNull();
    expect(lunarToSolar(2100, 12, 29, false)).toBeNull();
    // 窗口内的腊月初一仍可读出，且可往返
    const last = lunarToSolar(2100, 12, 1, false);
    expect(last).toBe('2100-12-31');
    expect(solarToLunar(last!)).toEqual({ year: 2100, month: 12, day: 1, isLeap: false });
  });
});
