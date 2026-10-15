import { describe, expect, it } from 'vitest';
import {
  WEEK_WINDOW,
  buildWeekSectionBoards,
  buildWeekTimetable,
  gridTicks,
} from '../weekViewService';
import { makeItem, makeSlot } from './fixtures';

/** 2026-10-12 是周一，这一周是 10-12（一）… 10-18（日） */
const WEEK = [
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
  '2026-10-17',
  '2026-10-18',
];

describe('WEEK_WINDOW — 固定 06:00–24:00（不随当周数据收窄）', () => {
  it('固定窗口常量', () => {
    expect(WEEK_WINDOW).toEqual({ startMin: 6 * 60, endMin: 24 * 60 });
  });

  it('gridTicks 默认每两小时一条分割线，且终点 24:00 也被包含', () => {
    expect(gridTicks(WEEK_WINDOW)).toEqual([
      360, 480, 600, 720, 840, 960, 1080, 1200, 1320, 1440,
    ]);
  });

  it('gridTicks 可按自定义步长给出整点刻度', () => {
    expect(gridTicks({ startMin: 8 * 60, endMin: 18 * 60 })).toEqual([
      480, 600, 720, 840, 960, 1080,
    ]);
  });
});

describe('buildWeekTimetable — 课程表布局', () => {
  const timeWindow = { startMin: 8 * 60, endMin: 18 * 60 }; // 跨度 600 分钟

  it('按天的下标定位，位置与高度按窗口归一化', () => {
    const cells = buildWeekTimetable(
      [makeSlot({ id: 'a', date: '2026-10-14', startMin: 9 * 60, endMin: 10 * 60 })],
      WEEK,
      timeWindow,
    );
    expect(cells).toHaveLength(1);
    // 周三 = index 2；(9:00-8:00)/10h = 0.1；1 小时 / 10 小时 = 0.1
    expect(cells[0]?.dayIndex).toBe(2);
    expect(cells[0]?.top).toBeCloseTo(0.1);
    expect(cells[0]?.height).toBeCloseTo(0.1);
    expect(cells[0]?.laneCount).toBe(1);
  });

  it('不在本周内的时间段被跳过', () => {
    const cells = buildWeekTimetable(
      [makeSlot({ id: 'a', date: '2026-10-25', startMin: 9 * 60, endMin: 10 * 60 })],
      WEEK,
      timeWindow,
    );
    expect(cells).toHaveLength(0);
  });

  it('时段重叠时并排（各占一列），不是后一条盖住前一条', () => {
    const cells = buildWeekTimetable(
      [
        makeSlot({ id: 'a', date: '2026-10-14', startMin: 9 * 60, endMin: 11 * 60 }),
        makeSlot({ id: 'b', date: '2026-10-14', startMin: 10 * 60, endMin: 12 * 60 }),
      ],
      WEEK,
      timeWindow,
    );
    expect(cells).toHaveLength(2);
    expect(cells.map((c) => c.lane).sort()).toEqual([0, 1]);
    expect(cells.every((c) => c.laneCount === 2)).toBe(true);
  });

  it('首尾相接（10 点结束、10 点开始）不算重叠', () => {
    const cells = buildWeekTimetable(
      [
        makeSlot({ id: 'a', date: '2026-10-14', startMin: 9 * 60, endMin: 10 * 60 }),
        makeSlot({ id: 'b', date: '2026-10-14', startMin: 10 * 60, endMin: 11 * 60 }),
      ],
      WEEK,
      timeWindow,
    );
    expect(cells.every((c) => c.laneCount === 1)).toBe(true);
  });

  it('0 时长的段也保留一个可点的最小高度', () => {
    const cells = buildWeekTimetable(
      [makeSlot({ id: 'a', date: '2026-10-14', startMin: 9 * 60, endMin: 0 })],
      WEEK,
      timeWindow,
    );
    expect(cells[0]?.height).toBeGreaterThan(0);
  });

  it('高度不会溢出网格下沿', () => {
    const cells = buildWeekTimetable(
      [makeSlot({ id: 'a', date: '2026-10-14', startMin: 17 * 60, endMin: 18 * 60 })],
      WEEK,
      timeWindow,
    );
    const cell = cells[0];
    expect(cell).toBeDefined();
    expect((cell?.top ?? 0) + (cell?.height ?? 0)).toBeLessThanOrEqual(1);
  });

  it('软删的段不出现在课程表里', () => {
    const cells = buildWeekTimetable(
      [makeSlot({ id: 'a', date: '2026-10-14', deletedAt: 5000 })],
      WEEK,
      timeWindow,
    );
    expect(cells).toHaveLength(0);
  });
});

describe('buildWeekSectionBoards — 本周田字格', () => {
  it('四个板块恒在（即使本周没内容），空板块 days 为空', () => {
    const boards = buildWeekSectionBoards([], [], WEEK);
    expect(boards.map((b) => b.key)).toEqual(['work', 'study', 'fitness', 'life']);
    expect(boards.every((b) => b.days.length === 0 && b.total === 0)).toBe(true);
  });

  it('汇总顶层条目并统计完成数', () => {
    const items = [
      makeItem({ id: 'a', date: '2026-10-14', sectionId: 'work', done: true }),
      makeItem({ id: 'b', date: '2026-10-15', sectionId: 'work', done: false }),
    ];
    const work = buildWeekSectionBoards(items, [], WEEK)[0];
    expect(work?.total).toBe(2);
    expect(work?.done).toBe(1);
    expect(work?.days.map((d) => d.dateKey)).toEqual(['2026-10-14', '2026-10-15']);
  });

  it('归类的时间段也算该板块的一件事项（与今日页同一口径）', () => {
    const items = [makeItem({ id: 'a', date: '2026-10-14', sectionId: 'work' })];
    const slots = [
      makeSlot({ id: 's1', date: '2026-10-14', sectionId: 'work', content: '开组会' }),
    ];
    const work = buildWeekSectionBoards(items, slots, WEEK)[0];
    expect(work?.total).toBe(2);
    expect(work?.days[0]?.entries.map((e) => e.kind)).toEqual(['item', 'timeSlot']);
  });

  it('未归类（sectionId = null）的时间段不进任何板块', () => {
    const boards = buildWeekSectionBoards(
      [],
      [makeSlot({ id: 's1', date: '2026-10-14', sectionId: null })],
      WEEK,
    );
    expect(boards.every((b) => b.total === 0)).toBe(true);
  });

  it('子项不单独占一行（与完成率口径一致，避免虚高）', () => {
    const items = [
      makeItem({ id: 'parent', date: '2026-10-14', sectionId: 'work' }),
      makeItem({ id: 'child', date: '2026-10-14', sectionId: 'work', parentId: 'parent', level: 1 }),
    ];
    const work = buildWeekSectionBoards(items, [], WEEK)[0];
    expect(work?.total).toBe(1);
    expect(work?.days[0]?.entries.map((e) => e.id)).toEqual(['parent']);
  });

  it('只列出有内容的天', () => {
    const items = [makeItem({ id: 'a', date: '2026-10-14', sectionId: 'life' })];
    const life = buildWeekSectionBoards(items, [], WEEK)[3];
    expect(life?.days).toHaveLength(1);
    expect(life?.days[0]?.weekday).toBe('周三');
    expect(life?.days[0]?.dateLabel).toBe('10月14日');
  });

  it('软删的条目与时间段都不计入', () => {
    const items = [makeItem({ id: 'a', date: '2026-10-14', sectionId: 'work', deletedAt: 5000 })];
    const slots = [
      makeSlot({ id: 's1', date: '2026-10-14', sectionId: 'work', deletedAt: 5000 }),
    ];
    expect(buildWeekSectionBoards(items, slots, WEEK)[0]?.total).toBe(0);
  });
});
