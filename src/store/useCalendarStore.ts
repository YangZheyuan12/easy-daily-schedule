import { create } from 'zustand';
import type { DaySummary } from '@/domain/types';
import {
  type MonthMiniSummary,
  buildMonthSummaries,
  buildYearSummaries,
} from '@/services/calendarService';
import {
  clampDayToMonth,
  monthGrid,
  shiftMonthKey,
  shiftYearKey,
  toMonthKey,
  toYearKey,
  todayKey,
  yearRange,
} from '@/utils/date';
import { repos } from './bootstrap';

/**
 * 日历页状态。
 *
 * 与日维度 store 的关键差别：这里**按整月 / 整年取数**。
 * 一次 `Promise.all` 五次区间查询（条目 / 任务 / 时间段 / 灵感 / 自我状态），交给纯函数聚合；
 * 绝不循环 30 次单日查询 —— 移动端 IndexedDB 每一次往返都有毫秒级开销，
 * 连续 30 次会明显卡住主线程。
 */

type CalendarView = 'month' | 'year';

interface CalendarState {
  /** 当前视图：月 / 年 */
  view: CalendarView;
  /** 当前显示的月份 'YYYY-MM' */
  monthKey: string;
  /** 当前显示的年份 'YYYY' */
  yearKey: string;
  /** 当前选中的日期键 */
  selectedDate: string;
  /** 月历每一格的摘要，key 为日期键 */
  summaries: Record<string, DaySummary>;
  /** 年历每个月的迷你汇总，key 为月键 */
  yearSummaries: Record<string, MonthMiniSummary>;
  loading: boolean;

  setView: (view: CalendarView) => void;
  loadMonth: (monthKey: string) => Promise<void>;
  loadYear: (yearKey: string) => Promise<void>;
  shiftMonth: (delta: number) => Promise<void>;
  shiftYear: (delta: number) => Promise<void>;
  selectDate: (dateKey: string) => void;
  refresh: () => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => {
  /** 单调递增的请求序号，用于丢弃过期的取数结果 */
  let requestSeq = 0;

  /** 整月一次取数：起止日期取自月历网格的首尾格（含前后补位日） */
  const fetchMonth = async (
    monthKey: string,
  ): Promise<Record<string, DaySummary>> => {
    const cells = monthGrid(monthKey);
    const start = cells[0]?.dateKey ?? `${monthKey}-01`;
    const end = cells[cells.length - 1]?.dateKey ?? `${monthKey}-01`;
    const [items, tasks, timeSlots, inspirations, selfStatuses] = await Promise.all([
      repos.items.listByDateRange(start, end),
      repos.tasks.listByDateRange(start, end),
      repos.timeSlots.listByDateRange(start, end),
      repos.inspirations.listByDateRange(start, end),
      repos.selfStatus.listBetween(start, end),
    ]);
    return buildMonthSummaries(items, tasks, timeSlots, inspirations, selfStatuses, monthKey);
  };

  /** 整年一次取数：区间 = 1/1 → 12/31，聚合出 12 个月迷你汇总 */
  const fetchYear = async (
    yearKey: string,
  ): Promise<Record<string, MonthMiniSummary>> => {
    const { start, end } = yearRange(yearKey);
    const [items, tasks, timeSlots, inspirations, selfStatuses] = await Promise.all([
      repos.items.listByDateRange(start, end),
      repos.tasks.listByDateRange(start, end),
      repos.timeSlots.listByDateRange(start, end),
      repos.inspirations.listByDateRange(start, end),
      repos.selfStatus.listBetween(start, end),
    ]);
    return buildYearSummaries(yearKey, items, tasks, timeSlots, inspirations, selfStatuses);
  };

  return {
    view: 'month',
    monthKey: toMonthKey(todayKey()),
    yearKey: toYearKey(todayKey()),
    selectedDate: todayKey(),
    summaries: {},
    yearSummaries: {},
    loading: false,

    /**
     * 切视图。
     *
     * ⚠️ 切到年视图必须顺带取数：早先这里只改 `view`，而 `yearSummaries`
     * 初始是空对象 —— 用户点「年」会看到 12 个月全部显示「未记录」，
     * 直到他点了「下一年」才突然全冒出来。那是把「还没取数」渲染成了
     * 「这一整年什么都没记」，与日历页「不说谎」的底线冲突。
     * 放在 store 里而不是页面里，就是为了这条规则能被单测锁住。
     */
    setView(view) {
      if (view === 'year') {
        void get().loadYear(get().yearKey);
        return;
      }
      set({ view });
    },

    async loadMonth(monthKey) {
      // 竞态守卫：连点两次「下一月」会同时飞出两个请求，谁先回来是不确定的。
      // 若迟到的旧结果覆盖了新结果，日历表头写着 12 月、格子里却是 10 月的数据，
      // 摘要卡还会显示「这一天还没有任何记录」—— 一句彻头彻尾的谎话。
      const token = (requestSeq += 1);
      set({ loading: true, monthKey, view: 'month' });
      try {
        const summaries = await fetchMonth(monthKey);
        if (token !== requestSeq) return; // 期间又切了月份，丢弃本次结果
        set({ summaries, loading: false });
      } catch {
        // 读不出来就渲染一张空日历，不要让页面卡在 loading
        if (token !== requestSeq) return;
        set({ summaries: {}, loading: false });
      }
    },

    async loadYear(yearKey) {
      const token = (requestSeq += 1);
      set({ loading: true, yearKey, view: 'year' });
      try {
        const yearSummaries = await fetchYear(yearKey);
        if (token !== requestSeq) return;
        set({ yearSummaries, loading: false });
      } catch {
        if (token !== requestSeq) return;
        set({ yearSummaries: {}, loading: false });
      }
    },

    async shiftMonth(delta) {
      const next = shiftMonthKey(get().monthKey, delta);
      const previous = get().selectedDate;
      await get().loadMonth(next);

      // 期间有人又切了月（连点两次「下一月」），本次的结果已经作废：
      // 绝不能再写 selectedDate —— 那会把选中日甩到一个当前摘要表覆盖不到的日期上。
      if (get().monthKey !== next) return;

      // 切月后尽量保留「几号」这个选择（30 号 → 30 号；31 号在 30 天月里退到月末）。
      // 不处理的话摘要卡会一直显示一个不在当前月里的日期，读起来像数据丢了。
      // 夹取规则单独放在 utils/date 里并由单测覆盖（闰月 / 跨年最容易算错）。
      set({ selectedDate: clampDayToMonth(previous, next) });
    },

    async shiftYear(delta) {
      const next = shiftYearKey(get().yearKey, delta);
      await get().loadYear(next);
    },

    selectDate(dateKey) {
      set({ selectedDate: dateKey });
    },

    async refresh() {
      if (get().view === 'year') {
        await get().loadYear(get().yearKey);
      } else {
        await get().loadMonth(get().monthKey);
      }
    },
  };
});
