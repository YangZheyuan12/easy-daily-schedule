import type {
  DailySelfStatus,
  Day,
  Inspiration,
  Item,
  ItemImage,
  Task,
  TaskImage,
  TimeSlot,
} from './types';
import type { SectionKey } from './enums';

/**
 * 仓储端口（接口）。
 *
 * 这是**唯一允许触碰存储 API 的层边界**：`src/repositories/` 下的实现负责
 * 适配 IndexedDB（Dexie）；将来迁微信小程序时新增 `WxStorageRepository`，
 * 只需替换 `src/repositories/index.ts` 一个装配点，业务代码零改动。
 *
 * 本文件只定义契约，不含任何实现，也不 import 任何运行时依赖。
 */

export interface ItemRepository {
  /** 取某天某板块的全部条目（含软删，由 mapper 决定过滤策略） */
  listBySection(date: string, sectionId: SectionKey): Promise<Item[]>;
  /** 取某天全部板块的条目 */
  listByDate(date: string): Promise<Item[]>;
  /**
   * 区间批量拉取（日历月视图用）。
   * 实现必须走 `date` 索引的 between 查询，禁止全表 toArray 后再内存过滤。
   */
  listByDateRange(startDate: string, endDate: string): Promise<Item[]>;
  listAll(): Promise<Item[]>;
  get(id: string): Promise<Item | undefined>;
  /** 批量写入（新增或更新），必须在单个事务内完成 */
  upsertMany(items: Item[]): Promise<void>;
  /** 物理删除（仅用于软删记录到期清理） */
  hardDeleteMany(ids: string[]): Promise<void>;
  /** 返回 items 表中全部 id（含软删未到期的），用于清理孤儿图片附件 */
  listAllIds(): Promise<string[]>;
}

export interface TaskRepository {
  listByDate(date: string): Promise<Task[]>;
  /** 区间批量拉取（日历月视图用），走 `date` 索引 */
  listByDateRange(startDate: string, endDate: string): Promise<Task[]>;
  listAll(): Promise<Task[]>;
  upsertMany(tasks: Task[]): Promise<void>;
  hardDeleteMany(ids: string[]): Promise<void>;
}

export interface DayRepository {
  /** 确保该日记录存在（惰性创建），返回已有或新建的 Day */
  ensure(date: string): Promise<Day>;
  listAll(): Promise<Day[]>;
  /** 批量写入（备份导入用） */
  upsertMany(days: Day[]): Promise<void>;
  /** 清空整表。仅备份「覆盖导入」使用，日常业务禁止调用 */
  clearAll(): Promise<void>;
}

export interface SelfStatusRepository {
  /** 取某天的自我状态（主键即日期键） */
  get(date: string): Promise<DailySelfStatus | undefined>;
  /** 写入（主键即日期键，天然幂等） */
  upsert(selfStatus: DailySelfStatus): Promise<void>;
  /** 区间批量拉取（日历月 / 年视图用），走 `date` 索引 */
  listBetween(startDate: string, endDate: string): Promise<DailySelfStatus[]>;
  /** 全表拉取（备份导出用） */
  listAll(): Promise<DailySelfStatus[]>;
  /** 批量写入（备份导入用） */
  upsertMany(rows: DailySelfStatus[]): Promise<void>;
  /** 清空整表。仅备份「覆盖导入」使用，日常业务禁止调用 */
  clearAll(): Promise<void>;
}

export interface TimeSlotRepository {
  /** 取某天的全部时间段（含软删，由调用方决定过滤策略） */
  listByDate(date: string): Promise<TimeSlot[]>;
  /** 区间批量拉取（日历月 / 年视图用），走 `date` 索引 */
  listByDateRange(startDate: string, endDate: string): Promise<TimeSlot[]>;
  /** 全表拉取（备份导出用，含软删，由调用方过滤） */
  listAll(): Promise<TimeSlot[]>;
  /** 批量写入（新增或更新），必须在单个事务内完成 */
  upsertMany(slots: TimeSlot[]): Promise<void>;
  /** 物理删除（仅用于软删记录到期清理） */
  hardDeleteMany(ids: string[]): Promise<void>;
}

export interface InspirationRepository {
  /** 取某天的全部灵感（已过滤软删，按 order 排序） */
  listByDate(date: string): Promise<Inspiration[]>;
  /** 区间批量拉取（日历月 / 年视图用），走 `date` 索引 */
  listByDateRange(startDate: string, endDate: string): Promise<Inspiration[]>;
  /** 全表拉取（备份导出用，含软删，由调用方过滤） */
  listAll(): Promise<Inspiration[]>;
  /** 批量写入（新增或更新），必须在单个事务内完成 */
  upsertMany(rows: Inspiration[]): Promise<void>;
  /** 物理删除（仅用于软删记录到期清理） */
  hardDeleteMany(ids: string[]): Promise<void>;
}

/**
 * 条目图片附件仓储。
 *
 * 图片二进制单独成表，通过 `itemId` 反查；条目删除后由 `purgeOrphans` 清理孤儿附件。
 */
export interface ItemImageRepository {
  /** 批量取若干条目挂的图片（按 createdAt 升序），itemIds 为空返回 [] */
  listByItemIds(itemIds: string[]): Promise<ItemImage[]>;
  /** 全表拉取（备份导出用） */
  listAll(): Promise<ItemImage[]>;
  /** 批量写入（新增或更新），单事务 */
  putMany(images: ItemImage[]): Promise<void>;
  /** 删除单张图片 */
  delete(id: string): Promise<void>;
  /**
   * 清理孤儿附件：图片所属的条目记录已不存在时一并删除。
   * `existingItemIds` 应传入 items 表**全部** id（含软删未到期），
   * 这样「软删窗口内、还能撤销」的条目图片不会被误删。
   */
  purgeOrphans(existingItemIds: Set<string>): Promise<number>;
}

/** 任务图片附件仓储（与条目图片同构，但归属键是 taskId，故独立一张表） */
export interface TaskImageRepository {
  /** 批量取若干任务挂的图片（按 createdAt 升序），taskIds 为空返回 [] */
  listByTaskIds(taskIds: string[]): Promise<TaskImage[]>;
  /** 全表拉取（备份导出用） */
  listAll(): Promise<TaskImage[]>;
  /** 批量写入（新增或更新），单事务 */
  putMany(images: TaskImage[]): Promise<void>;
  /** 删除单张图片 */
  delete(id: string): Promise<void>;
  /** 清理孤儿附件：`existingTaskIds` 传 tasks 表**全部** id（含软删未到期） */
  purgeOrphans(existingTaskIds: Set<string>): Promise<number>;
}

/** 轻量键值偏好（板块改名 / 折叠态等），一期落在 localStorage */
export interface SettingsRepository {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
}

/** 全部仓储的集合，由 repositories/index.ts 装配后注入 */
export interface Repositories {
  items: ItemRepository;
  tasks: TaskRepository;
  days: DayRepository;
  selfStatus: SelfStatusRepository;
  timeSlots: TimeSlotRepository;
  inspirations: InspirationRepository;
  itemImages: ItemImageRepository;
  taskImages: TaskImageRepository;
  settings: SettingsRepository;
}
