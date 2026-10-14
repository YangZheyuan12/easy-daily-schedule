import { MAX_LEVEL, ORDER_STEP } from '@/domain/constants';
import { DomainError } from '@/domain/errors';
import type { Item } from '@/domain/types';
import type { VisibleRow } from '@/domain/types';
import { newItemId } from './idService';
import type { Clock } from './clock';

/**
 * 树形操作内核（纯函数）。
 *
 * 设计约定：
 * - 入参是「某板块下的全部活条目」的扁平数组，返回**新的**数组，绝不原地修改。
 * - 树的形态完全由 `parentId` 决定；`level` 是派生冗余字段，每次操作后同步维护。
 * - `order` 是同层排序值，步长 1000，支持中点插入（`(prev + next) / 2`）；
 *   精度耗尽时才整层重排。
 * - 所有函数都不会抛「用户可感知」的异常：非法操作（如顶层条目执行 Shift+Tab）
 *   返回原数组，由 UI 静默处理，避免打断连续录入。
 */

export interface TreeMutation {
  /** 操作后的完整条目数组 */
  items: Item[];
  /** 本次被修改的条目 id（供持久化做增量写入） */
  touched: string[];
}

export interface CreateResult extends TreeMutation {
  /** 新建条目的 id，供 UI 立即聚焦 */
  newId: string;
}

/* ------------------------------------------------------------------ */
/* 内部辅助                                                             */
/* ------------------------------------------------------------------ */

type ParentKey = string | null;

function aliveOnly(items: readonly Item[]): Item[] {
  return items.filter((i) => i.deletedAt === null);
}

/** 按 parentId 分组，组内按 order 升序 */
export function groupChildren(items: readonly Item[]): Map<ParentKey, Item[]> {
  const map = new Map<ParentKey, Item[]>();
  for (const item of aliveOnly(items)) {
    const bucket = map.get(item.parentId);
    if (bucket) bucket.push(item);
    else map.set(item.parentId, [item]);
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }
  return map;
}

export function sortByOrder(items: readonly Item[]): Item[] {
  return aliveOnly(items).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

function maxOrderOf(children: readonly Item[]): number {
  return children.reduce((max, item) => Math.max(max, item.order), 0);
}

/** 在 parentId 下追加到末尾时应取的 order */
export function nextOrder(items: readonly Item[], parentId: ParentKey): number {
  const children = groupChildren(items).get(parentId) ?? [];
  return children.length === 0 ? ORDER_STEP : maxOrderOf(children) + ORDER_STEP;
}

/** 整层重排为 (i+1) * ORDER_STEP */
export function reindexSiblings(items: readonly Item[], parentId: ParentKey): TreeMutation {
  const children = groupChildren(items).get(parentId) ?? [];
  const orderById = new Map<string, number>();
  children.forEach((child, index) => orderById.set(child.id, (index + 1) * ORDER_STEP));

  const touched: string[] = [];
  const next = items.map((item) => {
    const order = orderById.get(item.id);
    if (order === undefined || order === item.order) return item;
    touched.push(item.id);
    return { ...item, order };
  });
  return { items: next, touched };
}

/** 递归收集某条目的全部后代 id（含自身） */
export function collectSubtreeIds(items: readonly Item[], rootId: string): string[] {
  const childrenOf = groupChildren(items);
  const result: string[] = [];
  const walk = (id: string) => {
    result.push(id);
    for (const child of childrenOf.get(id) ?? []) walk(child.id);
  };
  walk(rootId);
  return result;
}

/** 统计后代数量（不含自身） */
export function countDescendants(items: readonly Item[], rootId: string): number {
  return collectSubtreeIds(items, rootId).length - 1;
}

/**
 * 把某条目的**后代**（不含自身）整体提升 / 降低 delta 个层级。
 * 自身层级由调用方单独设定，避免被重复加减。
 */
function shiftDescendantLevels(items: Item[], rootId: string, delta: number): string[] {
  const ids = new Set(collectSubtreeIds(items, rootId));
  ids.delete(rootId);
  if (delta === 0) return [];
  const touched: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || !ids.has(item.id)) continue;
    items[i] = { ...item, level: Math.max(0, item.level + delta) };
    touched.push(item.id);
  }
  return touched;
}

function findIndexById(items: readonly Item[], id: string): number {
  return items.findIndex((item) => item.id === id);
}

function requireItem(items: readonly Item[], id: string): Item {
  const item = items.find((i) => i.id === id);
  if (!item) throw new DomainError(`条目不存在: ${id}`);
  return item;
}

/* ------------------------------------------------------------------ */
/* 渲染视图                                                             */
/* ------------------------------------------------------------------ */

/**
 * 把扁平数组展开成可直接渲染的行。
 * 折叠的条目不会展开其子树；`depth` 用于渲染缩进，`ancestorIds` 用于定位。
 */
export function buildVisibleRows(items: readonly Item[]): VisibleRow[] {
  const childrenOf = groupChildren(items);
  const rows: VisibleRow[] = [];

  const walk = (parentId: ParentKey, depth: number, ancestors: string[]) => {
    for (const item of childrenOf.get(parentId) ?? []) {
      const directChildren = childrenOf.get(item.id) ?? [];
      rows.push({
        item,
        depth,
        hasChildren: directChildren.length > 0,
        descendantCount: countDescendants(items, item.id),
        childrenProgress:
          directChildren.length > 0
            ? {
                done: directChildren.filter((c) => c.done).length,
                total: directChildren.length,
              }
            : null,
        ancestorIds: ancestors,
      });
      if (!item.collapsed) {
        walk(item.id, depth + 1, [...ancestors, item.id]);
      }
    }
  };

  walk(null, 0, []);
  return rows;
}

/** 某条目的祖先链（由浅到深），不包含自身 */
export function ancestorIdsOf(items: readonly Item[], id: string): string[] {
  const byId = new Map(aliveOnly(items).map((item) => [item.id, item]));
  const chain: string[] = [];
  let cursor = byId.get(id)?.parentId ?? null;
  const guard = new Set<string>();
  while (cursor !== null && !guard.has(cursor)) {
    guard.add(cursor);
    chain.unshift(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return chain;
}

/* ------------------------------------------------------------------ */
/* 增删改                                                               */
/* ------------------------------------------------------------------ */

/** 在 afterId 之后插入一个同级新条目；afterId 为 null 时插到顶层末尾 */
export function createSiblingAfter(
  items: readonly Item[],
  afterId: string | null,
  draft: { date: string; sectionId: Item['sectionId']; title: string },
  clock: Clock,
): CreateResult {
  const list = [...items];
  const now = clock.now();
  const newId = newItemId();

  let parentId: ParentKey = null;
  let level = 0;
  let order: number;

  if (afterId === null) {
    order = nextOrder(list, null);
  } else {
    const anchor = requireItem(list, afterId);
    parentId = anchor.parentId;
    level = anchor.level;
    const siblings = groupChildren(list).get(parentId) ?? [];
    const index = siblings.findIndex((s) => s.id === afterId);
    const nextSibling = siblings[index + 1];
    if (nextSibling) {
      const gap = nextSibling.order - anchor.order;
      // 精度耗尽：先整层重排，再取中点
      if (gap <= 1) {
        const reindexed = reindexSiblings(list, parentId);
        return createSiblingAfter(reindexed.items, afterId, draft, clock);
      }
      order = Math.floor((anchor.order + nextSibling.order) / 2);
    } else {
      order = anchor.order + ORDER_STEP;
    }
  }

  const created: Item = {
    id: newId,
    date: draft.date,
    sectionId: draft.sectionId,
    parentId,
    title: draft.title,
    level,
    order,
    done: false,
    collapsed: false,
    description: '',
    rating: 0,
    review: '',
    createdAt: now,
    updatedAt: now,
    sourceTaskId: null,
    deletedAt: null,
  };

  return { items: [...list, created], touched: [newId], newId };
}

/** 在 parentId 下追加一个子条目（parentId 为 null 即顶层） */
export function createChild(
  items: readonly Item[],
  parentId: ParentKey,
  draft: { date: string; sectionId: Item['sectionId']; title: string },
  clock: Clock,
): CreateResult {
  const list = [...items];
  const now = clock.now();
  const newId = newItemId();
  let level = 0;
  if (parentId !== null) {
    const parent = requireItem(list, parentId);
    level = parent.level + 1;
  }

  const created: Item = {
    id: newId,
    date: draft.date,
    sectionId: draft.sectionId,
    parentId,
    title: draft.title,
    level,
    order: nextOrder(list, parentId),
    done: false,
    collapsed: false,
    description: '',
    rating: 0,
    review: '',
    createdAt: now,
    updatedAt: now,
    sourceTaskId: null,
    deletedAt: null,
  };

  // 父节点若处于折叠态，新建的子项会立刻「消失」，这里自动展开
  const touched = [newId];
  let next = list;
  if (parentId !== null) {
    const parentIndex = findIndexById(next, parentId);
    const parent = next[parentIndex];
    if (parent && parent.collapsed) {
      next = [...next];
      next[parentIndex] = { ...parent, collapsed: false, updatedAt: now };
      touched.push(parentId);
    }
  }

  return { items: [...next, created], touched, newId };
}

/**
 * Tab 缩进：挂到**上一个同级兄弟**之下，成为它的最后一个子节点。
 * 若不存在前驱兄弟（同层第一条），原样返回。
 */
export function indent(items: readonly Item[], id: string, clock: Clock): TreeMutation {
  const list = [...items];
  const target = requireItem(list, id);
  const siblings = groupChildren(list).get(target.parentId) ?? [];
  const index = siblings.findIndex((s) => s.id === id);
  const prev = siblings[index - 1];
  if (!prev) return { items: list, touched: [] };

  if (prev.level + 1 >= MAX_LEVEL) {
    // 超过软上限：仍然执行，但由 UI 提示；这里不阻断
  }

  const now = clock.now();
  const next = list.map((item) => {
    if (item.id === id) {
      return { ...item, parentId: prev.id, level: prev.level + 1, order: nextOrder(list, prev.id), updatedAt: now };
    }
    // 前驱若折叠，展开它，否则缩进后目标行会消失
    if (item.id === prev.id && item.collapsed) {
      return { ...item, collapsed: false, updatedAt: now };
    }
    return item;
  });

  // 自身已经设为 prev.level + 1，这里只把后代再整体下移一级
  const touched = shiftDescendantLevels(next, id, 1);
  return { items: next, touched: [...new Set([id, prev.id, ...touched])] };
}

/**
 * Shift+Tab 升级：挂到父节点的父节点下，紧跟在父节点之后。
 * 若已是顶层，原样返回。子树层级随之下移一级。
 */
export function outdent(items: readonly Item[], id: string, clock: Clock): TreeMutation {
  const list = [...items];
  const target = requireItem(list, id);
  if (target.parentId === null) return { items: list, touched: [] };

  const parent = requireItem(list, target.parentId);
  const grandSiblings = groupChildren(list).get(parent.parentId) ?? [];
  const parentIndex = grandSiblings.findIndex((s) => s.id === parent.id);
  const nextSibling = grandSiblings[parentIndex + 1];

  const now = clock.now();
  let order: number;
  if (nextSibling) {
    const gap = nextSibling.order - parent.order;
    if (gap <= 1) {
      const reindexed = reindexSiblings(list, parent.parentId);
      return outdent(reindexed.items, id, clock);
    }
    order = Math.floor((parent.order + nextSibling.order) / 2);
  } else {
    order = parent.order + ORDER_STEP;
  }

  const next = list.map((item) =>
    item.id === id
      ? { ...item, parentId: parent.parentId, level: parent.level, order, updatedAt: now }
      : item,
  );

  // 自身已设为 parent.level，后代按同样的差值平移
  const touched = shiftDescendantLevels(next, id, parent.level - target.level);
  return { items: next, touched: [...new Set([id, ...touched])] };
}

/** 同层内上移 / 下移一位。返回原数组表示已在边界。 */
export function moveWithinSiblings(
  items: readonly Item[],
  id: string,
  direction: -1 | 1,
): TreeMutation {
  const list = [...items];
  const target = requireItem(list, id);
  const siblings = groupChildren(list).get(target.parentId) ?? [];
  const index = siblings.findIndex((s) => s.id === id);
  const swapIndex = index + direction;
  if (index === -1 || swapIndex < 0 || swapIndex >= siblings.length) {
    return { items: list, touched: [] };
  }

  const reordered = [...siblings];
  const moved = reordered[index];
  const swapped = reordered[swapIndex];
  if (!moved || !swapped) return { items: list, touched: [] };
  reordered[index] = swapped;
  reordered[swapIndex] = moved;

  const orderById = new Map(reordered.map((item, i) => [item.id, (i + 1) * ORDER_STEP]));
  const touched: string[] = [];
  const next = list.map((item) => {
    const order = orderById.get(item.id);
    if (order === undefined || order === item.order) return item;
    touched.push(item.id);
    return { ...item, order };
  });
  return { items: next, touched };
}

/** 更新条目字段（标题 / 描述 / 评分 / 评价 / 折叠态 / 完成态） */
export function updateItem(
  items: readonly Item[],
  id: string,
  patch: Partial<Pick<Item, 'title' | 'description' | 'rating' | 'review' | 'done' | 'collapsed'>>,
  clock: Clock,
): TreeMutation {
  const now = clock.now();
  let touched = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    touched = true;
    return { ...item, ...patch, updatedAt: now };
  });
  if (!touched) throw new DomainError(`条目不存在: ${id}`);
  return { items: next, touched: [id] };
}

/**
 * 软删：递归标记整棵子树。
 *
 * 🔴 架构级红线：**只改 deletedAt，其余字段一个字节都不能动。**
 * 这是撤销时能完整恢复层级 / 顺序 / 折叠态 / 完成态的唯一前提。
 */
export function softDeleteSubtree(
  items: readonly Item[],
  id: string,
  clock: Clock,
): TreeMutation {
  const ids = new Set(collectSubtreeIds(items, id));
  const now = clock.now();
  const touched: string[] = [];
  const next = items.map((item) => {
    if (!ids.has(item.id)) return item;
    touched.push(item.id);
    return { ...item, deletedAt: now };
  });
  return { items: next, touched };
}

/** 撤销删除：把 deletedAt 置回 null，其余字段原样保留 */
export function restoreSubtree(items: readonly Item[], ids: readonly string[]): TreeMutation {
  const idSet = new Set(ids);
  const touched: string[] = [];
  const next = items.map((item) => {
    if (!idSet.has(item.id)) return item;
    touched.push(item.id);
    return { ...item, deletedAt: null };
  });
  return { items: next, touched };
}

/** 取某条目的完整副本（用于撤销快照） */
export function snapshotSubtree(items: readonly Item[], id: string): Item[] {
  const ids = new Set(collectSubtreeIds(items, id));
  return items.filter((item) => ids.has(item.id)).map((item) => ({ ...item }));
}

/**
 * 勾选完成态。**不联动子项**（产品决策 Q1）：
 * 父条目只展示直系子项的完成情况，"父完成"不等于"子项全部完成"。
 */
export function toggleDone(items: readonly Item[], id: string, clock: Clock): TreeMutation {
  const target = requireItem(items, id);
  return updateItem(items, id, { done: !target.done }, clock);
}
