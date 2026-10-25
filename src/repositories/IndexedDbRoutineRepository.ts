import type { RoutineRepository } from '@/domain/ports';
import type { Routine } from '@/domain/types';
import { OTHER_KEY } from '@/domain/enums';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';
import { compareByOrder } from '@/domain/constants';
import { filterAlive, filterPurgeable } from './mappers';

/**
 * 老数据缺 `sectionId`（Routine 在 v7 才引入，理论上不会有老数据，但归一化仍是防御性惯例）：
 * 读取时统一归一化为 `'other'`，避免 undefined 漏到业务层把固定任务分到一个不存在的组。
 */
function normalizeRoutine(row: Routine): Routine {
  return {
    ...row,
    sectionId: row.sectionId ?? OTHER_KEY,
    description: row.description ?? '',
  };
}

export class IndexedDbRoutineRepository implements RoutineRepository {
  constructor(private readonly db: AppDatabase) {}

  /** 全部存活模板（按 order 升序），业务层永远看不到软删数据 */
  async listAlive(): Promise<Routine[]> {
    try {
      const rows = await this.db.routines.toArray();
      return filterAlive(rows).map(normalizeRoutine).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取固定任务失败', error);
    }
  }

  /** 全表（含软删，清理用） */
  async listAll(): Promise<Routine[]> {
    try {
      const rows = await this.db.routines.toArray();
      return rows.map(normalizeRoutine);
    } catch (error) {
      throw new StorageError('读取固定任务失败', error);
    }
  }

  async upsertMany(routines: Routine[]): Promise<void> {
    if (routines.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.routines, async () => {
        await this.db.routines.bulkPut(routines);
      });
    } catch (error) {
      throw new StorageError('写入固定任务失败', error);
    }
  }

  async hardDeleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.routines, async () => {
        await this.db.routines.bulkDelete(ids);
      });
    } catch (error) {
      throw new StorageError('清理固定任务失败', error);
    }
  }

  /**
   * 软删清理：删除早于 cutoff 的 tombstone。
   * 固定任务不参与同步，因此忽略 syncedThrough（永远按 `deletedAt < cutoff` 清理）。
   */
  async purgeExpired(cutoff: number): Promise<number> {
    try {
      const all = await this.db.routines.toArray();
      const expired = filterPurgeable(all, cutoff, null);
      if (expired.length === 0) return 0;
      await this.hardDeleteMany(expired.map((row) => row.id));
      return expired.length;
    } catch (error) {
      throw new StorageError('清理过期软删固定任务失败', error);
    }
  }
}
