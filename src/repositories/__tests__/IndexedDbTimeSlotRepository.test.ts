import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TimeSlot } from '@/domain/types';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbTimeSlotRepository } from '@/repositories/IndexedDbTimeSlotRepository';
import { makeSlot } from '@/services/__tests__/fixtures';

let counter = 0;

/** 每个用例用独立的库名，避免跨用例污染（fake-indexeddb 是进程级单例） */
function makeRepo() {
  const db = new AppDatabase(`timeslot-test-${counter++}`);
  return { db, repo: new IndexedDbTimeSlotRepository(db) };
}

describe('IndexedDbTimeSlotRepository', () => {
  let db: AppDatabase;
  let repo: IndexedDbTimeSlotRepository;

  beforeEach(() => {
    ({ db, repo } = makeRepo());
  });

  it('listByDateRange 只返回区间内的存活时间段（闭区间，软删排除）', async () => {
    await db.timeSlots.bulkPut([
      makeSlot({ id: 'a', date: '2026-10-09', startMin: 600 }),
      makeSlot({ id: 'b', date: '2026-10-10', startMin: 540 }),
      makeSlot({ id: 'c', date: '2026-10-11', startMin: 700 }),
      makeSlot({ id: 'd', date: '2026-10-12', startMin: 800, deletedAt: 1234 }), // 区间外 + 软删
      makeSlot({ id: 'e', date: '2026-10-15', startMin: 900 }), // 区间外
    ]);

    const range = await repo.listByDateRange('2026-10-09', '2026-10-11');
    const ids = range.map((slot) => slot.id).sort();

    expect(ids).toEqual(['a', 'b', 'c']);
    // 软删的 d 即便在区间内也应被排除
    expect(ids).not.toContain('d');
  });

  it('listByDate 只返回当天存活时间段，并排除软删', async () => {
    await db.timeSlots.bulkPut([
      makeSlot({ id: 'x1', date: '2026-10-10', startMin: 540 }),
      makeSlot({ id: 'x2', date: '2026-10-10', startMin: 600, deletedAt: 999 }),
      makeSlot({ id: 'x3', date: '2026-10-10', startMin: 660, sectionId: null }),
      makeSlot({ id: 'y1', date: '2026-10-11', startMin: 540 }),
    ]);

    const day = await repo.listByDate('2026-10-10');
    const ids = day.map((slot) => slot.id).sort();

    expect(ids).toEqual(['x1', 'x3']);
    // sectionId 为 null 的记录也能正常读出（复合索引含 null 不崩）
    expect(day.find((slot) => slot.id === 'x3')?.sectionId).toBeNull();
  });

  it('upsertMany 后 listByDate 能读到，且支持增量更新', async () => {
    await repo.upsertMany([
      makeSlot({ id: 's1', date: '2026-10-10', startMin: 540, content: '早起' }),
      makeSlot({ id: 's2', date: '2026-10-10', startMin: 600, content: '锻炼' }),
    ]);

    let day = await repo.listByDate('2026-10-10');
    expect(day).toHaveLength(2);

    // 更新其中一条，再 upsertMany 一次
    await repo.upsertMany([makeSlot({ id: 's1', date: '2026-10-10', startMin: 540, content: '晨跑' })]);
    day = await repo.listByDate('2026-10-10');
    expect(day).toHaveLength(2);
    expect(day.find((slot) => slot.id === 's1')?.content).toBe('晨跑');
  });

  it('purgeExpired 只清理超过 cutoff 的软删记录，存活记录不受影响', async () => {
    await db.timeSlots.bulkPut([
      makeSlot({ id: 'old', date: '2026-10-10', deletedAt: 100 }), // 早于 cutoff
      makeSlot({ id: 'recent', date: '2026-10-10', deletedAt: 5000 }), // 撤销窗口内，不能清
      makeSlot({ id: 'alive', date: '2026-10-10' }),
    ]);

    const purged = await repo.purgeExpired(1000);

    expect(purged).toBe(1);
    const ids = (await db.timeSlots.toArray()).map((slot) => slot.id).sort();
    expect(ids).toEqual(['alive', 'recent']);
  });

  it('老数据缺 actual* 字段：读取时归一化为 null（不是 undefined）', async () => {
    // 直接塞一条「旧版」记录：没有 actualStartMin / actualEndMin（Dexie 非索引字段无 schema）
    const legacy: Partial<TimeSlot> = makeSlot({ id: 'legacy', date: '2026-10-10' });
    delete legacy.actualStartMin;
    delete legacy.actualEndMin;
    await db.timeSlots.put(legacy as TimeSlot);

    const day = await repo.listByDate('2026-10-10');
    const slot = day.find((s) => s.id === 'legacy')!;
    expect(slot.actualStartMin).toBeNull();
    expect(slot.actualEndMin).toBeNull();
  });

  it('hardDeleteMany 物理删除记录', async () => {
    await db.timeSlots.bulkPut([
      makeSlot({ id: 'k1', date: '2026-10-10' }),
      makeSlot({ id: 'k2', date: '2026-10-10' }),
    ]);
    await repo.hardDeleteMany(['k1']);

    const day = await repo.listByDate('2026-10-10');
    expect(day.map((slot) => slot.id)).toEqual(['k2']);
  });
});
