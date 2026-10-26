import type { PinCompletionRepository } from '@/domain/ports';
import type { PinCompletion } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';

/**
 * 定住任务的每日完成态仓储（按 taskId + date 维度）。
 *
 * 完成态按 `taskId@date` 存 `pinCompletions` 表，投影任务勾选时直接 upsert，
 * 天然幂等；模板被删（软删到期物理清理）后，其完成记录成孤儿，由 `purgeOrphans` 清理。
 */
export class IndexedDbPinCompletionRepository implements PinCompletionRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByDate(date: string): Promise<PinCompletion[]> {
    try {
      return await this.db.pinCompletions.where('date').equals(date).toArray();
    } catch (error) {
      throw new StorageError('读取定住完成记录失败', error);
    }
  }

  async listByTaskIds(taskIds: string[]): Promise<PinCompletion[]> {
    if (taskIds.length === 0) return [];
    try {
      return await this.db.pinCompletions.where('taskId').anyOf(taskIds).toArray();
    } catch (error) {
      throw new StorageError('读取定住完成记录失败', error);
    }
  }

  async listAll(): Promise<PinCompletion[]> {
    try {
      return await this.db.pinCompletions.toArray();
    } catch (error) {
      throw new StorageError('读取全部定住完成记录失败', error);
    }
  }

  async upsertMany(rows: PinCompletion[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.pinCompletions, async () => {
        await this.db.pinCompletions.bulkPut(rows);
      });
    } catch (error) {
      throw new StorageError('写入定住完成记录失败', error);
    }
  }

  async hardDeleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.pinCompletions, async () => {
        await this.db.pinCompletions.bulkDelete(ids);
      });
    } catch (error) {
      throw new StorageError('清理定住完成记录失败', error);
    }
  }

  async purgeOrphans(existingTaskIds: Set<string>): Promise<number> {
    try {
      const all = await this.db.pinCompletions.toArray();
      const orphaned = all.filter((row) => !existingTaskIds.has(row.taskId));
      if (orphaned.length === 0) return 0;
      await this.hardDeleteMany(orphaned.map((row) => row.id));
      return orphaned.length;
    } catch (error) {
      throw new StorageError('清理孤儿定住完成记录失败', error);
    }
  }
}
