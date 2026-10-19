import type { SectionKey } from '@/domain/enums';
import { isDailyTask } from '@/domain/enums';
import type { Item, Task, TaskSyncDraft } from '@/domain/types';
import { isSyncableSection } from '@/domain/constants';
import type { Clock } from './clock';
import { createSiblingAfter, nextOrder } from './treeService';

/**
 * 「任务页 → 同步到今日页」（R-043）。
 *
 * 语义（2026-10-20 调整）：**勾选即对齐** —— 只同步勾选的任务，
 * 没同步过的建成新条目，同步过的更新今日页那条（分组 / 标题 / 完成情况）。
 * 它仍是**复制**不是关联：不勾选就不会自动跟着变，删掉今日页的条目也不影响任务。
 *
 * 为什么不做成投影（像 R-042 的时间段那样）：投影是「永远自动在那儿」，
 * 用户没法挑；今日清单要的是「我把这几件放进去」这个**动作**。
 * 代价是两边会各自漂移 —— 所以去重靠 `sourceTaskId`，
 * 同一个任务勾选再多次也只对应**一条**条目。
 */

/**
 * 已经「同步到今日」过的任务 id 集合（与 `collectSyncedSlotIds` 同构）。
 *
 * 只认**存活**条目：今日页那条被删掉后，这个任务重新变成「没同步过」——
 * 再勾选一次会新建，而不是「明明删了却再也同步不过去」。
 */
export function collectSyncedTaskIds(items: readonly Item[], date?: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.deletedAt !== null) continue;
    if (date !== undefined && item.date !== date) continue;
    if (item.sourceTaskId === null || item.sourceTaskId === undefined) continue;
    ids.add(item.sourceTaskId);
  }
  return ids;
}

export interface TaskSyncUpdate {
  itemId: string;
  taskId: string;
  sectionId: SectionKey;
  title: string;
  done: boolean;
}

/** 一次同步的完整计划（与时段同步同构） */
export interface TaskSyncPlan {
  create: TaskSyncDraft[];
  update: TaskSyncUpdate[];
}

/**
 * 规划本次同步（2026-10-20 改：**只同步用户勾选的**）。
 *
 * 早先这里是「一键同步全部四大板块任务」，用户没法挑 —— 想只放两件进去时
 * 只能先同步再手动删。改成勾选制后，`tasks` 传的就是勾选的那些，
 * 函数仍然做防御性过滤（哪天 / 是不是每日任务 / 有没有分组 / 内容空不空）。
 *
 * 已同步过的**不再跳过**，走 `update`：勾选即对齐今日页那条条目。
 */
export function planTaskSync(
  tasks: readonly Task[],
  items: readonly Item[],
  date: string,
): TaskSyncPlan {
  // 防御性按当天过滤：本函数的 contract 是「某一天」，漏过滤会把别天的任务同步过来。
  // 只认「每日任务」—— 期限任务 / 长时目标是跨日期持久存在的，不该被同步进今日页。
  const dayTasks = tasks.filter(
    (task) => task.date === date && task.deletedAt === null && isDailyTask(task),
  );
  const dayItems = items.filter((item) => item.date === date && item.deletedAt === null);

  // 已同步过的任务 → 今日页那条条目（勾选即更新，不再跳过）
  const itemByTask = new Map<string, Item>();
  for (const item of dayItems) {
    if (item.sourceTaskId === null || item.sourceTaskId === undefined) continue;
    itemByTask.set(item.sourceTaskId, item);
  }

  const plan: TaskSyncPlan = { create: [], update: [] };
  for (const task of dayTasks) {
    if (!isSyncableSection(task.sectionId)) continue;
    const title = task.content.trim();
    if (title.length === 0) continue;

    const existing = itemByTask.get(task.id);
    if (existing) {
      // 今日页那条已经和任务一致 → 不产生更新（按钮上写几项，落地就得动几项）
      const unchanged =
        existing.sectionId === task.sectionId &&
        existing.title === title &&
        existing.done === task.done;
      if (!unchanged) {
        plan.update.push({
          itemId: existing.id,
          taskId: task.id,
          sectionId: task.sectionId as SectionKey,
          title,
          done: task.done,
        });
      }
      continue;
    }
    plan.create.push({
      taskId: task.id,
      date,
      sectionId: task.sectionId as SectionKey,
      title,
      done: task.done,
    });
  }
  return plan;
}

/**
 * 把计划落到条目上（新建 + 更新），与 `applySlotSync` 同构。
 *
 * 分组变了就挪到新板块顶层末尾；内容没变则不写，省掉一次无谓的 `updatedAt` 推进。
 */
export function applyTaskSync(
  items: readonly Item[],
  plan: TaskSyncPlan,
  clock: Clock,
): { items: Item[]; touched: string[]; created: string[]; updated: string[] } {
  const createdResult = createSyncedItems(items, plan.create, clock);
  let list = createdResult.items;
  const touched = [...createdResult.touched];
  const updated: string[] = [];

  for (const change of plan.update) {
    const index = list.findIndex((item) => item.id === change.itemId);
    if (index === -1) continue;
    const current = list[index] as Item;
    const sectionChanged = current.sectionId !== change.sectionId;
    const unchanged =
      !sectionChanged && current.title === change.title && current.done === change.done;
    if (unchanged) continue;

    list[index] = {
      ...current,
      sectionId: change.sectionId,
      title: change.title,
      done: change.done,
      order: sectionChanged ? nextOrder(list, null) : current.order,
      updatedAt: clock.now(),
    };
    touched.push(change.itemId);
    updated.push(change.itemId);
  }

  return { items: list, touched, created: createdResult.newIds, updated };
}

/**
 * 把草稿变成新条目，**追加到对应板块的顶层末尾**
 * （与今日页内联快速添加同一条路径：`createSiblingAfter(items, null, …)`）。
 *
 * 复用 `createSiblingAfter` 而不是自己算 order，是为了连「精度耗尽时整层重排」
 * 这种边界一起继承 —— 自己写一遍 order 计算，迟早会和树那边漂移。
 */
export function createSyncedItems(
  items: readonly Item[],
  drafts: readonly TaskSyncDraft[],
  clock: Clock,
): { items: Item[]; touched: string[]; newIds: string[] } {
  let list = [...items];
  const touched: string[] = [];
  const newIds: string[] = [];

  for (const draft of drafts) {
    const result = createSiblingAfter(
      list,
      null,
      { date: draft.date, sectionId: draft.sectionId, title: draft.title },
      clock,
    );
    list = result.items;
    const index = list.findIndex((item) => item.id === result.newId);
    if (index === -1) continue;
    // 建完再补来源标记与完成情况：这两个字段是同步专属的，
    // 不属于「建一个条目」的通用语义，不该塞进 createSiblingAfter 的入参
    list[index] = { ...list[index], sourceTaskId: draft.taskId, done: draft.done };
    touched.push(result.newId);
    newIds.push(result.newId);
  }

  return { items: list, touched, newIds };
}
