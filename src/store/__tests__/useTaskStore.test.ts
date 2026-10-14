import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORDER_STEP, compareByOrder } from '@/domain/constants';

/**
 * `useTaskStore.move` 的换位语义。
 *
 * 背景（真 bug）：`move` 只改了 `order` 字段，而 TasksPage 当时直接按**数组位置**渲染，
 * 于是点「上移 / 下移」页面上纹丝不动（刷新一下反而换了位）。
 * 修复后展示顺序由 `order` 派生，所以这里断言的就是「order 是否真的换了位」——
 * 加上两条容易被忽略的：**边界必须是不落盘的空操作**、
 * **软删的任务不能占掉换位名额**（它不在页面上，却会挤掉一次真实的位移）。
 *
 * bootstrap 整体替换成假实现：验的是 store 自己的编排，不碰 IndexedDB。
 */
const { fakeRepos, fakePersistence, fakeClock, fakeUndoService } = vi.hoisted(() => ({
  fakeRepos: { tasks: { listByDate: vi.fn() } },
  fakePersistence: { markTasks: vi.fn(), scheduleImmediate: vi.fn().mockResolvedValue(undefined) },
  fakeClock: { now: () => 5000 },
  fakeUndoService: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: fakeUndoService,
}));

import { useTaskStore } from '@/store/useTaskStore';
import { makeTask } from '@/services/__tests__/fixtures';

/** 按 `order` 派生的展示顺序 —— TasksPage 就是这么算的 */
function displayIds(): string[] {
  return useTaskStore
    .getState()
    .tasks.filter((t) => t.deletedAt === null)
    .sort(compareByOrder)
    .map((t) => t.id);
}

function reset(tasks: ReturnType<typeof makeTask>[] = []): void {
  useTaskStore.setState({ tasks, loading: false, lastCreatedId: null, pendingUndo: null });
  fakePersistence.markTasks.mockReset();
  fakePersistence.scheduleImmediate.mockReset();
}

const T = (id: string, order: number, extra: Record<string, unknown> = {}) =>
  makeTask({ id, content: id, order, createdAt: order, ...extra });

describe('useTaskStore.move — 相邻换位', () => {
  beforeEach(() => reset());

  it('下移一位：与下一个存活任务互换 order，展示顺序随之变化', () => {
    reset([T('a', ORDER_STEP), T('b', ORDER_STEP * 2), T('c', ORDER_STEP * 3)]);

    useTaskStore.getState().move('a', 1);

    expect(displayIds()).toEqual(['b', 'a', 'c']);
    const byId = new Map(useTaskStore.getState().tasks.map((t) => [t.id, t.order]));
    // 不是「只改被移动的那一条」—— 两条的 order 都要落定，否则会和第三条撞在一起
    expect(byId.get('b')).toBe(ORDER_STEP);
    expect(byId.get('a')).toBe(ORDER_STEP * 2);
    expect(byId.get('c')).toBe(ORDER_STEP * 3);
  });

  it('上移一位：同样只动相邻两条', () => {
    reset([T('a', ORDER_STEP), T('b', ORDER_STEP * 2), T('c', ORDER_STEP * 3)]);

    useTaskStore.getState().move('c', -1);

    expect(displayIds()).toEqual(['a', 'c', 'b']);
  });

  it('换位是离散操作：立即落盘一次', () => {
    reset([T('a', ORDER_STEP), T('b', ORDER_STEP * 2)]);

    useTaskStore.getState().move('a', 1);

    expect(fakePersistence.markTasks).toHaveBeenCalledTimes(1);
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalledTimes(1);
  });
});

describe('useTaskStore.move — 边界是静默空操作（不改数据、不落盘）', () => {
  beforeEach(() => reset());

  it('首行上移：tasks 引用与 order 全部不变，markTasks 未被调用', () => {
    reset([T('a', ORDER_STEP), T('b', ORDER_STEP * 2)]);
    const before = useTaskStore.getState().tasks;

    useTaskStore.getState().move('a', -1);

    expect(useTaskStore.getState().tasks).toBe(before);
    expect(fakePersistence.markTasks).not.toHaveBeenCalled();
  });

  it('末行下移：同样不动', () => {
    reset([T('a', ORDER_STEP), T('b', ORDER_STEP * 2)]);
    const before = useTaskStore.getState().tasks;

    useTaskStore.getState().move('b', 1);

    expect(useTaskStore.getState().tasks).toBe(before);
    expect(fakePersistence.markTasks).not.toHaveBeenCalled();
  });

  it('只有一条任务时上移和下移都是空操作', () => {
    reset([T('only', ORDER_STEP)]);
    const before = useTaskStore.getState().tasks;

    useTaskStore.getState().move('only', -1);
    useTaskStore.getState().move('only', 1);

    expect(useTaskStore.getState().tasks).toBe(before);
    expect(fakePersistence.markTasks).not.toHaveBeenCalled();
  });
});

describe('useTaskStore.move — 软删任务不占换位名额', () => {
  beforeEach(() => reset());

  it('被软删的任务夹在中间时，「下移」跨过的是下一个**存活**任务', () => {
    reset([
      T('a', ORDER_STEP),
      // 已软删、且 order 正好夹在 a 与 b 之间 —— 最容易漏掉的一种排布
      T('dead', Math.floor(ORDER_STEP * 1.5), { deletedAt: 4000 }),
      T('b', ORDER_STEP * 2),
    ]);

    useTaskStore.getState().move('a', 1);

    // 跨过 b（而不是先撞上已经不在页面上的 dead）
    expect(displayIds()).toEqual(['b', 'a']);
  });

  it('软删任务的 order 不被改写 —— 撤销后才能回到原来的名次', () => {
    reset([
      T('a', ORDER_STEP),
      T('dead', Math.floor(ORDER_STEP * 1.5), { deletedAt: 4000 }),
      T('b', ORDER_STEP * 2),
    ]);

    useTaskStore.getState().move('a', 1);

    const dead = useTaskStore.getState().tasks.find((t) => t.id === 'dead')!;
    expect(dead.order).toBe(Math.floor(ORDER_STEP * 1.5));
    expect(dead.deletedAt).toBe(4000);
  });

  it('全部任务都已软删时，任何方向的移动都不改动数据', () => {
    reset([T('a', ORDER_STEP, { deletedAt: 4000 }), T('b', ORDER_STEP * 2, { deletedAt: 4000 })]);
    const before = useTaskStore.getState().tasks;

    useTaskStore.getState().move('a', 1);

    expect(useTaskStore.getState().tasks).toBe(before);
    expect(fakePersistence.markTasks).not.toHaveBeenCalled();
  });
});

describe('useTaskStore.setSection — 改分组', () => {
  beforeEach(() => reset());

  it('写入分组并立即落盘（改分组是一次明确的离散操作）', () => {
    reset([T('a', ORDER_STEP)]);

    useTaskStore.getState().setSection('a', 'work');

    expect(useTaskStore.getState().tasks.find((t) => t.id === 'a')?.sectionId).toBe('work');
    expect(fakePersistence.markTasks).toHaveBeenCalledTimes(1);
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalledTimes(1);
  });

  it('可以改回「其他」', () => {
    reset([T('a', ORDER_STEP, { sectionId: 'work' })]);

    useTaskStore.getState().setSection('a', 'other');

    expect(useTaskStore.getState().tasks.find((t) => t.id === 'a')?.sectionId).toBe('other');
  });
});

/*
  分组**不影响**换位：任务页是单一列表平铺渲染的，分组只是每行的一个属性（色点），
  不是分段容器。若换位被限制在组内，用户按「下移」会毫无反应 ——
  而列表上明明下面还有一行，那看起来就像按钮坏了。
*/
describe('useTaskStore.move — 分组不参与换位判断', () => {
  beforeEach(() => reset());

  it('相邻两条分组不同也能互换（列表是平铺的，名次与分组无关）', () => {
    reset([
      T('a', ORDER_STEP, { sectionId: 'work' }),
      T('b', ORDER_STEP * 2, { sectionId: 'life' }),
    ]);

    useTaskStore.getState().move('a', 1);

    expect(displayIds()).toEqual(['b', 'a']);
  });

  it('换位后各行的分组属性原样保留', () => {
    reset([
      T('a', ORDER_STEP, { sectionId: 'work' }),
      T('b', ORDER_STEP * 2, { sectionId: 'life' }),
    ]);

    useTaskStore.getState().move('a', 1);

    expect(useTaskStore.getState().tasks.find((t) => t.id === 'a')?.sectionId).toBe('work');
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'b')?.sectionId).toBe('life');
  });

  it('中间那条能跨过分组边界下移（列表是平铺的，它下面就是「下一行」）', () => {
    reset([
      T('a', ORDER_STEP, { sectionId: 'work' }),
      T('b', ORDER_STEP * 2, { sectionId: 'work' }),
      T('c', ORDER_STEP * 3, { sectionId: 'life' }),
    ]);

    useTaskStore.getState().move('b', 1);

    expect(displayIds()).toEqual(['a', 'c', 'b']);
  });

  it('末行下移是空操作（边界是整条列表的末行，不是「同组最后一个」）', () => {
    reset([
      T('a', ORDER_STEP, { sectionId: 'work' }),
      T('b', ORDER_STEP * 2, { sectionId: 'work' }),
      T('c', ORDER_STEP * 3, { sectionId: 'life' }),
    ]);
    const before = useTaskStore.getState().tasks;

    useTaskStore.getState().move('c', 1);

    expect(useTaskStore.getState().tasks).toBe(before);
    expect(fakePersistence.markTasks).not.toHaveBeenCalled();
  });
});
