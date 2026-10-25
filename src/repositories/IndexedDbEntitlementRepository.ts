import type { EntitlementRepository } from '@/domain/ports';
import type { Entitlement } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';

/**
 * 权益快照的本地缓存（服务端才是真相源）。
 * 单账号本地同时只持有一份，主键固定 'current'。
 */
const CURRENT_KEY = 'current' as const;

export class IndexedDbEntitlementRepository implements EntitlementRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(): Promise<Entitlement | undefined> {
    try {
      return (await this.db.entitlements.get(CURRENT_KEY)) ?? undefined;
    } catch (error) {
      throw new StorageError('读取权益失败', error);
    }
  }

  async upsert(entitlement: Entitlement): Promise<void> {
    try {
      await this.db.entitlements.put({ ...entitlement, id: CURRENT_KEY });
    } catch (error) {
      throw new StorageError('写入权益失败', error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.db.entitlements.delete(CURRENT_KEY);
    } catch (error) {
      throw new StorageError('清除权益失败', error);
    }
  }
}
