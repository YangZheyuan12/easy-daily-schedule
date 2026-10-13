import type { TimeSlot } from '@/domain/types';

/**
 * 应用内提醒（纯函数，零浏览器 API）。
 *
 * 到期判定：已到计划开始时间且未完成的当日时间块。
 * `endMin` 不参与判定 —— 一个时段过了还没记录，恰恰更该提醒，而不是因为「过期」就放过。
 */

/**
 * 已到计划时段且未完成的当日时间块。
 *
 * - `deletedAt === null`：软删的不提醒；
 * - `!done`：已完成的不提醒；
 * - `startMin > 0`：开始时间为 0（00:00）视为「未设定具体时间」，不触发；
 * - `nowMin >= startMin`：当前时间达到或超过计划开始时间即到期。
 */
export function listDueSlots(slots: readonly TimeSlot[], nowMin: number): TimeSlot[] {
  return slots.filter(
    (slot) => slot.deletedAt === null && !slot.done && slot.startMin > 0 && nowMin >= slot.startMin,
  );
}
