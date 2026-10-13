import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimeSlot } from '@/domain/types';
import { ORDER_STEP } from '@/domain/constants';

/**
 * useTimeSlotStore 的编排验证（QA）。
 *
 * `bootstrap`（repos / persistence / clock）被整体替换成假实现，
 * 验的是 store 自己的逻辑：新增 / 勾选 / 软删 / 排序 / 落盘调用。
 */
const { fakeRepos, fakePersistence, fakeClock } = vi.hoisted(() => ({
  fakeRepos: {
    timeSlots: { listByDate: vi.fn() },
  },
  fakePersistence: {
    markTimeSlot: vi.fn(),
    scheduleImmediate: vi.fn(),
  },
  fakeClock: { now: () => 1000 },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
}));

import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { makeSlot } from '@/services/__tests__/fixtures';

function reset(): void {
  useTimeSlotStore.setState({ date: '', slots: [], loading: false });
  fakeRepos.timeSlots.listByDate.mockReset();
  fakePersistence.markTimeSlot.mockReset();
  fakePersistence.scheduleImmediate.mockReset();
}

describe('useTimeSlotStore — 新增与排序', () => {
  beforeEach(reset);

  it('addSlot 生成一个完整的时间段，按 startMin 排序，并立即落盘', () => {
    const id = useTimeSlotStore.getState().addSlot({
      date: '2026-10-10',
      startMin: 600,
      endMin: 660,
      content: '锻炼',
      sectionId: 'fitness',
    });

    expect(id).toBeTruthy();
    const slots = useTimeSlotStore.getState().slots;
    expect(slots).toHaveLength(1);
    const created = slots[0]!;
    expect(created.id).toBe(id);
    expect(created.content).toBe('锻炼');
    expect(created.sectionId).toBe('fitness');
    expect(created.done).toBe(false);
    expect(created.deletedAt).toBeNull();
    expect(created.order).toBe(ORDER_STEP);
    expect(created.createdAt).toBe(1000);
    expect(created.updatedAt).toBe(1000);

    // 立即落盘：markTimeSlot + scheduleImmediate（immediate）
    expect(fakePersistence.markTimeSlot).toHaveBeenCalledWith(created);
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalled();
  });

  it('连续新增：order 在最大 order 之上累加 STEP', () => {
    useTimeSlotStore.getState().addSlot({ date: '2026-10-10', startMin: 540, endMin: 0, content: 'a', sectionId: null });
    useTimeSlotStore.getState().addSlot({ date: '2026-10-10', startMin: 600, endMin: 0, content: 'b', sectionId: null });

    const orders = useTimeSlotStore.getState().slots.map((s) => s.order);
    expect(orders).toEqual([ORDER_STEP, ORDER_STEP * 2]);
  });

  it('slots 按 startMin 升序排列（与 order / createdAt 无关）', () => {
    useTimeSlotStore.getState().addSlot({ date: '2026-10-10', startMin: 700, endMin: 0, content: '晚', sectionId: null });
    useTimeSlotStore.getState().addSlot({ date: '2026-10-10', startMin: 500, endMin: 0, content: '早', sectionId: null });

    const startMins = useTimeSlotStore.getState().slots.map((s) => s.startMin);
    expect(startMins).toEqual([500, 700]);
  });

  it('startMin 相同时用 order 兜底（后加的排在同刻后面）', () => {
    // 两个时间段都排在 13:00：order 小的在前，保证顺序稳定、不会每次渲染都跳
    useTimeSlotStore.setState({ date: '', slots: [], loading: false });
    const first = useTimeSlotStore.getState().addSlot({
      date: '2026-10-10', startMin: 780, endMin: 840, content: '先排的', sectionId: null,
    });
    const second = useTimeSlotStore.getState().addSlot({
      date: '2026-10-10', startMin: 780, endMin: 840, content: '后排的', sectionId: null,
    });

    const contents = useTimeSlotStore.getState().slots.map((s) => s.content);
    expect(contents).toEqual(['先排的', '后排的']);

    // 把「先排的」的开始时间改到更早，排序必须立刻跟着变
    useTimeSlotStore.getState().updateSlot(first, { startMin: 600 });
    expect(useTimeSlotStore.getState().slots.map((s) => s.id)).toEqual([first, second]);

    useTimeSlotStore.getState().updateSlot(first, { startMin: 900 });
    expect(useTimeSlotStore.getState().slots.map((s) => s.id)).toEqual([second, first]);
  });

  it('loadDate 载入的乱序数据也按 startMin 排好（order 兜底）', async () => {
    useTimeSlotStore.setState({ date: '', slots: [], loading: false });
    fakeRepos.timeSlots.listByDate.mockImplementation(async () => [
      makeSlot({ id: 'b', date: '2026-10-10', startMin: 780, order: 2000 }),
      makeSlot({ id: 'a', date: '2026-10-10', startMin: 780, order: 1000 }),
      makeSlot({ id: 'c', date: '2026-10-10', startMin: 540, order: 3000 }),
    ]);

    await useTimeSlotStore.getState().loadDate('2026-10-10');

    expect(useTimeSlotStore.getState().slots.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('useTimeSlotStore — 勾选与编辑', () => {
  beforeEach(reset);

  it('toggleDone 翻转 done，并立即落盘', () => {
    const id = useTimeSlotStore.getState().addSlot({
      date: '2026-10-10',
      startMin: 540,
      endMin: 0,
      content: 'x',
      sectionId: null,
    });
    fakePersistence.markTimeSlot.mockClear();

    useTimeSlotStore.getState().toggleDone(id);
    expect(useTimeSlotStore.getState().slots.find((s) => s.id === id)?.done).toBe(true);

    useTimeSlotStore.getState().toggleDone(id);
    expect(useTimeSlotStore.getState().slots.find((s) => s.id === id)?.done).toBe(false);
    expect(fakePersistence.markTimeSlot).toHaveBeenCalledTimes(2);
  });

  it('updateSlot 合并补丁并刷新 updatedAt', () => {
    const id = useTimeSlotStore.getState().addSlot({
      date: '2026-10-10',
      startMin: 540,
      endMin: 0,
      content: '旧',
      sectionId: null,
    });

    useTimeSlotStore.getState().updateSlot(id, { content: '新', startMin: 600 });
    const slot = useTimeSlotStore.getState().slots.find((s) => s.id === id)!;
    expect(slot.content).toBe('新');
    expect(slot.startMin).toBe(600);
    expect(slot.updatedAt).toBe(1000);
  });
});

describe('useTimeSlotStore — 软删', () => {
  beforeEach(reset);

  it('removeSlot 设置 deletedAt 做软删，并保留在内存中（由 UI 过滤隐藏）', () => {
    const id = useTimeSlotStore.getState().addSlot({
      date: '2026-10-10',
      startMin: 540,
      endMin: 0,
      content: 'x',
      sectionId: null,
    });
    fakePersistence.markTimeSlot.mockClear();

    useTimeSlotStore.getState().removeSlot(id);
    const slot = useTimeSlotStore.getState().slots.find((s) => s.id === id)!;
    expect(slot.deletedAt).toBe(1000); // 软删时间戳
    // 内存里仍保留（便于将来撤销 / 物理清理），但 UI 通过 deletedAt===null 过滤
    expect(useTimeSlotStore.getState().slots).toHaveLength(1);
    expect(fakePersistence.markTimeSlot).toHaveBeenCalledWith(slot);
  });
});

describe('useTimeSlotStore — 加载', () => {
  beforeEach(reset);

  it('loadDate 调用 repos 并按存活记录载入', async () => {
    const data: TimeSlot[] = [
      makeSlot({ id: 'live', date: '2026-10-10', startMin: 540 }),
      makeSlot({ id: 'dead', date: '2026-10-10', startMin: 600, deletedAt: 999 }),
      makeSlot({ id: 'other', date: '2026-10-11', startMin: 540 }),
    ];
    // 模拟真实仓库契约：listByDate 只返回「当天且存活」的记录
    fakeRepos.timeSlots.listByDate.mockImplementation(async (date: string) =>
      data.filter((slot) => slot.date === date && slot.deletedAt === null),
    );

    await useTimeSlotStore.getState().loadDate('2026-10-10');

    const slots = useTimeSlotStore.getState().slots;
    // repo 已过滤软删；只返回当天的存活记录
    expect(slots.map((s) => s.id).sort()).toEqual(['live']);
    expect(useTimeSlotStore.getState().date).toBe('2026-10-10');
    expect(useTimeSlotStore.getState().loading).toBe(false);
  });
});
