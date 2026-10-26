import { describe, expect, it } from 'vitest';
import { SECTION_CONFIGS } from '@/domain/constants';
import type { DailySelfStatus, Inspiration, Item, Task, TimeSlot } from '@/domain/types';
import {
  buildDaySummary,
  buildMonthSummaries,
  buildYearSummaries,
  emptySummary,
  shouldShowDayDots,
} from '../calendarService';
import { computeRingData, toPercent } from '../progressService';
import { makeItem, makeSelfStatus, makeSlot, makeTask } from './fixtures';
import { clampDayToMonth, monthGrid, shiftMonthKey } from '@/utils/date';

/**
 * 日历页的边界验证（QA）。
 *
 * 与常规单测的分工：这里只盯「会在什么情况下算错 / 崩掉」——
 * 首次挂载、切月后的选中日、跨月补位格、除零、并发切换月份、整年聚合。
 */

const MONTHS = [
  '2026-02', // 平年 2 月，2/1 是周日
  '2028-02', // 闰年 2 月
  '2026-01',
  '2026-04',
  '2026-10',
  '2025-12',
  '2027-01',
] as const;

const NO_ITEMS: Item[] = [];
const NO_TASKS: Task[] = [];
const NO_SLOTS: TimeSlot[] = [];
const NO_INSPIRATIONS: Inspiration[] = [];
const NO_SELF: DailySelfStatus[] = [];

function makeSelf(partial: Partial<DailySelfStatus> & { date: string }): DailySelfStatus {
  return makeSelfStatus(partial);
}

/* ------------------------------------------------------------------ */
/* 1. 口径真实性：日历数字必须等于首页环形图                              */
/* ------------------------------------------------------------------ */

/** 同一天的数据集：含四板块混合、深子树、软删、孤立子项 */
function dataset(name: string, items: Item[]): { name: string; items: Item[] } {
  return { name, items };
}

const DAY = '2026-10-10';

const DATASETS = [
  dataset('空数据', []),
  dataset('只有工作板块', [
    makeItem({ id: 'w1', date: DAY, done: true, order: 1000 }),
    makeItem({ id: 'w2', date: DAY, done: false, order: 2000 }),
  ]),
  dataset('四板块混合', [
    makeItem({ id: 'w1', date: DAY, sectionId: 'work', done: true, order: 1000 }),
    makeItem({ id: 'w2', date: DAY, sectionId: 'work', done: true, order: 2000 }),
    makeItem({ id: 's1', date: DAY, sectionId: 'study', done: false, order: 1000 }),
    makeItem({ id: 's2', date: DAY, sectionId: 'study', done: true, order: 2000 }),
    makeItem({ id: 'f1', date: DAY, sectionId: 'fitness', done: false, order: 1000 }),
    makeItem({ id: 'l1', date: DAY, sectionId: 'life', done: true, order: 1000 }),
    makeItem({ id: 'l2', date: DAY, sectionId: 'life', done: false, order: 2000 }),
  ]),
  dataset('带子树：子项不进分母', [
    makeItem({ id: 'top1', date: DAY, done: true, order: 1000 }),
    makeItem({ id: 'top2', date: DAY, done: false, order: 2000 }),
    makeItem({ id: 'c1', date: DAY, parentId: 'top1', level: 1, done: true }),
    makeItem({ id: 'c2', date: DAY, parentId: 'top1', level: 1, done: false }),
    makeItem({ id: 'gc1', date: DAY, parentId: 'c1', level: 2, done: true }),
  ]),
  dataset('含软删：软删既不算完成也不算总数', [
    makeItem({ id: 'alive', date: DAY, done: true, order: 1000 }),
    makeItem({ id: 'dead', date: DAY, done: true, order: 2000, deletedAt: 999 }),
    makeItem({ id: 'deadChild', date: DAY, parentId: 'alive', level: 1, deletedAt: 999 }),
  ]),
  dataset('只有软删条目：分母为 0 而不是 NaN', [
    makeItem({ id: 'dead1', date: DAY, deletedAt: 999 }),
    makeItem({ id: 'dead2', date: DAY, deletedAt: 999 }),
  ]),
  dataset('孤立子项（父节点不在数据集里）：不算顶层', [
    makeItem({ id: 'orphan', date: DAY, parentId: 'missing-parent', level: 3, done: true }),
  ]),
];

describe('口径真实性 Assert — 日历 vs 首页环形图', () => {
  it.each(DATASETS)('$name：四板块 done/total 与 overall 逐字段等价', ({ items }) => {
    const summary = buildDaySummary(DAY, items, [], [], NO_INSPIRATIONS, null);
    const ring = computeRingData(items);

    for (const config of SECTION_CONFIGS) {
      const segment = ring.segments.find((s) => s.sectionId === config.key)!;
      expect(summary.sections[config.key]).toEqual({ done: segment.done, total: segment.total });
    }
    expect(summary.overall).toBe(ring.overall);
    expect(toPercent(summary.overall)).toBe(toPercent(ring.overall));
    expect(Number.isNaN(summary.overall)).toBe(false);
  });

  it.each(DATASETS)('$name：整月视图的结果与单日计算完全一致', ({ items }) => {
    const month = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, '2026-10')[DAY]!;
    const single = buildDaySummary(DAY, items, [], [], NO_INSPIRATIONS, null);
    expect(month.sections).toEqual(single.sections);
    expect(month.overall).toBe(single.overall);
    expect(month.hasData).toBe(single.hasData);
  });

  it('任务不参与 overall（口径与首页一致：环形图只有四板块）', () => {
    const items = [makeItem({ id: 'w1', date: DAY, done: true })];
    const tasks = [makeTask({ id: 't1', date: DAY, done: true })];
    const summary = buildDaySummary(DAY, items, tasks, [], NO_INSPIRATIONS, null);

    expect(summary.taskDone).toBe(1);
    expect(summary.taskTotal).toBe(1);
    expect(summary.overall).toBe(1);
    expect(computeRingData(items).overall).toBe(1);
  });

  it('归入板块的时间段**不再**参与 overall（2026-10-26：只有同步成条目才计入）', () => {
    // work 原本 1/1 = 100%；加一条未完成的 work 时间段 → 仍为 1/1 = 100%（时间段不再并入）
    const items = [makeItem({ id: 'w1', date: DAY, sectionId: 'work', done: true })];
    const slots = [makeSlot({ id: 's1', date: DAY, sectionId: 'work', done: false })];
    const summary = buildDaySummary(DAY, items, [], slots, NO_INSPIRATIONS, null);

    expect(summary.sections.work).toEqual({ done: 1, total: 1 });
    expect(summary.overall).toBeCloseTo(1, 10);
  });

  it('混入其它日期的条目不会算进当天（调用方漏过滤也不出错）', () => {
    const items = [
      makeItem({ id: 'today', date: DAY, done: true }),
      makeItem({ id: 'yesterday', date: '2026-10-09', done: true }),
      makeItem({ id: 'nextMonth', date: '2026-11-01', done: true }),
    ];
    const tasks = [
      makeTask({ id: 't-today', date: DAY, done: true }),
      makeTask({ id: 't-other', date: '2026-10-09', done: true }),
    ];
    const summary = buildDaySummary(DAY, items, tasks, [], NO_INSPIRATIONS, null);

    expect(summary.sections.work).toEqual({ done: 1, total: 1 });
    expect(summary.taskTotal).toBe(1);
    expect(summary.overall).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 2. 摘要表的 key 覆盖：UI 取不到就是「假的无数据」                       */
/* ------------------------------------------------------------------ */

describe('buildMonthSummaries — key 覆盖', () => {
  it.each(MONTHS)('%s：首次挂载（IndexedDB 全空）也是 42 个 key，不是空对象', (monthKey) => {
    const summaries = buildMonthSummaries(NO_ITEMS, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, monthKey);
    const keys = monthGrid(monthKey).map((cell) => cell.dateKey);

    expect(Object.keys(summaries)).toHaveLength(42);
    for (const key of keys) {
      expect(summaries[key]).toBeDefined();
      expect(summaries[key]?.hasData).toBe(false);
      expect(summaries[key]?.overall).toBe(0);
      expect(summaries[key]?.date).toBe(key);
    }
  });

  it.each(MONTHS)('%s：连着切月后，clamp 出来的选中日一定取得到摘要', (monthKey) => {
    // 模拟用户连着往后 / 往前切月：selectedDate 被夹到新月
    for (const delta of [-2, -1, 1, 2]) {
      const nextMonth = shiftMonthKey(monthKey, delta);
      for (const day of [1, 28, 29, 30, 31]) {
        const before = `${monthKey}-${String(day).padStart(2, '0')}`;
        const selected = clampDayToMonth(before, nextMonth);
        const summaries = buildMonthSummaries(NO_ITEMS, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, nextMonth);
        expect(summaries[selected]).toBeDefined();
        expect(summaries[selected]?.date).toBe(selected);
      }
    }
  });

  it('切到完全没有数据的月份，摘要卡拿到的是零值摘要而不是 undefined', () => {
    const empty = buildMonthSummaries(NO_ITEMS, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, '2027-01');
    const selected = clampDayToMonth('2026-10-10', '2027-01');
    const summary = empty[selected] ?? emptySummary(selected);

    expect(summary.hasData).toBe(false);
    expect(toPercent(summary.overall)).toBe(0);
    expect(toPercent(summary.overall)).not.toBeNaN();
  });
});

/* ------------------------------------------------------------------ */
/* 3. 跨月：本月不被污染，补位格也不能说谎                                */
/* ------------------------------------------------------------------ */

describe('buildMonthSummaries — 跨月', () => {
  it('补位日期的数据绝不污染本月任何一个格子', () => {
    const items = [
      makeItem({ id: 'sep', date: '2026-09-30', sectionId: 'life', done: true }),
      makeItem({ id: 'nov', date: '2026-11-01', sectionId: 'study', done: true }),
      makeItem({ id: 'oct', date: '2026-10-15', done: true }),
    ];
    const summaries = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, '2026-10');

    const octCells = monthGrid('2026-10').filter((cell) => cell.inMonth);
    for (const cell of octCells) {
      const expected = buildDaySummary(
        cell.dateKey,
        items.filter((i) => i.date === cell.dateKey),
        [],
        [],
        NO_INSPIRATIONS,
        null,
      );
      expect(summaries[cell.dateKey]).toEqual(expected);
    }
    expect(summaries['2026-10-15']?.sections.work).toEqual({ done: 1, total: 1 });
    expect(summaries['2026-10-01']?.hasData).toBe(false);
  });

  it('点灰色的补位格，摘要必须是真数据（不能谎报「没有任何记录」）', () => {
    // 2026-10 的网格首格是 2026-09-28；这些日期在屏幕上可见且可点
    const items = [
      makeItem({ id: 'prev', date: '2026-09-30', sectionId: 'life', done: true }),
      makeItem({ id: 'next', date: '2026-11-01', sectionId: 'study', done: false }),
    ];
    const tasks = [makeTask({ id: 'prevTask', date: '2026-09-29', done: true })];
    const selfStatuses = [makeSelf({ date: '2026-11-02', mood: 5, body: 2 })];
    const summaries = buildMonthSummaries(items, tasks, NO_SLOTS, NO_INSPIRATIONS, selfStatuses, '2026-10');

    expect(summaries['2026-09-30']?.hasData).toBe(true);
    expect(summaries['2026-09-30']?.sections.life).toEqual({ done: 1, total: 1 });
    expect(summaries['2026-09-29']?.taskTotal).toBe(1);
    expect(summaries['2026-09-29']?.taskDone).toBe(1);
    expect(summaries['2026-11-01']?.sections.study).toEqual({ done: 0, total: 1 });
    expect(summaries['2026-11-02']?.mood).toBe(5);
    expect(summaries['2026-11-02']?.body).toBe(2);
  });

  it.each(MONTHS)('%s：每一格的摘要都只由该格当天的数据算出来', (monthKey) => {
    const cells = monthGrid(monthKey);
    const items = cells.flatMap((cell, index) =>
      // 每格放 index % 3 条（含 0 条），保证天天都不一样才有区分度
      Array.from({ length: index % 3 }, (_, n) =>
        makeItem({
          id: `${cell.dateKey}-${n}`,
          date: cell.dateKey,
          sectionId: SECTION_CONFIGS[index % 4]!.key,
          done: n === 0,
          order: (n + 1) * 1000,
        }),
      ),
    );
    const summaries = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, monthKey);

    for (const cell of cells) {
      const dayItems = items.filter((i) => i.date === cell.dateKey);
      const expected = buildDaySummary(cell.dateKey, dayItems, [], [], NO_INSPIRATIONS, null);
      expect(summaries[cell.dateKey]).toEqual(expected);
      expect(summaries[cell.dateKey]?.date).toBe(cell.dateKey);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4. 除零与 NaN（含整年聚合不崩）                                        */
/* ------------------------------------------------------------------ */

describe('除零与 NaN', () => {
  it('全空月份里随便拎一格出来，都不该出现 NaN', () => {
    for (const monthKey of MONTHS) {
      const summaries = buildMonthSummaries(NO_ITEMS, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, monthKey);
      for (const summary of Object.values(summaries)) {
        expect(Number.isNaN(summary.overall)).toBe(false);
        expect(toPercent(summary.overall)).toBe(0);
        for (const config of SECTION_CONFIGS) {
          expect(Number.isNaN(toPercent(summary.sections[config.key].total))).toBe(false);
        }
      }
    }
  });

  it('只有任务、四板块全空：overall 是 0%，不参与除零', () => {
    const tasks = [makeTask({ id: 't1', date: DAY, done: true })];
    const summary = buildDaySummary(DAY, NO_ITEMS, tasks, [], NO_INSPIRATIONS, null);

    expect(summary.hasData).toBe(true);
    expect(summary.overall).toBe(0);
    expect(toPercent(summary.overall)).toBe(0);
    expect(summary.taskDone).toBe(1);
  });

  it('软删占满一天：total 归 0，overall 仍是 0 而非 NaN', () => {
    const items = [makeItem({ id: 'gone', date: DAY, done: true, deletedAt: 1 })];
    const summary = buildDaySummary(DAY, items, [], [], NO_INSPIRATIONS, null);

    expect(summary.sections.work.total).toBe(0);
    expect(summary.overall).toBe(0);
    expect(Number.isNaN(summary.overall)).toBe(false);
  });

  it('整年全空：buildYearSummaries 不崩，每个月 daysWithData 都是 0', () => {
    const year = buildYearSummaries('2026', NO_ITEMS, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF);
    for (const mk of Object.keys(year)) {
      expect(year[mk]?.daysWithData).toBe(0);
      expect(Number.isNaN(year[mk]?.sections.work.done)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 5. 色点渲染规则（DayCell 的决策依据，抽出来才能被单测锁住）              */
/* ------------------------------------------------------------------ */

describe('shouldShowDayDots — 哪些格子渲染四板块色点', () => {
  const OCT = '2026-10'; // 网格覆盖 2026-09-28 ~ 2026-11-08
  const padding = (dateKey: string) => monthGrid(OCT).find((cell) => cell.dateKey === dateKey)!;
  const inMonthCell = monthGrid(OCT).find((cell) => cell.dateKey === '2026-10-15')!;

  it('当月格子一律渲染，与是否今天无关', () => {
    expect(shouldShowDayDots(inMonthCell, false)).toBe(true);
    expect(shouldShowDayDots(inMonthCell, true)).toBe(true);
  });

  it('补位格默认不渲染：别月的点不能串到本月视图里', () => {
    expect(shouldShowDayDots(padding('2026-09-30'), false)).toBe(false);
    expect(shouldShowDayDots(padding('2026-11-01'), false)).toBe(false);
  });

  it('今天是补位格时必须渲染：锚点不能是瞎的', () => {
    // 今天是 11-03、正在看 10 月 → 该格 inMonth=false 但带蓝色高亮
    expect(padding('2026-11-03').inMonth).toBe(false);
    expect(shouldShowDayDots(padding('2026-11-03'), true)).toBe(true);
    // 同一个补位格，不是今天时依然不渲染
    expect(shouldShowDayDots(padding('2026-11-03'), false)).toBe(false);
  });

  it('整张表：渲染色点的格子数 = 当月格数，今天落在补位格时才 +1', () => {
    const grid = monthGrid(OCT);
    const dotsFor = (todayKey: string | null) =>
      grid.filter((cell) => shouldShowDayDots(cell, cell.dateKey === todayKey)).length;

    const daysInMonth = grid.filter((cell) => cell.inMonth).length;
    // 今天不在本月视图里（比如看 10 月、今天是 12-01）
    expect(dotsFor('2026-12-01')).toBe(daysInMonth);
    // 今天是本月某天
    expect(dotsFor('2026-10-20')).toBe(daysInMonth);
    // 今天落在补位格：多渲染且只多这一个
    expect(dotsFor('2026-11-03')).toBe(daysInMonth + 1);
    expect(dotsFor('2026-09-28')).toBe(daysInMonth + 1);
  });

  it('与摘要数据自洽：今天落在补位格时，那一格拿得到真数据（同屏不能打架）', () => {
    const today = '2026-11-03';
    const summaries = buildMonthSummaries(
      [makeItem({ id: 'x', date: today, sectionId: 'life', done: true })],
      NO_TASKS,
      NO_SLOTS,
      NO_INSPIRATIONS,
      NO_SELF,
      OCT,
    );
    const cell = padding(today);

    // 同一格里：色点渲染=true，摘要有数据=true —— 二者必须同真同假
    expect(shouldShowDayDots(cell, true)).toBe(true);
    expect(summaries[today]?.hasData).toBe(true);
    expect(summaries[today]?.sections.life).toEqual({ done: 1, total: 1 });
    // 反例：相邻的补位格既不给点，也不该被当成有记录
    const neighbour = padding('2026-11-02');
    expect(shouldShowDayDots(neighbour, false)).toBe(false);
    expect(summaries['2026-11-02']?.hasData).toBe(false);
  });

  it('极端月也成立：2026-02 首格恰好是今天时依然渲染', () => {
    const firstCell = monthGrid('2026-02')[0]!;
    expect(firstCell.inMonth).toBe(false);
    expect(shouldShowDayDots(firstCell, true)).toBe(true);
    expect(shouldShowDayDots(firstCell, false)).toBe(false);
  });
});
