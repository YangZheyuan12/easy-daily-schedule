import type { TaskRepository } from '@/domain/ports';
import type { Task } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';
import { compareByOrder } from '@/domain/constants';
import { filterAlive, filterDeleted } from './mappers';

export class IndexedDbTaskRepository implements TaskRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByDate(date: string): Promise<Task[]> {
    try {
      const rows = await this.db.tasks.where('date').equals(date).toArray();
      return filterAlive(rows).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取当日任务失败', error);
    }
  }

  /** 区间批量拉取（日历月视图一次查一整月），走 `date` 索引避免全表扫描 */
  async listByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    try {
      const rows = await this.db.tasks
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray();
      return filterAlive(rows).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取区间任务失败', error);
    }
  }

  async listAll(): Promise<Task[]> {
    try {
      return await this.db.tasks.toArray();
    } catch (error) {
      throw new StorageError('读取全部任务失败', error);
    }
  }

  async upsertMany(tasks: Task[]): Promise<void> {
    if (tasks.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.tasks, async () => {
        await this.db.tasks.bulkPut(tasks);
      });
    } catch (error) {
      throw new StorageError('写入任务失败', error);
    }
  }

  async hardDeleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.tasks, async () => {
        await this.db.tasks.bulkDelete(ids);
      });
    } catch (error) {
      throw new StorageError('清理任务失败', error);
    }
  }

  async purgeExpired(cutoff: number): Promise<number> {
    try {
      const all = await this.db.tasks.toArray();
      const expired = filterDeleted(all).filter((row) => (row.deletedAt ?? 0) < cutoff);
      if (expired.length === 0) return 0;
      await this.hardDeleteMany(expired.map((row) => row.id));
      return expired.length;
    } catch (error) {
      throw new StorageError('清理过期软删任务失败', error);
    }
  }
}
