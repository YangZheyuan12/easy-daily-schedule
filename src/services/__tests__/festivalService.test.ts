import { describe, expect, it } from 'vitest';
import { getFestivalLine, getFestivals } from '@/services/festivalService';
import { solarToLunar, lunarToSolar } from '@/services/lunar/lunarService';
import { shiftDateKey } from '@/utils/date';

/**
 * 内置节日测试。
 *
 * ⚠️ 反循环：春节 / 中秋 / 国庆 / 元旦 / 母亲节等锚点均为**外部已知的固定日期**，
 * 硬编码于此；除夕则用「春节前一日」这个定义 + 逐农历年结构扫描来验证
 * 「大月 30 / 小月 29 都覆盖」，而不是把实现输出粘回来。
 */

function names(dateKey: string): string[] {
  return getFestivals(dateKey).map((f) => f.name);
}

describe('农历传统节日', () => {
  it('2025-01-29 = 春节（kind=lunar, major=true）', () => {
    const list = getFestivals('2025-01-29');
    expect(list.map((f) => f.name)).toContain('春节');
    expect(list.find((f) => f.name === '春节')).toMatchObject({ kind: 'lunar', major: true });
  });

  it('2025-10-06 = 中秋节', () => {
    expect(names('2025-10-06')).toContain('中秋节');
  });

  it('2025-05-31 = 端午节；2026-06-19 = 端午节', () => {
    expect(names('2025-05-31')).toContain('端午节');
    expect(names('2026-06-19')).toContain('端午节');
  });

  it('元宵节 / 七夕 / 重阳节 / 腊八节 / 小年 均能命中（抽样锚点）', () => {
    expect(names('2025-02-12')).toContain('元宵节'); // 正月十五
    expect(names('2025-08-29')).toContain('七夕'); // 七月初七
    expect(names('2025-10-29')).toContain('重阳节'); // 九月初九
    expect(names('2026-01-26')).toContain('腊八节'); // 腊月初八
    expect(names('2026-02-10')).toContain('小年'); // 腊月廿三
  });
});

describe('公历 / 西方节日', () => {
  it('元旦 2026-01-01、国庆 2025-10-01（major=true）', () => {
    expect(getFestivals('2026-01-01').find((f) => f.name === '元旦')).toMatchObject({
      kind: 'solar',
      major: true,
    });
    expect(getFestivals('2025-10-01').find((f) => f.name === '国庆节')).toMatchObject({
      kind: 'solar',
      major: true,
    });
  });

  it('固定西方节日：2025-02-14 情人节 / 2025-12-25 圣诞（kind=western, major=false）', () => {
    expect(getFestivals('2025-02-14').find((f) => f.name === '情人节')).toMatchObject({
      kind: 'western',
      major: false,
    });
    expect(getFestivals('2025-12-25').find((f) => f.name === '圣诞')).toMatchObject({
      kind: 'western',
      major: false,
    });
  });

  it('规则型：母亲节 = 5 月第 2 个周日（2026-05-10；2025-05-11）', () => {
    expect(names('2026-05-10')).toContain('母亲节');
    expect(names('2025-05-11')).toContain('母亲节');
    // 前一周与后一周都不是母亲节
    expect(names('2026-05-03')).not.toContain('母亲节');
    expect(names('2026-05-17')).not.toContain('母亲节');
  });

  it('规则型：父亲节 = 6 月第 3 个周日（2025-06-15）', () => {
    expect(names('2025-06-15')).toContain('父亲节');
    expect(names('2025-06-08')).not.toContain('父亲节');
  });

  it('规则型：感恩节 = 11 月第 4 个周四（2025-11-27）', () => {
    expect(names('2025-11-27')).toContain('感恩节');
    expect(names('2025-11-20')).not.toContain('感恩节');
  });
});

describe('除夕 —— 腊月最后一天，大月 30 / 小月 29 都要覆盖', () => {
  it('2024 除夕 = 2024-02-09（腊月三十，大月）', () => {
    // 独立依据：春节 2024-02-10，除夕即其前一日
    expect(solarToLunar('2024-02-09')).toMatchObject({ month: 12, day: 30, isLeap: false });
    expect(names('2024-02-09')).toContain('除夕');
    expect(names('2024-02-10')).toContain('春节');
    expect(names('2024-02-10')).not.toContain('除夕');
  });

  it('2025 除夕 = 2025-01-28（腊月廿九，小月）', () => {
    expect(solarToLunar('2025-01-28')).toMatchObject({ month: 12, day: 29, isLeap: false });
    expect(names('2025-01-28')).toContain('除夕');
    expect(names('2025-01-29')).toContain('春节');
    expect(names('2025-01-29')).not.toContain('除夕');
  });

  it('逐农历年扫描：除夕永远落在腊月最后一天，且 29 / 30 两种大小月都出现过', () => {
    const seenDays = new Set<number>();
    for (let lunarYear = 1900; lunarYear <= 2099; lunarYear += 1) {
      const newYear = lunarToSolar(lunarYear + 1, 1, 1, false);
      expect(newYear, `${lunarYear + 1} 正月初一应存在`).not.toBeNull();
      const eve = shiftDateKey(newYear!, -1);
      const lunar = solarToLunar(eve);
      expect(lunar?.month, `${eve} 应为腊月`).toBe(12);
      expect(lunar?.isLeap).toBe(false);
      expect(names(eve), `${eve} 应为除夕`).toContain('除夕');
      // 次日必为春节
      expect(names(newYear!)).toContain('春节');
      seenDays.add(lunar!.day);
    }
    expect([...seenDays].sort()).toEqual([29, 30]);
  });
});

describe('清明的去重规则 —— 既是节气又是传统节日，但只出现一次', () => {
  it('2024-04-04 与 2025-04-04：清明恰好出现一次', () => {
    for (const key of ['2024-04-04', '2025-04-04']) {
      const qingming = getFestivals(key).filter((f) => f.name === '清明');
      expect(qingming, `${key} 清明应恰好一次`).toHaveLength(1);
      expect(qingming[0]?.kind).toBe('term');
      expect(qingming[0]?.major).toBe(true);
    }
  });

  it('冬至 / 夏至作为纯节气存在（kind=term，不见于其它类别）', () => {
    expect(names('2025-12-21')).toEqual(['冬至']);
    expect(getFestivals('2025-12-21')[0]?.kind).toBe('term');
  });

  it('getFestivals 返回值永远无重名', () => {
    for (const key of ['2024-04-04', '2020-10-01', '2025-12-21', '2025-01-29', '2022-09-10']) {
      const list = names(key);
      expect(new Set(list).size, `${key} 出现重名`).toBe(list.length);
    }
  });
});

describe('getFestivalLine —— 最多 2 个名字 + 优先级排序', () => {
  it('2020-10-01 = 中秋 + 国庆 → 「中秋节 · 国庆节」（农历优先于公历）', () => {
    expect(names('2020-10-01').slice(0, 2)).toEqual(['中秋节', '国庆节']);
    expect(getFestivalLine('2020-10-01')).toBe('中秋节 · 国庆节');
  });

  it('2022-09-10 = 中秋 + 教师节 → 农历排在公历之前', () => {
    expect(getFestivalLine('2022-09-10')).toBe('中秋节 · 教师节');
  });

  it('单一节日 / 无节日', () => {
    expect(getFestivalLine('2025-10-06')).toBe('中秋节');
    expect(getFestivalLine('2025-03-15')).toBeNull();
  });

  it('结构扫描：2024–2026 任意一天的 line 至多 2 段（「·」分隔）', () => {
    let key = '2024-01-01';
    const end = '2026-12-31';
    while (key <= end) {
      const line = getFestivalLine(key);
      if (line) {
        const parts = line.split(' · ');
        expect(parts.length, `${key} 超过 2 段: ${line}`).toBeLessThanOrEqual(2);
      }
      key = shiftDateKey(key, 1);
    }
  });
});

describe('越界 / 非法输入', () => {
  it('1899-12-31 与 2101-01-01 → 空数组 / null', () => {
    expect(getFestivals('1899-12-31')).toEqual([]);
    expect(getFestivals('2101-01-01')).toEqual([]);
    expect(getFestivalLine('1899-12-31')).toBeNull();
    expect(getFestivalLine('2101-01-01')).toBeNull();
  });

  it('非法日期键 → 空数组 / null', () => {
    expect(getFestivals('abc')).toEqual([]);
    expect(getFestivals('2025-13-01')).toEqual([]);
    expect(getFestivalLine('2025-02-30')).toBeNull();
  });
});

describe('major 标记（Phase 2 复用）', () => {
  it('春节 / 清明 / 端午 / 中秋 / 国庆 / 元旦 均为 major', () => {
    const majors: readonly [string, string][] = [
      ['2025-01-29', '春节'],
      ['2025-04-04', '清明'],
      ['2025-05-31', '端午节'],
      ['2025-10-06', '中秋节'],
      ['2025-10-01', '国庆节'],
      ['2026-01-01', '元旦'],
    ];
    for (const [key, name] of majors) {
      expect(getFestivals(key).find((f) => f.name === name)?.major, `${name} 应为 major`).toBe(true);
    }
  });

  it('非大节为 major=false', () => {
    expect(getFestivals('2025-06-01').find((f) => f.name === '儿童节')?.major).toBe(false);
    expect(getFestivals('2025-02-14').find((f) => f.name === '情人节')?.major).toBe(false);
  });
});
