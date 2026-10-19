import { SECTION_CONFIGS } from '@/domain/constants';
import type { DiaryEntry, DiaryGroup, Inspiration, Item, TimeSlot } from '@/domain/types';
import { buildVisibleRows } from './treeService';
import { collectSyncedSlotIds } from './slotSyncService';

/**
 * 主页日记体统一列表（纯函数，零浏览器 API）。
 *
 * 把四板块的树形条目 + 归类的时间轴时间段 + 灵感合并成「分组日记」视图：
 * - 四板块按固定顺序（工作/学习/健身/生活），每板块内部复用 `buildVisibleRows`
 *   展开树（折叠的子树不展开）；
 * - **空板块也要展示**（entries 为空数组）—— 它是「今天还没记这个板块」的唯一入口，
 *   整组消失会让用户找不到添加的地方（旧版 SectionCard 是可点的）；顺序仍固定。
 * - **时间轴里选了板块的时间段，投影进对应板块**（`kind: 'timeSlot'`）。
 *   只读投影，不复制成条目；`sectionId === null`（未归类）的不投影 ——
 *   时间轴允许「只是记一笔时间」而不纳入板块统计。
 * - 灵感恒为第 5 组，即使为空也展示（承载底部的快速添加入口）。
 *
 * 🔴 编号红线：`displayNo` 只是**展示**编号，只在内存里临时算，绝不写回 DB，
 * 也不参与 order / 折叠 / 树算法 —— 它是渲染期的派生值。
 *
 * 🔴 入参 contract：三个数组都应是**同一天**的数据（调用方按 `date` 加载）。
 * 本函数不做日期过滤 —— 漏过滤会在今天看到昨天的条目，而这类错误在 UI 上
 * 无法解释，所以统一由调用方保证（与 `items` / `inspirations` 既有约定一致）。
 */

export const DIARY_GROUP_ORDER = ['work', 'study', 'fitness', 'life', 'inspiration'] as const;

/** 时间段在板块内的排序：开始时间 → order → 创建时间（与 store 的 sortSlots 同一套） */
function sortSlots(slots: readonly TimeSlot[]): TimeSlot[] {
  return [...slots].sort(
    (a, b) => a.startMin - b.startMin || a.order - b.order || a.createdAt - b.createdAt,
  );
}

export function buildDiaryList(
  items: readonly Item[],
  inspirations: readonly Inspiration[],
  timeSlots: readonly TimeSlot[],
): DiaryGroup[] {
  const groups: DiaryGroup[] = [];
  // 顶层条目跨组连续编号：工作 2 条 + 学习 2 条 → 1、2、3、4
  let counter = 0;
  /*
    🔴 已经「同步到今日」过的时段**不能再投影**。
    否则一件事占两个号：它既是 `sourceSlotId` 指向它的真实条目（编号 n），
    又是这里的只读投影（编号 n+1），用户看到的就是「同步了 1 条，编号却跳了 2」。
  */
  const syncedSlotIds = collectSyncedSlotIds(items);

  for (const config of SECTION_CONFIGS) {
    const sectionItems = items.filter(
      (item) => item.sectionId === config.key && item.deletedAt === null,
    );
    const rows = buildVisibleRows(sectionItems);

    // 空板块照常入列（entries=[]），作为「今天还没记这个板块」的入口。
    // 编号只在真正有顶层条目时自增，空组不影响跨组连续编号。
    const entries: DiaryEntry[] = rows.map((row) =>
      row.depth === 0
        ? { displayNo: ++counter, kind: 'item', item: row.item, depth: 0 }
        : { displayNo: null, kind: 'child', item: row.item, depth: row.depth },
    );

    /*
      时间轴归到本板块的时间段：**追加在条目之后**，不插到前面。
      条目顺序是用户手动排的（order 可控），时间段是外部来源，让它覆盖用户
      已经排好的顺序会让「我明明把它排第一了」这类困惑变得无从解释。
      编号接着往下走 —— 它计入了完成率，就该等价于本板块的一件顶层事项。
    */
    const scopedSlots = sortSlots(
      timeSlots.filter(
        (slot) =>
          slot.sectionId === config.key &&
          slot.deletedAt === null &&
          !syncedSlotIds.has(slot.id),
      ),
    );
    for (const slot of scopedSlots) {
      entries.push({ displayNo: ++counter, kind: 'timeSlot', timeSlot: slot, depth: 0 });
    }

    groups.push({ key: config.key, name: config.name, entries });
  }

  // 灵感组恒在末尾、恒存在（即使为空，底部要放快速添加入口）；不参与编号
  const alive = inspirations
    .filter((row) => row.deletedAt === null)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  groups.push({
    key: 'inspiration',
    name: '灵感',
    entries: alive.map((row) => ({
      displayNo: null,
      kind: 'inspiration',
      inspiration: row,
      depth: 0,
    })),
  });

  return groups;
}
