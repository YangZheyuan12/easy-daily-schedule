import type { RoutineCompletionRepository } from '@/domain/ports';
import type { RoutineCompletion } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';

/**
 * 每日固定任务的每日完成记录仓储。
 *
 * 完成记录按 `routineId + date` 维度存在 `routineCompletions` 表，主键 `id = routineId@date`。
 * 因为完成态是「每天的独立一份」，这里没有软删概念 —— 模板被删后，其完成记录
 * 通过 `purgeOrphans` 直接物理清理（已完成记录对已经不存在的模板毫无意义）。
 */
export class IndexedDbRoutineCompletionRepository implements RoutineCompletionRepository {
  constructor(private readonly db: AppDatabase) {}

  /** 某天的全部完成记录（走 `date` 索引） */
  async listByDate(date: string): Promise<RoutineCompletion[]> {
    try {
      return await this.db.routineCompletions.where('date').equals(date).toArray();
    } catch (error) {
      throw new StorageError('读取固定任务完成记录失败', error);
    }
  }

  /** 若干模板的完成记录（级联 / 清理用） */
  async listByRoutineIds(routineIds: string[]): Promise<RoutineCompletion[]> {
    if (routineIds.length === 0) return [];
    try {
      const all = await this.db.routineCompletions.toArray();
      const set = new Set(routineIds);
      return all.filter((row) => set.has(row.routineId));
    } catch (error) {
      throw new StorageError('读取固定任务完成记录失败', error);
    }
  }

  /** 全表拉取（清理用） */
  async listAll(): Promise<RoutineCompletion[]> {
    try {
      return await this.db.routineCompletions.toArray();
    } catch (error) {
      throw new StorageError('读取固定任务完成记录失败', error);
    }
  }

  /** 批量写入（新增或更新），单事务 */
  async upsertMany(rows: RoutineCompletion[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.routineCompletions, async () => {
        await this.db.routineCompletions.bulkPut(rows);
      });
    } catch (error) {
      throw new StorageError('写入固定任务完成记录失败', error);
    }
  }

  /** 物理删除 */
  async hardDeleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.routineCompletions, async () => {
        await this.db.routineCompletions.bulkDelete(ids);
      });
    } catch (error) {
      throw new StorageError('清理固定任务完成记录失败', error);
    }
  }

  /** 清理孤儿：所属模板已不存在的完成记录一并删除，返回清理条数 */
  async purgeOrphans(existingRoutineIds: Set<string>): Promise<number> {
    try {
      const all = await this.db.routineCompletions.toArray();
      const orphans = all.filter((row) => !existingRoutineIds.has(row.routineId));
      if (orphans.length === 0) return 0;
      await this.hardDeleteMany(orphans.map((row) => row.id));
      return orphans.length;
    } catch (error) {
      throw new StorageError('清理孤儿固定任务完成记录失败', error);
    }
  }
}
