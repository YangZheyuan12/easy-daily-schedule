import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbInspirationRepository } from '@/repositories/IndexedDbInspirationRepository';
import { makeInspiration } from '@/services/__tests__/fixtures';

let counter = 0;

/** 每个用例用独立的库名，避免跨用例污染（fake-indexeddb 是进程级单例） */
function makeRepo() {
  const db = new AppDatabase(`inspiration-test-${counter++}`);
  return { db, repo: new IndexedDbInspirationRepository(db) };
}

describe('IndexedDbInspirationRepository', () => {
  let db: AppDatabase;
  let repo: IndexedDbInspirationRepository;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
  });

  it('listByDateRange 只返回区间内的存活灵感（闭区间，软删排除）', async () => {
    await db.inspirations.bulkPut([
      makeInspiration({ id: 'a', date: '2026-10-09' }),
      makeInspiration({ id: 'b', date: '2026-10-10' }),
      makeInspiration({ id: 'c', date: '2026-10-11' }),
      makeInspiration({ id: 'd', date: '2026-10-12', deletedAt: 1234 }), // 区间外 + 软删
      makeInspiration({ id: 'e', date: '2026-10-15' }), // 区间外
    ]);

    const range = await repo.listByDateRange('2026-10-09', '2026-10-11');
    const ids = range.map((row) => row.id).sort();

    expect(ids).toEqual(['a', 'b', 'c']);
    expect(ids).not.toContain('d');
  });

  it('listByDate 只返回当天存活灵感，并排除软删', async () => {
    await db.inspirations.bulkPut([
      makeInspiration({ id: 'x1', date: '2026-10-10' }),
      makeInspiration({ id: 'x2', date: '2026-10-10', deletedAt: 999 }),
      makeInspiration({ id: 'y1', date: '2026-10-11' }),
    ]);

    const day = await repo.listByDate('2026-10-10');
    expect(day.map((row) => row.id)).toEqual(['x1']);
  });

  it('listByDate 按 order 升序返回', async () => {
    await db.inspirations.bulkPut([
      makeInspiration({ id: 'later', date: '2026-10-10', order: 2000 }),
      makeInspiration({ id: 'earlier', date: '2026-10-10', order: 1000 }),
    ]);

    const day = await repo.listByDate('2026-10-10');
    expect(day.map((row) => row.id)).toEqual(['earlier', 'later']);
  });

  it('upsertMany 后 listByDate 能读到，且支持增量更新', async () => {
    await repo.upsertMany([
      makeInspiration({ id: 's1', content: '早起' }),
      makeInspiration({ id: 's2', content: '锻炼' }),
    ]);

    let day = await repo.listByDate('2026-10-10');
    expect(day).toHaveLength(2);

    // 更新其中一条，再 upsertMany 一次
    await repo.upsertMany([makeInspiration({ id: 's1', content: '晨跑' })]);
    day = await repo.listByDate('2026-10-10');
    expect(day).toHaveLength(2);
    expect(day.find((row) => row.id === 's1')?.content).toBe('晨跑');
  });

  it('hardDeleteMany 物理删除记录', async () => {
    await db.inspirations.bulkPut([
      makeInspiration({ id: 'k1', date: '2026-10-10' }),
      makeInspiration({ id: 'k2', date: '2026-10-10' }),
    ]);
    await repo.hardDeleteMany(['k1']);

    const day = await repo.listByDate('2026-10-10');
    expect(day.map((row) => row.id)).toEqual(['k2']);
  });
});
