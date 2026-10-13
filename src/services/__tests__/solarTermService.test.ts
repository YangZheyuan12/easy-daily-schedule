import { describe, expect, it } from 'vitest';
import { SOLAR_TERMS, solarTermDayOfMonth, solarTermOf } from '@/services/solarTermService';
import { shiftDateKey, toDateKey } from '@/utils/date';

/**
 * 二十四节气测试。
 *
 * ⚠️ 反循环：结构与「每年恰好 24 个、严格递增、落在正确月份」是**算法无关的结构性质**；
 * 少数具体日期用的是外部已知事实（清明 / 立春 / 冬至 / 夏至）作为硬编码锚点。
 */

const YEARS = [2024, 2025, 2026] as const;

/** 从 1 月 1 日扫到 12 月 31 日，收集全部节气日 */
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

describe('SOLAR_TERMS — 常量表', () => {
  it('恰好 24 个，从「小寒」起，含「清明」且下标为 6（清明 = 4 月）', () => {
    expect(SOLAR_TERMS).toHaveLength(24);
    expect(SOLAR_TERMS[0]).toBe('小寒');
    expect(SOLAR_TERMS[23]).toBe('冬至');
    expect(SOLAR_TERMS[6]).toBe('清明');
    expect(SOLAR_TERMS.filter((name) => name === '清明')).toHaveLength(1);
  });
});

describe('每年恰好 24 个节气日，严格递增，落在正确月份', () => {
  it.each(YEARS)('%i 年', (year) => {
    const days = termDaysOfYear(year);
    expect(days).toHaveLength(24);

    // 名字序列应当与 SOLAR_TERMS 完全一致（从 1 月的小寒开始）
    expect(days.map((d) => d.name)).toEqual([...SOLAR_TERMS]);

    // 严格递增（同一年内节气日单调递增）
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i]!.dateKey > days[i - 1]!.dateKey).toBe(true);
    }

    // 第 n 个节气的公历月必须是 floor(n / 2) + 1
    days.forEach((d, index) => {
      const month = Number(d.dateKey.slice(5, 7));
      expect(month, `${d.dateKey} ${d.name} 月份不对`).toBe(Math.floor(index / 2) + 1);
    });

    // 每个节气日都应落在当月合理区间（1–31，且不与相邻节气撞车）
    for (const d of days) {
      const day = Number(d.dateKey.slice(8, 10));
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
    }
  });
});

describe('节气日具体锚点（外部已知事实）', () => {
  const ANCHORS: readonly [string, string][] = [
    ['2024-04-04', '清明'],
    ['2025-04-04', '清明'],
    ['2024-02-04', '立春'],
    ['2025-02-03', '立春'],
    ['2024-12-21', '冬至'],
    ['2025-12-21', '冬至'],
    ['2025-06-21', '夏至'],
  ];

  it.each(ANCHORS)('%s 是 %s', (dateKey, term) => {
    expect(solarTermOf(dateKey)).toBe(term);
  });
});

describe('solarTermOf — 非节气日 / 越界 / 非法输入', () => {
  it('普通日子返回 null', () => {
    expect(solarTermOf('2025-03-15')).toBeNull();
    expect(solarTermOf('2025-10-06')).toBeNull();
  });

  it('越界年份返回 null', () => {
    expect(solarTermOf('1899-04-05')).toBeNull();
    expect(solarTermOf('2101-04-05')).toBeNull();
  });

  it('非法日期键返回 null', () => {
    expect(solarTermOf('2025-13-01')).toBeNull();
    expect(solarTermOf('abc')).toBeNull();
    expect(solarTermOf('2025-02-30')).toBeNull();
  });
});

describe('solarTermDayOfMonth — 与按日扫描自洽', () => {
  it('每个节气日的日号 == solarTermDayOfMonth(年, 序号)', () => {
    const days = termDaysOfYear(2025);
    days.forEach((d, index) => {
      expect(Number(d.dateKey.slice(8, 10))).toBe(solarTermDayOfMonth(2025, index));
    });
  });

  it('toDateKey 回环自检（本地时区工具可用）', () => {
    expect(toDateKey(new Date(2025, 3, 4))).toBe('2025-04-04');
  });
});
