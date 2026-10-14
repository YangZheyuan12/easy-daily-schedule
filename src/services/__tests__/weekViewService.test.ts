import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEEK_WINDOW,
  buildWeekSectionBoards,
  buildWeekTimetable,
  hourTicks,
  resolveWeekWindow,
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

describe('resolveWeekWindow — 按当周数据自动收窄', () => {
  it('没有数据时回落默认窗口 08:00–22:00', () => {
    expect(resolveWeekWindow([])).toEqual({ startMin: 8 * 60, endMin: 22 * 60 });
    expect(resolveWeekWindow([makeSlot({ id: 'a', deletedAt: 5000 })])).toEqual(DEFAULT_WEEK_WINDOW);
  });

  it('最早 / 最晚各外扩一小时并对齐整点', () => {
    const timeWindow = resolveWeekWindow([
      makeSlot({ id: 'a', startMin: 9 * 60, endMin: 10 * 60 }),
      makeSlot({ id: 'b', startMin: 15 * 60 + 30, endMin: 17 * 60 }),
    ]);
    // 8:00 (=9-1) → 18:00 (=17+1)
    expect(timeWindow).toEqual({ startMin: 8 * 60, endMin: 18 * 60 });
  });

  it('软删的时间段不参与窗口计算（凌晨那段不该把窗口拉到 2:00）', () => {
    const timeWindow = resolveWeekWindow([
      makeSlot({ id: 'a', startMin: 9 * 60, endMin: 10 * 60 }),
      makeSlot({ id: 'b', startMin: 3 * 60, endMin: 4 * 60, deletedAt: 5000 }),
    ]);
    // 只看 a：8:00(=9-1) → 11:00(=10+1)；跨度不足 4 小时，再往下探一小时到 7:00
    expect(timeWindow.startMin).toBe(7 * 60);
    expect(timeWindow.endMin).toBe(11 * 60);
  });

  it('跨度不足 4 小时时兜底拉到 4 小时，避免网格挤成一团', () => {
    const timeWindow = resolveWeekWindow([
      makeSlot({ id: 'a', startMin: 9 * 60, endMin: 9 * 60 + 30 }),
    ]);
    // 8:00 → 13:00（(9.5+1) 向上取整 = 11:00，不足 4 小时再往下补到 8:00 仍差 1 小时 → 补到 13:00）
    expect(timeWindow.endMin - timeWindow.startMin).toBeGreaterThanOrEqual(4 * 60);
  });

  it('窗口不会越出 00:00–24:00', () => {
    const timeWindow = resolveWeekWindow([
      makeSlot({ id: 'a', startMin: 0, endMin: 30 }),
      makeSlot({ id: 'b', startMin: 23 * 60, endMin: 24 * 60 }),
    ]);
    expect(timeWindow.startMin).toBe(0);
    expect(timeWindow.endMin).toBe(24 * 60);
  });

  it('hourTicks 给出窗口内的整点刻度', () => {
    expect(hourTicks({ startMin: 8 * 60, endMin: 11 * 60 })).toEqual([480, 540, 600, 660]);
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
