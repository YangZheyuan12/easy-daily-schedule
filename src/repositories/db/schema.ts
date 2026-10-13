/**
 * Dexie 数据库 schema。
 *
 * 索引设计要点：
 * - `[date+sectionId]` 复合索引：首页与板块详情页的主查询路径（一次命中，不用先按 date 再内存过滤）。
 * - `parentId`：树形操作时按父节点取子节点。
 * - `deletedAt`：软删清理查询用。注意 Dexie **不会索引 null / undefined**，
 *   所以「未删除」的过滤走内存 filter（数据量在单日几百条量级，完全够用），
 *   「已删除」的清理走 `filter` 全表扫描（启动时执行一次）。
 */
import type { DailySelfStatus, Day, Inspiration, Item, Task, TimeSlot } from '@/domain/types';

export const DB_NAME = 'daily-schedule';
export const DB_VERSION = 3;

export interface ItemTable extends Item {}
export interface TaskTable extends Task {}
export interface DayTable extends Day {}
export interface SelfStatusTable extends DailySelfStatus {}
export interface TimeSlotTable extends TimeSlot {}
export interface InspirationTable extends Inspiration {}

/**
 * stores 声明：主键 + 索引。
 * 主键用 `&id` 表示唯一且为字符串。
 *
 * v2 变更：删除 `reviews` 表（已合并进 selfStatus），新增 `selfStatus`（按日期键）
 * 与 `timeSlots`（按 id，附 date / [date+sectionId] / deletedAt 索引用于区间与过滤）。
 * v3 变更：新增 `inspirations` 表（按 id，附 date / deletedAt 索引）。Dexie 要求
 * 每个版本声明**完整** schema，故此处重申全部既有表。
 */
export const STORES = {
  items: '&id, date, sectionId, parentId, [date+sectionId], deletedAt',
  tasks: '&id, date, deletedAt, inheritedFrom',
  days: '&date',
  selfStatus: '&date',
  timeSlots: '&id, date, [date+sectionId], deletedAt',
  inspirations: '&id, date, deletedAt',
} as const;

export type StoreName = keyof typeof STORES;
