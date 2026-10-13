import { describe, expect, it } from 'vitest';
import { SOLAR_TERMS, solarTermDayOfMonth, solarTermOf } from '@/services/solarTermService';
import { shiftDateKey } from '@/utils/date';

/**
 * 二十四节气「外部事实」锚点测试（1980 / 1995 / 2000 / 2010 / 2025 等年代）。
 *
 * ⚠️ 反循环：结构与具体日期都取自外部万年历／天文台，硬编码字面量，
 * 不是跑一遍实现再粘回来。若实现与锚点冲突 → **报告冲突**，不改锚点。
 *
 * 锚点来源：
 * - 1980 全年：香港天文台 HKO 公历农历对照表（hko.gov.hk/tc/gts/time/calendar/pdf/files/1980.pdf）
 *   + yinliyangli.com/huangli/1980/4327-19800404.html
 * - 1995 部分：huangli123.net/huangli/1995-9-25.html
 * - 2000 全年：jieqi.911cha.com/2000.html、huangli123.net/jieqibiao/2000.html（紫金山天文台）
 * - 2010 全年：日本国立天文台 NAO（eco.mtk.nao.ac.jp/koyomi/yoko/2010/rekiyou102.html）、
 *   jieqi.txcx.com/jieqi-2010.html、riliku.com/nongli/2010/5053-20100707.html、
 *   zhouyi.cc/huangli/nongli/15520.html、wannianli.tianqi.com/rilibiao/2010.html
 * - 2025 全年：huangli123.net/nianli/2025.html（紫金山天文台）
 *
 * 顺序：小寒…冬至（下标 0..23）。
 */

function termDaysOfYear(year: number): { dateKey: string; name: string }[] {
  const found: { dateKey: string; name: string }[] = [];
  let key = `${year}-01-01`;
  const end = `${year}-12-31`;
  while (key <= end) {
    const name = solarTermOf(key);
    if (name) found.push({ dateKey: key, name });
    key = shiftDateKey(key, 1);
  }
  return found;
}

describe('结构不变量：1900–2100 每年恰好 24 个节气日（全 201 年）', () => {
  it('每年 24 个、名字序列 == SOLAR_TERMS、严格递增、月份 == floor(n/2)+1', () => {
    for (let year = 1900; year <= 2100; year += 1) {
      const days = termDaysOfYear(year);
      expect(days, `${year} 年节气数不为 24`).toHaveLength(24);
      expect(days.map((d) => d.name), `${year} 年节气名字序列错`).toEqual([...SOLAR_TERMS]);
      for (let i = 1; i < days.length; i += 1) {
        expect(days[i]!.dateKey > days[i - 1]!.dateKey, `${year} 节气未严格递增`).toBe(true);
      }
      days.forEach((d, index) => {
        const month = Number(d.dateKey.slice(5, 7));
        expect(month, `${year} 年第 ${index} 个节气 ${d.name} 落到 ${month} 月`).toBe(
          Math.floor(index / 2) + 1,
        );
      });
    }
  });
});

describe('精确锚点：与外部万年历逐日吻合的年份（必须通过）', () => {
  /** [年, 24 个「日号」按小寒…冬至顺序] */
  const MATCHING_YEARS: readonly [number, readonly number[]][] = [
    [
      2000,
      [6, 21, 4, 19, 5, 20, 4, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21],
    ],
    [
      2025,
      [5, 20, 3, 18, 5, 20, 4, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21],
    ],
  ];

  it.each(MATCHING_YEARS)('%i 年 24 个节气日号逐一吻合外部表', (year, expectedDays) => {
    const actualDays = Array.from({ length: 24 }, (_, i) => solarTermDayOfMonth(year, i));
    const mismatches: string[] = [];
    expectedDays.forEach((expected, i) => {
      if (actualDays[i] !== expected) {
        mismatches.push(`${SOLAR_TERMS[i]}: 期望 ${expected} 日, 实现 ${actualDays[i]} 日`);
      }
    });
    expect(mismatches, `${year} 年节气日号与外部表冲突：\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('1995 年部分节气（外部）：立春/雨水/惊蛰/春分/清明/谷雨/秋分/寒露', () => {
    const anchors: readonly [string, string][] = [
      ['立春', '1995-02-04'],
      ['雨水', '1995-02-19'],
      ['惊蛰', '1995-03-06'],
      ['春分', '1995-03-21'],
      ['清明', '1995-04-05'],
      ['谷雨', '1995-04-20'],
      ['秋分', '1995-09-23'],
      ['寒露', '1995-10-09'],
    ];
    const conflicts: string[] = [];
    for (const [name, dateKey] of anchors) {
      if (solarTermOf(dateKey) !== name) {
        conflicts.push(`${dateKey} 期望 ${name}，实现返回 ${solarTermOf(dateKey)}`);
      }
    }
    expect(conflicts, `1995 节气冲突：\n${conflicts.join('\n')}`).toEqual([]);
  });

  it('回归：既有 2024–2026 锚点仍成立（清明/立春/冬至/夏至/秋分）', () => {
    const anchors: readonly [string, string][] = [
      ['2024-04-04', '清明'],
      ['2025-04-04', '清明'],
      ['2024-02-04', '立春'],
      ['2025-02-03', '立春'],
      ['2024-12-21', '冬至'],
      ['2025-12-21', '冬至'],
      ['2025-06-21', '夏至'],
      ['2025-09-23', '秋分'],
      ['2000-12-21', '冬至'],
    ];
    for (const [dateKey, name] of anchors) {
      expect(solarTermOf(dateKey), `${dateKey} 应为 ${name}`).toBe(name);
    }
  });

  it('非节气日返回 null（抽样，含闰日附近）', () => {
    for (const key of ['2025-03-15', '2024-02-29', '2000-02-29', '2010-01-15']) {
      expect(solarTermOf(key), `${key} 不应是节气`).toBeNull();
    }
  });
});

describe('已修复缺陷回归：1980 / 2010 与外部万年历逐日吻合（**硬断言**，不再是 it.fails）', () => {
  /**
   * 2026-10 修复记录（原为 `it.fails` 记录的「已知缺陷」，现已修复 → 转为硬断言）：
   *
   * 旧实现 `solarTermDayOfMonth` 取「1900 基准 + 平均回归年(31556925974.7ms) 紧凑表」
   * 对应的 **`getUTCDate()`（UTC 日号）**，既丢北京时区（UTC+8）、又累积回归年漂移，
   * 于是 1980 / 2010 的个别节气差 ±1 天。
   *
   * 修复前的外部分歧（HKO / 日本国立天文台 NAO）：
   * - 1980 立春 外部 02-05 / 旧 02-04；1980 冬至 外部 12-22 / 旧 12-21
   * - 2010 惊蛰 外部 03-06 / 旧 03-05；2010 立秋 外部 08-07 / 旧 08-08
   *
   * 现改为「太阳视黄经（Meeus ch.25 低精度）实时求解交节瞬间 + 北京时间纯整数定日」，
   * 下列 24 项全年日号与外部表逐一吻合。
   *
   * ⚠️ 反循环：期望值仍是外部万年历的硬编码事实，**不是**跑实现粘回来的。
   * 若断言变红，是实现回退，不要改锚点。
   */
  const DEVIATION_YEARS: readonly [number, readonly number[]][] = [
    [1980, [6, 21, 5, 19, 5, 20, 4, 20, 5, 21, 5, 21, 7, 23, 7, 23, 7, 23, 8, 23, 7, 22, 7, 22]],
    [2010, [5, 20, 4, 19, 6, 21, 5, 20, 5, 21, 6, 21, 7, 23, 7, 23, 8, 23, 8, 23, 7, 22, 7, 22]],
  ];

  it('1980 与 2010 的 24 节气日号与外部万年历逐一吻合', () => {
    const allMismatches: string[] = [];
    for (const [year, expectedDays] of DEVIATION_YEARS) {
      const actual = Array.from({ length: 24 }, (_, i) => solarTermDayOfMonth(year, i));
      expectedDays.forEach((expected, i) => {
        if (actual[i] !== expected) {
          allMismatches.push(`${year} ${SOLAR_TERMS[i]}: 外部 ${expected} 日 vs 实现 ${actual[i]} 日`);
        }
      });
    }
    expect(allMismatches, `1980 / 2010 节气日号与外部表冲突：\n${allMismatches.join('\n')}`).toEqual(
      [],
    );
  });

  it('四个反例锚点：外部真值命中，旧的错误日返回 null', () => {
    // 独立外部事实（HKO / NAO），逐一硬编码。
    const facts: readonly [string, string][] = [
      ['1980-02-05', '立春'],
      ['1980-12-22', '冬至'],
      ['2010-03-06', '惊蛰'],
      ['2010-08-07', '立秋'],
    ];
    for (const [dateKey, name] of facts) {
      expect(solarTermOf(dateKey), `${dateKey} 应为 ${name}`).toBe(name);
    }
    // 旧实现误判的日期，修复后必须不再是节气。
    for (const stale of ['1980-02-04', '1980-12-21', '2010-03-05', '2010-08-08']) {
      expect(solarTermOf(stale), `${stale} 旧实现误判为节气，现应为 null`).toBeNull();
    }
  });
});
