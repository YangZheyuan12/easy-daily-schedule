import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailySelfStatus, Item, TimeSlot } from '@/domain/types';
import { DEBOUNCE_MS } from '@/domain/constants';
import { PersistenceService } from '../persistenceService';
import { makeInspiration, makeItem, makeSelfStatus, makeSlot, makeTask } from './fixtures';

/**
 * 持久化调度的防抖与落盘验证（QA）。
 *
 * 要锁住的是「零丢失」这条承诺：连着改 10 次只写一次库，
 * 但切后台 / 关页面时必须把最后一次写出去；写失败还得把脏数据放回去而不是吞掉。
 */
function fakeRepos() {
  return {
    items: { upsertMany: vi.fn(async () => undefined) },
    tasks: { upsertMany: vi.fn(async () => undefined) },
    selfStatus: { upsert: vi.fn(async () => undefined) },
    timeSlots: { upsertMany: vi.fn(async () => undefined) },
    inspirations: { upsertMany: vi.fn(async () => undefined) },
  };
}

/**
 * 等一轮微任务，让 flush 里的 await 链走完。
 *
 * ⚠️ 必须走 `advanceTimersByTimeAsync`：本文件用的是假计时器，
 * 手写 `new Promise(resolve => setTimeout(...))` 永远等不到执行，用例会超时。
 */
const tick = () => vi.advanceTimersByTimeAsync(0);

let repos: ReturnType<typeof fakeRepos>;

beforeEach(() => {
  vi.useFakeTimers();
  repos = fakeRepos();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PersistenceService — 防抖', () => {
  it('防抖窗口内连改 10 次，最终只写一次库（且写的是最后一次）', async () => {
    const persistence = new PersistenceService(repos as never);

    let item: Item = makeItem({ id: 'i1', title: '第0次' });
    for (let n = 1; n <= 10; n += 1) {
      item = { ...item, title: `第${n}次` };
      persistence.markItem(item);
      vi.advanceTimersByTime(100); // 每次间隔都小于 DEBOUNCE_MS
    }

    expect(repos.items.upsertMany).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DEBOUNCE_MS);
    await tick();

    expect(repos.items.upsertMany).toHaveBeenCalledTimes(1);
    expect(repos.items.upsertMany).toHaveBeenCalledWith([{ ...item }]);
  });

  it('hasPending 如实反映是否还有未落盘的改动', async () => {
    const persistence = new PersistenceService(repos as never);
    expect(persistence.hasPending()).toBe(false);

    persistence.markItem(makeItem({ id: 'i1' }));
    expect(persistence.hasPending()).toBe(true);

    vi.advanceTimersByTime(DEBOUNCE_MS);
    await tick();
    expect(persistence.hasPending()).toBe(false);
  });
});

describe('PersistenceService — 自我状态落盘', () => {
  it('自我状态按日期去重后 upsert 到 selfStatus 仓储', async () => {
    const persistence = new PersistenceService(repos as never);
    let self: DailySelfStatus = makeSelfStatus({ date: '2026-10-10', mood: 1 });
    persistence.markSelfStatus(self);
    self = makeSelfStatus({ date: '2026-10-10', mood: 4 });
    persistence.markSelfStatus(self); // 同一天，覆盖前一次

    vi.advanceTimersByTime(DEBOUNCE_MS);
    await tick();

    expect(repos.selfStatus.upsert).toHaveBeenCalledTimes(1);
    expect(repos.selfStatus.upsert).toHaveBeenCalledWith(makeSelfStatus({ date: '2026-10-10', mood: 4 }));
  });

  it('不同日期的自我状态各写各的', async () => {
    const persistence = new PersistenceService(repos as never);
    persistence.markSelfStatus(makeSelfStatus({ date: '2026-10-10', mood: 3 }));
    persistence.markSelfStatus(makeSelfStatus({ date: '2026-10-11', mood: 5 }));

    vi.advanceTimersByTime(DEBOUNCE_MS);
    await tick();

    expect(repos.selfStatus.upsert).toHaveBeenCalledTimes(2);
  });
});

describe('PersistenceService — 时间段落盘', () => {
  it('软删的时间段也要写出去（deletedAt 本身就是一次改动）', async () => {
    const persistence = new PersistenceService(repos as never);
    const slot: TimeSlot = makeSlot({ id: 's1', deletedAt: 999 });
    persistence.markTimeSlot(slot);

    vi.advanceTimersByTime(DEBOUNCE_MS);
    await tick();

    expect(repos.timeSlots.upsertMany).toHaveBeenCalledWith([slot]);
  });
});

describe('PersistenceService — 灵感落盘', () => {
  it('软删的灵感也要写出去（deletedAt 本身就是一次改动）', async () => {
    const persistence = new PersistenceService(repos as never);
    const row = makeInspiration({ id: 'in1', deletedAt: 999 });
    persistence.markInspiration(row);

    vi.advanceTimersByTime(DEBOUNCE_MS);
    await tick();

    expect(repos.inspirations.upsertMany).toHaveBeenCalledWith([row]);
  });
});

describe('PersistenceService — flush 与失败回滚', () => {
  it('lifecycle/manual flush 立即落盘，不等防抖', async () => {
    const persistence = new PersistenceService(repos as never);
    persistence.markItem(makeItem({ id: 'i1' }));
    persistence.markTask(makeTask({ id: 't1' }));

    await persistence.flush('lifecycle');

    expect(repos.items.upsertMany).toHaveBeenCalledTimes(1);
    expect(repos.tasks.upsertMany).toHaveBeenCalledTimes(1);
    expect(persistence.hasPending()).toBe(false);

    // 防抖计时器已被取消，之后不会再重复写一次
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    await tick();
    expect(repos.items.upsertMany).toHaveBeenCalledTimes(1);
  });

  it('没有脏数据时 flush 是空操作，不会开事务', async () => {
    const persistence = new PersistenceService(repos as never);
    await persistence.flush('lifecycle');

    expect(repos.items.upsertMany).not.toHaveBeenCalled();
    expect(repos.selfStatus.upsert).not.toHaveBeenCalled();
  });

  it('写失败时把脏数据放回队列（不吞掉用户这次改动）并回调 onError', async () => {
    const onError = vi.fn();
    const persistence = new PersistenceService(repos as never, { onError });
    const item = makeItem({ id: 'i1', title: '不能丢' });
    (repos.items.upsertMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('quota'));

    persistence.markItem(item);
    await persistence.flush('lifecycle');

    expect(onError).toHaveBeenCalledTimes(1);
    expect(persistence.hasPending()).toBe(true);

    // 下一次 flush 必须还能把这条写出去
    await persistence.flush('lifecycle');
    expect(repos.items.upsertMany).toHaveBeenCalledTimes(2);
    expect(repos.items.upsertMany).toHaveBeenLastCalledWith([item]);
    expect(persistence.hasPending()).toBe(false);
  });

  it('flush 成功后通过 onFlushed 上报原因与条数', async () => {
    const onFlushed = vi.fn();
    const persistence = new PersistenceService(repos as never, { onFlushed });
    persistence.markItem(makeItem({ id: 'i1' }));
    persistence.markSelfStatus(makeSelfStatus({ date: '2026-10-10', mood: 2 }));

    await persistence.flush('manual');

    expect(onFlushed).toHaveBeenCalledWith('manual', 2);
  });
});
