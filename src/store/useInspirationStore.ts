import { create } from 'zustand';
import type { Inspiration } from '@/domain/types';
import { clock, persistence, repos } from './bootstrap';
import { newId } from '@/services/idService';
import { ORDER_STEP } from '@/domain/constants';

interface InspirationState {
  /** 当前日期（与 useDayStore 保持同步） */
  date: string;
  inspirations: Inspiration[];
  loading: boolean;

  loadDate: (date: string) => Promise<void>;
  add: (date: string, content: string) => string;
  update: (id: string, content: string) => void;
  remove: (id: string) => void;
}

/** 排序：order 升序，order 相同用 createdAt 兜底（稳定） */
function sortInspirations(rows: Inspiration[]): Inspiration[] {
  return [...rows].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/**
 * 灵感 store（主页日记体第 5 组）。
 *
 * 与 useTimeSlotStore 同构，但没有勾选态：灵感是纯文字条目。
 * 删除是软删（只改 `deletedAt`，架构红线），落盘走 `persistence.markInspiration`。
 */
export const useInspirationStore = create<InspirationState>((set, get) => {
  const commit = (rows: Inspiration[], touched: string[], immediate: boolean) => {
    set({ inspirations: sortInspirations(rows) });
    if (touched.length === 0) return;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const dirty = touched
      .map((id) => byId.get(id))
      .filter((row): row is Inspiration => Boolean(row));
    if (immediate) {
      for (const row of dirty) persistence.markInspiration(row);
      void persistence.scheduleImmediate();
    } else {
      for (const row of dirty) persistence.markInspiration(row);
    }
  };

  const maxOrder = (list: Inspiration[]) =>
    list.reduce((max, row) => Math.max(max, row.order), 0);

  return {
    date: '',
    inspirations: [],
    loading: false,

    async loadDate(date) {
      set({ loading: true, date });
      try {
        const inspirations = await repos.inspirations.listByDate(date);
        set({ inspirations: sortInspirations(inspirations), loading: false });
      } catch {
        set({ inspirations: [], loading: false });
      }
    },

    add(date, content) {
      const now = clock.now();
      const row: Inspiration = {
        id: newId('in'),
        date,
        content,
        order: maxOrder(get().inspirations) + ORDER_STEP,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      commit([...get().inspirations, row], [row.id], true);
      return row.id;
    },

    update(id, content) {
      const now = clock.now();
      const rows = get().inspirations.map((row) =>
        row.id === id ? { ...row, content, updatedAt: now } : row,
      );
      commit(rows, [id], true);
    },

    remove(id) {
      const now = clock.now();
      // 软删只改 deletedAt，其余字段一律不动（架构红线：撤销要能完整恢复）
      const rows = get().inspirations.map((row) =>
        row.id === id ? { ...row, deletedAt: now } : row,
      );
      commit(rows, [id], true);
    },
  };
});
