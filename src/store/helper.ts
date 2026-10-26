import type { Item, PinCompletion, Task } from '@/domain/types';
import { persistence } from './bootstrap';

/**
 * 变更落地辅助。
 *
 * 统一处理「更新内存 → 标记持久化」这两步，避免每个 action 各写一遍：
 * - 离散操作（勾选 / 删除 / 缩进 / 撤销）走 `immediate`，跳过防抖立刻写；
 * - 连续输入（改标题 / 描述）走防抖，避免每敲一个字开一次事务。
 */
export function pickTouched<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const idSet = new Set(ids);
  return items.filter((item) => idSet.has(item.id));
}

export function persistItems(items: readonly Item[], ids: readonly string[], immediate = false): void {
  const touched = pickTouched(items, ids);
  if (touched.length === 0) return;
  if (immediate) {
    // 先入脏表再立即 flush（flush 内部会取消挂起的防抖），两者顺序不能反
    persistence.markItems(touched);
    void persistence.scheduleImmediate();
    return;
  }
  persistence.markItems(touched);
}

export function persistTasks(tasks: readonly Task[], ids: readonly string[], immediate = false): void {
  const touched = pickTouched(tasks, ids);
  if (touched.length === 0) return;
  if (immediate) {
    persistence.markTasks(touched);
    void persistence.scheduleImmediate();
    return;
  }
  persistence.markTasks(touched);
}

export function persistPinCompletion(completion: PinCompletion, immediate = true): void {
  if (immediate) {
    persistence.markPinCompletion(completion);
    void persistence.scheduleImmediate();
    return;
  }
  persistence.markPinCompletion(completion);
}
