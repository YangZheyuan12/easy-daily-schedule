import { describe, expect, it } from 'vitest';
import { getFestivalLine, getFestivals } from '@/services/festivalService';
import { leapMonthOf, lunarMonthDays, lunarToSolar, solarToLunar } from '@/services/lunar/lunarService';
import { shiftDateKey } from '@/utils/date';

/**
 * 农历「外部事实」锚点测试 —— 覆盖 1990s / 2000s / 2010s / 2020s / 2030s，
 * 比既有 `lunarService.test.ts`（只钉 2024–2026）宽得多。
 *
 * ⚠️ 反循环原则（本文件的生命线）：
 * 下面每一个期望值都是**外部万年历公布的公历日期**，硬编码为字面量，
 * **不是**跑一遍实现再把输出粘回来。若实现与锚点冲突，**报告冲突**，
 * **绝不**把锚点改成实现的样子。
 *
 * 锚点来源（均为公历日期，2026-10 检索）：
 * - 春节（正月初一）历年表：多源交叉一致
 *   · set.baidu.com/view/ee844fe6f21fb7360b4c2e3f5727a5e9856a2707.html（1900–2030 全表）
 *   · chinesecalendaronline.com/zh/jieri/chunjie/（2008–2050）
 *   · jieri8.com/festival/chunjie/2026.html（2021–2031）
 * - 2010 年逐日农历（含每月大小月标注）：zhouyi.cc/huangli/nongli/15520.html、
 *   wannianli.tianqi.com/rilibiao/2010.html（数据源：紫金山天文台）
 * - 2025 年每月初一 + 大小月 + 闰六月 + 384 天：huangli123.net/nianli/2025.html（紫金山天文台）、
 *   blog.sina.com.cn/s/blog_66b042810102yxlw.html（2025 初一/十五汇总）
 * - 1995 年闰八月：huangli123.net/huangli/1995-9-25.html（1995-09-25 闰八月初一，小月）、
 *   rili.com.cn/nongli/1995/08101.html、ima.qq.com 万年历表（1995-09-24 八月三十 / 09-25 闰八月初一）
 *
 * 置信度：涉及 2010 / 2025 / 2024–2026 的锚点置信度=高（≥2 个独立来源，且与相邻年份首尾衔接自洽）；
 * 1990 年前后的周末锚点置信度=中（单一权威表，但与该表的其余年份链内部一致）。
 */

/* ------------------------------------------------------------------ */
/* 1) 春节（正月初一）跨年代锚点                                        */
/* ------------------------------------------------------------------ */

const CNY: readonly [string, number][] = [
  ['1990-01-27', 1990],
  ['1995-01-31', 1995],
  ['1999-02-16', 1999],
  ['2000-02-05', 2000],
  ['2005-02-09', 2005],
  ['2008-02-07', 2008],
  ['2010-02-14', 2010],
  ['2012-01-23', 2012],
  ['2015-02-19', 2015],
  ['2018-02-16', 2018],
  ['2020-01-25', 2020],
  ['2023-01-22', 2023],
  ['2024-02-10', 2024],
  ['2025-01-29', 2025],
  ['2026-02-17', 2026],
  ['2030-02-03', 2030],
  ['2033-01-31', 2033],
  ['2035-02-08', 2035],
  ['2038-02-04', 2038],
];

describe('春节（正月初一）跨 1990s–2030s 外部锚点', () => {
  it.each(CNY)('%s 是农历 %i 年正月初一', (dateKey, lunarYear) => {
    expect(solarToLunar(dateKey)).toEqual({ year: lunarYear, month: 1, day: 1, isLeap: false });
  });

  it.each(CNY)('逆向：lunarToSolar(%i, 1, 1) == %s', (dateKey, lunarYear) => {
    expect(lunarToSolar(lunarYear, 1, 1, false)).toBe(dateKey);
  });
});

/* ------------------------------------------------------------------ */
/* 1b) 远期春节锚点（2036–2100）—— 用来把「非锚点年份」的覆盖缺口压到最小  */
/* ------------------------------------------------------------------ */

/**
 * 2036–2100 春节表。来源（两源在 2050–2075 区间完全一致，互为印证）：
 * - 429006.com/article/other/4515.htm （1800–2100 历年春节阳历日期）
 * - club.excelhome.net/thread-799794-1-439.html （2046–2100 春节表）
 * - wiki.owo.si 「正月初一」词条（2038–2056，含闰月标注）
 * 置信度：2036–2049 高；2050–2075 高（两源一致）；2076–2100 中（单一来源）。
 */
const FAR_CNY: readonly [string, number][] = [
  ['2036-01-28', 2036],
  ['2037-02-15', 2037],
  ['2038-02-04', 2038],
  ['2039-01-24', 2039],
  ['2040-02-12', 2040],
  ['2041-02-01', 2041],
  ['2042-01-22', 2042],
  ['2043-02-10', 2043],
  ['2044-01-30', 2044],
  ['2045-02-17', 2045],
  ['2046-02-06', 2046],
  ['2047-01-26', 2047],
  ['2048-02-14', 2048],
  ['2049-02-02', 2049],
  ['2050-01-23', 2050],
  ['2051-02-11', 2051],
  ['2052-02-01', 2052],
  ['2053-02-19', 2053],
  ['2054-02-08', 2054],
  ['2055-01-28', 2055],
  ['2056-02-15', 2056],
  ['2057-02-04', 2057],
  ['2058-01-24', 2058],
  ['2059-02-12', 2059],
  ['2060-02-02', 2060],
  ['2061-01-21', 2061],
  ['2062-02-09', 2062],
  ['2063-01-29', 2063],
  ['2064-02-17', 2064],
  ['2065-02-05', 2065],
  ['2066-01-26', 2066],
  ['2067-02-14', 2067],
  ['2068-02-03', 2068],
  ['2069-01-23', 2069],
  ['2070-02-11', 2070],
  ['2071-01-31', 2071],
  ['2072-02-19', 2072],
  ['2073-02-07', 2073],
  ['2074-01-27', 2074],
  ['2075-02-15', 2075],
  ['2076-02-05', 2076],
  ['2077-01-24', 2077],
  ['2078-02-12', 2078],
  ['2079-02-02', 2079],
  ['2080-01-22', 2080],
  ['2081-02-09', 2081],
  ['2082-01-29', 2082],
  ['2083-02-17', 2083],
  ['2084-02-06', 2084],
  ['2085-01-26', 2085],
  ['2086-02-14', 2086],
  ['2087-02-03', 2087],
  ['2088-01-24', 2088],
  ['2089-02-10', 2089],
  ['2090-01-30', 2090],
  ['2091-02-18', 2091],
  ['2092-02-07', 2092],
  ['2093-01-27', 2093],
  ['2094-02-15', 2094],
  ['2095-02-05', 2095],
  ['2096-01-25', 2096],
  ['2097-02-12', 2097],
  ['2098-02-01', 2098],
  ['2099-01-21', 2099],
  ['2100-02-09', 2100],
];

describe('春节（正月初一）远期外部锚点 2036–2100', () => {
  it.each(FAR_CNY)('%s 是农历 %i 年正月初一', (dateKey, lunarYear) => {
    expect(solarToLunar(dateKey)).toEqual({ year: lunarYear, month: 1, day: 1, isLeap: false });
  });

  it.each(FAR_CNY)('逆向：lunarToSolar(%i, 1, 1) == %s', (dateKey, lunarYear) => {
    expect(lunarToSolar(lunarYear, 1, 1, false)).toBe(dateKey);
  });

  it('远期春节表本身单调合理（相邻春节相差 353–385 天）', () => {
    for (let i = 1; i < FAR_CNY.length; i += 1) {
      const prev = FAR_CNY[i - 1]![0];
      const cur = FAR_CNY[i]![0];
      const diff =
        (Date.parse(`${cur}T00:00:00Z`) - Date.parse(`${prev}T00:00:00Z`)) / 86_400_000;
      expect(diff, `${prev} → ${cur}`).toBeGreaterThanOrEqual(353);
      expect(diff, `${prev} → ${cur}`).toBeLessThanOrEqual(385);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 1c) 闰月月份锚点 —— 让「闰月下标被改坏但年长不变」的损坏也能被抓到      */
/* ------------------------------------------------------------------ */

describe('闰月月份外部锚点（含远期）', () => {
  /**
   * 来源：wiki.owo.si「正月初一」词条逐年闰月标注 + 多源交叉（2020 闰四月 / 2025 闰六月 /
   * 2033 闰冬月 / 2017 闰六月 等已与其它来源核对一致）。置信度：中高。
   */
  const LEAP_MONTHS: readonly [number, number][] = [
    [1995, 8],
    [2004, 2],
    [2006, 7],
    [2009, 5],
    [2012, 4],
    [2014, 9],
    [2017, 6],
    [2020, 4],
    [2023, 2],
    [2025, 6],
    [2028, 5],
    [2031, 3],
    [2033, 11],
    [2036, 6],
    [2039, 5],
    [2042, 2],
    [2044, 7],
    [2047, 5],
    [2050, 3],
    [2052, 8],
    [2055, 6],
  ];

  it.each(LEAP_MONTHS)('%i 年闰 %i 月', (year, month) => {
    expect(leapMonthOf(year)).toBe(month);
  });
});

/* ------------------------------------------------------------------ */
/* 2) 非春节锚点：每月初一 / 闰月                                        */
/* ------------------------------------------------------------------ */

describe('2010 年（无闰月）：各月初一 == 外部万年历', () => {
  // [农历月, 公历初一]；来自 zhouyi.cc / tianqi.com 的 2010 年逐日农历表
  const MONTH_STARTS: readonly [number, string][] = [
    [1, '2010-02-14'],
    [2, '2010-03-16'],
    [3, '2010-04-14'],
    [4, '2010-05-14'],
    [5, '2010-06-12'],
    [6, '2010-07-12'],
    [7, '2010-08-10'],
    [8, '2010-09-08'],
    [9, '2010-10-08'],
    [10, '2010-11-06'],
    [11, '2010-12-06'],
  ];

  it('2010 年无闰月（leapMonthOf(2010) === 0）', () => {
    expect(leapMonthOf(2010)).toBe(0);
  });

  it.each(MONTH_STARTS)('2010 农历 %i 月初一 = %s', (month, dateKey) => {
    expect(lunarToSolar(2010, month, 1, false)).toBe(dateKey);
    expect(solarToLunar(dateKey)).toEqual({ year: 2010, month, day: 1, isLeap: false });
  });

  it('2010 年腊月初一 = 2011-01-04；与 2011 春节 2011-02-03 衔接', () => {
    // 冬月初一=2010-12-06 且冬月小(29) → 腊月初一=2011-01-04；腊月大(30) → 2011-02-03 为正月初一
    expect(lunarToSolar(2010, 12, 1, false)).toBe('2011-01-04');
    expect(solarToLunar('2011-02-03')).toEqual({ year: 2011, month: 1, day: 1, isLeap: false });
  });

  it('2010 各月大小月（外部标注）：大/小序列必须吻合', () => {
    // 外部表逐日标注：正月大 二月小 三月大 四月小 五月大 六月小 七月小 八月大 九月小 十月大 冬月小 腊月大
    const expected = [30, 29, 30, 29, 30, 29, 29, 30, 29, 30, 29, 30];
    for (let m = 1; m <= 12; m += 1) {
      expect(lunarMonthDays(2010, m, false), `2010-${m} 月大小不符`).toBe(expected[m - 1]);
    }
    // 这也是「两个月长不必然交替」的实证：六月小(29) 紧接 七月小(29)
    expect(lunarMonthDays(2010, 6, false)).toBe(29);
    expect(lunarMonthDays(2010, 7, false)).toBe(29);
  });
});

describe('2025 年（闰六月）：初一 + 闰月 + 大小月 == 外部', () => {
  const STARTS: readonly [number, boolean, string][] = [
    [1, false, '2025-01-29'],
    [2, false, '2025-02-28'],
    [3, false, '2025-03-29'],
    [4, false, '2025-04-28'],
    [5, false, '2025-05-27'],
    [6, false, '2025-06-25'],
    [6, true, '2025-07-25'], // 闰六月初一
    [7, false, '2025-08-23'],
    [8, false, '2025-09-22'],
    [9, false, '2025-10-21'],
    [10, false, '2025-11-20'],
    [11, false, '2025-12-20'],
  ];

  it('2025 闰六月（leapMonthOf(2025) === 6）', () => {
    expect(leapMonthOf(2025)).toBe(6);
  });

  it.each(STARTS)('2025 农历 %i 月%s 初一 = %s', (month, isLeap, dateKey) => {
    expect(lunarToSolar(2025, month, 1, isLeap)).toBe(dateKey);
  });

  it('2025 各月大小月（紫金山天文台）：大月7个 / 小月6个（含闰六月），全年 384 天', () => {
    const expected: readonly [number, boolean, number][] = [
      [1, false, 30], [2, false, 29], [3, false, 30], [4, false, 29], [5, false, 29],
      [6, false, 30], [6, true, 29], [7, false, 30], [8, false, 29], [9, false, 30],
      [10, false, 30], [11, false, 30], [12, false, 29],
    ];
    let total = 0;
    for (const [m, leap, len] of expected) {
      expect(lunarMonthDays(2025, m, leap), `2025-${m}${leap ? '(闰)' : ''} 天数不符`).toBe(len);
      total += len;
    }
    expect(total).toBe(384); // 外部来源：2025 农历共 384 天
  });

  it('2025 腊月小（29）→ 2026-02-17 为 2026 正月初一', () => {
    expect(lunarMonthDays(2025, 12, false)).toBe(29);
    expect(solarToLunar('2026-02-17')).toEqual({ year: 2026, month: 1, day: 1, isLeap: false });
  });
});

describe('1995 年闰八月 == 外部万年历', () => {
  it('1995-09-24 = 八月三十（八月大月）；1995-09-25 = 闰八月初一（闰八月小月）', () => {
    expect(solarToLunar('1995-09-24')).toEqual({ year: 1995, month: 8, day: 30, isLeap: false });
    expect(solarToLunar('1995-09-25')).toEqual({ year: 1995, month: 8, day: 1, isLeap: true });
    expect(lunarToSolar(1995, 8, 1, true)).toBe('1995-09-25');
  });

  it('1995 闰八月为小月（29 天）：九月初一 = 1995-10-24', () => {
    expect(lunarMonthDays(1995, 8, true)).toBe(29);
    expect(lunarToSolar(1995, 9, 1, false)).toBe('1995-10-24');
  });

  it('1995 农历年共 384 天（外部：起止 1995-01-31 → 1996-02-18）', () => {
    const start = lunarToSolar(1995, 1, 1, false);
    const next = lunarToSolar(1996, 1, 1, false);
    expect(start).toBe('1995-01-31');
    expect(next).toBe('1996-02-19');
    const days =
      (Date.parse(`${next!}T00:00:00Z`) - Date.parse(`${start!}T00:00:00Z`)) / 86_400_000;
    expect(days).toBe(384);
  });
});

/* ------------------------------------------------------------------ */
/* 3) 除夕：大月(30) / 小月(29) 两种都要外部锚点                        */
/* ------------------------------------------------------------------ */

describe('除夕 = 腊月最后一天（外部锚点，覆盖大月 30 / 小月 29）', () => {
  it('2010 除夕 = 2010-02-13（腊月三十，大月）；次日 2010-02-14 春节', () => {
    expect(solarToLunar('2010-02-13')).toEqual({ year: 2009, month: 12, day: 30, isLeap: false });
    expect(getFestivals('2010-02-13').map((f) => f.name)).toContain('除夕');
    expect(getFestivals('2010-02-14').map((f) => f.name)).toContain('春节');
    expect(getFestivals('2010-02-14').map((f) => f.name)).not.toContain('除夕');
  });

  it('2025 除夕 = 2025-01-28（腊月廿九，小月）；次日 2025-01-29 春节', () => {
    expect(solarToLunar('2025-01-28')).toEqual({ year: 2024, month: 12, day: 29, isLeap: false });
    expect(getFestivals('2025-01-28').map((f) => f.name)).toContain('除夕');
    expect(getFestivals('2025-01-29').map((f) => f.name)).not.toContain('除夕');
  });

  it('2026 除夕 = 2026-02-16（腊月廿九）；2026-02-17 春节', () => {
    // 2025 腊月小(29) → 除夕即 2026-02-16
    expect(getFestivals('2026-02-16').map((f) => f.name)).toContain('除夕');
    expect(getFestivals('2026-02-17').map((f) => f.name)).toContain('春节');
  });

  it('腊八节 / 小年 外部锚点：2010-01-22 腊八、2010-02-06 小年', () => {
    expect(getFestivals('2010-01-22').map((f) => f.name)).toContain('腊八节');
    expect(getFestivals('2010-02-06').map((f) => f.name)).toContain('小年');
  });
});

/* ------------------------------------------------------------------ */
/* 4) 清明去重 + getFestivalLine 2 名上限 + 优先级 + ≥3 扫描            */
/* ------------------------------------------------------------------ */

describe('清明去重 & 节日行契约', () => {
  it('清明只出现一次（kind=term），且在任何年份都不与其它类别重复', () => {
    for (const key of ['2000-04-04', '2010-04-05', '2025-04-04', '1995-04-05']) {
      const names = getFestivals(key).map((f) => f.name);
      expect(names.filter((n) => n === '清明'), `${key} 清明重复`).toHaveLength(1);
      expect(new Set(names).size, `${key} 有重名`).toBe(names.length);
    }
  });

  it('优先级：农历 > 公历（2020-10-01 中秋+国庆 → 中秋节 · 国庆节）', () => {
    expect(getFestivalLine('2020-10-01')).toBe('中秋节 · 国庆节');
  });

  it('优先级：农历 > 公历（2022-09-10 中秋+教师节）', () => {
    expect(getFestivalLine('2022-09-10')).toBe('中秋节 · 教师节');
  });

  it('getFestivalLine 至多 2 段：扫描 1900-01-31…2100-12-31 全区间', () => {
    // 独立扫描全区间，确证「任何一天的 line 都不会超过 2 段（1 个 · 分隔）」
    let key = '1900-01-31';
    const end = '2100-12-31';
    let checked = 0;
    while (key <= end) {
      const line = getFestivalLine(key);
      if (line) {
        const parts = line.split(' · ');
        expect(parts.length, `${key} 超过 2 个节日: ${line}`).toBeLessThanOrEqual(2);
      }
      checked += 1;
      key = shiftDateKey(key, 1);
    }
    expect(checked).toBeGreaterThan(73_000);
  });

  it('独立扫描：确认 1900–2100 是否存在「≥3 个内置节日」的日子（工程师称不存在）', () => {
    let key = '1900-01-31';
    const end = '2100-12-31';
    let maxCount = 0;
    let maxKey = '';
    const maxNames: string[] = [];
    while (key <= end) {
      const names = getFestivals(key).map((f) => f.name);
      if (names.length > maxCount) {
        maxCount = names.length;
        maxKey = key;
        maxNames.length = 0;
        maxNames.push(...names);
      }
      key = shiftDateKey(key, 1);
    }
    // 断言「不存在 ≥3 节日的日子」。若这里失败，说明工程师的判断被推翻，
    // 附上反例（maxKey / maxNames）——不要改断言去迁就实现。
    expect(maxCount, `发现 ≥3 节日：${maxKey} → ${maxNames.join('、')}`).toBeLessThanOrEqual(2);
    // 同时证明「2 名」这一档确实被真实数据触发过（上限不是摆设）
    expect(maxCount).toBe(2);
    // eslint-disable-next-line no-console
    console.log(`[scan] 1900–2100 单日最多内置节日数 = ${maxCount}，样例 ${maxKey} → ${maxNames.join(' · ')}`);
  });
});

/* ------------------------------------------------------------------ */
/* 5) 闰月结构：外部点名年份                                            */
/* ------------------------------------------------------------------ */

describe('闰月年份结构对齐外部事实', () => {
  it('2025 闰六月 / 2033 闰十一月 / 1995 闰八月 / 2012 闰四月', () => {
    expect(leapMonthOf(2025)).toBe(6);
    expect(leapMonthOf(2033)).toBe(11);
    expect(leapMonthOf(1995)).toBe(8);
    expect(leapMonthOf(2012)).toBe(4);
  });

  it('无闰月年份：2010 / 2024 / 2026 均为 0', () => {
    expect(leapMonthOf(2010)).toBe(0);
    expect(leapMonthOf(2024)).toBe(0);
    expect(leapMonthOf(2026)).toBe(0);
  });
});
