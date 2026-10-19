import { describe, expect, it } from 'vitest';
import type { DailySelfStatus, Inspiration, Item, Task, TimeSlot } from '@/domain/types';
import {
  EMPTY_SUMMARY,
  buildDaySummary,
  buildMonthSummaries,
  buildWeekSummaries,
  buildYearSummaries,
  emptySummary,
  hasAnyData,
  resolveCalendarSelection,
} from '../calendarService';
import { computeRingData } from '../progressService';
import { makeInspiration, makeItem, makeSelfStatus, makeSlot, makeTask } from './fixtures';
import { monthGrid, monthLabel, shiftMonthKey, toMonthKey } from '@/utils/date';

/** 2026-10-01 是周四，因此月历首格（周一）为 2026-09-28 */
const MONTH = '2026-10';

const NO_ITEMS: Item[] = [];
const NO_TASKS: Task[] = [];
const NO_SLOTS: TimeSlot[] = [];
const NO_INSPIRATIONS: Inspiration[] = [];
const NO_SELF: DailySelfStatus[] = [];

describe('buildMonthSummaries — 分日聚合', () => {
  it('跨多天的数据按日期各自聚合，互不串扰', () => {
    const items = [
      makeItem({ id: 'a1', date: '2026-10-01', done: true }),
      makeItem({ id: 'a2', date: '2026-10-01', done: false }),
      makeItem({ id: 'b1', date: '2026-10-02', done: true }),
    ];
    const summaries = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, MONTH);

    expect(summaries['2026-10-01']?.sections.work).toEqual({ done: 1, total: 2 });
    expect(summaries['2026-10-02']?.sections.work).toEqual({ done: 1, total: 1 });
    // 第三天没有被前两天的条目污染
    expect(summaries['2026-10-03']?.sections.work).toEqual({ done: 0, total: 0 });
    expect(summaries['2026-10-03']?.hasData).toBe(false);
  });

  it('四个板块分别落在自己的键上', () => {
    const items = [
      makeItem({ id: 'w', date: '2026-10-05', sectionId: 'work', done: true }),
      makeItem({ id: 's', date: '2026-10-05', sectionId: 'study' }),
      makeItem({ id: 'f', date: '2026-10-05', sectionId: 'fitness', done: true }),
      makeItem({ id: 'l1', date: '2026-10-05', sectionId: 'life' }),
      makeItem({ id: 'l2', date: '2026-10-05', sectionId: 'life' }),
    ];
    const summary = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-05'];

    expect(summary?.sections).toEqual({
      work: { done: 1, total: 1 },
      study: { done: 0, total: 1 },
      fitness: { done: 1, total: 1 },
      life: { done: 0, total: 2 },
    });
  });
});

describe('buildWeekSummaries — 给定日期集合逐日聚合', () => {
  // 一周跨两个月：2026-10-12（周一）→ 2026-10-18（周日）
  const WEEK = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];

  it('只为传入的 7 个日期产出摘要，邻周/邻月日期不混入', () => {
    const items = [
      makeItem({ id: 'in', date: '2026-10-14', sectionId: 'work', done: true }),
      makeItem({ id: 'out', date: '2026-10-19', sectionId: 'work', done: true }), // 邻周周日之后，应排除
    ];
    const summaries = buildWeekSummaries(WEEK, items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF);

    expect(Object.keys(summaries).sort()).toEqual([...WEEK].sort());
    expect(summaries['2026-10-14']?.sections.work).toEqual({ done: 1, total: 1 });
    // 邻周 10/19 不会出现，且 10/14 不被 10/19 污染
    expect(summaries['2026-10-19']).toBeUndefined();
  });

  it('归入板块的时间段并入该板块完成度（与 buildDaySummary 同一口径）', () => {
    const slots = [
      makeSlot({ id: 's1', date: '2026-10-14', startMin: 9 * 60, endMin: 10 * 60, sectionId: 'study', done: true }),
    ];
    const summary = buildWeekSummaries(WEEK, NO_ITEMS, NO_TASKS, slots, NO_INSPIRATIONS, NO_SELF)['2026-10-14'];
    expect(summary?.sections.study).toEqual({ done: 1, total: 1 });
    expect(summary?.hasData).toBe(true);
  });
});

describe('buildMonthSummaries — 完成度口径', () => {
  it('四板块为顶层条目口径，子项不计入分母（与首页环形图一致）', () => {
    const items = [
      makeItem({ id: 'top1', date: '2026-10-06', done: true, order: 1000 }),
      makeItem({ id: 'top2', date: '2026-10-06', done: false, order: 2000 }),
      // 2 条已完成、1 条未完成的子项：既不该进分母，也不该进分子
      makeItem({ id: 'c1', date: '2026-10-06', parentId: 'top1', level: 1, done: true }),
      makeItem({ id: 'c2', date: '2026-10-06', parentId: 'top1', level: 1, done: true }),
      makeItem({ id: 'c3', date: '2026-10-06', parentId: 'top2', level: 1, done: false }),
    ];
    const summary = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-06'];

    expect(summary?.sections.work).toEqual({ done: 1, total: 2 });

    // 与首页同一份数据的环形图结果逐字段比对
    const ring = computeRingData(items);
    expect(summary?.overall).toBe(ring.overall);
  });

  it('软删条目既不计数也不算「有数据」', () => {
    const items = [
      makeItem({ id: 'alive', date: '2026-10-07' }),
      makeItem({ id: 'gone', date: '2026-10-08', deletedAt: 999 }),
    ];
    const summaries = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, MONTH);

    expect(summaries['2026-10-07']?.sections.work.total).toBe(1);
    expect(summaries['2026-10-08']?.sections.work.total).toBe(0);
    expect(summaries['2026-10-08']?.hasData).toBe(false);
  });
});

describe('buildMonthSummaries — 空摘要', () => {
  it('无数据日期返回空摘要：hasData=false、overall=0、不是 NaN', () => {
    const summaries = buildMonthSummaries(NO_ITEMS, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, MONTH);
    const day = summaries['2026-10-20'];

    expect(day).toBeDefined();
    expect(day?.hasData).toBe(false);
    expect(day?.overall).toBe(0);
    expect(Number.isNaN(day?.overall)).toBe(false);
    expect(day?.taskDone).toBe(0);
    expect(day?.taskTotal).toBe(0);
    expect(day?.mood).toBe(0);
    expect(day?.body).toBe(0);
    expect(day?.sections).toEqual({
      work: { done: 0, total: 0 },
      study: { done: 0, total: 0 },
      fitness: { done: 0, total: 0 },
      life: { done: 0, total: 0 },
    });
  });

  it('EMPTY_SUMMARY 常量为零值，emptySummary(date) 每次返回独立对象', () => {
    expect(EMPTY_SUMMARY.hasData).toBe(false);
    expect(EMPTY_SUMMARY.overall).toBe(0);

    const a = emptySummary('2026-10-01');
    const b = emptySummary('2026-10-02');
    a.sections.work.total = 5;
    expect(b.sections.work.total).toBe(0);
    expect(EMPTY_SUMMARY.sections.work.total).toBe(0);
  });
});

describe('buildMonthSummaries — 任务 / 时间段 / 自我状态', () => {
  it('任务完成数统计正确，且与四板块分开计', () => {
    const items = [makeItem({ id: 'i1', date: '2026-10-09', done: true })];
    const tasks = [
      makeTask({ id: 't1', date: '2026-10-09', done: true }),
      makeTask({ id: 't2', date: '2026-10-09', done: false }),
      makeTask({ id: 't3', date: '2026-10-09', done: true, deletedAt: 999 }),
    ];
    const summary = buildMonthSummaries(items, tasks, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-09'];

    expect(summary?.taskDone).toBe(1);
    expect(summary?.taskTotal).toBe(2);
    // 任务只进任务行，不进 overall
    expect(summary?.overall).toBe(1);
  });

  it('归入板块的时间段会并入该板块完成度（done 才计入）', () => {
    const slots = [
      makeSlot({ id: 's1', date: '2026-10-09', sectionId: 'work', done: true }),
      makeSlot({ id: 's2', date: '2026-10-09', sectionId: 'work', done: false }),
      makeSlot({ id: 's3', date: '2026-10-09', sectionId: 'study', done: true }),
      // 未归类（sectionId=null）的时间段不进任何板块
      makeSlot({ id: 's4', date: '2026-10-09', sectionId: null, done: true }),
    ];
    const summary = buildMonthSummaries(NO_ITEMS, NO_TASKS, slots, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-09'];

    expect(summary?.sections.work).toEqual({ done: 1, total: 2 });
    expect(summary?.sections.study).toEqual({ done: 1, total: 1 });
    // 未归类的时间段不计入 sections
    expect(summary?.sections.life).toEqual({ done: 0, total: 0 });
  });

  it('🔴 已同步成条目的时间段不重复计入完成度（同一件事只算一次）', () => {
    // 与「编号跳号」是同一个 bug 的另一面：不做排除的话，分母会凭空 +1
    const items = [makeItem({ id: 'i1', date: '2026-10-09', sectionId: 'work', sourceSlotId: 's1' })];
    const slots = [makeSlot({ id: 's1', date: '2026-10-09', sectionId: 'work', done: true })];

    const summary = buildMonthSummaries(items, NO_TASKS, slots, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-09'];

    expect(summary?.sections.work).toEqual({ done: 0, total: 1 });
  });

  it('同一天里板块条目与时间段共存：两边都算数，互不覆盖', () => {
    // 产品口径：分类模式与时间轴模式不是互斥的，一天可以既有条目又有时间段
    const items = [
      makeItem({ id: 'i1', date: '2026-10-09', sectionId: 'work', done: true }),
      makeItem({ id: 'i2', date: '2026-10-09', sectionId: 'work', done: false }),
    ];
    const slots = [
      makeSlot({ id: 's1', date: '2026-10-09', sectionId: 'work', done: true }),
      // 未归类的时间段：只贡献「有数据」，不进任何板块分母
      makeSlot({ id: 's2', date: '2026-10-09', sectionId: null, done: false }),
    ];

    const summary = buildMonthSummaries(items, NO_TASKS, slots, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-09'];

    // work：2 条顶层条目 + 1 条归入 work 的时间段 = total 3，done = 1 + 1 = 2
    expect(summary?.sections.work).toEqual({ done: 2, total: 3 });
    expect(summary?.hasData).toBe(true);
    // 未归类时间段所在板块（life）不受影响
    expect(summary?.sections.life).toEqual({ done: 0, total: 0 });
  });

  it('一天只有未归类时间段：算「有数据」，但四板块与 overall 都是 0 而不是 NaN', () => {
    const slots = [makeSlot({ id: 's1', date: '2026-10-09', sectionId: null, done: true })];
    const summary = buildMonthSummaries(NO_ITEMS, NO_TASKS, slots, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-09'];

    expect(summary?.hasData).toBe(true);
    expect(summary?.sections.work).toEqual({ done: 0, total: 0 });
    expect(summary?.overall).toBe(0);
    expect(Number.isNaN(summary?.overall)).toBe(false);
  });

  it('自我状态（心情 / 身体）正确读取；只要有一项有记录就算「有数据」', () => {
    const selfStatuses = [
      makeSelfStatus({ date: '2026-10-10', mood: 4, body: 3, moodText: '不错' }),
    ];
    const summaries = buildMonthSummaries(NO_ITEMS, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, selfStatuses, MONTH);

    expect(summaries['2026-10-10']?.mood).toBe(4);
    expect(summaries['2026-10-10']?.body).toBe(3);
    expect(summaries['2026-10-10']?.hasData).toBe(true);
    expect(summaries['2026-10-11']?.mood).toBe(0);
    expect(summaries['2026-10-11']?.body).toBe(0);
  });

  it('hasAnyData 覆盖条目 / 任务 / 时间段 / 灵感 / 自我状态五类来源', () => {
    expect(hasAnyData({ items: [makeItem({ id: 'x' })], tasks: [], timeSlots: [], inspirations: [] })).toBe(true);
    expect(hasAnyData({ items: [], tasks: [makeTask({ id: 'x' })], timeSlots: [], inspirations: [] })).toBe(true);
    // 未归类的存活时间段也算「有数据」
    expect(
      hasAnyData({ items: [], tasks: [], timeSlots: [makeSlot({ id: 'x', deletedAt: null })], inspirations: [] }),
    ).toBe(true);
    // 软删的时间段不算
    expect(
      hasAnyData({ items: [], tasks: [], timeSlots: [makeSlot({ id: 'x', deletedAt: 999 })], inspirations: [] }),
    ).toBe(false);
    // 存活的灵感算「有数据」，软删的不算
    expect(
      hasAnyData({ items: [], tasks: [], timeSlots: [], inspirations: [makeInspiration({ id: 'i', deletedAt: null })] }),
    ).toBe(true);
    expect(
      hasAnyData({ items: [], tasks: [], timeSlots: [], inspirations: [makeInspiration({ id: 'i', deletedAt: 999 })] }),
    ).toBe(false);
    // 自我状态：心情 > 0 / 身体 > 0 / 任一文字非空
    expect(
      hasAnyData({ items: [], tasks: [], timeSlots: [], inspirations: [], selfStatus: makeSelfStatus({ date: 'd', mood: 3 }) }),
    ).toBe(true);
    expect(
      hasAnyData({ items: [], tasks: [], timeSlots: [], inspirations: [], selfStatus: makeSelfStatus({ date: 'd', bodyText: '累' }) }),
    ).toBe(true);
    expect(hasAnyData({ items: [], tasks: [], timeSlots: [], inspirations: [] })).toBe(false);
    expect(
      hasAnyData({ items: [], tasks: [], timeSlots: [], inspirations: [], selfStatus: makeSelfStatus({ date: 'd' }) }),
    ).toBe(false);
  });

  it('灵感只影响「有没有记录」，不进板块完成度 / overall', () => {
    const inspirations = [makeInspiration({ id: 'in1', date: '2026-10-21', content: '想法' })];
    const summary = buildMonthSummaries(NO_ITEMS, NO_TASKS, NO_SLOTS, inspirations, NO_SELF, MONTH)['2026-10-21'];

    // 有灵感 → 这一天「有数据」
    expect(summary?.hasData).toBe(true);
    // 但四板块与 overall 不受影响（不是 NaN、不是 1）
    expect(summary?.sections.work).toEqual({ done: 0, total: 0 });
    expect(summary?.overall).toBe(0);
  });
});

describe('buildMonthSummaries — overall 与跨月边界', () => {
  it('加权 overall = Σ顶层完成 ÷ Σ顶层总数（不是四板块百分比的算术平均）', () => {
    const items = [
      // work：1/1 → 100%
      makeItem({ id: 'w1', date: '2026-10-12', sectionId: 'work', done: true }),
      // life：0/3 → 0%
      makeItem({ id: 'l1', date: '2026-10-12', sectionId: 'life' }),
      makeItem({ id: 'l2', date: '2026-10-12', sectionId: 'life' }),
      makeItem({ id: 'l3', date: '2026-10-12', sectionId: 'life' }),
    ];
    const summary = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-12'];

    // 算术平均会得到 50%，加权口径才是 1/4 = 25%
    expect(summary?.overall).toBeCloseTo(0.25, 10);
    expect(summary?.overall).not.toBeCloseTo(0.5, 5);
  });

  it('跨月边界：属于上月 / 下月的数据不混入本月，但补位格要说真话', () => {
    const items = [
      makeItem({ id: 'sep', date: '2026-09-30', sectionId: 'life', done: true }),
      makeItem({ id: 'nov', date: '2026-11-01', sectionId: 'study', done: true }),
      makeItem({ id: 'oct', date: '2026-10-15' }),
    ];
    const tasks = [makeTask({ id: 'sepTask', date: '2026-09-28' })];
    const selfStatuses = [makeSelfStatus({ date: '2026-11-02', mood: 5, body: 2 })];
    const summaries = buildMonthSummaries(items, tasks, NO_SLOTS, NO_INSPIRATIONS, selfStatuses, MONTH);

    // ① 本月的格子只认本月的记录
    expect(summaries['2026-10-15']?.sections.work.total).toBe(1);
    expect(summaries['2026-10-01']?.hasData).toBe(false);
    expect(summaries['2026-10-01']?.sections).toEqual({
      work: { done: 0, total: 0 },
      study: { done: 0, total: 0 },
      fitness: { done: 0, total: 0 },
      life: { done: 0, total: 0 },
    });
    expect(summaries['2026-10-31']?.hasData).toBe(false);

    // ② 前后补位格（9 月末 / 11 月初）在屏幕上看得见、点得到，
    //    摘要必须如实反映当天实际记录，否则用户点「9/30」会看到一句谎话
    expect(summaries['2026-09-30']?.hasData).toBe(true);
    expect(summaries['2026-09-30']?.sections.life).toEqual({ done: 1, total: 1 });
    expect(summaries['2026-11-01']?.hasData).toBe(true);
    expect(summaries['2026-11-01']?.sections.study).toEqual({ done: 1, total: 1 });
    expect(summaries['2026-11-02']?.mood).toBe(5);
    expect(summaries['2026-11-02']?.body).toBe(2);
    expect(summaries['2026-09-28']?.taskTotal).toBe(1);
  });

  it('buildDaySummary 可直接算单日，字段与整月结果一致', () => {
    const items = [makeItem({ id: 'only', date: '2026-10-18', done: true })];
    const single = buildDaySummary('2026-10-18', items, [], [], NO_INSPIRATIONS, null);
    const month = buildMonthSummaries(items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF, MONTH)['2026-10-18'];
    expect(single).toEqual(month);
  });
});

describe('buildYearSummaries — 整年聚合', () => {
  const YEAR = '2026';

  it('聚合出 12 个月，daysWithData 与 sections 按自然月累加（边界日不重复计入）', () => {
    // 10 月放真实记录，1 月 / 12 月放跨月补位日的数据验证不串月
    const items = [
      makeItem({ id: 'oct1', date: '2026-10-05', sectionId: 'work', done: true }),
      makeItem({ id: 'oct2', date: '2026-10-20', sectionId: 'work', done: false }),
      // 12 月网格的补位日（属于 11 月）不应算进 12 月，也不应算进别的月重复
      makeItem({ id: 'decPad', date: '2026-12-31', sectionId: 'life', done: true }),
    ];
    const slots = [
      makeSlot({ id: 'sl1', date: '2026-10-10', sectionId: 'study', done: true }),
    ];
    const selfStatuses = [
      makeSelfStatus({ date: '2026-10-15', mood: 4 }),
      makeSelfStatus({ date: '2026-03-03', body: 5 }),
    ];

    const year = buildYearSummaries(YEAR, items, NO_TASKS, slots, NO_INSPIRATIONS, selfStatuses);

    // 每个月都有 key
    expect(Object.keys(year)).toHaveLength(12);

    // 10 月：2 条 work 条目 + 1 条 study 时间段 + 2 个自我状态 → daysWithData=4
    const oct = year['2026-10']!;
    expect(oct.daysWithData).toBe(4);
    expect(oct.hasAny).toBe(true);
    expect(oct.sections.work).toEqual({ done: 1, total: 2 });
    expect(oct.sections.study).toEqual({ done: 1, total: 1 });

    // 3 月：只有身体 5 分 → daysWithData=1，body 不影响 sections
    const mar = year['2026-03']!;
    expect(mar.daysWithData).toBe(1);
    expect(mar.sections.work).toEqual({ done: 0, total: 0 });

    // 12 月：只有 12-31 一条 life 条目 → daysWithData=1
    const dec = year['2026-12']!;
    expect(dec.daysWithData).toBe(1);
    expect(dec.sections.life).toEqual({ done: 1, total: 1 });

    // 1 月：无数据
    const jan = year['2026-01']!;
    expect(jan.daysWithData).toBe(0);
    expect(jan.hasAny).toBe(false);
  });

  it('整年空库：每个月的 daysWithData 都为 0，hasAny 都为 false', () => {
    const year = buildYearSummaries(YEAR, NO_ITEMS, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF);
    for (const mk of Object.keys(year)) {
      expect(year[mk]?.daysWithData).toBe(0);
      expect(year[mk]?.hasAny).toBe(false);
      expect(year[mk]?.sections.work).toEqual({ done: 0, total: 0 });
    }
  });

  it('闰年：2 月 29 日的数据正确归入 2 月，不被丢到 3 月', () => {
    // 2028 是闰年
    const items = [
      makeItem({ id: 'leap', date: '2028-02-29', sectionId: 'life', done: true }),
      makeItem({ id: 'mar1', date: '2028-03-01', sectionId: 'work', done: true }),
    ];
    const year = buildYearSummaries('2028', items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF);

    expect(year['2028-02']?.daysWithData).toBe(1);
    expect(year['2028-02']?.sections.life).toEqual({ done: 1, total: 1 });
    expect(year['2028-02']?.sections.work).toEqual({ done: 0, total: 0 });
    expect(year['2028-03']?.daysWithData).toBe(1);
    expect(year['2028-03']?.sections.work).toEqual({ done: 1, total: 1 });
  });

  it('平年 2 月只有 28 天：2/28 归 2 月、3/1 归 3 月，不重不漏', () => {
    const items = [
      makeItem({ id: 'feb28', date: '2027-02-28', sectionId: 'study', done: true }),
      makeItem({ id: 'mar01', date: '2027-03-01', sectionId: 'study', done: true }),
    ];
    const year = buildYearSummaries('2027', items, NO_TASKS, NO_SLOTS, NO_INSPIRATIONS, NO_SELF);

    expect(year['2027-02']?.daysWithData).toBe(1);
    expect(year['2027-03']?.daysWithData).toBe(1);
    // 全年的 study 完成度之和 = 2 条，无重复计入
    const studyTotal = Object.values(year).reduce(
      (sum, m) => sum + m.sections.study.total,
      0,
    );
    expect(studyTotal).toBe(2);
  });
});

describe('resolveCalendarSelection — 进入某月时选中哪天', () => {
  it('优先选全局日期：preferredDate 在本月则选它（即使不是今天）', () => {
    expect(resolveCalendarSelection('2026-10', '2026-10-05', '2026-10-20')).toBe('2026-10-05');
  });

  it('preferredDate 不在本月 → 退而选「今天」（若今天在本月）', () => {
    expect(resolveCalendarSelection('2026-10', '2026-09-15', '2026-10-20')).toBe('2026-10-20');
  });

  it('preferredDate 与今天都不在本月 → 选该月第一天', () => {
    expect(resolveCalendarSelection('2026-10', '2026-09-15', '2026-11-25')).toBe('2026-10-01');
  });

  it('补位日不算「在本月」：9/30 是 10 月网格的补位格，不能选它', () => {
    // 2026-10 的网格首格是 2026-09-28（补位），inMonth=false
    expect(resolveCalendarSelection('2026-10', '2026-09-30', '2026-11-25')).toBe('2026-10-01');
  });

  it('跨年：2 月且今天与全局日期都不在 → 选 2/1（不是上月补位日）', () => {
    expect(resolveCalendarSelection('2026-02', '2026-01-31', '2026-03-05')).toBe('2026-02-01');
  });

  it('preferred 是本月的最后一天（10/31）也照样选中，不因「不是今天」被替换', () => {
    expect(resolveCalendarSelection('2026-10', '2026-10-31', '2026-10-01')).toBe('2026-10-31');
  });

  it('1 号是周日的月份（2026-02）：兜底选 2/1，绝不选上月补位日', () => {
    // 2026-02-01 是周日 → 网格首格回退到 2026-01-26（补位，inMonth=false）
    expect(monthGrid('2026-02')[0]?.dateKey).toBe('2026-01-26');
    expect(
      monthGrid('2026-02').find((c) => c.dateKey === '2026-02-01')?.inMonth,
    ).toBe(true);
    expect(resolveCalendarSelection('2026-02', '2026-01-26', '2026-03-01')).toBe('2026-02-01');
  });

  it('闰年 2 月（2028-02）：29 天都算本月；兜底选 2/1，闰日 2/29 命中', () => {
    const inMonth = monthGrid('2028-02').filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(resolveCalendarSelection('2028-02', '2028-01-31', '2028-03-31')).toBe('2028-02-01');
    expect(resolveCalendarSelection('2028-02', '2028-02-29', '2028-03-31')).toBe('2028-02-29');
  });

  it.each([
    '2026-01',
    '2026-02',
    '2026-04',
    '2026-10',
    '2028-02',
    '2025-12',
    '2027-01',
  ])('%s：preferred 与 today 都落在补位格时，返回值一定是本月格（永不返回补位日）', (monthKey) => {
    const cells = monthGrid(monthKey);
    const padding = cells.filter((c) => !c.inMonth).map((c) => c.dateKey);
    expect(padding.length).toBeGreaterThan(0);
    const result = resolveCalendarSelection(monthKey, padding[0]!, padding[padding.length - 1]!);
    expect(cells.find((c) => c.dateKey === result)?.inMonth).toBe(true);
    expect(padding).not.toContain(result);
  });
});

describe('monthGrid', () => {
  it('固定返回 42 格，周一为第一列', () => {
    const grid = monthGrid(MONTH);
    expect(grid).toHaveLength(42);
    // 2026-10-01 是周四 → 首格回退到 2026-09-28（周一）
    expect(grid[0]?.dateKey).toBe('2026-09-28');
    expect(grid[0]?.day).toBe(28);
    expect(grid[3]?.dateKey).toBe('2026-10-01');
    expect(grid[41]?.dateKey).toBe('2026-11-08');
  });

  it('inMonth 只标记目标月，跨月补位为 false', () => {
    const grid = monthGrid(MONTH);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(grid[0]?.inMonth).toBe(false);
    expect(grid[2]?.inMonth).toBe(false);
    expect(grid[3]?.inMonth).toBe(true);
    expect(grid[33]?.inMonth).toBe(true);
    expect(grid[34]?.inMonth).toBe(false);
    expect(grid[41]?.inMonth).toBe(false);
  });

  it('月键工具：toMonthKey / shiftMonthKey / monthLabel 跨年正确', () => {
    expect(toMonthKey('2026-10-15')).toBe('2026-10');
    expect(shiftMonthKey('2026-10', 1)).toBe('2026-11');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(monthLabel('2026-10')).toBe('2026年10月');
  });
});
