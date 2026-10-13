/**
 * 云端仓储占位（P2）。
 *
 * 一期完全不启用。保留这个文件是为了把「二期上云」的改造点固定下来：
 * 1. 实现 `src/domain/ports.ts` 里相同的接口（如 ItemRepository / TaskRepository）；
 * 2. 在 `src/repositories/index.ts` 的 `createRepositories()` 里按开关切换实现；
 * 3. 业务层与 UI 层**零改动**。
 *
 * 之所以能做到零改动，是因为上层从来没见过 IndexedDB ——
 * 它们只认识 ports 里的接口。
 */

export interface CloudSyncOptions {
  /** 云端接口基址 */
  baseUrl: string;
  /** 用户令牌 */
  token: string;
}

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`「${feature}」属于 P2 云端同步能力，一期未实现`);
    this.name = 'NotImplementedError';
  }
}

/** 二期实现时在此落地增量同步（按 date + updatedAt 拉取差异） */
export function createCloudSyncPlaceholder(): never {
  throw new NotImplementedError('云端同步');
}
