import type { InspirationRepository } from '@/domain/ports';
import type { Inspiration } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';
import { compareByOrder } from '@/domain/constants';
import { filterAlive } from './mappers';

/**
 * Inspiration 仓储的 IndexedDB 实现。
 *
 * 与 `IndexedDbTimeSlotRepository` 同构：读走 `date` 索引并过滤软删，
 * 写走单事务 `bulkPut`；软删记录到期由 `purgeExpired` 物理清理。
 */
export class IndexedDbInspirationRepository implements InspirationRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByDate(date: string): Promise<Inspiration[]> {
    try {
      const rows = await this.db.inspirations.where('date').equals(date).toArray();
      return filterAlive(rows).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取当日灵感失败', error);
    }
  }

  /** 区间批量拉取（日历月 / 年视图一次查一整段），走 `date` 索引的 between */
  async listByDateRange(startDate: string, endDate: string): Promise<Inspiration[]> {
    try {
      const rows = await this.db.inspirations
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray();
      return filterAlive(rows).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取区间灵感失败', error);
    }
  }

  /** 备份导出用：全表拉取（含软删，由调用方决定过滤策略） */
  async listAll(): Promise<Inspiration[]> {
    try {
      const rows = await this.db.inspirations.toArray();
      return rows.sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取全部灵感失败', error);
    }
  }

  async upsertMany(rows: Inspiration[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.inspirations, async () => {
        await this.db.inspirations.bulkPut(rows);
      });
    } catch (error) {
      throw new StorageError('写入灵感失败', error);
    }
  }

  async hardDeleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.inspirations, async () => {
        await this.db.inspirations.bulkDelete(ids);
      });
    } catch (error) {
      throw new StorageError('清理灵感失败', error);
    }
  }

  /** 启动时清理过期软删记录（超过保留时长） */
  async purgeExpired(cutoff: number): Promise<number> {
    try {
      const all = await this.db.inspirations.toArray();
      const expired = all.filter((row) => row.deletedAt !== null && (row.deletedAt ?? 0) < cutoff);
      if (expired.length === 0) return 0;
      await this.hardDeleteMany(expired.map((row) => row.id));
      return expired.length;
    } catch (error) {
      throw new StorageError('清理过期软删灵感失败', error);
    }
  }
}
