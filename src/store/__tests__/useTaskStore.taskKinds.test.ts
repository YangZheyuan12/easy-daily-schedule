import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORDER_STEP } from '@/domain/constants';

/**
 * 任务 store 的「多类型」扩展：期限任务 / 长时目标的增删改，
 * 以及「move 只重排每日任务、不碰跨日期持久任务」。
 *
 * bootstrap 整体替换成假实现：验的是 store 自己的编排，不碰 IndexedDB。
 */
const { fakeRepos, fakePersistence, fakeClock } = vi.hoisted(() => ({
  fakeRepos: { tasks: { listByDate: vi.fn() } },
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

function reset(tasks: ReturnType<typeof makeTask>[] = []): void {
  useTaskStore.setState({ tasks, loading: false, lastCreatedId: null, pendingUndo: null });
  fakePersistence.markTasks.mockReset();
  fakePersistence.scheduleImmediate.mockReset();
}

const D = (id: string, order: number, extra: Record<string, unknown> = {}) =>
  makeTask({ id, content: id, order, createdAt: order, ...extra });

describe('useTaskStore — 期限任务 / 长时目标 新增', () => {
  beforeEach(() => reset());

  it('addDeadline 写入带截止日期的期限任务并立即落盘', () => {
    const id = useTaskStore.getState().addDeadline('2026-10-15', {
      content: '交报告',
      description: '初稿',
      dueDate: '2026-10-20',
    });

    const task = useTaskStore.getState().tasks.find((t) => t.id === id);
    expect(task?.kind).toBe('deadline');
    expect(task?.dueDate).toBe('2026-10-20');
    expect(task?.description).toBe('初稿');
    expect(task?.done).toBe(false);
    expect(fakePersistence.markTasks).toHaveBeenCalledTimes(1);
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalledTimes(1);
  });

  it('addDeadline 支持抽象期限（如一周内）', () => {
    const id = useTaskStore.getState().addDeadline('2026-10-15', {
      content: '回邮件',
      relative: '1w',
    });
    const task = useTaskStore.getState().tasks.find((t) => t.id === id);
    expect(task?.dueRelative).toBe('1w');
    expect(task?.dueDate).toBeUndefined();
  });

  it('addGoal 写入无期限的长时目标', () => {
    const id = useTaskStore.getState().addGoal('2026-10-15', {
      content: '学会游泳',
      description: '每周两次',
    });
    const task = useTaskStore.getState().tasks.find((t) => t.id === id);
    expect(task?.kind).toBe('goal');
    expect(task?.dueDate).toBeUndefined();
    expect(task?.dueRelative).toBeUndefined();
    expect(task?.description).toBe('每周两次');
  });
});

describe('useTaskStore — 期限任务的期限编辑', () => {
  beforeEach(() => reset());

  it('setDue 从具体日期改为抽象期限', () => {
    const id = useTaskStore.getState().addDeadline('2026-10-15', { content: 'x', dueDate: '2026-10-20' });
    expect(id).not.toBeNull();
    useTaskStore.getState().setDue(id!, { relative: '3d' });

    const task = useTaskStore.getState().tasks.find((t) => t.id === id);
    expect(task?.dueRelative).toBe('3d');
    expect(task?.dueDate).toBeUndefined();
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalled();
  });
});

describe('useTaskStore — 描述编辑走防抖', () => {
  beforeEach(() => reset());

  it('setDescription 写库但不在离散操作路径立即 flush', () => {
    const id = useTaskStore.getState().add('2026-10-15', '日常');
    expect(id).not.toBeNull();
    fakePersistence.markTasks.mockReset();
    fakePersistence.scheduleImmediate.mockReset();

    useTaskStore.getState().setDescription(id!, '一些备注');

    expect(useTaskStore.getState().tasks.find((t) => t.id === id)?.description).toBe('一些备注');
    expect(fakePersistence.markTasks).toHaveBeenCalledTimes(1);
    expect(fakePersistence.scheduleImmediate).not.toHaveBeenCalled();
  });
});

describe('useTaskStore.move — 只重排每日任务，不碰期限/目标', () => {
  beforeEach(() => reset());

  it('每日任务下移只与另一条每日任务互换，期限任务的 order 原样保留', () => {
    reset([
      D('a', ORDER_STEP, { kind: 'daily' }),
      D('d', ORDER_STEP * 2, { kind: 'deadline', dueDate: '2026-10-20' }),
      D('b', ORDER_STEP * 3, { kind: 'daily' }),
    ]);

    useTaskStore.getState().move('a', 1);

    const byId = new Map(useTaskStore.getState().tasks.map((t) => [t.id, t.order]));
    // a 与 b 互换（它们都是每日任务）
    expect(byId.get('a')).toBe(ORDER_STEP * 2);
    expect(byId.get('b')).toBe(ORDER_STEP);
    // 期限任务 d 的 order 完全没动
    expect(byId.get('d')).toBe(ORDER_STEP * 2);
  });

  it('对期限任务调用 move 是静默空操作', () => {
    reset([D('d', ORDER_STEP, { kind: 'deadline', dueDate: '2026-10-20' })]);
    const before = useTaskStore.getState().tasks;

    useTaskStore.getState().move('d', 1);

    expect(useTaskStore.getState().tasks).toBe(before);
    expect(fakePersistence.markTasks).not.toHaveBeenCalled();
  });
});
