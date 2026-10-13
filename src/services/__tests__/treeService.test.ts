import { describe, expect, it } from 'vitest';
import {
  buildVisibleRows,
  collectSubtreeIds,
  createChild,
  createSiblingAfter,
  indent,
  moveWithinSiblings,
  nextOrder,
  outdent,
  reindexSiblings,
  restoreSubtree,
  softDeleteSubtree,
  toggleDone,
} from '../treeService';
import { createFixedClock } from '../clock';
import { makeItem } from './fixtures';

const clock = createFixedClock(5000);

/** 构造一棵简单树： a(顶层) ─ b(顶层) ─┬ b1 ─ b11 */
function sampleTree() {
  return [
    makeItem({ id: 'a', order: 1000 }),
    makeItem({ id: 'b', order: 2000 }),
    makeItem({ id: 'b1', parentId: 'b', level: 1, order: 1000 }),
    makeItem({ id: 'b11', parentId: 'b1', level: 2, order: 1000 }),
  ];
}

describe('buildVisibleRows', () => {
  it('按层级展开，depth 与 hasChildren 正确', () => {
    const rows = buildVisibleRows(sampleTree());
    expect(rows.map((r) => [r.item.id, r.depth])).toEqual([
      ['a', 0],
      ['b', 0],
      ['b1', 1],
      ['b11', 2],
    ]);
    expect(rows[1]?.hasChildren).toBe(true);
    expect(rows[3]?.hasChildren).toBe(false);
  });

  it('父条目折叠时，其子树不再出现在可见行中', () => {
    const items = sampleTree().map((i) => (i.id === 'b' ? { ...i, collapsed: true } : i));
    const rows = buildVisibleRows(items);
    expect(rows.map((r) => r.item.id)).toEqual(['a', 'b']);
  });

  it('折叠的条目带子项数量徽标', () => {
    const items = sampleTree().map((i) => (i.id === 'b' ? { ...i, collapsed: true } : i));
    const bRow = buildVisibleRows(items).find((r) => r.item.id === 'b');
    expect(bRow?.descendantCount).toBe(2);
  });

  it('父条目展示直系子项完成情况', () => {
    const items = sampleTree().map((i) => (i.id === 'b1' ? { ...i, done: true } : i));
    const bRow = buildVisibleRows(items).find((r) => r.item.id === 'b');
    expect(bRow?.childrenProgress).toEqual({ done: 1, total: 1 });
  });
});

describe('createSiblingAfter', () => {
  it('顶层末尾追加', () => {
    const { items, newId } = createSiblingAfter(sampleTree(), 'a', { date: '2026-10-10', sectionId: 'work', title: 'x' }, clock);
    const created = items.find((i) => i.id === newId);
    expect(created?.parentId).toBeNull();
    expect(created?.order).toBeGreaterThan(1000);
    expect(created?.level).toBe(0);
  });

  it('插入到两个同级之间时取中点 order', () => {
    const items0 = [makeItem({ id: 'p', order: 1000 }), makeItem({ id: 'q', order: 2000 })];
    const { items, newId } = createSiblingAfter(items0, 'p', { date: '2026-10-10', sectionId: 'work', title: 'x' }, clock);
    const created = items.find((i) => i.id === newId);
    expect(created?.order).toBe(1500);
  });

  it('afterId 为 null 时插到顶层末尾', () => {
    const { items, newId } = createSiblingAfter(sampleTree(), null, { date: '2026-10-10', sectionId: 'work', title: 'x' }, clock);
    const created = items.find((i) => i.id === newId);
    expect(created?.parentId).toBeNull();
    expect(created?.order).toBe(3000);
  });
});

describe('createChild', () => {
  it('子条目 level 为父 +1，且父节点自动展开', () => {
    const collapsed = sampleTree().map((i) => (i.id === 'b' ? { ...i, collapsed: true } : i));
    const { items, newId } = createChild(collapsed, 'b', { date: '2026-10-10', sectionId: 'work', title: 'x' }, clock);
    const created = items.find((i) => i.id === newId);
    expect(created?.parentId).toBe('b');
    expect(created?.level).toBe(1);
    expect(items.find((i) => i.id === 'b')?.collapsed).toBe(false);
  });
});

describe('indent (Tab 降级)', () => {
  it('挂到上一个同级兄弟之下', () => {
    const { items, touched } = indent(sampleTree(), 'b', clock);
    const b = items.find((i) => i.id === 'b');
    expect(b?.parentId).toBe('a');
    expect(b?.level).toBe(1);
    expect(touched).toContain('b');
  });

  it('子树 level 随之下移一级', () => {
    const { items } = indent(sampleTree(), 'b', clock);
    expect(items.find((i) => i.id === 'b1')?.level).toBe(2);
    expect(items.find((i) => i.id === 'b11')?.level).toBe(3);
  });

  it('同层第一条没有前驱兄弟时原样返回', () => {
    const tree = sampleTree();
    const { items, touched } = indent(tree, 'a', clock);
    expect(items).toEqual(tree);
    expect(touched).toEqual([]);
  });

  it('前驱兄弟处于折叠态时自动展开，避免目标行消失', () => {
    const tree = sampleTree().map((i) => (i.id === 'a' ? { ...i, collapsed: true } : i));
    const { items } = indent(tree, 'b', clock);
    expect(items.find((i) => i.id === 'a')?.collapsed).toBe(false);
  });
});

describe('outdent (Shift+Tab 升级)', () => {
  it('挂到父节点的父节点下', () => {
    const { items } = outdent(sampleTree(), 'b1', clock);
    const b1 = items.find((i) => i.id === 'b1');
    expect(b1?.parentId).toBeNull();
    expect(b1?.level).toBe(0);
  });

  it('子树 level 随之上移一级', () => {
    const { items } = outdent(sampleTree(), 'b1', clock);
    expect(items.find((i) => i.id === 'b11')?.level).toBe(1);
  });

  it('顶层条目再升级时原样返回（不越界）', () => {
    const tree = sampleTree();
    const { items, touched } = outdent(tree, 'a', clock);
    expect(items).toEqual(tree);
    expect(touched).toEqual([]);
  });
});

describe('moveWithinSiblings', () => {
  it('同层内上移 / 下移', () => {
    const tree = [makeItem({ id: 'x', order: 1000 }), makeItem({ id: 'y', order: 2000 })];
    const down = moveWithinSiblings(tree, 'x', 1);
    expect(down.items.find((i) => i.id === 'x')?.order).toBeGreaterThan(
      down.items.find((i) => i.id === 'y')?.order ?? 0,
    );
  });

  it('已在边界时原样返回', () => {
    const tree = [makeItem({ id: 'x', order: 1000 }), makeItem({ id: 'y', order: 2000 })];
    expect(moveWithinSiblings(tree, 'x', -1).items).toEqual(tree);
    expect(moveWithinSiblings(tree, 'y', 1).items).toEqual(tree);
  });
});

describe('order 精度', () => {
  it('相邻 order 差 <= 1 时插入前先整层重排，保证中点落在缝隙里', () => {
    const tree = [makeItem({ id: 'p', order: 1000 }), makeItem({ id: 'q', order: 1001 })];
    const { items, newId } = createSiblingAfter(tree, 'p', { date: '2026-10-10', sectionId: 'work', title: 'x' }, clock);
    // 若不重排，中点 (1000+1001)/2 取整后仍是 1000，会与 p 撞车；
    // 重排后 p=1000、q=2000，新条目取到 1500。
    expect(items.find((i) => i.id === 'p')?.order).toBe(1000);
    expect(items.find((i) => i.id === 'q')?.order).toBe(2000);
    expect(items.find((i) => i.id === newId)?.order).toBe(1500);
  });

  it('reindexSiblings 把同层重排为整齐步长', () => {
    const tree = [
      makeItem({ id: 'a', order: 3 }),
      makeItem({ id: 'b', order: 7 }),
      makeItem({ id: 'c', order: 99 }),
    ];
    const { items } = reindexSiblings(tree, null);
    expect(items.map((i) => i.order)).toEqual([1000, 2000, 3000]);
  });

  it('nextOrder 在空层返回首个步长', () => {
    expect(nextOrder([], null)).toBe(1000);
  });
});

describe('软删与撤销', () => {
  it('collectSubtreeIds 返回整棵子树', () => {
    expect(collectSubtreeIds(sampleTree(), 'b').sort()).toEqual(['b', 'b1', 'b11']);
  });

  it('软删只改 deletedAt，其余字段一字不动', () => {
    const tree = sampleTree();
    const before = tree.find((i) => i.id === 'b1');
    const { items } = softDeleteSubtree(tree, 'b', clock);
    const after = items.find((i) => i.id === 'b1');
    expect(after?.deletedAt).toBe(5000);
    expect(after?.parentId).toBe(before?.parentId);
    expect(after?.order).toBe(before?.order);
    expect(after?.level).toBe(before?.level);
    expect(after?.collapsed).toBe(before?.collapsed);
    expect(after?.done).toBe(before?.done);
  });

  it('软删后子树不再出现在可见行中', () => {
    const { items } = softDeleteSubtree(sampleTree(), 'b', clock);
    expect(buildVisibleRows(items).map((r) => r.item.id)).toEqual(['a']);
  });

  it('撤销恢复后层级 / 顺序 / 折叠态完整还原', () => {
    const tree = sampleTree().map((i) => (i.id === 'b1' ? { ...i, collapsed: true, done: true } : i));
    const { items: deleted } = softDeleteSubtree(tree, 'b', clock);
    const { items: restored } = restoreSubtree(deleted, ['b', 'b1', 'b11']);
    const b1 = restored.find((i) => i.id === 'b1');
    expect(b1?.deletedAt).toBeNull();
    expect(b1?.collapsed).toBe(true);
    expect(b1?.done).toBe(true);
    expect(b1?.level).toBe(1);
    expect(restored.find((i) => i.id === 'b11')?.parentId).toBe('b1');
  });
});

describe('toggleDone', () => {
  it('只改自身，不联动子项', () => {
    const { items } = toggleDone(sampleTree(), 'b', clock);
    expect(items.find((i) => i.id === 'b')?.done).toBe(true);
    expect(items.find((i) => i.id === 'b1')?.done).toBe(false);
  });

  it('可反复切换', () => {
    const once = toggleDone(sampleTree(), 'b', clock);
    const twice = toggleDone(once.items, 'b', clock);
    expect(twice.items.find((i) => i.id === 'b')?.done).toBe(false);
  });
});
