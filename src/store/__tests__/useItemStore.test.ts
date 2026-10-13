import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORDER_STEP } from '@/domain/constants';

/**
 * useItemStore.addSibling 的编排验证（内联快速添加）。
 *
 * `bootstrap`（repos / persistence / clock / undoService）被整体替换成假实现，
 * 验的是 store 自己的逻辑：第四参 title 透传、追加到顶层末尾、一次 commit 一条。
 */
const { fakeRepos, fakePersistence, fakeClock, fakeUndoService } = vi.hoisted(() => ({
  fakeRepos: { items: { listByDate: vi.fn() } },
  fakePersistence: { markItems: vi.fn(), scheduleImmediate: vi.fn() },
  fakeClock: { now: () => 5000 },
  fakeUndoService: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: fakeUndoService,
}));

import { useItemStore } from '@/store/useItemStore';
import { makeItem } from '@/services/__tests__/fixtures';

function reset(items: ReturnType<typeof makeItem>[] = []): void {
  useItemStore.setState({ items, lastCreatedId: null, pendingUndo: null, loading: false });
  fakePersistence.markItems.mockReset();
  fakePersistence.scheduleImmediate.mockReset();
}

describe('useItemStore.addSibling — 内联快速添加带标题', () => {
  beforeEach(() => reset());

  it('第四参传标题：新建 1 条，title/parentId/level/sectionId 正确且追加到该板块顶层末尾', () => {
    const date = '2026-10-10';
    reset([
      makeItem({ id: 'w1', sectionId: 'work', order: 1000 }),
      makeItem({ id: 'w2', sectionId: 'work', order: 2000 }),
    ]);

    const newId = useItemStore.getState().addSibling(null, date, 'work', '写周报');

    expect(newId).toBeTruthy();
    const items = useItemStore.getState().items;
    // 恰好新增 1 条 —— 绝不是「先建空条目再 setTitle」产出的两条
    expect(items).toHaveLength(3);
    const created = items.find((i) => i.id === newId)!;
    expect(created.title).toBe('写周报');
    expect(created.parentId).toBeNull();
    expect(created.level).toBe(0);
    expect(created.sectionId).toBe('work');
    expect(created.date).toBe(date);
    expect(created.deletedAt).toBeNull();
    // 追加在末尾：order = 该板块原顶层最大 order + STEP
    expect(created.order).toBe(2000 + ORDER_STEP);
    expect(created.order).toBeGreaterThan(2000);
  });

  it('不传第四参：向后兼容，仍创建 title==="" 的条目（useTreeEditor 三参调用不受影响）', () => {
    const newId = useItemStore.getState().addSibling(null, '2026-10-10', 'study');

    const created = useItemStore.getState().items.find((i) => i.id === newId)!;
    expect(created.title).toBe('');
    expect(created.sectionId).toBe('study');
    expect(created.parentId).toBeNull();
  });

  it('一次 commit：只标记新建的那条，markItems/scheduleImmediate 各调用一次', () => {
    reset([makeItem({ id: 'w1', sectionId: 'work', order: 1000 })]);

    const newId = useItemStore.getState().addSibling(null, '2026-10-10', 'work', '写周报');

    expect(fakePersistence.markItems).toHaveBeenCalledTimes(1);
    const touched = fakePersistence.markItems.mock.calls[0]?.[0] as { id: string }[];
    expect(touched.map((t) => t.id)).toEqual([newId]);
    expect(fakePersistence.scheduleImmediate).toHaveBeenCalledTimes(1);
  });
});
