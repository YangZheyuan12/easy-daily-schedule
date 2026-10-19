import type { Item, Task } from '@/domain/types';
import { syncStamp } from '@/domain/sync';

/**
 * 仓储层的读写入口。
 *
 * 约定：
 * - **读**：统一过滤掉 `deletedAt !== null` 的记录，业务层永远看不到已软删数据，
 *   避免每个调用点各自写过滤逻辑。
 * - **写**：补全 `updatedAt`，保证默认值不为空。
 */

/** 过滤软删记录 */
export function filterAlive<T extends { deletedAt: number | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.deletedAt === null);
}

/** 只保留已软删记录（清理任务用） */
export function filterDeleted<T extends { deletedAt: number | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.deletedAt !== null);
}

/**
 * 软删清理的候选行：已过期 **且**（未开启同步 或 这个删除已经推上云）。
 *
 * 🔴 第二个条件是同步引入的，不能省：
 * 物理删掉一条还没推上云的 tombstone，云端就永远不知道它删过；
 * 下一轮同步时，对端那条「还活着」的行会被当成新数据推过来 —— **删除被复活**。
 * 这是本地优先同步最经典的翻车点，代价是清理会晚一点（最多晚到下一次成功同步）。
 *
 * `syncedThrough` 是「已推送到的本地时间」（由服务端游标换算而来）；
 * 传 null 表示没有开启同步，按老规则全清。
 */
export function filterPurgeable<T extends { deletedAt: number | null; updatedAt: number }>(
  rows: readonly T[],
  cutoff: number,
  syncedThrough: number | null,
): T[] {
  const deleted = filterDeleted([...rows]);
  if (syncedThrough === null) {
    return deleted.filter((row) => (row.deletedAt ?? 0) < cutoff);
  }
  return deleted.filter(
    (row) => (row.deletedAt ?? 0) < cutoff && syncStamp(row) <= syncedThrough,
  );
}

export function touchItem(item: Item, now: number): Item {
  return { ...item, updatedAt: now };
}

export function touchTask(task: Task, now: number): Task {
  return { ...task, updatedAt: now };
}
