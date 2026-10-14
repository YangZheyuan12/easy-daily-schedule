import type { ItemRepository } from '@/domain/ports';
import type { Item } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';
import { compareByOrder } from '@/domain/constants';
import { filterAlive, filterDeleted } from './mappers';

/**
 * Item 仓储的 IndexedDB 实现。
 *
 * 批量操作统一走 `bulkPut` + 单事务 —— 递归软删一棵子树会一次写 20+ 条记录，
 * 逐条 put 会开 20 个事务，在移动端明显掉帧。
 */
/**
 * 老数据缺 `sourceTaskId`（R-043 才加的字段），读取时统一归一化为 null。
 * 不归一化也能跑（比较时 undefined 恒不等于任何 id），但那属于「靠巧合正确」——
 * 业务层拿到的是 `string | null` 类型，就该真是这个值。
 */
function normalizeItem(item: Item): Item {
  return { ...item, sourceTaskId: item.sourceTaskId ?? null };
}

export class IndexedDbItemRepository implements ItemRepository {
  constructor(private readonly db: AppDatabase) {}

  async listBySection(date: string, sectionId: SectionKey): Promise<Item[]> {
    try {
      const rows = await this.db.items.where('[date+sectionId]').equals([date, sectionId]).toArray();
      return filterAlive(rows).map(normalizeItem).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取板块条目失败', error);
    }
  }

  async listByDate(date: string): Promise<Item[]> {
    try {
      const rows = await this.db.items.where('date').equals(date).toArray();
      return filterAlive(rows).map(normalizeItem).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取当日条目失败', error);
    }
  }

  /**
   * 区间批量拉取（日历月视图一次查一整月）。
   *
   * 必须走 `date` 索引的 between：全表 toArray 后在内存过滤会在数据量上来后
   * 变成 O(全表) 的读放大，而 between 只扫区间内的索引段。
   */
  async listByDateRange(startDate: string, endDate: string): Promise<Item[]> {
    try {
      const rows = await this.db.items
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray();
      return filterAlive(rows).map(normalizeItem).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取区间条目失败', error);
    }
  }

  /** 含软删记录，仅供清理任务使用 */
  async listAll(): Promise<Item[]> {
    try {
      const rows = await this.db.items.toArray();
      return rows.map(normalizeItem);
    } catch (error) {
      throw new StorageError('读取全部条目失败', error);
    }
  }

  async get(id: string): Promise<Item | undefined> {
    try {
      const row = await this.db.items.get(id);
      if (!row || row.deletedAt !== null) return undefined;
      return row;
    } catch (error) {
      throw new StorageError('读取条目失败', error);
    }
  }

  async upsertMany(items: Item[]): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.items, async () => {
        await this.db.items.bulkPut(items);
      });
    } catch (error) {
      throw new StorageError('写入条目失败', error);
    }
  }

  async hardDeleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.items, async () => {
        await this.db.items.bulkDelete(ids);
      });
    } catch (error) {
      throw new StorageError('清理条目失败', error);
    }
  }

  /**
   * 启动时清理过期软删记录（超过 7 天）。
   * 放在仓储层是因为只有它知道底层存储怎么查最省。
   */
  async purgeExpired(cutoff: number): Promise<number> {
    try {
      const all = await this.db.items.toArray();
      const expired = filterDeleted(all).filter((row) => (row.deletedAt ?? 0) < cutoff);
      if (expired.length === 0) return 0;
      await this.hardDeleteMany(expired.map((row) => row.id));
      return expired.length;
    } catch (error) {
      throw new StorageError('清理过期软删条目失败', error);
    }
  }
}
