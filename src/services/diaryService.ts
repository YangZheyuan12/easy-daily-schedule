import { SECTION_CONFIGS } from '@/domain/constants';
import type { DiaryEntry, DiaryGroup, Inspiration, Item } from '@/domain/types';
import { buildVisibleRows } from './treeService';

/**
 * 主页日记体统一列表（纯函数，零浏览器 API）。
 *
 * 把四板块的树形条目 + 灵感合并成「分组日记」视图：
 * - 四板块按固定顺序（工作/学习/健身/生活），每板块内部复用 `buildVisibleRows`
 *   展开树（折叠的子树不展开）；
 * - **空板块也要展示**（entries 为空数组）—— 它是「今天还没记这个板块」的唯一入口，
 *   整组消失会让用户找不到添加的地方（旧版 SectionCard 是可点的）；顺序仍固定。
 * - 灵感恒为第 5 组，即使为空也展示（承载底部的快速添加入口）。
 *
 * 🔴 时间轴时间段**不再自动投影**（2026-10-26 改）：用户明确要求「只有点了
 *   『同步到今日』按钮并勾选，才会同步到今日」。时间段进入今日页的唯一途径是
 *   同步成条目（`sourceSlotId` 标记），此处不再接收 `timeSlots`、不再产出
 *   `kind: 'timeSlot'` 的只读投影行。
 *
 * 🔴 编号红线：`displayNo` 只是**展示**编号，只在内存里临时算，绝不写回 DB，
 * 也不参与 order / 折叠 / 树算法 —— 它是渲染期的派生值。
 *
 * 🔴 入参 contract：两个数组都应是**同一天**的数据（调用方按 `date` 加载）。
 * 本函数不做日期过滤 —— 漏过滤会在今天看到昨天的条目，而这类错误在 UI 上
 * 无法解释，所以统一由调用方保证（与 `items` / `inspirations` 既有约定一致）。
 */

export const DIARY_GROUP_ORDER = ['work', 'study', 'fitness', 'life', 'inspiration'] as const;

export function buildDiaryList(
  items: readonly Item[],
  inspirations: readonly Inspiration[],
): DiaryGroup[] {
  const groups: DiaryGroup[] = [];
  // 顶层条目跨组连续编号：工作 2 条 + 学习 2 条 → 1、2、3、4
  let counter = 0;

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
