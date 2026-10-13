import type { DayRepository, SelfStatusRepository } from '@/domain/ports';
import type { DailySelfStatus, Day } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';

/** Day 记录惰性创建：只有用户真正访问某天时才落库。 */
export class IndexedDbDayRepository implements DayRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  async ensure(date: string): Promise<Day> {
    try {
      const existing = await this.db.days.get(date);
      if (existing) return existing;
      const created: Day = { date, createdAt: this.now() };
      await this.db.days.put(created);
      return created;
    } catch (error) {
      throw new StorageError('初始化日期记录失败', error);
    }
  }

  async listAll(): Promise<Day[]> {
    try {
      return await this.db.days.toArray();
    } catch (error) {
      throw new StorageError('读取日期记录失败', error);
    }
  }
}

/** 当日自我状态（心情 + 身体）。主键即日期键，天然幂等。 */
export class IndexedDbSelfStatusRepository implements SelfStatusRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(date: string): Promise<DailySelfStatus | undefined> {
    try {
      return await this.db.selfStatus.get(date);
    } catch (error) {
      throw new StorageError('读取当日自我状态失败', error);
    }
  }

  async upsert(selfStatus: DailySelfStatus): Promise<void> {
    try {
      await this.db.selfStatus.put(selfStatus);
    } catch (error) {
      throw new StorageError('写入当日自我状态失败', error);
    }
  }

  /** 统计页批量拉取区间数据用 */
  async listBetween(startDate: string, endDate: string): Promise<DailySelfStatus[]> {
    try {
      return await this.db.selfStatus.where('date').between(startDate, endDate, true, true).toArray();
    } catch (error) {
      throw new StorageError('读取区间自我状态失败', error);
    }
  }
}
