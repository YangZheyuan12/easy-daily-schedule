/**
 * 同步结果的提示语。
 *
 * 时间轴与任务页共用同一套措辞，免得两处各自演化成
 * 「已同步 2 项」/「同步了 2 条」这种不一致的说法。
 *
 * 🔴 必须区分「新建」与「更新」：用户抱怨过「同步过的没法再同步」，
 * 而现在再点一次大多是**更新**（跟随时间轴 / 任务的最新分组与完成态）。
 * 如果照旧只说「已同步 0 项」，用户会以为这次什么都没发生 ——
 * 实际上今日页那条已经被改过了。
 */
export function describeSyncCounts(created: number, updated: number): string {
  if (created === 0 && updated === 0) return '没有变化，今日页已经是最新';
  if (created > 0 && updated > 0) return `新建 ${created} 项、更新 ${updated} 项`;
  if (created > 0) return `已同步 ${created} 项到今日`;
  return `已更新今日的 ${updated} 项`;
}

/** 确认前的计数（新建 / 更新分别多少） */
export interface SyncPlanCounts {
  create: number;
  update: number;
}

/** 确认按钮的文案。为 null（不在勾选模式）时给个兜底标签 */
export function syncButtonLabel(counts: SyncPlanCounts | null): string {
  if (counts === null) return '同步到今日';
  if (counts.create > 0 && counts.update > 0) {
    return `新建 ${counts.create} 项、更新 ${counts.update} 项`;
  }
  if (counts.create > 0) return `同步 ${counts.create} 项到今日`;
  if (counts.update > 0) return `更新 ${counts.update} 项`;
  return '今日页已是最新';
}
