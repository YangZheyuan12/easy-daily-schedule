import type { Item, Task } from '@/domain/types';

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

export function touchItem(item: Item, now: number): Item {
  return { ...item, updatedAt: now };
}

export function touchTask(task: Task, now: number): Task {
  return { ...task, updatedAt: now };
}
