import { create } from 'zustand';
import type { Item, VisibleRow } from '@/domain/types';
import type { Rating, SectionKey } from '@/domain/enums';
import { clock, repos, undoService } from './bootstrap';
import { persistItems } from './helper';
import {
  buildVisibleRows,
  createChild,
  createSiblingAfter,
  indent as indentTree,
  moveWithinSiblings,
  outdent as outdentTree,
  toggleDone as toggleDoneTree,
  updateItem as updateItemTree,
} from '@/services/treeService';
import { planDelete, planUndo } from '@/services/itemMutationService';
import type { UndoEntry } from '@/services/undoService';

interface ItemState {
  /** 当前日期已加载的条目（含软删，渲染时由 selectors 过滤） */
  items: Item[];
  /** 最近一次新建的条目 id，供 UI 聚焦 */
  lastCreatedId: string | null;
  /** 当前待撤销项（用于渲染撤销条） */
  pendingUndo: UndoEntry | null;
  loading: boolean;

  loadDate: (date: string) => Promise<void>;
  reset: () => void;

  /** 在 anchorId 之后新增同级条目；anchorId 为 null 时追加到顶层末尾。title 可选（内联快速添加一次性带标题建成） */
  addSibling: (
    anchorId: string | null,
    date: string,
    sectionId: SectionKey,
    title?: string,
  ) => string | null;
  /** 在 parentId 下新增子条目 */
  addChild: (parentId: string | null, date: string, sectionId: SectionKey) => string | null;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  move: (id: string, direction: -1 | 1) => void;
  toggleCollapsed: (id: string) => void;
  toggleDone: (id: string) => void;
  setTitle: (id: string, title: string) => void;
  setDescription: (id: string, description: string) => void;
  setRating: (id: string, rating: Rating) => void;
  setReview: (id: string, review: string) => void;
  remove: (id: string) => void;
  undo: () => void;
  dismissUndo: () => void;
}

export const useItemStore = create<ItemState>((set, get) => {
  /** 统一的内存更新 + 持久化入口 */
  const commit = (items: Item[], touched: string[], immediate: boolean) => {
    set({ items });
    persistItems(items, touched, immediate);
  };

  return {
    items: [],
    lastCreatedId: null,
    pendingUndo: null,
    loading: false,

    async loadDate(date) {
      set({ loading: true });
      try {
        const items = await repos.items.listByDate(date);
        set({ items, loading: false, lastCreatedId: null });
      } catch {
        set({ items: [], loading: false });
      }
    },

    reset() {
      set({ items: [], lastCreatedId: null, pendingUndo: null });
    },

    addSibling(anchorId, date, sectionId, title) {
      const result = createSiblingAfter(
        get().items,
        anchorId,
        { date, sectionId, title: title ?? '' },
        clock,
      );
      commit(result.items, result.touched, true);
      set({ lastCreatedId: result.newId });
      return result.newId;
    },

    addChild(parentId, date, sectionId) {
      const result = createChild(get().items, parentId, { date, sectionId, title: '' }, clock);
      commit(result.items, result.touched, true);
      set({ lastCreatedId: result.newId });
      return result.newId;
    },

    indent(id) {
      const result = indentTree(get().items, id, clock);
      commit(result.items, result.touched, true);
    },

    outdent(id) {
      const result = outdentTree(get().items, id, clock);
      commit(result.items, result.touched, true);
    },

    move(id, direction) {
      const result = moveWithinSiblings(get().items, id, direction);
      commit(result.items, result.touched, true);
    },

    toggleCollapsed(id) {
      const item = get().items.find((i) => i.id === id);
      if (!item) return;
      const result = updateItemTree(get().items, id, { collapsed: !item.collapsed }, clock);
      commit(result.items, result.touched, true);
    },

    toggleDone(id) {
      const result = toggleDoneTree(get().items, id, clock);
      commit(result.items, result.touched, true);
    },

    setTitle(id, title) {
      const result = updateItemTree(get().items, id, { title }, clock);
      commit(result.items, result.touched, false);
    },

    setDescription(id, description) {
      const result = updateItemTree(get().items, id, { description }, clock);
      commit(result.items, result.touched, false);
    },

    setRating(id, rating) {
      const result = updateItemTree(get().items, id, { rating }, clock);
      commit(result.items, result.touched, true);
    },

    setReview(id, review) {
      const result = updateItemTree(get().items, id, { review }, clock);
      commit(result.items, result.touched, false);
    },

    remove(id) {
      const plan = planDelete(get().items, id, clock);
      if (plan.undo.ids.length === 0) return;
      undoService.push(plan.undo);
      commit(plan.items, plan.touched, true);
      set({ pendingUndo: undoService.peek() });
    },

    undo() {
      const entry = undoService.consume();
      if (!entry) {
        set({ pendingUndo: null });
        return;
      }
      const current = get().items;
      // 快照里的条目在本地可能已被物理清理，先补齐再恢复
      const byId = new Map(current.map((item) => [item.id, item]));
      const merged = [...current];
      for (const snapshot of entry.snapshot) {
        if (!byId.has(snapshot.id)) merged.push(snapshot);
      }
      const result = planUndo(merged, entry);
      commit(result.items, [...entry.ids], true);
      set({ pendingUndo: null });
    },

    dismissUndo() {
      undoService.clear();
      set({ pendingUndo: null });
    },
  };
});

/** 某板块的可见行（组件里配合 useMemo 使用） */
export function selectVisibleRows(items: Item[], sectionId: SectionKey): VisibleRow[] {
  return buildVisibleRows(items.filter((item) => item.sectionId === sectionId));
}
