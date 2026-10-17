import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORDER_STEP } from '@/domain/constants';

/**
 * 拖拽排序的落盘：`reorderIds`。
 *
 * 这里验的契约决定了列表 UI 展示的顺序能不能稳定下来：
 * 1. 传入的序列就是**最终序列** —— 第 i 个 id 拿到 `(i+1) * ORDER_STEP`；
 * 2. 序列外的任务（别的种类 / 软删的）不被波及；
 * 3. 整批只重写一次，并立即 flush（松手即所见，App 被回收也不丢）。
 */
const { fakeRepos, fakePersistence, fakeClock } = vi.hoisted(() => ({
  fakeRepos: { tasks: { listByDate: vi.fn(), listAll: vi.fn().mockResolvedValue([]) } },
  fakePersistence: { markTasks: vi.fn(), scheduleImmediate: vi.fn().mockResolvedValue(undefined) },
  fakeClock: { now: () => 5000 },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

import { useTaskStore } from '@/store/useTaskStore';
import { makeTask } from '@/services/__tests__/fixtures';

const D = (id: string, order: number, extra: Record<string, unknown> = {}) =>
  makeTask({ id, content: id, order, createdAt: order, ...extra });

function reset(tasks: ReturnType<typeof makeTask>[] = []): void {
  useTaskStore.setState({ tasks, loading: false, lastCreatedId: null, pendingUndo: null });
  fakePersistence.markTasks.mockReset();
  fakePersistence.scheduleImmediate.mockReset();
}

describe('useTaskStore.reorderIds — 拖拽排序落盘', () => {
  beforeEach(() => reset());

  it('按传入序列重写 order（第一个拿到最小刻度）', () => {
    reset([D('a', ORDER_STEP), D('b', ORDER_STEP * 2), D('c', ORDER_STEP * 3)]);

    useTaskStore.getState().reorderIds(['c', 'a', 'b']);

    const byId = new Map(useTaskStore.getState().tasks.map((t) => [t.id, t.order]));
    expect(byId.get('c')).toBe(ORDER_STEP);
    expect(byId.get('a')).toBe(ORDER_STEP * 2);
    expect(byId.get('b')).toBe(ORDER_STEP * 3);
  });

  it('序列之外的任务不被波及（期限任务 / 已软删的都留在原地）', () => {
    reset([
      D('a', ORDER_STEP),
      D('b', ORDER_STEP * 2),
      D('goal', ORDER_STEP * 4, { kind: 'goal' }),
    ]);

    useTaskStore.getState().reorderIds(['b', 'a']);

    const byId = new Map(useTaskStore.getState().tasks.map((t) => [t.id, t.order]));
    expect(byId.get('b')).toBe(ORDER_STEP);
    expect(byId.get('a')).toBe(ORDER_STEP * 2);
    expect(byId.get('goal')).toBe(ORDER_STEP * 4);
  });

  it('立即落盘：松手那一刻就必须写完（App 被回收也不丢顺序）', () => {
    reset([D('a', ORDER_STEP), D('b', ORDER_STEP * 2)]);

    useTaskStore.getState().reorderIds(['b', 'a']);

    expect(fakePersistence.markTasks).toHaveBeenCalledTimes(1);
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalledTimes(1);
  });

  it('少于两条不落盘（拖了又放回原地不算一次修改）', () => {
    reset([D('a', ORDER_STEP)]);

    useTaskStore.getState().reorderIds(['a']);

    expect(fakePersistence.markTasks).not.toHaveBeenCalled();
  });

  it('顺序没变时不改写记录（避免无谓的写放大）', () => {
    reset([D('a', ORDER_STEP), D('b', ORDER_STEP * 2)]);
    const before = useTaskStore.getState().tasks;

    // 传入的序列与现状一致 → order 一个都没变 → 每条记录仍是原对象
    useTaskStore.getState().reorderIds(['a', 'b']);

    const after = useTaskStore.getState().tasks;
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});
