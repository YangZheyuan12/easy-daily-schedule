import type { TaskRepository } from '@/domain/ports';
import type { Task } from '@/domain/types';
import { OTHER_KEY } from '@/domain/enums';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';
import { compareByOrder } from '@/domain/constants';
import { filterAlive, filterPurgeable } from './mappers';

/**
 * 老数据缺 `sectionId`（R-043 才加的字段，Dexie 非索引字段无 schema 约束），
 * 读取时统一归一化为 `'other'`，避免 undefined 漏到业务层把任务分到一个不存在的组。
 *
 * 归一化为「其他」而不是某个板块，是因为同步到今日页会把四大板块的任务复制成条目 ——
 * 若把历史任务默认算作「工作」，一次同步就会凭空造出一批用户没打算同步的条目。
 *
 * 同时归一化 `kind`（缺省按每日任务）与 `description`（缺省空串），
 * 让业务层永远拿不到 undefined，避免到处写 `?? 'daily'` / `?? ''`。
 *
 * 🔴 `pinFrom` / `pinUntil` 也必须归一化为 `null`：老数据（定住功能上线前的任务）
 * 缺这两个字段，读出来是 `undefined`。而业务层用 `pinFrom !== null` 判断「是否已定住」，
 * `undefined !== null` 恒为 true，会把所有老任务误判成「已定住」——
 * 表现就是图钉恒实心、点它只能「取消」不能「设为」（`pin()` 里 `pinFrom !== null` 直接 return）。
 */
function normalizeTask(task: Task): Task {
  return {
    ...task,
    sectionId: task.sectionId ?? OTHER_KEY,
    kind: task.kind ?? 'daily',
    description: task.description ?? '',
    pinFrom: task.pinFrom ?? null,
    pinUntil: task.pinUntil ?? null,
  };
}

export class IndexedDbTaskRepository implements TaskRepository {
  constructor(private readonly db: AppDatabase) {}

  async listByDate(date: string): Promise<Task[]> {
    try {
      const rows = await this.db.tasks.where('date').equals(date).toArray();
      return filterAlive(rows).map(normalizeTask).sort(compareByOrder);
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
      return filterAlive(rows).map(normalizeTask).sort(compareByOrder);
    } catch (error) {
      throw new StorageError('读取区间任务失败', error);
    }
  }

  async listAll(): Promise<Task[]> {
    try {
      const rows = await this.db.tasks.toArray();
      return rows.map(normalizeTask);
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

  async purgeExpired(cutoff: number, syncedThrough: number | null = null): Promise<number> {
    try {
      const all = await this.db.tasks.toArray();
      const expired = filterPurgeable(all, cutoff, syncedThrough);
      if (expired.length === 0) return 0;
      await this.hardDeleteMany(expired.map((row) => row.id));
      return expired.length;
    } catch (error) {
      throw new StorageError('清理过期软删任务失败', error);
    }
  }
}
