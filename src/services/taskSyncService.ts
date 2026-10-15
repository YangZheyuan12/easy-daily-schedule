import type { SectionKey } from '@/domain/enums';
import { isDailyTask } from '@/domain/enums';
import type { Item, Task, TaskSyncDraft } from '@/domain/types';
import { isSyncableSection } from '@/domain/constants';
import type { Clock } from './clock';
import { createSiblingAfter } from './treeService';

/**
 * 「任务页 → 同步到今日页」（R-043）。
 *
 * 🔴 这是一次性**复制**，不是持续关联，也不是只读投影：
 * 点「同步」的那一刻把任务内容复制成今日页的条目，之后两边各自独立 ——
 * 改任务不会改条目，删条目也不会删任务。
 *
 * 为什么不做成投影（像 R-042 的时间段那样）：用户要的是「一个按钮 + 一句确认」，
 * 说明他要的是「把这批东西放过去」这个**动作**；投影是「永远自动在那儿」，
 * 不需要按钮，也就不该有按钮。
 * 代价是两边会各自漂移 —— 所以去重靠 `sourceTaskId`，重复点不会堆出第二份。
 */

/**
 * 挑出本次真正要新建的条目。
 *
 * 排除三类：
 * - 「其他」分组 —— 今日页没有它的落点（R-043 明确要求不管）；
 * - 内容为空的任务 —— 建成空条目只会得到一排「未命名条目」；
 * - **已经同步过的**（今日页存在 `sourceTaskId === task.id` 的存活条目）——
 *   没有这一步，点两次按钮就会得到两份一模一样的条目，而用户看不出自己点重了。
 */
export function planTaskSync(
  tasks: readonly Task[],
  items: readonly Item[],
  date: string,
): TaskSyncDraft[] {
  // 防御性按当天过滤：本函数的 contract 是「某一天」，漏过滤会把别天的任务同步过来。
  // 只认「每日任务」—— 期限任务 / 长时目标是跨日期持久存在的，不该被同步进今日页。
  const dayTasks = tasks.filter(
    (task) => task.date === date && task.deletedAt === null && isDailyTask(task),
  );
  const dayItems = items.filter((item) => item.date === date && item.deletedAt === null);

  const syncedTaskIds = new Set<string>();
  for (const item of dayItems) {
    if (item.sourceTaskId !== null) syncedTaskIds.add(item.sourceTaskId);
  }

  const drafts: TaskSyncDraft[] = [];
  for (const task of dayTasks) {
    if (!isSyncableSection(task.sectionId)) continue;
    const title = task.content.trim();
    if (title.length === 0) continue;
    if (syncedTaskIds.has(task.id)) continue;
    drafts.push({
      taskId: task.id,
      date,
      sectionId: task.sectionId as SectionKey,
      title,
      done: task.done,
    });
  }
  return drafts;
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
