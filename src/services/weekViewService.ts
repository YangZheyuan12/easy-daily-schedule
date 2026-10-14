import type { Item, TimeSlot } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import { SECTION_CONFIGS } from '@/domain/constants';
import { compareByOrder } from '@/domain/constants';
import { formatShortDate, weekdayLabel } from '@/utils/date';

/**
 * 周视图（纯函数，零浏览器 API）。
 *
 * 两块内容，同属「把日维度的数据按周重新组织」：
 * - **课程表**（时间轴页）：一周七天 × 纵向时间轴，时间段按真实起止时间定位；
 * - **田字格**（今日页）：四板块各一格，格内按天列出本周该板块的事项。
 *
 * 两者都是**只读派生** —— 不复制数据、不写库，与 R-042 的「投影」同一套思路：
 * 一份数据就没有「改了这边、那边没跟着变」的问题。
 */

/* ------------------------------------------------------------------ */
/* 一、时间窗                                                          */
/* ------------------------------------------------------------------ */

export interface WeekWindow {
  /** 窗口起点（距 00:00 的分钟数，整点） */
  startMin: number;
  /** 窗口终点（整点） */
  endMin: number;
}

/** 当周没有任何时间段时的兜底窗口（08:00–22:00） */
export const DEFAULT_WEEK_WINDOW: WeekWindow = { startMin: 8 * 60, endMin: 22 * 60 };

/** 自动收窄时向两端各扩出的余量（分钟） */
const WINDOW_PADDING = 60;
/** 窗口最短跨度（小时）。避免「只有一段 09:00–09:30」时窗口窄成一小时、网格挤成一团 */
const MIN_WINDOW_HOURS = 4;

const MINUTES_IN_DAY = 24 * 60;

/** 时间段的有效起止（实际时间优先，回退计划时间）—— 与 durationService 同一口径 */
function effectiveRange(slot: TimeSlot): { start: number; end: number } {
  const start = slot.actualStartMin ?? slot.startMin;
  const plannedEnd = slot.endMin > 0 ? slot.endMin : start;
  const end = slot.actualEndMin ?? plannedEnd;
  return end > start ? { start, end } : { start, end: start };
}

/**
 * 周视图的纵向时间范围：**按当周数据自动收窄**（用户 2026-10-14 拍板）。
 *
 * 取当周最早开始 / 最晚结束，各向外扩 60 分钟并对齐到整点 —— 扩出去不是为了填满屏幕，
 * 而是让最早和最晚那两段时间块**不贴在网格边缘**（贴边会被误认为被截断）。
 * 一整天没数据时回落 `DEFAULT_WEEK_WINDOW`：那时收窄到 0 高度反而更糟，
 * 用户看到的是「什么都没有」，而不是「今天还没排」。
 */
export function resolveWeekWindow(slots: readonly TimeSlot[]): WeekWindow {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const slot of slots) {
    if (slot.deletedAt !== null) continue;
    const { start, end } = effectiveRange(slot);
    min = Math.min(min, start);
    max = Math.max(max, end);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ...DEFAULT_WEEK_WINDOW };

  // 向外扩并取整点：floor / ceil 到小时
  let start = Math.max(0, Math.floor((min - WINDOW_PADDING) / 60) * 60);
  let end = Math.min(MINUTES_IN_DAY, Math.ceil((max + WINDOW_PADDING) / 60) * 60);

  // 跨度不足下限：从起点往下补（补不动就往上补），保证网格不至于挤成一团
  if (end - start < MIN_WINDOW_HOURS * 60) {
    const deficit = MIN_WINDOW_HOURS * 60 - (end - start);
    const room = start; // 起点之上还有多少空间
    const pull = Math.min(deficit, room);
    start -= pull;
    end = Math.min(MINUTES_IN_DAY, end + (deficit - pull));
  }

  // 极端情况：数据全在 00:00 附近，start 已经是 0 而 end 仍被 clamp 住
  if (end <= start) return { startMin: 0, endMin: MINUTES_IN_DAY };

  return { startMin: start, endMin: end };
}

/** 窗口内的整点刻度（用于画横向网格线） */
export function hourTicks(timeWindow: WeekWindow): number[] {
  const ticks: number[] = [];
  for (let min = timeWindow.startMin; min <= timeWindow.endMin; min += 60) ticks.push(min);
  return ticks;
}

/* ------------------------------------------------------------------ */
/* 二、课程表布局                                                      */
/* ------------------------------------------------------------------ */

/** 一个时间块在课程表中的位置（归一化到 [0,1]，由渲染端乘容器尺寸） */
export interface WeekCell {
  slot: TimeSlot;
  /** 周内第几天，0 = 周一 */
  dayIndex: number;
  /** 相对窗口顶部的比例位置 */
  top: number;
  /** 高度比例 */
  height: number;
  /** 同一时段重叠并排：所在列（0 起） */
  lane: number;
  /** 同一时段重叠并排：总列数（1 = 不重叠） */
  laneCount: number;
}

/** 太短的时间段也给一个可点的最小高度（分钟），否则 5 分钟的一段在屏幕上不到 1px */
const MIN_VISIBLE_MINUTES = 20;

/**
 * 课程表布局：把时间段铺到「天 × 时间」的网格上。
 *
 * 🔴 **重叠并排，不叠放**。同一时段有两条时，若让后一条盖住前一条，用户看到的是
 * 「我的 10 点组会不见了」；并排各占一半宽度，至少两条都还在（点开能看全）。
 * 并排的代价是每列更窄，所以块内只显示时间 + 标题，不塞更多。
 *
 * 分簇算法：按开始时间排序后扫描，`start >= 当前簇的最晚结束` 即开启新簇；
 * 同一簇内的段两两相交，因此簇的大小就是并排列数。
 */
export function buildWeekTimetable(
  slots: readonly TimeSlot[],
  weekDays: readonly string[],
  timeWindow: WeekWindow,
): WeekCell[] {
  const span = timeWindow.endMin - timeWindow.startMin;
  if (span <= 0) return [];

  const cells: WeekCell[] = [];

  weekDays.forEach((dateKey, dayIndex) => {
    const daySlots = slots
      .filter((slot) => slot.date === dateKey && slot.deletedAt === null)
      .sort(
        (a, b) =>
          effectiveRange(a).start - effectiveRange(b).start || a.order - b.order || a.createdAt - b.createdAt,
      );

    /** 当前簇：彼此时间相交的一组段 */
    let cluster: TimeSlot[] = [];
    let clusterEnd = Number.NEGATIVE_INFINITY;

    const flush = () => {
      if (cluster.length === 0) return;
      cluster.forEach((slot, lane) => {
        const { start, end } = effectiveRange(slot);
        const top = (start - timeWindow.startMin) / span;
        const height = Math.max(end - start, MIN_VISIBLE_MINUTES) / span;
        cells.push({
          slot,
          dayIndex,
          top: clamp01(top),
          // 高度不能超出窗口下沿 —— 否则最后一段会溢出网格
          height: clamp01(Math.min(height, 1 - clamp01(top))),
          lane,
          laneCount: cluster.length,
        });
      });
      cluster = [];
      clusterEnd = Number.NEGATIVE_INFINITY;
    };

    for (const slot of daySlots) {
      const { start, end } = effectiveRange(slot);
      if (start >= clusterEnd) {
        flush();
      }
      cluster.push(slot);
      clusterEnd = Math.max(clusterEnd, end);
    }
    flush();
  });

  return cells;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/* ------------------------------------------------------------------ */
/* 三、本周田字格                                                      */
/* ------------------------------------------------------------------ */

/** 田字格里的一个事项 */
export interface WeekEntry {
  id: string;
  title: string;
  done: boolean;
  /** 条目 vs 时间轴归类的时间段 */
  kind: 'item' | 'timeSlot';
}

/** 田字格里的一天 */
export interface WeekBoardDay {
  dateKey: string;
  /** 「周一」 */
  weekday: string;
  /** 「10月14日」 */
  dateLabel: string;
  entries: WeekEntry[];
}

/** 一个板块格子的内容 */
export interface WeekSectionBoard {
  key: SectionKey;
  name: string;
  icon: string;
  days: WeekBoardDay[];
  /** 本周该板块的事项总数（顶层条目 + 归类时间段） */
  total: number;
  /** 其中已完成的 */
  done: number;
}

/**
 * 本周四板块汇总（今日页田字格）。
 *
 * 口径与今日页**完全一致**（这是刻意对齐的，否则同一周两处数字不一样）：
 * - 只取**顶层条目**（`parentId === null`），子项不单独占一行 —— 与完成率口径一致，
 *   子项重复进分母会让「本周做了多少事」虚高；
 * - 加上**归到该板块的时间段**（R-042 的同一条规则），它同样算这个板块的一件事项；
 * - 每天之内先条目后时间段（顺序与今日页一致），只列出**有内容的天**。
 */
export function buildWeekSectionBoards(
  items: readonly Item[],
  slots: readonly TimeSlot[],
  weekDays: readonly string[],
): WeekSectionBoard[] {
  const aliveItems = items.filter((item) => item.deletedAt === null && item.parentId === null);
  const aliveSlots = slots.filter((slot) => slot.deletedAt === null && slot.sectionId !== null);

  return SECTION_CONFIGS.map((config) => {
    const days: WeekBoardDay[] = [];
    let total = 0;
    let done = 0;

    for (const dateKey of weekDays) {
      const entries: WeekEntry[] = [];

      const dayItems = aliveItems
        .filter((item) => item.date === dateKey && item.sectionId === config.key)
        .sort(compareByOrder);
      for (const item of dayItems) {
        entries.push({ id: item.id, title: item.title, done: item.done, kind: 'item' });
      }

      const daySlots = aliveSlots
        .filter((slot) => slot.date === dateKey && slot.sectionId === config.key)
        .sort((a, b) => a.startMin - b.startMin || a.order - b.order);
      for (const slot of daySlots) {
        entries.push({
          id: slot.id,
          title: slot.content.trim() || '未命名时间段',
          done: slot.done,
          kind: 'timeSlot',
        });
      }

      if (entries.length === 0) continue;
      total += entries.length;
      done += entries.filter((entry) => entry.done).length;
      days.push({
        dateKey,
        weekday: weekdayLabel(dateKey),
        dateLabel: formatShortDate(dateKey),
        entries,
      });
    }

    return { key: config.key, name: config.name, icon: config.icon, days, total, done };
  });
}
