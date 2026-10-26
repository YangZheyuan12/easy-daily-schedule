import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  AiAnalysisRecord,
  DailySelfStatus,
  Day,
  Entitlement,
  Inspiration,
  Item,
  ItemImage,
  PinCompletion,
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
  /** 定住任务的每日完成态（按 taskId + date 维度） */
  pinCompletions!: EntityTable<PinCompletion, 'id'>;
  /** 账号画像缓存（非敏感，主键固定 'current'；token 不入库） */
  account!: EntityTable<Account, 'id'>;
  /** 权益快照缓存（服务端权益的本地缓存，主键固定 'current'） */
  entitlements!: EntityTable<Entitlement, 'id'>;
  /** 同步状态（单行）。与业务表同库，保证「写完数据 + 推进游标」可在同一事务里做 */
  syncMeta!: EntityTable<SyncMetaTable, 'key'>;
  /** AI 分析历史缓存（落本地，便于复查；纯本机数据） */
  aiAnalyses!: EntityTable<AiAnalysisRecord, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(DB_VERSION).stores(STORES);
  }
}

/** 默认单例。测试环境可自行 new AppDatabase(':memory:') 或传入临时库名。 */
export const db = new AppDatabase();
