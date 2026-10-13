import { describe, expect, it } from 'vitest';
import {
  clampDayToMonth,
  formatTimeRange,
  hhmmToMin,
  isFutureDate,
  isValidDateKey,
  minToHHMM,
  monthsInYear,
  monthGrid,
  monthLabel,
  parseDateKey,
  shiftDateKey,
  shiftMonthKey,
  shiftYearKey,
  toMonthKey,
  toYearKey,
  yearRange,
} from '@/utils/date';

/**
 * 月历边界验证。
 *
 * 这里刻意用「暴力遍历」而不是挑几个肉眼算过的月份：42 格网格的正确性
 * 取决于「首格回退天数 + 当月天数 + 补位天数」三者的组合，闰月与月初落在
 * 周日这两种极端情况最容易算漏一整行。
 */

/** 用 UTC 天数做差值比较，避开夏令时导致的本地午夜来回跳 */
function utcDays(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** UTC 星期的中文下标：0=周日 */
function utcWeekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** 覆盖闰年 / 平年 2 月、跨年、月初落在周日这些极端组合 */
const MONTHS = [
  '2026-02', // 平年 2 月，且 2/1 是周日（补位最多）
  '2028-02', // 闰年 2 月
  '2024-02', // 闰年 2 月，2/1 周四
  '2026-01',
  '2026-04', // 30 天月
  '2026-10',
  '2025-12', // 往前跨年
  '2026-12', // 往后跨年
  '2027-01',
  '2026-11', // 30 天月，11/1 是周日
] as const;

describe('monthGrid — 恒定的形状', () => {
  it.each(MONTHS)('%s 固定 42 格且不重不漏', (monthKey) => {
    const grid = monthGrid(monthKey);

    expect(grid).toHaveLength(42);
    // 日期唯一：补位格只要算错一天，就会和真格子撞同一个 key
    expect(new Set(grid.map((cell) => cell.dateKey)).size).toBe(42);
    // 严格连续：中间跳一天就意味着 weekday → offset 换算错了一格
    for (let i = 1; i < grid.length; i += 1) {
      expect(utcDays(grid[i]!.dateKey) - utcDays(grid[i - 1]!.dateKey)).toBe(1);
    }
  });

  it.each(MONTHS)('%s 首列是周一，每列位置与真实星期一致', (monthKey) => {
    const grid = monthGrid(monthKey);

    expect(utcWeekday(grid[0]!.dateKey)).toBe(1); // 周一
    grid.forEach((cell, index) => {
      // 第 i 列 → 周一..周日 依次为 i%7；换算回 JS 的星期（周日=0）
      expect(utcWeekday(cell.dateKey)).toBe(((index % 7) + 1) % 7);
    });
  });

  it.each(MONTHS)('%s inMonth 只对本月日期为真，且本月日期一个不少', (monthKey) => {
    const grid = monthGrid(monthKey);
    const inMonth = grid.filter((cell) => cell.inMonth);

    // 每个本月格子的 key 都必须落在本月，且 day 字段等于 key 里的「几号」
    for (const cell of inMonth) {
      expect(toMonthKey(cell.dateKey)).toBe(monthKey);
      expect(cell.day).toBe(Number(cell.dateKey.slice(8, 10)));
      expect(isValidDateKey(cell.dateKey)).toBe(true);
    }
    // 反方向：本月之外的格子一律 false
    for (const cell of grid.filter((c) => !c.inMonth)) {
      expect(toMonthKey(cell.dateKey)).not.toBe(monthKey);
    }
    // 本月 1 号一定在网格里，最后一天也一定在
    expect(inMonth.map((c) => c.dateKey)).toContain(`${monthKey}-01`);
    const [year, month] = monthKey.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
    expect(inMonth.map((c) => c.dateKey)).toContain(`${monthKey}-${String(daysInMonth).padStart(2, '0')}`);
    expect(inMonth).toHaveLength(daysInMonth);
  });
});

describe('monthGrid — 具体月份的手工锚点', () => {
  it('2026-02：平年 2 月 28 天，且 2/1 是周日 → 首格回退到 2026-01-26', () => {
    const grid = monthGrid('2026-02');

    expect(grid[0]?.dateKey).toBe('2026-01-26');
    expect(grid[0]?.inMonth).toBe(false);
    expect(grid[6]?.dateKey).toBe('2026-02-01');
    expect(grid[6]?.inMonth).toBe(true);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(28);
    // 28 天 → 2/28 落在第 34 格（index 33），之后全是 3 月补位
    expect(grid[33]?.dateKey).toBe('2026-02-28');
    expect(grid[34]?.dateKey).toBe('2026-03-01');
    expect(grid[34]?.inMonth).toBe(false);
    expect(grid[41]?.dateKey).toBe('2026-03-08');
  });

  it('2028-02：闰年 2 月 29 天，末格是 2028-03-12', () => {
    const grid = monthGrid('2028-02');
    // 2028-02-01 是周二 → 首格回退到 2028-01-31，2/1 落在 index 1
    expect(grid[0]?.dateKey).toBe('2028-01-31');
    expect(grid[1]?.dateKey).toBe('2028-02-01');
    expect(grid.filter((c) => c.inMonth)).toHaveLength(29);
    expect(grid[29]?.dateKey).toBe('2028-02-29');
    expect(grid[29]?.inMonth).toBe(true);
    expect(grid[30]?.dateKey).toBe('2028-03-01');
    expect(grid[30]?.inMonth).toBe(false);
    expect(grid[41]?.dateKey).toBe('2028-03-12');
  });

  it('跨年：2025-12 首格就是当月 1 号（12/1 恰为周一）', () => {
    const grid = monthGrid('2025-12');
    expect(grid[0]?.dateKey).toBe('2025-12-01');
    expect(grid[0]?.inMonth).toBe(true);
    expect(grid[41]?.dateKey).toBe('2026-01-11');
    expect(grid[41]?.inMonth).toBe(false);
    // 往前推一个月，应该无缝接上 2026-01（12 月末的补位就是 1 月头）
    expect(shiftMonthKey('2025-12', 1)).toBe('2026-01');
    expect(monthGrid('2026-01')[0]?.dateKey).toBe('2025-12-29');
  });

  it('跨年：2026-12 → 2027-01，往前 push 12 个月回到原点', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2027-01', -1)).toBe('2026-12');
    expect(shiftMonthKey('2026-01', 12)).toBe('2027-01');
    expect(shiftMonthKey('2026-01', -12)).toBe('2025-01');
    expect(monthGrid('2027-01')[0]?.dateKey).toBe('2026-12-28');
  });
});

describe('monthGrid 与日期工具的互操作', () => {
  it('shiftDateKey 逐格推进的结果与 monthGrid 完全一致（同一套规则在跑）', () => {
    const grid = monthGrid('2026-02');
    let cursor = grid[0]!.dateKey;
    for (let i = 1; i < grid.length; i += 1) {
      cursor = shiftDateKey(cursor, 1);
      expect(cursor).toBe(grid[i]!.dateKey);
    }
  });

  it('parseDateKey 取回的 Date 与格子 key 双向一致', () => {
    for (const monthKey of MONTHS) {
      for (const cell of monthGrid(monthKey)) {
        const date = parseDateKey(cell.dateKey);
        expect(date.getDate()).toBe(cell.day);
      }
    }
  });

  it('monthLabel 保留前导零语义（2026-01 → 2026年1月）', () => {
    expect(monthLabel('2026-01')).toBe('2026年1月');
    expect(monthLabel('2025-12')).toBe('2025年12月');
  });
});

describe('clampDayToMonth — 切月时「保留几号」的落点', () => {
  it('31 号切到平年 2 月 → 退到 28 号', () => {
    expect(clampDayToMonth('2026-01-31', '2026-02')).toBe('2026-02-28');
  });

  it('31 号切到闰年 2 月 → 保住 29 号', () => {
    expect(clampDayToMonth('2028-01-31', '2028-02')).toBe('2028-02-29');
  });

  it('31 号切到 30 天月 → 退到 30 号', () => {
    expect(clampDayToMonth('2026-03-31', '2026-04')).toBe('2026-04-30');
    expect(clampDayToMonth('2026-05-31', '2026-06')).toBe('2026-06-30');
  });

  it('跨年切月：12 月 31 号 → 次年 1 月 31 号；反向也成立', () => {
    expect(clampDayToMonth('2025-12-31', '2026-01')).toBe('2026-01-31');
    expect(clampDayToMonth('2026-01-31', '2025-12')).toBe('2025-12-31');
  });

  it('目标月有那一天就原样保留（不动用户的手选）', () => {
    expect(clampDayToMonth('2026-01-15', '2026-02')).toBe('2026-02-15');
    expect(clampDayToMonth('2026-01-01', '2026-02')).toBe('2026-02-01');
  });

  it('结果永远落在 monthGrid 的本月格子内（保证摘要一定取得到）', () => {
    for (const monthKey of MONTHS) {
      const inMonthKeys = new Set(
        monthGrid(monthKey)
          .filter((cell) => cell.inMonth)
          .map((cell) => cell.dateKey),
      );
      for (const day of [1, 15, 28, 29, 30, 31]) {
        const from = `${monthKey}-${String(day).padStart(2, '0')}`;
        expect(inMonthKeys.has(clampDayToMonth(from, monthKey))).toBe(true);
      }
    }
  });
});

describe('isFutureDate', () => {
  it('今天不算未来，昨天不算未来，明天算未来', () => {
    const now = new Date(2026, 9, 10, 12, 0, 0); // 2026-10-10 中午
    expect(isFutureDate('2026-10-10', now)).toBe(false);
    expect(isFutureDate('2026-10-09', now)).toBe(false);
    expect(isFutureDate('2026-10-11', now)).toBe(true);
  });

  it('跨月 / 跨年比较同样成立（字典序即时间序）', () => {
    const now = new Date(2026, 9, 10, 12, 0, 0);
    expect(isFutureDate('2026-10-31', now)).toBe(true);
    expect(isFutureDate('2026-11-01', now)).toBe(true);
    expect(isFutureDate('2027-01-01', now)).toBe(true);
    expect(isFutureDate('2025-12-31', now)).toBe(false);
  });

  it('当天 23:59 也不会把「今天」算成明天（本地时区口径）', () => {
    const lateNight = new Date(2026, 9, 10, 23, 59, 59);
    expect(isFutureDate('2026-10-10', lateNight)).toBe(false);
    expect(isFutureDate('2026-10-11', lateNight)).toBe(true);
  });
});

describe('isValidDateKey — 日期键校验（URL ?date= bootstrap 用）', () => {
  it('合法日期键通过', () => {
    expect(isValidDateKey('2026-10-05')).toBe(true);
    expect(isValidDateKey('2026-01-01')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true); // 闰年 2/29 合法
  });

  it('非法值被拒：越界月/日、非数字、空串、非定长', () => {
    // 月 13、日 45 都会被 Date 归一化成别的日期 → round-trip 不相等
    expect(isValidDateKey('2026-13-45')).toBe(false);
    expect(isValidDateKey('abc')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
    expect(isValidDateKey('2026-1-5')).toBe(false); // 非定长（缺前导零）
    expect(isValidDateKey('2026/10/05')).toBe(false); // 分隔符错误
    expect(isValidDateKey('2026-02-30')).toBe(false); // 平年没有 2/30
  });
});

describe('年历工具', () => {
  it('toYearKey 取前四位', () => {
    expect(toYearKey('2026-10-15')).toBe('2026');
    expect(toYearKey('2026-01-01')).toBe('2026');
  });

  it('shiftYearKey 加减年数，支持跨年与负值', () => {
    expect(shiftYearKey('2026', 1)).toBe('2027');
    expect(shiftYearKey('2026', -1)).toBe('2025');
    expect(shiftYearKey('2026', 0)).toBe('2026');
    expect(shiftYearKey('1999', 2)).toBe('2001');
  });

  it('monthsInYear 返回 12 个连续月键，1 月 → 12 月', () => {
    const months = monthsInYear('2026');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2026-01');
    expect(months[11]).toBe('2026-12');
    expect(new Set(months).size).toBe(12);
  });

  it('yearRange 覆盖全年闭区间（1/1 → 12/31），闰年也正确', () => {
    expect(yearRange('2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(yearRange('2024')).toEqual({ start: '2024-01-01', end: '2024-12-31' });
  });
});

describe('时间轴：分钟 ↔ HH:MM', () => {
  it('minToHHMM 补零，0 与 1439 边界正确', () => {
    expect(minToHHMM(0)).toBe('00:00');
    expect(minToHHMM(9 * 60)).toBe('09:00');
    expect(minToHHMM(13 * 60 + 5)).toBe('13:05');
    expect(minToHHMM(1439)).toBe('23:59');
  });

  it('minToHHMM 越界被夹回边界', () => {
    expect(minToHHMM(-10)).toBe('00:00');
    expect(minToHHMM(1500)).toBe('23:59');
  });

  it('hhmmToMin 正确解析，非法输入回退为 0', () => {
    expect(hhmmToMin('09:00')).toBe(540);
    expect(hhmmToMin('13:05')).toBe(785);
    expect(hhmmToMin('23:59')).toBe(1439);
    expect(hhmmToMin('')).toBe(0);
    expect(hhmmToMin('99:99')).toBe(0);
    expect(hhmmToMin('ab:cd')).toBe(0);
  });

  it('minToHHMM 与 hhmmToMin 互为逆（round-trip）', () => {
    for (const min of [0, 1, 60, 540, 785, 1439]) {
      expect(hhmmToMin(minToHHMM(min))).toBe(min);
    }
  });

  it('formatTimeRange：endMin 为 0 时只显示起点，否则显示区间', () => {
    expect(formatTimeRange(540, 0)).toBe('09:00');
    expect(formatTimeRange(540, 600)).toBe('09:00–10:00');
    expect(formatTimeRange(0, 0)).toBe('00:00');
  });
});
