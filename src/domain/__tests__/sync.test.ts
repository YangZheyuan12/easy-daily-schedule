import { describe, expect, it } from 'vitest';
import type { Item } from '@/domain/types';
import {
  PULL_OVERLAP_MS,
  resolveSyncConflict,
  syncRowKey,
  syncStamp,
  type ConflictStamp,
} from '@/domain/sync';
import { PURGE_AFTER_MS } from '@/domain/constants';

function makeItem(partial: Partial<Item> & { id: string }): Item {
  return {
    date: '2026-10-19',
    sectionId: 'work',
    parentId: null,
    title: '标题',
    level: 0,
    order: 1000,
    done: false,
    collapsed: false,
    description: '',
    rating: 0,
    review: '',
    createdAt: 100,
    updatedAt: 100,
    sourceTaskId: null,
    sourceSlotId: null,
    deletedAt: null,
    ...partial,
  };
}

const stamp = (updatedAt: number, deletedAt: number | null = null): ConflictStamp => ({
  updatedAt,
  deletedAt,
});

describe('syncStamp', () => {
  it('普通行取 updatedAt', () => {
    expect(syncStamp(makeItem({ id: 'a', updatedAt: 500 }))).toBe(500);
  });

  it('🔴 软删行取 deletedAt —— 软删只改 deletedAt，updatedAt 不动', () => {
    // 这条断言是「删除推得上去」的根因：以 updatedAt 为游标的话，
    // 一次软删的 stamp 不会前进，对端那条记录就会被复活。
    const deleted = makeItem({ id: 'a', updatedAt: 500, deletedAt: 900 });
    expect(syncStamp(deleted)).toBe(900);
    expect(deleted.updatedAt).toBe(500);
  });

  it('deletedAt 早于 updatedAt 时仍取 updatedAt', () => {
    // 老数据被复活再删除等异常顺序下不能倒退
    expect(syncStamp(makeItem({ id: 'a', updatedAt: 900, deletedAt: 500 }))).toBe(900);
  });
});

describe('resolveSyncConflict —— 修改 vs 修改', () => {
  it('远端更新 → 远端胜', () => {
    expect(resolveSyncConflict(stamp(100), stamp(200), 'dev_a', 'dev_b')).toBe('remote');
  });

  it('本地更新 → 本地胜', () => {
    expect(resolveSyncConflict(stamp(200), stamp(100), 'dev_a', 'dev_b')).toBe('local');
  });

  it('时间戳相同 → deviceId 字典序小的胜', () => {
    expect(resolveSyncConflict(stamp(100), stamp(100), 'dev_a', 'dev_b')).toBe('local');
    expect(resolveSyncConflict(stamp(100), stamp(100), 'dev_b', 'dev_a')).toBe('remote');
  });

  it('🔴 平局必须反对称 —— 两台设备独立算会得到同一个赢家，否则永远不收敛', () => {
    const aSees = resolveSyncConflict(stamp(100), stamp(100), 'dev_a', 'dev_b');
    const bSees = resolveSyncConflict(stamp(100), stamp(100), 'dev_b', 'dev_a');
    // A 判「本地(A)胜」，B 判「远端(A)胜」—— 两边都认 A，收敛
    expect(aSees).toBe('local');
    expect(bSees).toBe('remote');
  });

  it('同设备 + 同时间戳 → same（同一台机器写的同一行，不落库）', () => {
    expect(resolveSyncConflict(stamp(100), stamp(100), 'dev_a', 'dev_a')).toBe('same');
  });
});

describe('resolveSyncConflict —— 删除优先于修改', () => {
  it('远端在最后修改之后删除 → 删除胜（remote）', () => {
    // 本地改到 100，远端 200 才删 → 删除发生在修改之后，删除有效
    expect(resolveSyncConflict(stamp(100), stamp(50, 200), 'dev_a', 'dev_b')).toBe('remote');
  });

  it('🔴 本地在远端删除之后又改了 → 修改胜（视为「我要找回来」）', () => {
    // 远端 200 删掉，本地 300 又编辑 → 用户明确要复活
    expect(resolveSyncConflict(stamp(300), stamp(50, 200), 'dev_a', 'dev_b')).toBe('local');
  });

  it('双方都删 → 早的那个删胜（它是原始删除）', () => {
    expect(resolveSyncConflict(stamp(50, 300), stamp(50, 200), 'dev_a', 'dev_b')).toBe('remote');
    expect(resolveSyncConflict(stamp(50, 200), stamp(50, 300), 'dev_a', 'dev_b')).toBe('local');
  });

  it('双方同时刻删除 → deviceId 兜底，仍然收敛', () => {
    expect(resolveSyncConflict(stamp(50, 200), stamp(50, 200), 'dev_a', 'dev_b')).toBe('local');
    expect(resolveSyncConflict(stamp(50, 200), stamp(50, 200), 'dev_b', 'dev_a')).toBe('remote');
  });
});

describe('常量口径', () => {
  it('重叠窗口要大于 0 且远小于软删保留期', () => {
    // 太小盖不住云端提交延迟；太大每轮都重拉一大段
    expect(PULL_OVERLAP_MS).toBeGreaterThan(0);
    expect(PULL_OVERLAP_MS).toBeLessThan(PURGE_AFTER_MS);
  });

  it('行键按 实体:主键 拼装', () => {
    expect(syncRowKey('item', 'it_1')).toBe('item:it_1');
  });
});

describe('makeItem 兜底', () => {
  it('默认未删除且 updatedAt 生效', () => {
    const item = makeItem({ id: 'x' });
    expect(item.deletedAt).toBeNull();
    expect(syncStamp(item)).toBe(100);
  });
});
