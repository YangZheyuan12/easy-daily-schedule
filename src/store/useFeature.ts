import type { FeatureKey } from '@/domain/types';
import { useEntitlementStore } from './useEntitlementStore';

/**
 * 组件用钩子：某功能点当前是否解锁（订阅权益，权益变化自动重渲染）。
 *
 * 用法示例：
 *   const canExportPdf = useFeature('advancedExport');
 *   // canExportPdf === false → 展示「升级」入口而不是功能本体
 */
export function useFeature(feature: FeatureKey): boolean {
  return useEntitlementStore((s) => s.isUnlocked(feature));
}
