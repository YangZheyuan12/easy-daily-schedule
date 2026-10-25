import Dexie, { type EntityTable } from 'dexie';
import type {
  DailySelfStatus,
  Day,
  Inspiration,
  Item,
  ItemImage,
  Routine,
  RoutineCompletion,
  Task,
  TaskImage,
  TimeSlot,
} from '@/domain/types';
import type { SyncMetaTable } from './schema';
import { DB_NAME, DB_VERSION, STORES } from './schema';

/**
 * Dexie 数据库实例。
 *
 * ⚠️ 这是全项目**唯一**直接触碰 IndexedDB 的地方。
 * 迁移到微信小程序时，替换 `src/repositories/` 下的实现即可，业务层零改动。
 */
export class AppDatabase extends Dexie {
  items!: EntityTable<Item, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  days!: EntityTable<Day, 'date'>;
  selfStatus!: EntityTable<DailySelfStatus, 'date'>;
  timeSlots!: EntityTable<TimeSlot, 'id'>;
  inspirations!: EntityTable<Inspiration, 'id'>;
  itemImages!: EntityTable<ItemImage, 'id'>;
  taskImages!: EntityTable<TaskImage, 'id'>;
  /** 每日固定任务：跨日期复用的例行模板 */
  routines!: EntityTable<Routine, 'id'>;
  /** 每日固定任务的每日完成记录（按 routineId + date 维度） */
  routineCompletions!: EntityTable<RoutineCompletion, 'id'>;
  /** 同步状态（单行）。与业务表同库，保证「写完数据 + 推进游标」可在同一事务里做 */
  syncMeta!: EntityTable<SyncMetaTable, 'key'>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(DB_VERSION).stores(STORES);
  }
}

/** 默认单例。测试环境可自行 new AppDatabase(':memory:') 或传入临时库名。 */
export const db = new AppDatabase();
