import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbAccountRepository } from '@/repositories/IndexedDbAccountRepository';
import { makeAccount } from '@/services/__tests__/fixtures';

let counter = 0;

function makeRepo() {
  const db = new AppDatabase(`account-test-${counter++}`);
  return { db, repo: new IndexedDbAccountRepository(db) };
}

describe('IndexedDbAccountRepository', () => {
  let db: AppDatabase;
  let repo: IndexedDbAccountRepository;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
  });

  it('空库 get 返回 undefined', async () => {
    expect(await repo.get()).toBeUndefined();
  });

  it('upsert 后可读；主键固定 current，重复写覆盖同一条', async () => {
    await repo.upsert(makeAccount({ userId: 'u1', email: 'a@b.c' }));
    expect((await repo.get())?.userId).toBe('u1');

    await repo.upsert(makeAccount({ userId: 'u2' }));
    const row = await repo.get();
    expect(row?.userId).toBe('u2');
    // 覆盖而非新增：库里始终只有一条 current
    expect(await db.account.count()).toBe(1);
    expect(await db.account.get('current')).toBeDefined();
  });

  it('clear 后 get 返回 undefined', async () => {
    await repo.upsert(makeAccount({ userId: 'u1' }));
    await repo.clear();
    expect(await repo.get()).toBeUndefined();
    expect(await db.account.count()).toBe(0);
  });
});
