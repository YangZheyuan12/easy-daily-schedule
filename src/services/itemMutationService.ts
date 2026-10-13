import type { Item } from '@/domain/types';
import type { Clock } from './clock';
import { collectSubtreeIds, restoreSubtree, snapshotSubtree, softDeleteSubtree } from './treeService';
import type { UndoEntry } from './undoService';
import { undoLabel } from './undoService';

/**
 * 删除 / 撤销的组合器。
 *
 * 把「递归软删 + 生成撤销快照」这两件必须原子发生的事封装在一起，
 * 避免调用方（store）漏掉快照导致撤销时拿不到数据。
 *
 * 🔴 软删只改 deletedAt，快照保存删除前的完整副本 —— 二者配合，
 * 撤销才能把层级 / 顺序 / 折叠态 / 完成态一字不差地还原。
 */
export interface DeletePlan {
  /** 删除后的条目数组（子树已被标记软删） */
  items: Item[];
  touched: string[];
  /** 待压入撤销栈的条目（缺 deletedAt，由 UndoService 补时间戳） */
  undo: Omit<UndoEntry, 'deletedAt'>;
}

export function planDelete(items: readonly Item[], id: string, clock: Clock): DeletePlan {
  const root = items.find((item) => item.id === id);
  if (!root) {
    return { items: [...items], touched: [], undo: { snapshot: [], ids: [], label: '' } };
  }

  // 快照必须在软删之前取，否则快照里的 deletedAt 已经被改了
  const snapshot = snapshotSubtree(items, id);
  const ids = collectSubtreeIds(items, id);
  const mutation = softDeleteSubtree(items, id, clock);

  return {
    items: mutation.items,
    touched: mutation.touched,
    undo: {
      snapshot,
      ids,
      label: undoLabel(root.title, ids.length),
    },
  };
}

/** 撤销：把快照中的条目原样恢复 */
export function planUndo(items: readonly Item[], entry: UndoEntry): {
  items: Item[];
  touched: string[];
} {
  return restoreSubtree(items, entry.ids);
}
