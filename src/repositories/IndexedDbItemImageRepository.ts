import type { ItemImageRepository } from '@/domain/ports';
import type { ItemImage } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';

/**
 * 条目图片附件的 IndexedDB 实现。
 *
 * 图片二进制单独成表（不塞进 Item 记录，避免 `listByDate` 把二进制一起捞上来）。
 * 通过 `itemId` 索引反查；条目被物理清理后，由 `purgeOrphans` 清掉孤儿附件。
 */
export class IndexedDbItemImageRepository implements ItemImageRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByItemIds(itemIds: string[]): Promise<ItemImage[]> {
    if (itemIds.length === 0) return [];
    try {
      const rows = await this.db.itemImages.where('itemId').anyOf(itemIds).toArray();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      throw new StorageError('读取条目图片失败', error);
    }
  }

  /** 备份导出用：全表拉取（按 createdAt 升序） */
  async listAll(): Promise<ItemImage[]> {
    try {
      const rows = await this.db.itemImages.toArray();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      throw new StorageError('读取全部条目图片失败', error);
    }
  }

  async putMany(images: ItemImage[]): Promise<void> {
    if (images.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.itemImages, async () => {
        await this.db.itemImages.bulkPut(images);
      });
    } catch (error) {
      throw new StorageError('写入条目图片失败', error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.itemImages.delete(id);
    } catch (error) {
      throw new StorageError('删除条目图片失败', error);
    }
  }

  async purgeOrphans(existingItemIds: Set<string>): Promise<number> {
    try {
      const all = await this.db.itemImages.toArray();
      const orphaned = all.filter((row) => !existingItemIds.has(row.itemId));
      if (orphaned.length === 0) return 0;
      await this.db.transaction('rw', this.db.itemImages, async () => {
        await this.db.itemImages.bulkDelete(orphaned.map((row) => row.id));
      });
      return orphaned.length;
    } catch (error) {
      throw new StorageError('清理孤儿图片失败', error);
    }
  }
}
