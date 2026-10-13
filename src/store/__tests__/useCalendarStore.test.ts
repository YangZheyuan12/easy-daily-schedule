import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailySelfStatus, Inspiration, Item, Task, TimeSlot } from '@/domain/types';

/**
 * 日历 store 的边界验证（QA）。
 *
 * `repos` 被整体替换成内存假实现：这里要验的是 store 自己的编排逻辑
 * （取数区间、切月后选中日、读失败的兜底、并发切月、年视图加载），
 * 不是 Dexie 能不能查 —— 后者属于真机冒烟的范畴。
 */
const { fakeRepos } = vi.hoisted(() => ({
  fakeRepos: {
    items: { listByDateRange: vi.fn() },
    tasks: { listByDateRange: vi.fn() },
    timeSlots: { listByDateRange: vi.fn() },
    inspirations: { listByDateRange: vi.fn() },
    selfStatus: { listBetween: vi.fn() },
  },
}));

vi.mock('@/store/bootstrap', () => ({ repos: fakeRepos }));

import { useCalendarStore } from '@/store/useCalendarStore';
import { monthGrid } from '@/utils/date';
import { makeInspiration, makeItem } from '@/services/__tests__/fixtures';

interface Dataset {
  items: Item[];
  tasks: Task[];
  timeSlots: TimeSlot[];
  inspirations: Inspiration[];
  selfStatus: DailySelfStatus[];
}

const EMPTY_DB: Dataset = { items: [], tasks: [], timeSlots: [], inspirations: [], selfStatus: [] };

function inRange(key: string, start: string, end: string): boolean {
  return key >= start && key <= end;
}

function seed(db: Dataset): void {
  fakeRepos.items.listByDateRange.mockImplementation(async (start: string, end: string) =>
    db.items.filter((item) => inRange(item.date, start, end)),
  );
  fakeRepos.tasks.listByDateRange.mockImplementation(async (start: string, end: string) =>
    db.tasks.filter((task) => inRange(task.date, start, end)),
  );
  fakeRepos.timeSlots.listByDateRange.mockImplementation(async (start: string, end: string) =>
    db.timeSlots.filter((slot) => inRange(slot.date, start, end)),
  );
  fakeRepos.inspirations.listByDateRange.mockImplementation(async (start: string, end: string) =>
    db.inspirations.filter((row) => inRange(row.date, start, end)),
  );
  fakeRepos.selfStatus.listBetween.mockImplementation(async (start: string, end: string) =>
    db.selfStatus.filter((self) => inRange(self.date, start, end)),
  );
}

/** 手动控制的 Promise：用来制造「先发的请求后返回」这种竞态 */
function makeGate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = () => resolve();
  });
  return { promise, open };
}

function gridKeys(monthKey: string): string[] {
  return monthGrid(monthKey).map((cell) => cell.dateKey);
}

function setMonth(monthKey: string, selectedDate: string): void {
  useCalendarStore.setState({
    view: 'month',
    monthKey,
    yearKey: monthKey.slice(0, 4),
    selectedDate,
    summaries: {},
    yearSummaries: {},
    loading: false,
  });
}

describe('useCalendarStore — 正常取数', () => {
  beforeEach(() => {
    fakeRepos.items.listByDateRange.mockReset();
    fakeRepos.tasks.listByDateRange.mockReset();
    fakeRepos.timeSlots.listByDateRange.mockReset();
    fakeRepos.inspirations.listByDateRange.mockReset();
    fakeRepos.selfStatus.listBetween.mockReset();
    seed(EMPTY_DB);
  });

  it('一次整月取数：区间等于月历网格首尾（含前后补位日）', async () => {
    setMonth('2026-10', '2026-10-10');
    await useCalendarStore.getState().loadMonth('2026-10');

    expect(fakeRepos.items.listByDateRange).toHaveBeenCalledWith('2026-09-28', '2026-11-08');
    expect(fakeRepos.tasks.listByDateRange).toHaveBeenCalledWith('2026-09-28', '2026-11-08');
    expect(fakeRepos.timeSlots.listByDateRange).toHaveBeenCalledWith('2026-09-28', '2026-11-08');
    expect(fakeRepos.inspirations.listByDateRange).toHaveBeenCalledWith('2026-09-28', '2026-11-08');
    expect(fakeRepos.selfStatus.listBetween).toHaveBeenCalledWith('2026-09-28', '2026-11-08');
  });

  it('首次挂载（IndexedDB 全空）：42 个格子都有摘要，不会退化成空对象', async () => {
    setMonth('2026-02', '2026-02-10');
    await useCalendarStore.getState().loadMonth('2026-02');

    const state = useCalendarStore.getState();
    expect(state.loading).toBe(false);
    expect(Object.keys(state.summaries)).toHaveLength(42);
    expect(Object.keys(state.summaries).sort()).toEqual([...gridKeys('2026-02')].sort());
    expect(state.summaries['2026-02-28']?.hasData).toBe(false);
  });
});

describe('useCalendarStore — 读失败兜底', () => {
  beforeEach(() => {
    fakeRepos.items.listByDateRange.mockReset();
    fakeRepos.tasks.listByDateRange.mockReset();
    fakeRepos.timeSlots.listByDateRange.mockReset();
    fakeRepos.inspirations.listByDateRange.mockReset();
    fakeRepos.selfStatus.listBetween.mockReset();
    seed(EMPTY_DB);
  });

  it('Dexie 抛错：loading 落回 false，summaries 清空，且不卡住后续切换', async () => {
    setMonth('2026-10', '2026-10-10');
    fakeRepos.items.listByDateRange.mockRejectedValueOnce(new Error('db closed'));

    await useCalendarStore.getState().loadMonth('2026-10');
    expect(useCalendarStore.getState().loading).toBe(false);
    expect(useCalendarStore.getState().summaries).toEqual({});

    // 下一次必须还能正常加载（不能因为一次失败就永久停在错误态）
    await useCalendarStore.getState().loadMonth('2026-10');
    expect(useCalendarStore.getState().loading).toBe(false);
    expect(Object.keys(useCalendarStore.getState().summaries)).toHaveLength(42);
  });

  it('四个仓储任意一个失败都不会留下 loading=true 的死状态', async () => {
    setMonth('2026-10', '2026-10-10');
    fakeRepos.selfStatus.listBetween.mockRejectedValueOnce(new Error('selfStatus read failed'));

    await useCalendarStore.getState().loadMonth('2026-10');
    expect(useCalendarStore.getState().loading).toBe(false);
  });

  it('loadMonth 期间 loading 为 true，结束后必然落回 false', async () => {
    const gate = makeGate();
    setMonth('2026-10', '2026-10-10');
    fakeRepos.items.listByDateRange.mockImplementationOnce(async () => {
      await gate.promise;
      return [];
    });

    const pending = useCalendarStore.getState().loadMonth('2026-10');
    expect(useCalendarStore.getState().loading).toBe(true);
    gate.open();
    await pending;
    expect(useCalendarStore.getState().loading).toBe(false);
  });
});

describe('useCalendarStore — 切月的「保留几号」', () => {
  beforeEach(() => {
    fakeRepos.items.listByDateRange.mockReset();
    fakeRepos.tasks.listByDateRange.mockReset();
    fakeRepos.timeSlots.listByDateRange.mockReset();
    fakeRepos.inspirations.listByDateRange.mockReset();
    fakeRepos.selfStatus.listBetween.mockReset();
  });

  it('1 月 31 号 → 平年 2 月：退到 28 号，且该日的摘要取得到', async () => {
    seed({
      ...EMPTY_DB,
      items: [makeItem({ id: 'feb28', date: '2026-02-28', done: true })],
    });
    setMonth('2026-01', '2026-01-31');

    await useCalendarStore.getState().shiftMonth(1);

    const state = useCalendarStore.getState();
    expect(state.monthKey).toBe('2026-02');
    expect(state.selectedDate).toBe('2026-02-28');
    expect(state.summaries[state.selectedDate]).toBeDefined();
    expect(state.summaries[state.selectedDate]?.sections.work).toEqual({ done: 1, total: 1 });
  });

  it('1 月 31 号 → 闰年 2 月：保住 29 号', async () => {
    seed(EMPTY_DB);
    setMonth('2028-01', '2028-01-31');

    await useCalendarStore.getState().shiftMonth(1);

    expect(useCalendarStore.getState().selectedDate).toBe('2028-02-29');
    expect(useCalendarStore.getState().summaries['2028-02-29']).toBeDefined();
  });

  it('3 月 31 号 → 4 月：退到 30 号', async () => {
    seed(EMPTY_DB);
    setMonth('2026-03', '2026-03-31');

    await useCalendarStore.getState().shiftMonth(1);

    expect(useCalendarStore.getState().selectedDate).toBe('2026-04-30');
    expect(useCalendarStore.getState().summaries['2026-04-30']).toBeDefined();
  });

  it('往回跨年：1 月 31 号 → 上一年 12 月 31 号', async () => {
    seed(EMPTY_DB);
    setMonth('2026-01', '2026-01-31');

    await useCalendarStore.getState().shiftMonth(-1);

    expect(useCalendarStore.getState().monthKey).toBe('2025-12');
    expect(useCalendarStore.getState().selectedDate).toBe('2025-12-31');
    expect(useCalendarStore.getState().summaries['2025-12-31']).toBeDefined();
  });

  it('切到一个完全没有数据的月份也不会出现「选中日取不到摘要」', async () => {
    seed(EMPTY_DB);
    setMonth('2026-10', '2026-10-10');

    await useCalendarStore.getState().shiftMonth(3); // → 2027-01，空库

    const state = useCalendarStore.getState();
    expect(state.monthKey).toBe('2027-01');
    expect(state.summaries[state.selectedDate]).toBeDefined();
    expect(state.summaries[state.selectedDate]?.hasData).toBe(false);
  });

  it('选中一个补位日期后切月，摘要照样落在新月里', async () => {
    seed(EMPTY_DB);
    // 10 月网格里点灰色的 9/30（可见可点）
    setMonth('2026-10', '2026-09-30');
    await useCalendarStore.getState().loadMonth('2026-10');
    expect(useCalendarStore.getState().summaries['2026-09-30']).toBeDefined();

    await useCalendarStore.getState().shiftMonth(1); // → 2026-11
    const state = useCalendarStore.getState();
    expect(state.monthKey).toBe('2026-11');
    expect(state.selectedDate).toBe('2026-11-30');
    expect(state.summaries['2026-11-30']).toBeDefined();
  });
});

describe('useCalendarStore — 年视图加载', () => {
  beforeEach(() => {
    fakeRepos.items.listByDateRange.mockReset();
    fakeRepos.tasks.listByDateRange.mockReset();
    fakeRepos.timeSlots.listByDateRange.mockReset();
    fakeRepos.inspirations.listByDateRange.mockReset();
    fakeRepos.selfStatus.listBetween.mockReset();
    seed(EMPTY_DB);
  });

  it('loadYear 取的是整年区间（1/1 → 12/31）', async () => {
    setMonth('2026-10', '2026-10-10');
    await useCalendarStore.getState().loadYear('2026');

    expect(fakeRepos.items.listByDateRange).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    expect(fakeRepos.timeSlots.listByDateRange).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    expect(fakeRepos.inspirations.listByDateRange).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    expect(fakeRepos.selfStatus.listBetween).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
    expect(useCalendarStore.getState().view).toBe('year');
    // 12 个月都有迷你汇总
    expect(Object.keys(useCalendarStore.getState().yearSummaries)).toHaveLength(12);
  });

  it('切年保留选中月：切到某月后视图切回 month', async () => {
    setMonth('2026-10', '2026-10-10');
    await useCalendarStore.getState().loadYear('2026');
    await useCalendarStore.getState().shiftYear(1);

    const state = useCalendarStore.getState();
    expect(state.yearKey).toBe('2027');
    expect(state.view).toBe('year');
    expect(Object.keys(state.yearSummaries)).toHaveLength(12);
  });

  /**
   * 回归：早先 `setView('year')` 只改 view 不取数，年视图第一眼永远是
   * 12 个「未记录」—— 把「没取数」渲染成了「这一整年什么都没记」。
   */
  it('setView(year) 必须顺带取数：不能只改 view 留下空的 yearSummaries', async () => {
    seed({
      ...EMPTY_DB,
      items: [makeItem({ id: 'mar', date: '2026-03-03', sectionId: 'life', done: true })],
    });
    setMonth('2026-10', '2026-10-10');
    expect(useCalendarStore.getState().yearSummaries).toEqual({});

    useCalendarStore.getState().setView('year');
    await vi.waitFor(() => {
      expect(useCalendarStore.getState().loading).toBe(false);
    });

    const state = useCalendarStore.getState();
    expect(state.view).toBe('year');
    expect(Object.keys(state.yearSummaries)).toHaveLength(12);
    // 数据真的取回来了：3 月有 1 天记录
    expect(state.yearSummaries['2026-03']?.daysWithData).toBe(1);
    expect(state.yearSummaries['2026-03']?.sections.life).toEqual({ done: 1, total: 1 });
  });

  it('灵感只贡献「有记录天数」，不进板块 sections', async () => {
    seed({
      ...EMPTY_DB,
      inspirations: [makeInspiration({ id: 'idea1', date: '2026-05-05', content: '一个想法' })],
    });
    setMonth('2026-10', '2026-10-10');
    await useCalendarStore.getState().loadYear('2026');

    const may = useCalendarStore.getState().yearSummaries['2026-05'];
    expect(may?.daysWithData).toBe(1);
    expect(may?.hasAny).toBe(true);
    // 灵感不影响板块完成度
    expect(may?.sections.work).toEqual({ done: 0, total: 0 });
  });

  it('setView(month) 只切视图，不会把年份 / 月份改掉', async () => {
    setMonth('2026-10', '2026-10-10');
    useCalendarStore.getState().setView('month');

    const state = useCalendarStore.getState();
    expect(state.view).toBe('month');
    expect(state.monthKey).toBe('2026-10');
    expect(state.yearKey).toBe('2026');
  });
});

describe('useCalendarStore — 并发切月（竞态）', () => {
  beforeEach(() => {
    fakeRepos.items.listByDateRange.mockReset();
    fakeRepos.tasks.listByDateRange.mockReset();
    fakeRepos.timeSlots.listByDateRange.mockReset();
    fakeRepos.inspirations.listByDateRange.mockReset();
    fakeRepos.selfStatus.listBetween.mockReset();
    seed(EMPTY_DB);
  });

  it('先发的请求迟到，不能覆盖后发的结果', async () => {
    setMonth('2026-01', '2026-01-15');

    const gateA = makeGate();
    const gateB = makeGate();
    let call = 0;
    fakeRepos.items.listByDateRange.mockImplementation(async () => {
      call += 1;
      const gate = call === 1 ? gateA : gateB;
      await gate.promise;
      return [];
    });

    const first = useCalendarStore.getState().loadMonth('2026-02');
    const second = useCalendarStore.getState().loadMonth('2026-03');

    // 故意让第二次取数先返回
    gateB.open();
    await second;
    expect(useCalendarStore.getState().monthKey).toBe('2026-03');
    expect(Object.keys(useCalendarStore.getState().summaries)).toHaveLength(42);

    // 第一次的迟到结果必须被丢弃
    gateA.open();
    await first;

    const state = useCalendarStore.getState();
    expect(state.monthKey).toBe('2026-03');
    expect(Object.keys(state.summaries).sort()).toEqual([...gridKeys('2026-03')].sort());
    expect(state.loading).toBe(false);
  });

  it('快速连点两次「下一月」，最终月份与摘要必须自洽', async () => {
    setMonth('2026-10', '2026-10-10');

    const gate1 = makeGate();
    const gate2 = makeGate();
    let call = 0;
    fakeRepos.items.listByDateRange.mockImplementation(async () => {
      call += 1;
      await (call === 1 ? gate1 : gate2).promise;
      return [];
    });

    const first = useCalendarStore.getState().shiftMonth(1); // → 2026-11
    const second = useCalendarStore.getState().shiftMonth(1); // → 2026-12

    gate2.open();
    await second;
    gate1.open();
    await first;

    const state = useCalendarStore.getState();
    expect(state.loading).toBe(false);
    // 月 key 与摘要必须属于同一个月，否则摘要卡会显示「假的无记录」
    expect(Object.keys(state.summaries).sort()).toEqual([...gridKeys(state.monthKey)].sort());
    expect(state.summaries[state.selectedDate]).toBeDefined();
  });

  it('refresh 不会把正在查看的月份换成别的月份', async () => {
    seed({ ...EMPTY_DB, items: [makeItem({ id: 'x', date: '2026-04-05', done: true })] });
    setMonth('2026-04', '2026-04-05');
    await useCalendarStore.getState().refresh();

    const state = useCalendarStore.getState();
    expect(state.monthKey).toBe('2026-04');
    expect(state.summaries['2026-04-05']?.sections.work.total).toBe(1);
  });
});
