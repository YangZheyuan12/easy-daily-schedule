import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbEntitlementRepository } from '@/repositories/IndexedDbEntitlementRepository';
import { makeEntitlement } from '@/services/__tests__/fixtures';

let counter = 0;

function makeRepo() {
  const db = new AppDatabase(`entitlement-test-${counter++}`);
  return { db, repo: new IndexedDbEntitlementRepository(db) };
}

describe('IndexedDbEntitlementRepository', () => {
  let db: AppDatabase;
  let repo: IndexedDbEntitlementRepository;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
  });

  it('空库 get 返回 undefined', async () => {
    expect(await repo.get()).toBeUndefined();
  });

  it('upsert/get：默认免费快照；覆盖写只一条', async () => {
    await repo.upsert(makeEntitlement());
    expect((await repo.get())?.plan).toBe('free');

    await repo.upsert(makeEntitlement({ plan: 'pro', state: 'active' }));
    const row = await repo.get();
    expect(row?.plan).toBe('pro');
    expect(await db.entitlements.count()).toBe(1);
  });

  it('plan 索引可用（升级后续按 plan 过滤预留）', async () => {
    await repo.upsert(makeEntitlement({ plan: 'pro', state: 'active' }));
    const rows = await db.entitlements.where('plan').equals('pro').toArray();
    expect(rows).toHaveLength(1);
  });

  it('clear 后清空', async () => {
    await repo.upsert(makeEntitlement());
    await repo.clear();
    expect(await repo.get()).toBeUndefined();
  });
});
