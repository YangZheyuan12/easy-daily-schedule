import { PREVIEW_ITEM_COUNT, SECTION_CONFIGS } from '@/domain/constants';
import type { SectionKey } from '@/domain/enums';
import type { Item, RingData, RingSegment, SectionProgress } from '@/domain/types';
import { groupChildren, sortByOrder } from './treeService';

/**
 * 完成度计算。
 *
 * 口径（产品决策 Q2）：
 * - **板块完成率 = 顶层条目完成数 ÷ 顶层条目总数**。子项不重复计入分母，
 *   否则一条带 5 个子项的条目会把完成率稀释或放大，失去参考价值。
 * - **总完成率用加权口径** = Σ(各板块顶层完成数) ÷ Σ(各板块顶层总数)，
 *   而不是四个板块百分比的算术平均 —— 后者会让「只有 1 条」的板块
 *   和「有 10 条」的板块权重相等，明显失真。
 */

/** 单个板块的完成度 */
export function computeSectionProgress(
  items: readonly Item[],
  sectionId: SectionKey,
): SectionProgress {
  const scoped = sortByOrder(items).filter((item) => item.sectionId === sectionId);
  const topLevel = (groupChildren(scoped).get(null) ?? []);
  const done = topLevel.filter((item) => item.done).length;
  const total = topLevel.length;
  return {
    sectionId,
    done,
    total,
    ratio: total === 0 ? 0 : done / total,
    preview: topLevel.slice(0, PREVIEW_ITEM_COUNT),
  };
}

/** 四个板块的完成度 */
export function computeAllSections(items: readonly Item[]): Record<SectionKey, SectionProgress> {
  const result = {} as Record<SectionKey, SectionProgress>;
  for (const config of SECTION_CONFIGS) {
    result[config.key] = computeSectionProgress(items, config.key);
  }
  return result;
}

/** 环形图数据 */
export function computeRingData(items: readonly Item[]): RingData {
  const segments: RingSegment[] = SECTION_CONFIGS.map((config) => {
    const progress = computeSectionProgress(items, config.key);
    return {
      sectionId: config.key,
      name: config.name,
      color: config.color,
      ratio: progress.ratio,
      done: progress.done,
      total: progress.total,
    };
  });

  const totalCount = segments.reduce((sum, s) => sum + s.total, 0);
  const totalDone = segments.reduce((sum, s) => sum + s.done, 0);

  return {
    overall: totalCount === 0 ? 0 : totalDone / totalCount,
    segments,
    isEmpty: totalCount === 0,
  };
}

/** 每日任务的完成度 */
export function computeTaskProgress(tasks: readonly { done: boolean }[]): {
  done: number;
  total: number;
  ratio: number;
} {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/** 百分比整数（用于展示，避免 0.30000000000000004 之类的浮点噪声） */
export function toPercent(ratio: number): number {
  return Math.round(ratio * 100);
}
