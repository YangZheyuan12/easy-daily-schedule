import type { Repositories } from '@/domain/ports';
import { toAppError } from '@/domain/errors';
import { createRepositories } from '@/repositories';
import { systemClock, type Clock } from '@/services/clock';
import { PersistenceService } from '@/services/persistenceService';
import { UndoService } from '@/services/undoService';
import { PURGE_AFTER_MS } from '@/domain/constants';

/**
 * 依赖装配。
 *
 * 全项目唯一的初始化入口：创建仓储 → 创建服务 → 注册页面生命周期。
 * 上层（store / 组件）只拿到接口，不知道底层是 IndexedDB 还是别的。
 */

export const repos: Repositories = createRepositories();
export const clock: Clock = systemClock;
export const undoService = new UndoService(clock);

type ErrorHandler = (error: unknown) => void;

const errorHandlers = new Set<ErrorHandler>();

/** 注册全局错误处理器（UI 用它弹提示） */
export function onError(handler: ErrorHandler): () => void {
  errorHandlers.add(handler);
  return () => errorHandlers.delete(handler);
}

function emitError(error: unknown): void {
  const appError = toAppError(error);
  for (const handler of errorHandlers) handler(appError);
}

export const persistence = new PersistenceService(repos, {
  onError: emitError,
});

let lifecycleBound = false;

/**
 * 绑定页面生命周期：切后台 / 关闭前强制落盘。
 *
 * 这是「零丢失」的关键 —— IndexedDB 的异步事务在页面被回收时可能来不及提交，
 * 所以 visibilitychange 与 pagehide 两个时机都要兜。
 */
export function bindLifecycle(): () => void {
  if (lifecycleBound) return () => undefined;
  lifecycleBound = true;

  const flush = () => {
    void persistence.flush('lifecycle');
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  addEventListener('visibilitychange', onVisibilityChange);
  addEventListener('pagehide', flush);

  return () => {
    removeEventListener('visibilitychange', onVisibilityChange);
    removeEventListener('pagehide', flush);
    lifecycleBound = false;
  };
}

/** 启动时清理超过 7 天的软删记录 */
export async function purgeExpiredSoftDeletes(): Promise<void> {
  try {
    const cutoff = clock.now() - PURGE_AFTER_MS;
    const purgeable: unknown[] = [repos.items, repos.tasks, repos.timeSlots, repos.inspirations];
    for (const repo of purgeable) {
      const candidate = repo as { purgeExpired?: (c: number) => Promise<number> };
      if (typeof candidate.purgeExpired === 'function') await candidate.purgeExpired(cutoff);
    }
    // 清理孤儿图片：所属条目已不存在（被物理清理）的附件一并删除。
    // 传 items 表**全部** id（含软删未到期），保证「还能撤销」的条目图片不被误删。
    const existingItemIds = new Set(await repos.items.listAllIds());
    await repos.itemImages.purgeOrphans(existingItemIds);
    // 任务图片按 tasks 表判定存活（两张表互不干涉，不能混用同一个 id 集合）
    const existingTaskIds = new Set((await repos.tasks.listAll()).map((t) => t.id));
    await repos.taskImages.purgeOrphans(existingTaskIds);
  } catch (error) {
    // 清理失败不影响启动，静默即可
    emitError(error);
  }
}

export { emitError };
