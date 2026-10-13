import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Inspiration } from '@/domain/types';
import { ORDER_STEP } from '@/domain/constants';

/**
 * useInspirationStore 的编排验证（QA）。
 *
 * `bootstrap`（repos / persistence / clock）被整体替换成假实现，
 * 验的是 store 自己的逻辑：新增排序 / 编辑 / 软删红线（只改 deletedAt）/ 落盘调用。
 */
const { fakeRepos, fakePersistence, fakeClock } = vi.hoisted(() => {
  const state = { now: 1000 };
  return {
    fakeRepos: {
      inspirations: { listByDate: vi.fn() },
    },
    fakePersistence: {
      markInspiration: vi.fn(),
      scheduleImmediate: vi.fn(),
    },
    fakeClock: { now: () => state.now, _state: state },
  };
});

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
}));

import { useInspirationStore } from '@/store/useInspirationStore';
import { makeInspiration } from '@/services/__tests__/fixtures';

function reset(): void {
  useInspirationStore.setState({ date: '', inspirations: [], loading: false });
  fakeRepos.inspirations.listByDate.mockReset();
  fakePersistence.markInspiration.mockReset();
  fakePersistence.scheduleImmediate.mockReset();
  fakeClock._state.now = 1000;
}

describe('useInspirationStore — 新增与排序', () => {
  beforeEach(reset);

  it('add 生成完整灵感，按 order 排序，并立即落盘', () => {
    const id = useInspirationStore.getState().add('2026-10-10', '锻炼');

    expect(id).toBeTruthy();
    const rows = useInspirationStore.getState().inspirations;
    expect(rows).toHaveLength(1);
    const created = rows[0]!;
    expect(created.id).toBe(id);
    expect(created.content).toBe('锻炼');
    expect(created.order).toBe(ORDER_STEP);
    expect(created.deletedAt).toBeNull();
    expect(created.createdAt).toBe(1000);
    expect(created.updatedAt).toBe(1000);

    // 立即落盘：markInspiration + scheduleImmediate
    expect(fakePersistence.markInspiration).toHaveBeenCalledWith(created);
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalled();
  });

  it('连续新增：order 在最大 order 之上累加 STEP', () => {
    useInspirationStore.getState().add('2026-10-10', 'a');
    useInspirationStore.getState().add('2026-10-10', 'b');

    const orders = useInspirationStore.getState().inspirations.map((r) => r.order);
    expect(orders).toEqual([ORDER_STEP, ORDER_STEP * 2]);
  });
});

describe('useInspirationStore — 编辑与软删红线', () => {
  beforeEach(reset);

  it('update 合并新内容并刷新 updatedAt', () => {
    const id = useInspirationStore.getState().add('2026-10-10', '旧');

    useInspirationStore.getState().update(id, '新');
    const row = useInspirationStore.getState().inspirations.find((r) => r.id === id)!;
    expect(row.content).toBe('新');
    expect(row.updatedAt).toBe(1000);
  });

  it('remove 只改 deletedAt（架构红线），updatedAt / content 一律不动', () => {
    const id = useInspirationStore.getState().add('2026-10-10', 'x');
    const before = useInspirationStore.getState().inspirations.find((r) => r.id === id)!;
    fakePersistence.markInspiration.mockClear();

    // 时钟推进：若 remove 顺手刷了 updatedAt，下面这条断言必定红（冻结时钟下测不出来）
    fakeClock._state.now = 2000;
    useInspirationStore.getState().remove(id);
    const after = useInspirationStore.getState().inspirations.find((r) => r.id === id)!;

    expect(after.deletedAt).toBe(2000); // 软删时间戳
    // 红线：除 deletedAt 外其余字段原样保留（撤销要能完整恢复）
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.content).toBe(before.content);
    expect(after.order).toBe(before.order);
    // 内存里仍保留（UI 用 deletedAt===null 过滤隐藏）
    expect(useInspirationStore.getState().inspirations).toHaveLength(1);
    // 仍然走 markInspiration 落盘（不是裸 set）
    expect(fakePersistence.markInspiration).toHaveBeenCalledWith(after);
  });
});

describe('useInspirationStore — 加载', () => {
  beforeEach(reset);

  it('loadDate 调用 repos 并按 order 排序载入', async () => {
    const data: Inspiration[] = [
      makeInspiration({ id: 'b', order: 2000 }),
      makeInspiration({ id: 'a', order: 1000 }),
    ];
    fakeRepos.inspirations.listByDate.mockResolvedValue(data);

    await useInspirationStore.getState().loadDate('2026-10-10');

    const rows = useInspirationStore.getState().inspirations;
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(useInspirationStore.getState().date).toBe('2026-10-10');
    expect(useInspirationStore.getState().loading).toBe(false);
  });
});
