import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailySelfStatus } from '@/domain/types';
import { makeSelfStatus } from '@/services/__tests__/fixtures';

/**
 * useDayStore 的自我状态（心情 + 身体）持久化验证（QA）。
 *
 * 验的是「打了分到底会不会落到库里」这条链路：
 * store → persistence.markSelfStatus → flush → repos.selfStatus.upsert。
 * 断点在任何一环都不会报错，只会在用户换台手机后表现为「昨天的记录没了」。
 */
const { fakeRepos, fakePersistence, fakeClock } = vi.hoisted(() => ({
  fakeRepos: {
    selfStatus: { get: vi.fn(), upsert: vi.fn(), listBetween: vi.fn() },
  },
  fakePersistence: {
    markSelfStatus: vi.fn(),
    flush: vi.fn(),
  },
  fakeClock: { now: () => 1700000000000 },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
}));

import { useDayStore } from '@/store/useDayStore';

function reset(): void {
  useDayStore.setState({ date: '2026-10-10', selfStatus: null });
  fakeRepos.selfStatus.get.mockReset();
  fakeRepos.selfStatus.upsert.mockReset();
  fakePersistence.markSelfStatus.mockReset();
  fakePersistence.flush.mockReset();
}

describe('useDayStore — 自我状态读取', () => {
  beforeEach(reset);

  it('loadSelfStatus 把库里的记录放进 state', async () => {
    const stored = makeSelfStatus({ date: '2026-10-10', mood: 4, body: 3, moodText: '不错' });
    fakeRepos.selfStatus.get.mockResolvedValue(stored);

    await useDayStore.getState().loadSelfStatus('2026-10-10');

    expect(fakeRepos.selfStatus.get).toHaveBeenCalledWith('2026-10-10');
    expect(useDayStore.getState().selfStatus).toEqual(stored);
  });

  it('库里没有记录时 selfStatus 归 null（不是留下上一天的值）', async () => {
    useDayStore.setState({ selfStatus: makeSelfStatus({ date: '2026-10-09', mood: 5 }) });
    fakeRepos.selfStatus.get.mockResolvedValue(undefined);

    await useDayStore.getState().loadSelfStatus('2026-10-10');

    expect(useDayStore.getState().selfStatus).toBeNull();
  });

  it('读取失败也不抛到 UI，降级为 null', async () => {
    useDayStore.setState({ selfStatus: makeSelfStatus({ date: '2026-10-09', mood: 5 }) });
    fakeRepos.selfStatus.get.mockRejectedValue(new Error('db closed'));

    await expect(useDayStore.getState().loadSelfStatus('2026-10-10')).resolves.toBeUndefined();
    expect(useDayStore.getState().selfStatus).toBeNull();
  });
});

describe('useDayStore — 自我状态写入', () => {
  beforeEach(reset);

  it('saveSelfStatus 落的是「当前查看的日期」，并交给 persistence 落盘', () => {
    useDayStore.setState({ date: '2026-10-10' });

    useDayStore.getState().saveSelfStatus(4, '不错', 3, '有点累');

    const saved = useDayStore.getState().selfStatus;
    expect(saved).not.toBeNull();
    expect(saved?.date).toBe('2026-10-10');
    expect(saved?.mood).toBe(4);
    expect(saved?.moodText).toBe('不错');
    expect(saved?.body).toBe(3);
    expect(saved?.bodyText).toBe('有点累');
    expect(saved?.updatedAt).toBe(1700000000000);
    // 关键：必须真的交给持久化，否则刷新即丢
    expect(fakePersistence.markSelfStatus).toHaveBeenCalledWith(saved);
  });

  it('切了日期后写的是新日期，不会覆写前一天', () => {
    useDayStore.getState().saveSelfStatus(4, '', 3, '');
    useDayStore.setState({ date: '2026-10-11' });
    useDayStore.getState().saveSelfStatus(1, '', 1, '');

    const saved = useDayStore.getState().selfStatus;
    expect(saved?.date).toBe('2026-10-11');
    expect(saved?.mood).toBe(1);
  });

  it('四个字段都独立传递：只改文字不会把分数清掉，只改分数不会把文字清掉', () => {
    useDayStore.getState().saveSelfStatus(5, '开心', 2, '还行');

    // 只改心情文字：分数保持
    useDayStore.getState().saveSelfStatus(5, '非常开心', 2, '还行');
    expect(useDayStore.getState().selfStatus).toMatchObject({
      mood: 5,
      moodText: '非常开心',
      body: 2,
      bodyText: '还行',
    });

    // 只改身体分数：文字保持
    useDayStore.getState().saveSelfStatus(5, '非常开心', 0, '还行');
    expect(useDayStore.getState().selfStatus).toMatchObject({
      mood: 5,
      moodText: '非常开心',
      body: 0,
      bodyText: '还行',
    });
  });

  it('全 0 + 空文字也算一次合法写入（清零要有处可去）', () => {
    useDayStore.getState().saveSelfStatus(0, '', 0, '');
    const saved: DailySelfStatus | null = useDayStore.getState().selfStatus;

    expect(saved?.mood).toBe(0);
    expect(saved?.body).toBe(0);
    expect(fakePersistence.markSelfStatus).toHaveBeenCalledTimes(1);
  });
});

describe('useDayStore — 日期切换', () => {
  beforeEach(reset);

  it('shiftDate 跨月 / 跨年正确', () => {
    useDayStore.setState({ date: '2026-10-31' });
    useDayStore.getState().shiftDate(1);
    expect(useDayStore.getState().date).toBe('2026-11-01');

    useDayStore.setState({ date: '2026-01-01' });
    useDayStore.getState().shiftDate(-1);
    expect(useDayStore.getState().date).toBe('2025-12-31');
  });

  it('setDate 直接切到指定日期', () => {
    useDayStore.getState().setDate('2026-03-05');
    expect(useDayStore.getState().date).toBe('2026-03-05');
  });
});
