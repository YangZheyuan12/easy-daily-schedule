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
import type {
  Account,
  DailySelfStatus,
  Day,
  Entitlement,
  Inspiration,
  Item,
  ItemImage,
  Routine,
  RoutineCompletion,
  Task,
  TaskImage,
  TimeSlot,
} from '@/domain/types';
import type { SyncState } from '@/domain/sync';

export const DB_NAME = 'daily-schedule';
export const DB_VERSION = 8;

export interface ItemTable extends Item {}
export interface TaskTable extends Task {}
export interface DayTable extends Day {}
export interface SelfStatusTable extends DailySelfStatus {}
export interface TimeSlotTable extends TimeSlot {}
export interface InspirationTable extends Inspiration {}
export interface ItemImageTable extends ItemImage {}
export interface TaskImageTable extends TaskImage {}
export interface RoutineTable extends Routine {}
export interface RoutineCompletionTable extends RoutineCompletion {}
/** 账号画像（非敏感缓存，主键固定 'current'；token 不入库） */
export interface AccountTable extends Account {}
/** 权益快照（服务端权益的本地缓存，主键固定 'current'） */
export interface EntitlementTable extends Entitlement {}
/**
 * 同步状态行。全表只有一行（`key === 'state'`），
 * 字段与 `SyncState` 平铺，省掉一层 JSON 序列化。
 */
export interface SyncMetaTable extends SyncState {
  key: string;
}

/** syncMeta 表的主键常量 —— 目前只有同步状态这一行 */
export const SYNC_STATE_KEY = 'state';

/**
 * stores 声明：主键 + 索引。
 * 主键用 `&id` 表示唯一且为字符串。
 *
 * v2 变更：删除 `reviews` 表（已合并进 selfStatus），新增 `selfStatus`（按日期键）
 * 与 `timeSlots`（按 id，附 date / [date+sectionId] / deletedAt 索引用于区间与过滤）。
 * v3 变更：新增 `inspirations` 表（按 id，附 date / deletedAt 索引）。Dexie 要求
 * 每个版本声明**完整** schema，故此处重申全部既有表。
 * v4 变更：新增 `itemImages` 表（按 id，附 itemId 索引），用于给条目挂图片附件。
 * v5 变更：新增 `taskImages` 表（按 id，附 taskId 索引），给任务也挂上图片附件
 * （期限任务 / 长时目标同样要能配图）。同样重申全部既有表。
 * v6 变更（同步内核）：新增 `syncMeta` 表（按 key，存 deviceId / 双游标 / 时钟偏移），
 * 并给五张参与 LWW 的表补 `updatedAt` 索引（增量扫描用；当前实现是全表扫描 +
 * 内存过滤，索引是为了后续数据量上来后能直接切成 `where('updatedAt').above()`）。
 * 新增索引不需要数据迁移，Dexie 会自动重建。
 * v7 变更（每日固定任务）：新增 `routines`（例行模板，跨日期复用）与 `routineCompletions`
 * （按 routineId + date 维度的每日完成记录）两张表。同样重申全部既有表。
 * v8 变更（账号与权益）：新增 `account`（账号画像缓存，主键固定 'current'）与
 * `entitlements`（权益快照缓存，plan / updatedAt 索引）两张表。同样重申全部既有表。
 * 🔴 token 不进库：敏感令牌走 platform 安全存储，本库只存非敏感画像与权益快照。
 */
export const STORES = {
  items: '&id, date, sectionId, parentId, [date+sectionId], deletedAt, updatedAt',
  tasks: '&id, date, deletedAt, inheritedFrom, updatedAt',
  days: '&date',
  selfStatus: '&date, updatedAt',
  timeSlots: '&id, date, [date+sectionId], deletedAt, updatedAt',
  inspirations: '&id, date, deletedAt, updatedAt',
  itemImages: '&id, itemId',
  taskImages: '&id, taskId',
  routines: '&id, order, sectionId, deletedAt, updatedAt',
  routineCompletions: '&id, routineId, date',
  account: '&id',
  entitlements: '&id, plan, updatedAt',
  syncMeta: '&key',
} as const;

export type StoreName = keyof typeof STORES;
