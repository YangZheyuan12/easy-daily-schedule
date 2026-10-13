import type { TimeSlotRepository } from '@/domain/ports';
import type { TimeSlot } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';
import { compareByOrder } from '@/domain/constants';
import { filterAlive } from './mappers';

/**
 * TimeSlot 仓储的 IndexedDB 实现。
 *
 * 思路完全复用 `IndexedDbItemRepository`：读走 `date` 索引，写走单事务 `bulkPut`。
 */

/**
 * 老数据缺 `actualStartMin` / `actualEndMin`（Dexie 非索引字段无 schema），
 * 读取时统一归一化为 null，避免 undefined 漏到业务层。
 */
function normalizeSlot(slot: TimeSlot): TimeSlot {
  return {
    ...slot,
    actualStartMin: slot.actualStartMin ?? null,
    actualEndMin: slot.actualEndMin ?? null,
  };
}

export class IndexedDbTimeSlotRepository implements TimeSlotRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByDate(date: string): Promise<TimeSlot[]> {
    try {
      const rows = await this.db.timeSlots.where('date').equals(date).toArray();
      return filterAlive(rows).map(normalizeSlot).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取当日时间段失败', error);
    }
  }

  /**
   * 区间批量拉取（日历月 / 年视图一次查一整段）。
   *
   * 走 `date` 索引的 between，避免全表 toArray 后在内存过滤（数据量上来后的读放大）。
   */
  async listByDateRange(startDate: string, endDate: string): Promise<TimeSlot[]> {
    try {
      const rows = await this.db.timeSlots
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray();
      return filterAlive(rows).map(normalizeSlot).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取区间时间段失败', error);
    }
  }

  async upsertMany(slots: TimeSlot[]): Promise<void> {
    if (slots.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.timeSlots, async () => {
        await this.db.timeSlots.bulkPut(slots);
      });
    } catch (error) {
      throw new StorageError('写入时间段失败', error);
    }
  }

  async hardDeleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.db.transaction('rw', this.db.timeSlots, async () => {
        await this.db.timeSlots.bulkDelete(ids);
      });
    } catch (error) {
      throw new StorageError('清理时间段失败', error);
    }
  }

  /** 启动时清理过期软删记录（超过 7 天） */
  async purgeExpired(cutoff: number): Promise<number> {
    try {
      const all = await this.db.timeSlots.toArray();
      const expired = all.filter((row) => row.deletedAt !== null && (row.deletedAt ?? 0) < cutoff);
      if (expired.length === 0) return 0;
      await this.hardDeleteMany(expired.map((row) => row.id));
      return expired.length;
    } catch (error) {
      throw new StorageError('清理过期软删时间段失败', error);
    }
  }
}
