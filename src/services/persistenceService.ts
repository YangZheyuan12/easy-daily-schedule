import { DEBOUNCE_MS } from '@/domain/constants';
import type {
  DailySelfStatus,
  Inspiration,
  Item,
  Routine,
  RoutineCompletion,
  Task,
  TimeSlot,
} from '@/domain/types';
import type { Repositories } from '@/domain/ports';
import { debounce } from '@/utils/debounce';
import type { Debounced } from '@/utils/debounce';

/**
 * 持久化调度。
 *
 * 时机策略（PRD R-016）：
 * - 连续输入（标题 / 描述）：防抖 500ms 后写，避免每敲一个字开一次事务；
 * - 离散操作（勾选、删除、缩进）：立即写；
 * - 页面切后台 / 关闭：`flush()` 强制落盘，杜绝丢数据。
 *
 * 实现上用一个「脏实体表」按 id 去重：同一个条目在防抖窗口内被改 10 次，
 * 最终只写最后一次，事务数从 10 降到 1。
 */

export type FlushReason = 'debounce' | 'immediate' | 'lifecycle' | 'manual';

export interface PersistenceSink {
  onFlushed?: (reason: FlushReason, count: number) => void;
  onError?: (error: unknown) => void;
}

export class PersistenceService {
  private dirtyItems = new Map<string, Item>();
  private dirtyTasks = new Map<string, Task>();
  private dirtySelfStatus = new Map<string, DailySelfStatus>();
  private dirtyTimeSlots = new Map<string, TimeSlot>();
  private dirtyInspirations = new Map<string, Inspiration>();
  private dirtyRoutines = new Map<string, Routine>();
  private dirtyRoutineCompletions = new Map<string, RoutineCompletion>();
  private readonly flushDebounced: Debounced<[]>;

  constructor(
    private readonly repos: Repositories,
    private readonly sink: PersistenceSink = {},
  ) {
    this.flushDebounced = debounce(() => {
      void this.flush('debounce');
    }, DEBOUNCE_MS);
  }

  markItem(item: Item): void {
    this.dirtyItems.set(item.id, item);
    this.flushDebounced();
  }

  markItems(items: readonly Item[]): void {
    for (const item of items) this.dirtyItems.set(item.id, item);
    if (items.length > 0) this.flushDebounced();
  }

  markTask(task: Task): void {
    this.dirtyTasks.set(task.id, task);
    this.flushDebounced();
  }

  markTasks(tasks: readonly Task[]): void {
    for (const task of tasks) this.dirtyTasks.set(task.id, task);
    if (tasks.length > 0) this.flushDebounced();
  }

  markSelfStatus(selfStatus: DailySelfStatus): void {
    this.dirtySelfStatus.set(selfStatus.date, selfStatus);
    this.flushDebounced();
  }

  markTimeSlot(slot: TimeSlot): void {
    this.dirtyTimeSlots.set(slot.id, slot);
    this.flushDebounced();
  }

  markInspiration(row: Inspiration): void {
    this.dirtyInspirations.set(row.id, row);
    this.flushDebounced();
  }

  markRoutine(routine: Routine): void {
    this.dirtyRoutines.set(routine.id, routine);
    this.flushDebounced();
  }

  markRoutines(routines: readonly Routine[]): void {
    for (const routine of routines) this.dirtyRoutines.set(routine.id, routine);
    if (routines.length > 0) this.flushDebounced();
  }

  markRoutineCompletion(completion: RoutineCompletion): void {
    this.dirtyRoutineCompletions.set(completion.id, completion);
    this.flushDebounced();
  }

  markRoutineCompletions(completions: readonly RoutineCompletion[]): void {
    for (const completion of completions) this.dirtyRoutineCompletions.set(completion.id, completion);
    if (completions.length > 0) this.flushDebounced();
  }

  /** 离散操作：立即物理删除完成记录（级联清理模板时用），跳过防抖直接落库 */
  async hardDeleteRoutineCompletions(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.repos.routineCompletions.hardDeleteMany(ids);
    } catch (error) {
      this.sink.onError?.(error);
    }
  }

  /** 离散操作：跳过防抖，立刻写 */
  async scheduleImmediate(): Promise<void> {
    await this.flush('immediate');
  }

  hasPending(): boolean {
    return (
      this.dirtyItems.size > 0 ||
      this.dirtyTasks.size > 0 ||
      this.dirtySelfStatus.size > 0 ||
      this.dirtyTimeSlots.size > 0 ||
      this.dirtyInspirations.size > 0 ||
      this.dirtyRoutines.size > 0 ||
      this.dirtyRoutineCompletions.size > 0
    );
  }

  async flush(reason: FlushReason = 'manual'): Promise<void> {
    if (!this.hasPending()) return;
    this.flushDebounced.cancel();

    const items = [...this.dirtyItems.values()];
    const tasks = [...this.dirtyTasks.values()];
    const selfStatuses = [...this.dirtySelfStatus.values()];
    const timeSlots = [...this.dirtyTimeSlots.values()];
    const inspirations = [...this.dirtyInspirations.values()];
    const routines = [...this.dirtyRoutines.values()];
    const routineCompletions = [...this.dirtyRoutineCompletions.values()];
    this.dirtyItems.clear();
    this.dirtyTasks.clear();
    this.dirtySelfStatus.clear();
    this.dirtyTimeSlots.clear();
    this.dirtyInspirations.clear();
    this.dirtyRoutines.clear();
    this.dirtyRoutineCompletions.clear();

    try {
      // 软删记录也要写（deletedAt 变更本身就是一次写）
      await this.repos.items.upsertMany(items);
      await this.repos.tasks.upsertMany(tasks);
      for (const selfStatus of selfStatuses) {
        await this.repos.selfStatus.upsert(selfStatus);
      }
      await this.repos.timeSlots.upsertMany(timeSlots);
      await this.repos.inspirations.upsertMany(inspirations);
      await this.repos.routines.upsertMany(routines);
      await this.repos.routineCompletions.upsertMany(routineCompletions);
      this.sink.onFlushed?.(
        reason,
        items.length +
          tasks.length +
          selfStatuses.length +
          timeSlots.length +
          inspirations.length +
          routines.length +
          routineCompletions.length,
      );
    } catch (error) {
      // 写失败要把脏数据放回去，否则这条改动就永久丢了
      for (const item of items) this.dirtyItems.set(item.id, item);
      for (const task of tasks) this.dirtyTasks.set(task.id, task);
      for (const selfStatus of selfStatuses) this.dirtySelfStatus.set(selfStatus.date, selfStatus);
      for (const slot of timeSlots) this.dirtyTimeSlots.set(slot.id, slot);
      for (const row of inspirations) this.dirtyInspirations.set(row.id, row);
      for (const routine of routines) this.dirtyRoutines.set(routine.id, routine);
      for (const completion of routineCompletions)
        this.dirtyRoutineCompletions.set(completion.id, completion);
      this.sink.onError?.(error);
    }
  }
}
