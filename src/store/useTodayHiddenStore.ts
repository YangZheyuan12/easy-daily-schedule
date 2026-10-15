import { create } from 'zustand';
import { repos } from '@/store/bootstrap';

/**
 * 今日页里**从时间轴投影进来**的时间段，在今日视图内的「隐藏」集合。
 *
 * 这些投影条目和时间轴的原始 `TimeSlot` 是**同一份记录**（R-042 投影、不复制）。
 * 用户要的是**单向**：今日页的删除不应回写时间轴，时间轴的改动照常同步到今日。
 * 所以今日的「删除」不是真删记录，而是把 `(date|slotId)` 记进这个集合，
 * 今日列表据此过滤掉它；时间轴的原始记录毫发无损，时间轴的改动仍会反映到今日（除非被隐藏）。
 *
 * 持久化走 `repos.settings`（与主题 / 时间窗同一套键值机制）。store 只管内存状态。
 */
const TODAY_HIDDEN_KEY = 'todayHiddenSlots';

interface TodayHiddenState {
  /** `${date}|${slotId}` 列表 */
  hidden: string[];
  /** 首次从存储读回前为 false，避免默认值又写回去覆盖用户选择 */
  hydrated: boolean;
  load: () => Promise<void>;
  isHidden: (date: string, slotId: string) => boolean;
  setHidden: (date: string, slotId: string, hidden: boolean) => void;
}

const tag = (date: string, slotId: string): string => `${date}|${slotId}`;

export const useTodayHiddenStore = create<TodayHiddenState>((set, get) => ({
  hidden: [],
  hydrated: false,

  async load() {
    if (get().hydrated) return;
    try {
      const raw = (await repos.settings.get<string[]>(TODAY_HIDDEN_KEY, [])) ?? [];
      set({ hidden: Array.isArray(raw) ? raw : [], hydrated: true });
    } catch {
      set({ hidden: [], hydrated: true });
    }
  },

  isHidden(date, slotId) {
    return get().hidden.includes(tag(date, slotId));
  },

  setHidden(date, slotId, hidden) {
    const t = tag(date, slotId);
    const cur = get().hidden;
    const next = hidden
      ? cur.includes(t)
        ? cur
        : [...cur, t]
      : cur.filter((x) => x !== t);
    set({ hidden: next });
    // 写失败只影响「下次是否记住」，不打断当前交互
    void repos.settings.set(TODAY_HIDDEN_KEY, next).catch(() => undefined);
  },
}));
