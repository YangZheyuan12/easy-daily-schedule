/**
 * ⚠️ 本文件记录的「上云」思路已被**否决**，保留它只是为了把教训固定下来。
 *
 * 原思路：实现 `domain/ports.ts` 里相同的仓储接口（ItemRepository 等），
 * 在 `createRepositories()` 里按开关切换成本地 / 云端两种实现。
 *
 * 为什么否决：那是**云端当真相源**的模式。一旦这么干 ——
 * - 离线就用不了（每次读写都要打网络）；
 * - 首屏要等网络，弱网下体验直接崩；
 * - 本地缓存与云端不一致时，谁对谁错说不清。
 * 本项目从第一天起就是**本地优先**（IndexedDB 是唯一真相源），二者不兼容。
 *
 * ✅ 实际采用的方案（2026-10-19）：
 * 同步是**平行于 repositories 的一条通道**，不替换任何仓储实现：
 *   `domain/ports.ts` 的 `SyncGateway`  ←  网络侧契约（pull / push）
 *   `repositories/` 里放具体实现      ←  HTTP 实现接进来即可
 *   `services/syncService.ts`         ←  纯逻辑内核（LWW / 游标 / 时钟换算）
 *   `repositories/IndexedDbSyncStateRepository` ← deviceId / 双游标 / 时钟偏移
 *
 * 业务层与 UI 层依旧零改动，但**离线下也零影响** —— 同步挂了 App 照常用。
 */

/** 保留原错误类型名，避免历史引用失效 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`「${feature}」尚未实现`);
    this.name = 'NotImplementedError';
  }
}
