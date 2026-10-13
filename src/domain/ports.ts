import type { DailySelfStatus, Day, Inspiration, Item, Task, TimeSlot } from './types';
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
}

export interface SelfStatusRepository {
  /** 取某天的自我状态（主键即日期键） */
  get(date: string): Promise<DailySelfStatus | undefined>;
  /** 写入（主键即日期键，天然幂等） */
  upsert(selfStatus: DailySelfStatus): Promise<void>;
  /** 区间批量拉取（日历月 / 年视图用），走 `date` 索引 */
  listBetween(startDate: string, endDate: string): Promise<DailySelfStatus[]>;
}

export interface TimeSlotRepository {
  /** 取某天的全部时间段（含软删，由调用方决定过滤策略） */
  listByDate(date: string): Promise<TimeSlot[]>;
  /** 区间批量拉取（日历月 / 年视图用），走 `date` 索引 */
  listByDateRange(startDate: string, endDate: string): Promise<TimeSlot[]>;
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
  /** 批量写入（新增或更新），必须在单个事务内完成 */
  upsertMany(rows: Inspiration[]): Promise<void>;
  /** 物理删除（仅用于软删记录到期清理） */
  hardDeleteMany(ids: string[]): Promise<void>;
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
  settings: SettingsRepository;
}
