import { create } from 'zustand';
import { repos } from '@/store/bootstrap';
import {
  WEEK_WINDOW,
  TICK_STEP_HOURS,
  type WeekWindow,
} from '@/services/weekViewService';

/**
 * 时间轴**周视图**的时间窗设置（用户 2026-10-14 起可自定义）。
 *
 * 之前窗口是写死的 `WEEK_WINDOW` 常量（06:00–24:00 / 2 小时），被自定义的诉求取代：
 * - `startMin` / `endMin`：周课程表纵向覆盖的起止（整点，分钟数）；
 * - `tickHours`：横向分割线间隔（小时）。
 *
 * 持久化走 `repos.settings`，与主题同一套键值偏好机制；store 只管状态，不碰存储 API。
 * 周视图（TimelinePage / WeekTimetable）读取这份设置，日视图轴式列表不受影响。
 */
export const TIMELINE_WINDOW_KEY = 'timelineWindow';

export interface TimelineWindowSettings extends WeekWindow {
  /** 横向分割线间隔（小时，1–6） */
  tickHours: number;
}

export const DEFAULT_TIMELINE_WINDOW: TimelineWindowSettings = {
  startMin: WEEK_WINDOW.startMin,
  endMin: WEEK_WINDOW.endMin,
  tickHours: TICK_STEP_HOURS,
};

const HOUR = 60;
const MAX_END = 24 * 60;

/** 起始整点（0–23）。终点至少比起点晚 1 小时，所以起点最多 23 */
function clampStart(hour: number): number {
  return Math.max(0, Math.min(23, Math.round(hour))) * HOUR;
}

/** 结束整点（1–24），且必须晚于起点至少 1 小时 */
function clampEnd(hour: number, startMin: number): number {
  const raw = Math.max(1, Math.min(24, Math.round(hour))) * HOUR;
  return Math.max(startMin + HOUR, Math.min(MAX_END, raw));
}

function clampTick(hours: number): number {
  return Math.max(1, Math.min(6, Math.round(hours)));
}

interface TimelineWindowState {
  settings: TimelineWindowSettings;
  /** 首次从存储读回前为 false，避免默认值又写回去覆盖用户选择 */
  hydrated: boolean;
  setStartHour: (hour: number) => void;
  setEndHour: (hour: number) => void;
  setTickHours: (hours: number) => void;
  reset: () => void;
  hydrate: () => Promise<void>;
}

export const useTimelineWindowStore = create<TimelineWindowState>((set, get) => {
  /** 内存更新 + 持久化（写失败只影响「下次是否记住」，不打断当前交互） */
  const persist = (settings: TimelineWindowSettings) => {
    set({ settings });
    void repos.settings.set(TIMELINE_WINDOW_KEY, settings).catch(() => undefined);
  };

  return {
    settings: DEFAULT_TIMELINE_WINDOW,
    hydrated: false,

    setStartHour(hour) {
      const startMin = clampStart(hour);
      const current = get().settings;
      // 起点顶上来后，若终点不再比它晚 1 小时，自动把终点推后（不会越过 24:00）
      const endMin = current.endMin <= startMin + HOUR ? startMin + HOUR : current.endMin;
      persist({ ...current, startMin, endMin });
    },

    setEndHour(hour) {
      const current = get().settings;
      const endMin = clampEnd(hour, current.startMin);
      persist({ ...current, endMin });
    },

    setTickHours(hours) {
      persist({ ...get().settings, tickHours: clampTick(hours) });
    },

    reset() {
      persist({ ...DEFAULT_TIMELINE_WINDOW });
    },

    async hydrate() {
      if (get().hydrated) return;
      const stored = await repos.settings.get<TimelineWindowSettings>(
        TIMELINE_WINDOW_KEY,
        DEFAULT_TIMELINE_WINDOW,
      );
      const startMin = clampStart(stored.startMin / HOUR);
      const endMin = clampEnd(stored.endMin / HOUR, startMin);
      set({
        settings: { startMin, endMin, tickHours: clampTick(stored.tickHours) },
        hydrated: true,
      });
    },
  };
});

/** 非 React 场景（如启动脚本）读取当前时间窗 */
export function selectTimelineWindow(): TimelineWindowSettings {
  return useTimelineWindowStore.getState().settings;
}
