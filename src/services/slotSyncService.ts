import type { Item, SlotSyncDraft, TimeSlot } from '@/domain/types';
import type { Clock } from './clock';
import { createSiblingAfter } from './treeService';

/**
 * 「时间轴 → 同步到今日页」。
 *
 * 🔴 与 R-043 的任务同步是同一族语义：**一次性复制**，不是持续关联，
 * 也不是 R-042 那种只读投影。点「同步」的那一刻把勾选的时间段复制成
 * 今日页的条目，之后两边各自独立 —— 改时间段不会改条目，删条目也不会删时间段。
 *
 * 为什么不复用投影（时间段本来就自动投影在今日页）：投影是「归了板块的
 * 时间段永远自动在那儿」，而用户要的是「**挑几件**放进今日清单」这个动作 ——
 * 投影没有勾选，也就没有「挑」。两者服务不同场景，互不替代。
 * 代价是两边会各自漂移 —— 所以去重靠 `sourceSlotId`，重复点不会堆出第二份。
 */

/**
 * 挑出本次真正要新建的条目（入参是**用户勾选的**时间段，这里再做一次防御性过滤）。
 *
 * 排除四类：
 * - 不属于当天的（contract 是「某一天」，漏过滤会把别天的时间段同步过来）；
 * - **没归板块的**（`sectionId === null`）—— 今日页的条目必须落在某个板块下，
 *   没有板块就没有落点（与任务同步排除「其他」分组同理）；
 * - 内容为空的（建成空条目只会得到一排「未命名条目」）；
 * - **已经同步过的**（当日存在 `sourceSlotId === slot.id` 的存活条目）。
 */
export function planSlotSync(
  selected: readonly TimeSlot[],
  items: readonly Item[],
  date: string,
): SlotSyncDraft[] {
  const dayItems = items.filter((item) => item.date === date && item.deletedAt === null);

  const syncedSlotIds = new Set<string>();
  for (const item of dayItems) {
    if (item.sourceSlotId !== null && item.sourceSlotId !== undefined) {
      syncedSlotIds.add(item.sourceSlotId);
    }
  }

  const drafts: SlotSyncDraft[] = [];
  for (const slot of selected) {
    if (slot.date !== date) continue;
    if (slot.deletedAt !== null) continue;
    if (slot.sectionId === null) continue;
    const title = slot.content.trim();
    if (title.length === 0) continue;
    if (syncedSlotIds.has(slot.id)) continue;
    drafts.push({
      slotId: slot.id,
      date,
      sectionId: slot.sectionId,
      title,
      done: slot.done,
    });
  }
  return drafts;
}

/**
 * 把草稿变成新条目，**追加到对应板块的顶层末尾**
 * （与今日页内联快速添加、任务同步同一条路径：`createSiblingAfter(items, null, …)`）。
 *
 * 复用 `createSiblingAfter` 而不是自己算 order，是为了连「精度耗尽时整层重排」
 * 这种边界一起继承 —— 自己写一遍 order 计算，迟早会和树那边漂移。
 */
export function createSyncedSlotItems(
  items: readonly Item[],
  drafts: readonly SlotSyncDraft[],
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
    list[index] = { ...list[index], sourceSlotId: draft.slotId, done: draft.done };
    touched.push(result.newId);
    newIds.push(result.newId);
  }

  return { items: list, touched, newIds };
}
