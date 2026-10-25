import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbRoutineRepository } from '@/repositories/IndexedDbRoutineRepository';
import { makeRoutine } from '@/services/__tests__/fixtures';

let counter = 0;

function makeRepo() {
  const db = new AppDatabase(`routine-test-${counter++}`);
  return { db, repo: new IndexedDbRoutineRepository(db) };
}

describe('IndexedDbRoutineRepository', () => {
  let db: AppDatabase;
  let repo: IndexedDbRoutineRepository;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
  });

  it('listAlive 只返回存活模板，并按 order 升序', async () => {
    await db.routines.bulkPut([
      makeRoutine({ id: 'later', order: 2000 }),
      makeRoutine({ id: 'earlier', order: 1000 }),
      makeRoutine({ id: 'gone', deletedAt: 999 }),
    ]);

    const alive = await repo.listAlive();
    expect(alive.map((r) => r.id)).toEqual(['earlier', 'later']);
  });

  it('缺省 sectionId 被归一化为 other', async () => {
    await db.routines.put({ ...makeRoutine({ id: 'x' }), sectionId: undefined } as never);
    const alive = await repo.listAlive();
    expect(alive[0]?.sectionId).toBe('other');
  });

  it('upsertMany 后 listAlive 能读到，支持增量更新', async () => {
    await repo.upsertMany([makeRoutine({ id: 's1', title: '晨跑' })]);
    let alive = await repo.listAlive();
    expect(alive).toHaveLength(1);

    await repo.upsertMany([makeRoutine({ id: 's1', title: '夜跑' })]);
    alive = await repo.listAlive();
    expect(alive).toHaveLength(1);
    expect(alive[0]?.title).toBe('夜跑');
  });

  it('purgeExpired 删除早于 cutoff 的软删模板，保留未到点的（仍在库内、只是不出现在存活列表）', async () => {
    await db.routines.bulkPut([
      makeRoutine({ id: 'old', deletedAt: 100 }),
      makeRoutine({ id: 'fresh', deletedAt: 900 }),
      makeRoutine({ id: 'alive' }),
    ]);

    const removed = await repo.purgeExpired(500);
    expect(removed).toBe(1);

    // 存活列表只剩 alive：old 被物理删除；fresh 虽未被清理，但仍是软删状态，不出现在存活列表
    const aliveIds = (await repo.listAlive()).map((r) => r.id);
    expect(aliveIds).toEqual(['alive']);

    // 全量表仍含 fresh（未到清理时点，保留），不含 old
    const allIds = (await repo.listAll()).map((r) => r.id);
    expect(allIds).toContain('fresh');
    expect(allIds).not.toContain('old');
  });

  it('hardDeleteMany 物理删除模板', async () => {
    await db.routines.bulkPut([makeRoutine({ id: 'k1' }), makeRoutine({ id: 'k2' })]);
    await repo.hardDeleteMany(['k1']);
    const alive = await repo.listAlive();
    expect(alive.map((r) => r.id)).toEqual(['k2']);
  });
});
