import { create } from 'zustand';
import type { DailySelfStatus } from '@/domain/types';
import type { Rating } from '@/domain/enums';
import { isToday, shiftDateKey, todayKey } from '@/utils/date';
import { clock, persistence, repos } from './bootstrap';

interface DayState {
  /** 当前查看的日期键 */
  date: string;
  /** 当前日期的自我状态（心情 + 身体） */
  selfStatus: DailySelfStatus | null;
  /** 已存在数据的日期集合，用于在日历上打点（P1 统计页用） */
  setDate: (date: string) => void;
  shiftDate: (delta: number) => void;
  goToday: () => void;
  loadSelfStatus: (date: string) => Promise<void>;
  saveSelfStatus: (
    mood: Rating,
    moodText: string,
    body: Rating,
    bodyText: string,
  ) => void;
}

/**
 * 日期与当日自我状态。
 *
 * 日期是全局单一真相源：切换日期时由 `AppShell` 触发
 * item / task / timeSlot store 重新加载，保证各 store 看的永远是同一天。
 */
export const useDayStore = create<DayState>((set, get) => ({
  date: todayKey(),
  selfStatus: null,

  setDate: (date) => set({ date }),

  shiftDate: (delta) => set({ date: shiftDateKey(get().date, delta) }),

  goToday: () => set({ date: todayKey() }),

  async loadSelfStatus(date) {
    try {
      const selfStatus = await repos.selfStatus.get(date);
      set({ selfStatus: selfStatus ?? null });
    } catch {
      set({ selfStatus: null });
    }
  },

  saveSelfStatus(mood, moodText, body, bodyText) {
    const date = get().date;
    const now = clock.now();
    const next: DailySelfStatus = {
      date,
      mood,
      moodText,
      body,
      bodyText,
      updatedAt: now,
    };
    set({ selfStatus: next });
    persistence.markSelfStatus(next);
  },
}));

export const selectIsToday = (date: string): boolean => isToday(date);
