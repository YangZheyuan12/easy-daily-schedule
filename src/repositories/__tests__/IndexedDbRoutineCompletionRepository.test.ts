import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbRoutineCompletionRepository } from '@/repositories/IndexedDbRoutineCompletionRepository';
import { makeRoutineCompletion } from '@/services/__tests__/fixtures';

let counter = 0;

function makeRepo() {
  const db = new AppDatabase(`routine-completion-test-${counter++}`);
  return { db, repo: new IndexedDbRoutineCompletionRepository(db) };
}

describe('IndexedDbRoutineCompletionRepository', () => {
  let db: AppDatabase;
  let repo: IndexedDbRoutineCompletionRepository;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
  });

  it('listByDate 只返回该天的完成记录', async () => {
    await db.routineCompletions.bulkPut([
      makeRoutineCompletion({ id: 'rt1@2026-10-10', routineId: 'rt1', date: '2026-10-10', done: true }),
      makeRoutineCompletion({ id: 'rt2@2026-10-10', routineId: 'rt2', date: '2026-10-10', done: false }),
      makeRoutineCompletion({ id: 'rt1@2026-10-11', routineId: 'rt1', date: '2026-10-11', done: true }),
    ]);

    const day = await repo.listByDate('2026-10-10');
    expect(day.map((c) => c.id).sort()).toEqual(['rt1@2026-10-10', 'rt2@2026-10-10']);
  });

  it('listByRoutineIds 按模板筛选完成记录', async () => {
    await db.routineCompletions.bulkPut([
      makeRoutineCompletion({ id: 'rt1@2026-10-10', routineId: 'rt1', date: '2026-10-10' }),
      makeRoutineCompletion({ id: 'rt2@2026-10-10', routineId: 'rt2', date: '2026-10-10' }),
    ]);

    const rows = await repo.listByRoutineIds(['rt1']);
    expect(rows.map((c) => c.routineId)).toEqual(['rt1']);
  });

  it('upsertMany 后可按日读到，并支持更新', async () => {
    await repo.upsertMany([
      makeRoutineCompletion({ id: 'rt1@2026-10-10', routineId: 'rt1', date: '2026-10-10', done: false }),
    ]);
    let day = await repo.listByDate('2026-10-10');
    expect(day[0]?.done).toBe(false);

    await repo.upsertMany([
      makeRoutineCompletion({ id: 'rt1@2026-10-10', routineId: 'rt1', date: '2026-10-10', done: true }),
    ]);
    day = await repo.listByDate('2026-10-10');
    expect(day).toHaveLength(1);
    expect(day[0]?.done).toBe(true);
  });

  it('purgeOrphans 删除孤儿记录（模板已不存在）', async () => {
    await db.routineCompletions.bulkPut([
      makeRoutineCompletion({ id: 'rt1@2026-10-10', routineId: 'rt1', date: '2026-10-10' }),
      makeRoutineCompletion({ id: 'rt2@2026-10-10', routineId: 'rt2', date: '2026-10-10' }),
    ]);

    const removed = await repo.purgeOrphans(new Set(['rt1']));
    expect(removed).toBe(1);

    const all = await repo.listAll();
    expect(all.map((c) => c.routineId)).toEqual(['rt1']);
  });

  it('hardDeleteMany 物理删除完成记录', async () => {
    await db.routineCompletions.bulkPut([
      makeRoutineCompletion({ id: 'rt1@2026-10-10', routineId: 'rt1', date: '2026-10-10' }),
      makeRoutineCompletion({ id: 'rt2@2026-10-10', routineId: 'rt2', date: '2026-10-10' }),
    ]);
    await repo.hardDeleteMany(['rt1@2026-10-10']);

    const all = await repo.listAll();
    expect(all.map((c) => c.id)).toEqual(['rt2@2026-10-10']);
  });
});
