import type { TaskImageRepository } from '@/domain/ports';
import type { TaskImage } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';

/**
 * 任务图片附件的 IndexedDB 实现。
 *
 * 与 `IndexedDbItemImageRepository` 是两张互不干涉的表：
 * 归属键分别是 itemId / taskId，混在一张表里会让孤儿清理（按各自的主表判定存活）
 * 无法写 —— 挂给任务的图会被当成「条目已不存在」而误删。
 */
export class IndexedDbTaskImageRepository implements TaskImageRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByTaskIds(taskIds: string[]): Promise<TaskImage[]> {
    if (taskIds.length === 0) return [];
    try {
      const rows = await this.db.taskImages.where('taskId').anyOf(taskIds).toArray();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      throw new StorageError('读取任务图片失败', error);
    }
  }

  /** 备份导出用：全表拉取（按 createdAt 升序） */
  async listAll(): Promise<TaskImage[]> {
    try {
      const rows = await this.db.taskImages.toArray();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      throw new StorageError('读取全部任务图片失败', error);
    }
  }

  async putMany(images: TaskImage[]): Promise<void> {
    if (images.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.taskImages, async () => {
        await this.db.taskImages.bulkPut(images);
      });
    } catch (error) {
      throw new StorageError('写入任务图片失败', error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.taskImages.delete(id);
    } catch (error) {
      throw new StorageError('删除任务图片失败', error);
    }
  }

  async purgeOrphans(existingTaskIds: Set<string>): Promise<number> {
    try {
      const all = await this.db.taskImages.toArray();
      const orphaned = all.filter((row) => !existingTaskIds.has(row.taskId));
      if (orphaned.length === 0) return 0;
      await this.db.transaction('rw', this.db.taskImages, async () => {
        await this.db.taskImages.bulkDelete(orphaned.map((row) => row.id));
      });
      return orphaned.length;
    } catch (error) {
      throw new StorageError('清理孤儿任务图片失败', error);
    }
  }
}
