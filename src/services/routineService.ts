import type { Routine, RoutineCompletion } from '@/domain/types';

/**
 * 每日固定任务的纯函数计算（无副作用、可单测）。
 *
 * 固定任务分两层数据：跨日期复用的模板（`Routine`）与每天独立的完成记录
 *（`RoutineCompletion`，按 routineId + date 维度）。本文件只负责把这两层
 * 拼成 UI 要的「今天这条勾了没 / 完成度多少」，不碰任何存储。
 */

/**
 * 完成记录主键：`routineId@date`，天然唯一且可反查两个维度。
 * 落库时直接 `bulkPut`，无需先读后写。
 */
export function routineCompletionKey(routineId: string, date: string): string {
  return `${routineId}@${date}`;
}

/** 一组固定任务在某天的完成度汇总 */
export interface RoutineProgress {
  /** 已完成条数 */
  done: number;
  /** 模板总数 */
  total: number;
  /** 完成率 0–1；total 为 0 时返回 0（不会是 NaN） */
  ratio: number;
}

/**
 * 计算某天固定任务的完成度。
 *
 * `completions` 以 `${routineId}@${date}` 为键存全部日期的完成记录，
 * 这里只取目标 date 的那些，统计 `done === true` 的条数。
 */
export function computeRoutineProgress(
  routines: readonly Routine[],
  completions: Record<string, RoutineCompletion>,
  date: string,
): RoutineProgress {
  const total = routines.length;
  if (total === 0) return { done: 0, total: 0, ratio: 0 };
  const done = routines.filter(
    (routine) => completions[routineCompletionKey(routine.id, date)]?.done ?? false,
  ).length;
  return { done, total, ratio: done / total };
}
