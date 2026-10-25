import type { AccountRepository } from '@/domain/ports';
import type { Account } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';

/**
 * 本地只缓存「当前登录账号」一份画像，主键固定 'current'。
 * token 绝不入库 —— 见 `platform/auth/secureTokenStore.ts`。
 */
const CURRENT_KEY = 'current' as const;

export class IndexedDbAccountRepository implements AccountRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(): Promise<Account | undefined> {
    try {
      return (await this.db.account.get(CURRENT_KEY)) ?? undefined;
    } catch (error) {
      throw new StorageError('读取账号失败', error);
    }
  }

  async upsert(account: Account): Promise<void> {
    try {
      await this.db.account.put({ ...account, id: CURRENT_KEY });
    } catch (error) {
      throw new StorageError('写入账号失败', error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.db.account.delete(CURRENT_KEY);
    } catch (error) {
      throw new StorageError('清除账号失败', error);
    }
  }
}
