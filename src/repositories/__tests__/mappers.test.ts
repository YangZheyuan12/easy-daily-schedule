import { describe, expect, it } from 'vitest';
import { filterPurgeable } from '@/repositories/mappers';
import { makeItem } from '@/services/__tests__/fixtures';

/**
 * 软删清理的筛选口径。
 *
 * 这里最要紧的是「已开启同步时的额外约束」—— 它不报错，
 * 只表现为「隔几天发现删掉的东西又回来了」，属于最难查的一类 bug。
 */
describe('filterPurgeable', () => {
  const cutoff = 1_000;

  it('未开启同步（syncedThrough = null）：按过期时间全清', () => {
    const rows = [
      makeItem({ id: 'a', deletedAt: 500 }),
      makeItem({ id: 'b', deletedAt: 1_500 }),
      makeItem({ id: 'c', deletedAt: null }),
    ];
    expect(filterPurgeable(rows, cutoff, null).map((row) => row.id)).toEqual(['a']);
  });

  it('🔴 开启同步后：还没推上云的删除**不能**清', () => {
    // deletedAt 早就过期了，但这次删除还没同步出去（stamp 900 > syncedThrough 700）
    const rows = [makeItem({ id: 'a', updatedAt: 100, deletedAt: 900 })];
    expect(filterPurgeable(rows, cutoff, 700)).toHaveLength(0);
  });

  it('开启同步后：已推上云的删除可以清', () => {
    const rows = [makeItem({ id: 'a', updatedAt: 100, deletedAt: 900 })];
    expect(filterPurgeable(rows, cutoff, 900).map((row) => row.id)).toEqual(['a']);
  });

  it('🔴 过期没过的，同步再多也不清', () => {
    const rows = [makeItem({ id: 'a', updatedAt: 100, deletedAt: 1_500 })];
    expect(filterPurgeable(rows, cutoff, 9_999)).toHaveLength(0);
  });
});
