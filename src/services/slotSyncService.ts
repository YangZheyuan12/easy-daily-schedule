import type { Item, SlotSyncDraft, TimeSlot } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import type { Clock } from './clock';
import { createSiblingAfter, nextOrder } from './treeService';

/**
 * 「时间轴 → 同步到今日页」。
 *
 * 语义（2026-10-26 调整）：时间轴时间段**不再自动投影**到今日页 ——
 * 「同步到今日」是时间段进入今日页的**唯一**途径。
 * **勾选即对齐** —— 勾了没同步过的就新建，勾了同步过的就更新
 * （跟随时间轴的最新分组 / 标题 / 完成情况）。
 * 它仍然是**复制**而不是关联：不勾选就不会自动跟着变，
 * 删掉今日页的条目也不会影响时间轴。
 *
 * 去重靠 `sourceSlotId`：同一个时段勾选再多次也只对应一条条目。
 */

/**
 * 已经「同步到今日」过的时间段 id 集合。
 *
 * 用于时间轴页进入勾选模式时**默认勾上**已同步过的时间段（再确认一次 = 更新，
 * 而不是堆出第二条），以及判断某条时段是否已经同步过。
 *
 * 只认**存活**条目：条目被删掉（软删）后，`sourceSlotId` 不再指向它，
 * 时段可重新同步一次。
 */
export function collectSyncedSlotIds(
  items: readonly Item[],
  date?: string,
): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.deletedAt !== null) continue;
    if (date !== undefined && item.date !== date) continue;
    // 老数据缺该字段，仓储已归一化为 null；这里再兜一次 undefined
    if (item.sourceSlotId === null || item.sourceSlotId === undefined) continue;
    ids.add(item.sourceSlotId);
  }
  return ids;
}

/** 更新一个已经同步过的条目（跟随时间轴的最新内容） */
export interface SlotSyncUpdate {
  /** 今日页那条条目的 id */
  itemId: string;
  /** 来源时段的 id，便于排查 */
  slotId: string;
  sectionId: SectionKey;
  title: string;
  done: boolean;
}

/** 一次同步的完整计划：没同步过的新建，同步过的更新 */
export interface SlotSyncPlan {
  create: SlotSyncDraft[];
  update: SlotSyncUpdate[];
}

/**
 * 规划本次同步（入参是**用户勾选的**时间段，这里再做一次防御性过滤）。
 *
 * 排除四类：
 * - 不属于当天的（contract 是「某一天」，漏过滤会把别天的时间段同步过来）；
 * - **没归板块的**（`sectionId === null`）—— 今日页的条目必须落在某个板块下，
 *   没有板块就没有落点（与任务同步排除「其他」分组同理）；
 * - 内容为空的（建成空条目只会得到一排「未命名条目」）；
 *
 * 🔴 已同步过的**不再跳过**，而是走 `update`（2026-10-20 改）：
 * 用户在时间轴改了分组 / 标题 / 完成情况，期望今日页跟着变；
 * 原来「重复点没反应」的语义被抱怨成「同步过的内容无法再次同步」。
 * 代价是今日页手改过的标题会被覆盖 —— 这是用户明确选择的取舍。
 */
export function planSlotSync(
  selected: readonly TimeSlot[],
  items: readonly Item[],
  date: string,
): SlotSyncPlan {
  const dayItems = items.filter((item) => item.date === date && item.deletedAt === null);
  const itemBySlot = new Map<string, Item>();
  for (const item of dayItems) {
    if (item.sourceSlotId === null || item.sourceSlotId === undefined) continue;
    itemBySlot.set(item.sourceSlotId, item);
  }

  const plan: SlotSyncPlan = { create: [], update: [] };
  for (const slot of selected) {
    if (slot.date !== date) continue;
    if (slot.deletedAt !== null) continue;
    if (slot.sectionId === null) continue;
    const title = slot.content.trim();
    if (title.length === 0) continue;

    const existing = itemBySlot.get(slot.id);
    if (existing) {
      // 今日页那条已经和时间轴一致 → 不产生更新（否则按钮写「更新 3 项」、
      // 落地时却一条都没动，用户会以为同步坏了）
      const unchanged =
        existing.sectionId === slot.sectionId &&
        existing.title === title &&
        existing.done === slot.done;
      if (!unchanged) {
        plan.update.push({
          itemId: existing.id,
          slotId: slot.id,
          sectionId: slot.sectionId,
          title,
          done: slot.done,
        });
      }
      continue;
    }
    plan.create.push({
      slotId: slot.id,
      date,
      sectionId: slot.sectionId,
      title,
      done: slot.done,
    });
  }
  return plan;
}

/**
 * 把计划落到条目上（新建 + 更新）。
 *
 * 更新时若**分组变了**，条目要挪到新板块的顶层末尾 —— 只改 `sectionId` 不改
 * `order` 的话，它会带着旧板块的排序值插进新板块中间，位置无法解释。
 */
export function applySlotSync(
  items: readonly Item[],
  plan: SlotSyncPlan,
  clock: Clock,
): { items: Item[]; touched: string[]; created: string[]; updated: string[] } {
  const createdResult = createSyncedSlotItems(items, plan.create, clock);
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
    // 没变就别写：白改一次 updatedAt，还会让同步多推一行
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

  return {
    items: list,
    touched,
    created: createdResult.newIds,
    updated,
  };
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
