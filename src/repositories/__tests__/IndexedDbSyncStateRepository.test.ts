import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbSyncStateRepository } from '@/repositories/IndexedDbSyncStateRepository';

let counter = 0;

function makeRepo(deviceId?: string) {
  const db = new AppDatabase(`sync-state-test-${counter++}`);
  const repo = new IndexedDbSyncStateRepository(db, deviceId ? () => deviceId : undefined);
  return { db, repo };
}

describe('IndexedDbSyncStateRepository', () => {
  it('首次读取就地落库，deviceId 稳定', async () => {
    const { db, repo } = makeRepo('dev_fixed');
    const first = await repo.get();
    const second = await repo.get();

    expect(first.deviceId).toBe('dev_fixed');
    expect(second.deviceId).toBe(first.deviceId);
    expect(await db.syncMeta.count()).toBe(1);

    db.close();
  });

  it('patch 只改传入的字段，其余保留', async () => {
    const { db, repo } = makeRepo('dev_a');
    await repo.get();
    const next = await repo.patch({ userId: 'u_1', lastPushedAt: 5_000 });

    expect(next.userId).toBe('u_1');
    expect(next.lastPushedAt).toBe(5_000);
    expect(next.deviceId).toBe('dev_a');
    expect(next.lastPulledAt).toBe(0);

    // 重新读要能拿到（真的落盘了，不是只在内存）
    const reread = await new IndexedDbSyncStateRepository(db).get();
    expect(reread.lastPushedAt).toBe(5_000);

    db.close();
  });

  it('reset 保留 deviceId，其余归零（退出登录场景）', async () => {
    const { db, repo } = makeRepo('dev_a');
    await repo.patch({ userId: 'u_1', lastPulledAt: 100, lastPushedAt: 200, serverTimeOffset: -5 });
    const reset = await repo.reset();

    expect(reset.deviceId).toBe('dev_a');
    expect(reset.userId).toBeNull();
    expect(reset.lastPulledAt).toBe(0);
    expect(reset.lastPushedAt).toBe(0);
    expect(reset.serverTimeOffset).toBe(0);

    db.close();
  });

  it('deviceId 默认带 dev_ 前缀（便于日后排查同步来源）', async () => {
    const { db, repo } = makeRepo();
    const state = await repo.get();
    expect(state.deviceId.startsWith('dev_')).toBe(true);

    db.close();
  });
});
