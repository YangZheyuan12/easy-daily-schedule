import { create } from 'zustand';
import type { Item, TimeSlot } from '@/domain/types';
import { repos } from './bootstrap';

/**
 * 区间取数 store（周视图 / 本周汇总用）。
 *
 * 为什么要单独一个 store，而不是复用 `useItemStore` / `useTimeSlotStore`：
 * 那两个是**日维度**的，里面的写操作（增删改）默认作用域就是「当前那一天」。
 * 把一周的数据灌进去会让「新增一条」分不清该落到哪天，也会让撤销快照的边界变得模糊。
 * 所以这里只做**只读**的区间快照：取数、给视图用，不改。
 *
 * 一次 `Promise.all` 两次区间查询（条目 / 时间段），绝不循环 7 次单日查询 ——
 * 与 `useCalendarStore` 同一条规矩：移动端 IndexedDB 每次往返都有毫秒级开销。
 */
interface RangeState {
  /** 已装载的区间 'start~end'；用于判断当前数据是不是用户正在看的那一段 */
  key: string | null;
  items: Item[];
  slots: TimeSlot[];
  loading: boolean;

  loadRange: (start: string, end: string) => Promise<void>;
}

export const useRangeStore = create<RangeState>((set, get) => {
  /** 单调递增的请求序号，用于丢弃过期的取数结果 */
  let requestSeq = 0;

  return {
    key: null,
    items: [],
    slots: [],
    loading: false,

    async loadRange(start, end) {
      const key = `${start}~${end}`;
      // 同一区间已经在手上就不重复取 —— 切页面回来时不必再打一次 IndexedDB
      if (get().key === key) return;

      const token = (requestSeq += 1);
      set({ loading: true });
      try {
        const [items, slots] = await Promise.all([
          repos.items.listByDateRange(start, end),
          repos.timeSlots.listByDateRange(start, end),
        ]);
        if (token !== requestSeq) return;
        set({ key, items, slots, loading: false });
      } catch {
        // 读不出来就渲染空周视图，不要卡在 loading
        if (token !== requestSeq) return;
        set({ key, items: [], slots: [], loading: false });
      }
    },
  };
});
