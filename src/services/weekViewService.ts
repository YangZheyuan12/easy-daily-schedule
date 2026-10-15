import type { Item, TimeSlot } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import { SECTION_CONFIGS } from '@/domain/constants';
import { compareByOrder } from '@/domain/constants';
import { formatShortDate, minToHHMM, weekdayLabel } from '@/utils/date';

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

/**
 * 周视图的纵向时间范围：**固定 06:00–24:00**（用户 2026-10-14 拍板）。
 *
 * 之前是「按当周数据自动收窄」，被弃用的原因有两个，都是实际用出来的：
 * - **格子位置每周漂移**。同一门课上周在第 3 行、这周在第 5 行，
 *   课程表的价值恰恰是「一眼看出周三下午很满」这种**跨周可比**的判断，
 *   而漂移的网格让每一周都得重新读一遍刻度。
 * - **收窄后的窗口会把短块挤成一团**。跨度小时每段占的像素反而更密，
 *   文字互相压住 —— 固定 18 小时后，一小时 40px，半小时的块也有 20px，够放一行字。
 *
 * 起点选 6 点不是 0 点：凌晨那 6 小时对绝大多数作息是空的，留着只是白滚一段。
 * 终点选 24 点而不是 23 点，是为了让「23:30 那一段」有格子可放（23 点做终点会把它顶出去）。
 */
export const WEEK_WINDOW: WeekWindow = { startMin: 6 * 60, endMin: 24 * 60 };

/** 横向分割线的间隔（小时）。2 小时一条 —— 每小时一条会让网格看起来像笔记本横线，反而看不出「节」 */
export const TICK_STEP_HOURS = 2;

const MINUTES_IN_DAY = 24 * 60;

/** 时间段的有效起止（实际时间优先，回退计划时间）—— 与 durationService 同一口径 */
function effectiveRange(slot: TimeSlot): { start: number; end: number } {
  const start = slot.actualStartMin ?? slot.startMin;
  const plannedEnd = slot.endMin > 0 ? slot.endMin : start;
  const end = slot.actualEndMin ?? plannedEnd;
  return end > start ? { start, end } : { start, end: start };
}

/** 窗口内的刻度（用于画横向网格线）。终点恰好落在步长上时也会包含它（24:00） */
export function gridTicks(
  timeWindow: WeekWindow = WEEK_WINDOW,
  stepHours: number = TICK_STEP_HOURS,
): number[] {
  const step = Math.max(1, stepHours) * 60;
  const ticks: number[] = [];
  for (let min = timeWindow.startMin; min <= timeWindow.endMin; min += step) ticks.push(min);
  return ticks;
}

/**
 * 刻度的时间文本。`minToHHMM` 会把 1440 夹到 23:59，
 * 而窗口终点就是 24:00 —— 显示成「23:59」是明显的错字，所以这里单独兜住。
 */
export function tickLabel(min: number): string {
  if (min >= MINUTES_IN_DAY) return '24:00';
  return minToHHMM(min);
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

/**
 * 太短的时间段也给一个可点的最小高度（分钟）。
 * 固定窗口后 1 分钟 ≈ 0.67px，20 分钟只有 13px（一行字都放不下），所以抬到 30 分钟 ≈ 20px。
 */
const MIN_VISIBLE_MINUTES = 30;

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

/* ------------------------------------------------------------------ */
/* 四、板块周详情（点田字格某一格进去）                                  */
/* ------------------------------------------------------------------ */

/** 板块周详情里的一条事项 */
export interface WeekTimelineEntry {
  id: string;
  title: string;
  done: boolean;
  kind: 'item' | 'timeSlot';
  /** 时间文本：时间段是「09:00–10:00」；**没排时间**的条目为 null（渲染端留空时间列） */
  timeLabel: string | null;
  /** 排序键：时间段的开始分钟；条目为 null（排在有时间的事项之后，见下） */
  startMin: number | null;
}

export interface WeekTimelineDay {
  dateKey: string;
  /** 「周三」 */
  weekday: string;
  /** 「10月14日」 */
  dateLabel: string;
  entries: WeekTimelineEntry[];
}

export interface WeekSectionTimeline {
  key: SectionKey;
  name: string;
  days: WeekTimelineDay[];
  total: number;
  done: number;
}

/**
 * 单个板块一整周的**时间线**（今日页田字格点进去的那一页）。
 *
 * 与田字格唯一的区别是**天内顺序**：田字格按「先条目、后时间段」（和今日页同一口径），
 * 这一页按**时间顺序** —— 因为它就是要回答「这周几点做了什么」，
 * 用户点进来时脑子里问的是时间，不是录入顺序。
 *
 * 没排时间的条目怎么办：它们没有可排序的时间，**放在那一天的最后**，
 * 时间列留空。硬把它们插进时间序列只能靠 `createdAt`（那是录入时刻，不是做事的时刻），
 * 插进去就是在编一个用户没说过的顺序。
 */
export function buildWeekSectionTimeline(
  items: readonly Item[],
  slots: readonly TimeSlot[],
  weekDays: readonly string[],
  key: SectionKey,
): WeekSectionTimeline {
  const config = SECTION_CONFIGS.find((item) => item.key === key) ?? SECTION_CONFIGS[0];
  const aliveItems = items.filter(
    (item) => item.deletedAt === null && item.parentId === null && item.sectionId === key,
  );
  const aliveSlots = slots.filter(
    (slot) => slot.deletedAt === null && slot.sectionId === key,
  );

  const days: WeekTimelineDay[] = [];
  let total = 0;
  let done = 0;

  for (const dateKey of weekDays) {
    const entries: WeekTimelineEntry[] = [];

    const daySlots = aliveSlots
      .filter((slot) => slot.date === dateKey)
      .sort((a, b) => effectiveRange(a).start - effectiveRange(b).start || a.order - b.order);
    for (const slot of daySlots) {
      const { start, end } = effectiveRange(slot);
      entries.push({
        id: slot.id,
        title: slot.content.trim() || '未命名时间段',
        done: slot.done,
        kind: 'timeSlot',
        timeLabel:
          end > start ? `${minToHHMM(start)}–${minToHHMM(end)}` : minToHHMM(start),
        startMin: start,
      });
    }

    const dayItems = aliveItems
      .filter((item) => item.date === dateKey)
      .sort(compareByOrder);
    for (const item of dayItems) {
      entries.push({
        id: item.id,
        title: item.title,
        done: item.done,
        kind: 'item',
        timeLabel: null,
        startMin: null,
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

  return { key, name: config?.name ?? '', days, total, done };
}
