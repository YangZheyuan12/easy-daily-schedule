import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Routine, RoutineCompletion } from '@/domain/types';
import { ORDER_STEP } from '@/domain/constants';

/**
 * useRoutineStore 的编排验证（QA）。
 *
 * `bootstrap`（repos / persistence / clock）整体替换成假实现，
 * 验的是 store 自己的逻辑：新增排序 / 编辑 / 软删红线（只改 deletedAt）/
 * 每天独立勾选 / 级联清理完成记录 / 落盘调用。
 */
const { fakeRepos, fakePersistence, fakeClock } = vi.hoisted(() => {
  const state = { now: 1000 };
  return {
    fakeRepos: {
      routines: { listAlive: vi.fn(), listAll: vi.fn() },
      routineCompletions: { listByDate: vi.fn(), hardDeleteMany: vi.fn() },
    },
    fakePersistence: {
      markRoutine: vi.fn(),
      markRoutines: vi.fn(),
      markRoutineCompletion: vi.fn(),
      scheduleImmediate: vi.fn(),
      hardDeleteRoutineCompletions: vi.fn(),
    },
    fakeClock: { now: () => state.now, _state: state },
  };
});

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
}));

import { useRoutineStore } from '@/store/useRoutineStore';

function reset(): void {
  useRoutineStore.setState({
    routines: [],
    completions: {},
    loading: false,
    lastCreatedId: null,
    pendingUndo: null,
  });
  fakeRepos.routines.listAlive.mockReset();
  fakeRepos.routines.listAll.mockReset();
  fakeRepos.routineCompletions.listByDate.mockReset();
  fakeRepos.routineCompletions.hardDeleteMany.mockReset();
  fakePersistence.markRoutine.mockReset();
  fakePersistence.markRoutines.mockReset();
  fakePersistence.markRoutineCompletion.mockReset();
  fakePersistence.scheduleImmediate.mockReset();
  fakePersistence.hardDeleteRoutineCompletions.mockReset();
  fakeClock._state.now = 1000;
}

describe('useRoutineStore — 新增与排序', () => {
  beforeEach(reset);

  it('add 生成完整模板，order 在最大之上累加 STEP，并立即落盘', () => {
    const id = useRoutineStore.getState().add('晨跑');

    expect(id).toBeTruthy();
    const routines = useRoutineStore.getState().routines;
    expect(routines).toHaveLength(1);
    const created = routines[0]!;
    expect(created.id).toBe(id);
    expect(created.title).toBe('晨跑');
    expect(created.sectionId).toBe('other');
    expect(created.order).toBe(ORDER_STEP);
    expect(created.deletedAt).toBeNull();
    expect(created.createdAt).toBe(1000);

    expect(fakePersistence.markRoutines).toHaveBeenCalledWith([created]);
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalled();
  });

  it('连续新增：order 在最大 order 之上累加', () => {
    useRoutineStore.getState().add('a');
    useRoutineStore.getState().add('b');
    const orders = useRoutineStore.getState().routines.map((r) => r.order);
    expect(orders).toEqual([ORDER_STEP, ORDER_STEP * 2]);
  });
});

describe('useRoutineStore — 编辑与软删红线', () => {
  beforeEach(reset);

  it('setTitle 合并新标题并刷新 updatedAt，走防抖（不立即落盘）', () => {
    const id = useRoutineStore.getState().add('旧');
    fakePersistence.markRoutines.mockClear();
    fakePersistence.scheduleImmediate.mockClear();

    useRoutineStore.getState().setTitle(id, '新');
    const routine = useRoutineStore.getState().routines.find((r) => r.id === id)!;
    expect(routine.title).toBe('新');
    expect(routine.updatedAt).toBe(1000);
    expect(fakePersistence.markRoutines).toHaveBeenCalled();
    expect(fakePersistence.scheduleImmediate).not.toHaveBeenCalled();
  });

  it('remove 只改 deletedAt（架构红线），updatedAt / title 原样保留，并从列表移除', () => {
    const id = useRoutineStore.getState().add('x');
    const before = useRoutineStore.getState().routines.find((r) => r.id === id)!;
    fakePersistence.markRoutines.mockClear();

    fakeClock._state.now = 2000;
    useRoutineStore.getState().remove(id);
    const after = useRoutineStore.getState().routines.find((r) => r.id === id);

    // 软删后从存活列表移除
    expect(after).toBeUndefined();
    expect(useRoutineStore.getState().routines).toHaveLength(0);

    // 落盘的对象只改了 deletedAt
    const persisted = fakePersistence.markRoutines.mock.calls[0]![0][0] as Routine;
    expect(persisted.deletedAt).toBe(2000);
    expect(persisted.updatedAt).toBe(before.updatedAt);
    expect(persisted.title).toBe(before.title);
    expect(fakePersistence.hardDeleteRoutineCompletions).not.toHaveBeenCalled();
  });
});

describe('useRoutineStore — 每天独立勾选', () => {
  beforeEach(reset);

  it('toggleDone 在某天创建完成记录，isDone 正确反映（跨天独立）', () => {
    const id = useRoutineStore.getState().add('吃药');
    fakePersistence.markRoutineCompletion.mockClear();
    fakePersistence.scheduleImmediate.mockClear();

    useRoutineStore.getState().toggleDone(id, '2026-10-10');
    expect(useRoutineStore.getState().isDone(id, '2026-10-10')).toBe(true);
    expect(useRoutineStore.getState().isDone(id, '2026-10-11')).toBe(false);
    expect(fakePersistence.markRoutineCompletion).toHaveBeenCalled();
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalled();

    // 再点一次 → 取消
    useRoutineStore.getState().toggleDone(id, '2026-10-10');
    expect(useRoutineStore.getState().isDone(id, '2026-10-10')).toBe(false);
  });

  it('remove 级联删除该模板的全部完成记录', () => {
    const id = useRoutineStore.getState().add('吃药');
    useRoutineStore.getState().toggleDone(id, '2026-10-10');
    useRoutineStore.getState().toggleDone(id, '2026-10-11');
    fakePersistence.hardDeleteRoutineCompletions.mockClear();

    useRoutineStore.getState().remove(id);

    expect(fakePersistence.hardDeleteRoutineCompletions).toHaveBeenCalledTimes(1);
    const removed = fakePersistence.hardDeleteRoutineCompletions.mock.calls[0]![0] as string[];
    expect(removed).toHaveLength(2);
    expect(removed.every((k) => k.startsWith(id))).toBe(true); // key 形如 `${id}@date`
  });
});

describe('useRoutineStore — 加载', () => {
  beforeEach(reset);

  it('loadDate 载入模板与当日完成记录，isDone 正确', async () => {
    const routines: Routine[] = [
      { id: 'r1', title: 'a', sectionId: 'other', order: 1000, createdAt: 1, updatedAt: 1, deletedAt: null },
      { id: 'r2', title: 'b', sectionId: 'other', order: 2000, createdAt: 1, updatedAt: 1, deletedAt: null },
    ];
    const completions: RoutineCompletion[] = [
      { id: 'r1@2026-10-10', routineId: 'r1', date: '2026-10-10', done: true, updatedAt: 1 },
    ];
    fakeRepos.routines.listAlive.mockResolvedValue(routines);
    fakeRepos.routineCompletions.listByDate.mockResolvedValue(completions);

    await useRoutineStore.getState().loadDate('2026-10-10');

    expect(useRoutineStore.getState().routines.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(useRoutineStore.getState().isDone('r1', '2026-10-10')).toBe(true);
    expect(useRoutineStore.getState().isDone('r2', '2026-10-10')).toBe(false);
    expect(useRoutineStore.getState().loading).toBe(false);
  });
});
