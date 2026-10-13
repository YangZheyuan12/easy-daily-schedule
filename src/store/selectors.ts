import type { SectionKey } from '@/domain/enums';
import type { Item, SectionProgress } from '@/domain/types';
import { computeAllSections } from '@/services/progressService';
import { buildVisibleRows } from '@/services/treeService';

/**
 * 派生数据选择器。
 *
 * 全部是纯函数（items → 视图模型），组件里用 `useMemo` 包一层即可，
 * 天然避免了在 store 里缓存派生状态导致的一致性问题。
 */

export function selectSectionItems(items: readonly Item[], sectionId: SectionKey): Item[] {
  return items.filter((item) => item.sectionId === sectionId && item.deletedAt === null);
}

export function selectVisibleRows(items: readonly Item[], sectionId: SectionKey) {
  return buildVisibleRows(selectSectionItems(items, sectionId));
}

export function selectProgressMap(items: readonly Item[]): Record<SectionKey, SectionProgress> {
  return computeAllSections(items.filter((item) => item.deletedAt === null));
}
