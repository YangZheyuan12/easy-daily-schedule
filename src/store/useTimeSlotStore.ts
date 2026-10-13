import { create } from 'zustand';
import type { TimeSlot, TimeSlotDraft } from '@/domain/types';
import { clock, repos } from './bootstrap';
import { persistence } from './bootstrap';
import { newId } from '@/services/idService';
import { ORDER_STEP } from '@/domain/constants';

interface TimeSlotState {
  /** 当前日期（与 useDayStore 保持同步） */
  date: string;
  slots: TimeSlot[];
  loading: boolean;

  loadDate: (date: string) => Promise<void>;
  addSlot: (draft: TimeSlotDraft) => string;
  updateSlot: (id: string, patch: Partial<TimeSlot>) => void;
  toggleDone: (id: string) => void;
  removeSlot: (id: string) => void;
}

/** 排序：开始时间 → order → 创建时间（稳定） */
function sortSlots(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort(
    (a, b) => a.startMin - b.startMin || a.order - b.order || a.createdAt - b.createdAt,
  );
}

/**
 * 时间轴时间段 store。
 *
 * 数据全部走 `repos.timeSlots`，落盘走 `persistence.markTimeSlot`（与条目 / 任务同一套
 * 防抖策略）。删除采用软删（设置 `deletedAt`），与 Item / Task 保持一致，便于将来统一撤销。
 */
export const useTimeSlotStore = create<TimeSlotState>((set, get) => {
  const commit = (slots: TimeSlot[], touched: string[], immediate: boolean) => {
    set({ slots: sortSlots(slots) });
    if (touched.length === 0) return;
    const byId = new Map(slots.map((slot) => [slot.id, slot]));
    const dirty = touched.map((id) => byId.get(id)).filter((slot): slot is TimeSlot => Boolean(slot));
    if (immediate) {
      for (const slot of dirty) persistence.markTimeSlot(slot);
      void persistence.scheduleImmediate();
    } else {
      for (const slot of dirty) persistence.markTimeSlot(slot);
    }
  };

  const maxOrder = (list: TimeSlot[]) =>
    list.reduce((max, slot) => Math.max(max, slot.order), 0);

  return {
    date: '',
    slots: [],
    loading: false,

    async loadDate(date) {
      set({ loading: true, date });
      try {
        const slots = await repos.timeSlots.listByDate(date);
        set({ slots: sortSlots(slots), loading: false });
      } catch {
        set({ slots: [], loading: false });
      }
    },

    addSlot(draft) {
      const now = clock.now();
      const current = get().slots;
      const slot: TimeSlot = {
        id: newId('ts'),
        date: draft.date,
        startMin: draft.startMin,
        endMin: draft.endMin,
        actualStartMin: null,
        actualEndMin: null,
        content: draft.content,
        sectionId: draft.sectionId,
        done: false,
        order: maxOrder(current) + ORDER_STEP,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      commit([...current, slot], [slot.id], true);
      return slot.id;
    },

    updateSlot(id, patch) {
      const now = clock.now();
      const slots = get().slots.map((slot) =>
        slot.id === id ? { ...slot, ...patch, updatedAt: now } : slot,
      );
      commit(slots, [id], true);
    },

    toggleDone(id) {
      const now = clock.now();
      const slots = get().slots.map((slot) =>
        slot.id === id ? { ...slot, done: !slot.done, updatedAt: now } : slot,
      );
      commit(slots, [id], true);
    },

    removeSlot(id) {
      const now = clock.now();
      // 软删只改 deletedAt，其余字段一律不动（架构红线：撤销要能完整恢复）
      const slots = get().slots.map((slot) =>
        slot.id === id ? { ...slot, deletedAt: now } : slot,
      );
      commit(slots, [id], true);
    },
  };
});
