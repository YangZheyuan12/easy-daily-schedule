import type { TimeSlot } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import { SECTION_CONFIGS } from '@/domain/constants';

/**
 * 时间轴时长统计（纯函数，零浏览器 API）。
 *
 * 🔴 口径（用户 2026-10-14 拍板）：**实际时间优先，没记录就回退计划时间**。
 * 时间段有「计划」与「实际」两套时间（记录用的 actual* 是可选的），只算其中一套
 * 都会失真：只算计划 → 提前结束 / 拖延时数字不准；只算实际 → 大多数人不填实际时间，
 * 数字会明显偏小。所以：实际成对存在就用实际，否则用计划；计划也没结束时间就记 0。
 */

/** 单条时间段的时长（分钟）。无法构成有效区间时返回 0。 */
export function slotDurationMinutes(slot: Pick<
  TimeSlot,
  'startMin' | 'endMin' | 'actualStartMin' | 'actualEndMin'
>): number {
  const start = slot.actualStartMin ?? slot.startMin;
  /*
    `endMin === 0` 是「未设定结束」（见 TimeSlot.endMin 的约定），不是「0 点结束」——
    直接拿它减 startMin 会算出负数，这里收敛成 0。
  */
  const plannedEnd = slot.endMin > 0 ? slot.endMin : 0;
  const end = slot.actualEndMin ?? plannedEnd;
  return end > start ? end - start : 0;
}

/** 按板块汇总时长（分钟）。软删的、未归类的时间段都不计入。 */
export function sumMinutesBySection(
  slots: readonly TimeSlot[],
): Record<SectionKey, number> {
  const result = {} as Record<SectionKey, number>;
  for (const config of SECTION_CONFIGS) result[config.key] = 0;

  for (const slot of slots) {
    if (slot.deletedAt !== null) continue;
    if (slot.sectionId === null) continue;
    result[slot.sectionId] += slotDurationMinutes(slot);
  }
  return result;
}

/**
 * 按板块汇总**指定月份**的时长（分钟）。
 *
 * 单独一个函数而不是让调用方先过滤：日历月视图取数时拉的是**月历网格首尾**
 * （含前后补位的上月末 / 下月初），直接 `sumMinutesBySection` 会把邻月的几天算进来 ——
 * 表头写着 10 月、条里却含着 9 月 29 号，那是在骗人。
 */
export function sumMonthMinutesBySection(
  slots: readonly TimeSlot[],
  monthKey: string,
): Record<SectionKey, number> {
  const inMonth = slots.filter((slot) => slot.date.startsWith(monthKey));
  return sumMinutesBySection(inMonth);
}

/** 指定月份里已归类时间段的合计时长（分钟） */
export function totalMonthMinutes(slots: readonly TimeSlot[], monthKey: string): number {
  const inMonth = slots.filter((slot) => slot.date.startsWith(monthKey));
  return totalMinutes(inMonth);
}

/** 全部已归类时间段的合计时长（分钟） */
export function totalMinutes(slots: readonly TimeSlot[]): number {
  let sum = 0;
  for (const slot of slots) {
    if (slot.deletedAt !== null || slot.sectionId === null) continue;
    sum += slotDurationMinutes(slot);
  }
  return sum;
}

/**
 * 分钟 → 展示文本：`0m` / `45m` / `2h` / `2h5m`。
 *
 * 刻意不显示「0h0m」「2h0m」这种空尾巴 —— 时长条里要的是一眼能读的短数字，
 * 多两个字符在 13px 下就是折行的差别。
 */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${rest}m`;
}
