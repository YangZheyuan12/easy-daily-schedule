import { nanoid } from 'nanoid';
import type { SyncStateRepository } from '@/domain/ports';
import type { SyncState } from '@/domain/sync';
import { DEFAULT_SYNC_STATE } from '@/domain/sync';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';
import { SYNC_STATE_KEY } from './db/schema';

/**
 * 同步状态的 IndexedDB 实现。
 *
 * 「本地优先」架构里，这四个字段是**同步正确性**的一部分，不是可有可无的偏好：
 * - `deviceId` —— 首次生成后永不变。LWW 时间戳打平时靠它收敛到唯一结果，
 *   换一个就等于换了一台设备，可能把别人的改动判成「本机更新」；
 * - `lastPulledAt` / `lastPushedAt` —— 双游标（服务端轴）。丢了会退化成全量重传，
 *   虽然不会错，但白白重传几千行；
 * - `serverTimeOffset` —— 手机时钟不准是常态，没有它两轴换算就是错的。
 *
 * 所以它们落在 IndexedDB 而不是 localStorage（后者会被系统清理得更随意）。
 */
export class IndexedDbSyncStateRepository implements SyncStateRepository {
  constructor(
    private readonly db: AppDatabase,
    /** 设备 id 生成器，测试里可注入固定值 */
    private readonly newDeviceId: () => string = () => `dev_${nanoid(12)}`,
  ) {}

  async get(): Promise<SyncState> {
    try {
      const row = await this.db.syncMeta.get(SYNC_STATE_KEY);
      if (row) {
        const { key: _key, ...state } = row;
        return state;
      }
    } catch (error) {
      throw new StorageError('读取同步状态失败', error);
    }
    // 首次读取：就地落一份，保证 deviceId 稳定（否则每次读都换一个 id）
    return this.patch({ deviceId: this.newDeviceId() });
  }

  async patch(patch: Partial<SyncState>): Promise<SyncState> {
    try {
      const current = await this.readOrDefault();
      const next: SyncState = { ...current, ...patch };
      await this.db.syncMeta.put({ key: SYNC_STATE_KEY, ...next });
      return next;
    } catch (error) {
      throw new StorageError('写入同步状态失败', error);
    }
  }

  /** 退出登录：保留 deviceId（换设备才有意义），游标与用户归零 */
  async reset(): Promise<SyncState> {
    const current = await this.readOrDefault();
    return this.patch({
      ...DEFAULT_SYNC_STATE,
      deviceId: current.deviceId,
      serverTimeOffset: 0,
    });
  }

  private async readOrDefault(): Promise<SyncState> {
    const row = await this.db.syncMeta.get(SYNC_STATE_KEY);
    if (!row) {
      return { ...DEFAULT_SYNC_STATE, deviceId: this.newDeviceId() };
    }
    const { key: _key, ...state } = row;
    return state;
  }
}

/** 测试与 Node 环境下的内存实现 */
export class MemorySyncStateRepository implements SyncStateRepository {
  private state: SyncState;

  constructor(deviceId = 'dev_test') {
    this.state = { ...DEFAULT_SYNC_STATE, deviceId };
  }

  async get(): Promise<SyncState> {
    return { ...this.state };
  }

  async patch(patch: Partial<SyncState>): Promise<SyncState> {
    this.state = { ...this.state, ...patch };
    return { ...this.state };
  }

  async reset(): Promise<SyncState> {
    this.state = { ...DEFAULT_SYNC_STATE, deviceId: this.state.deviceId };
    return { ...this.state };
  }
}
