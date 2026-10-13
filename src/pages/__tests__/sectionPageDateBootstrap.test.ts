// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * SectionPage「URL ?date= → store 单向 bootstrap」独立验证（QA）。
 *
 * 背景：DiaryList 会跳到 `/section/work?date=YYYY-MM-DD`，但 SectionPage 早期
 * 只读全局 day store、从不解析该 query。HashRouter 刷新会重置 store（回到今天），
 * 于是标题显示今天、用户以为在处理 URL 上那天，再点「+ 添加条目」就写错日期。
 * eng-feature 的修复：在 SectionPage 里加一个只依赖 `[queryDate]` 的 effect，
 * 校验 `isValidDateKey` 后把 store 对齐到 URL —— store 仍是唯一日期源。
 *
 * 本文件刻意不复用它的用例，全部自行渲染 SectionPage + 断言 store 真实值。
 */

const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    items: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    tasks: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    timeSlots: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    inspirations: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    selfStatus: { get: vi.fn().mockResolvedValue(undefined), listBetween: vi.fn().mockResolvedValue([]) },
    days: { ensure: vi.fn().mockResolvedValue(undefined) },
  },
  fakePersistence: { markSelfStatus: vi.fn(), flush: vi.fn(), markItem: vi.fn(), markItems: vi.fn() },
  fakeClock: { now: () => 1700000000000 },
  fakeUndo: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

// 隔离 IndexedDB，只关心 store 的 date；其余依赖用桩
vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: fakeUndo,
}));

import { SectionPage } from '@/pages/SectionPage';
import { useDayStore } from '@/store/useDayStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORE_DATE = '2026-10-10';

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderAt(path: string): HTMLDivElement {
  const element = createElement(
    MemoryRouter,
    {
      initialEntries: [path],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    },
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: '/section/:sectionId',
        element: createElement(SectionPage),
      }),
    ),
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  mounted.push({ root, container });
  return container;
}

beforeEach(() => {
  useDayStore.setState({ date: STORE_DATE, selfStatus: null });
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.restoreAllMocks();
});

describe('SectionPage ?date= bootstrap — 非法值一律忽略（store 不得被改动）', () => {
  const ILLEGAL = ['2026-13-45', 'abc', '', '2026-1-5', '2026-02-30', '2026/10/05'] as const;

  it.each(ILLEGAL)('非法 queryDate=%j → setDate 未被调用且 store.date 不变', (bad) => {
    const spy = vi.spyOn(useDayStore.getState(), 'setDate');
    renderAt(`/section/work?date=${bad}`);
    expect(spy).not.toHaveBeenCalled();
    expect(useDayStore.getState().date).toBe(STORE_DATE);
  });

  it('非法值时渲染副标题用的是 store 日期，不是 URL 上的非法值（无第二日期源）', () => {
    const container = renderAt('/section/work?date=2026-13-45');
    expect(container.textContent).toContain('10月10日');
    expect(container.textContent).not.toContain('2026-13-45');
  });
});

describe('SectionPage ?date= bootstrap — 合法值回填 / 缺省不动 / 等值短路', () => {
  it('合法 queryDate → setDate(该日期)，store.date 回填', () => {
    const spy = vi.spyOn(useDayStore.getState(), 'setDate');
    renderAt('/section/work?date=2026-10-05');
    expect(useDayStore.getState().date).toBe('2026-10-05');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('2026-10-05');
  });

  it('合法回填后副标题随 store 变化（证明渲染只信 store）', () => {
    const container = renderAt('/section/work?date=2026-10-05');
    expect(container.textContent).toContain('10月5日');
  });

  it('无 ?date= 参数：store.date 不变且不调用 setDate', () => {
    const spy = vi.spyOn(useDayStore.getState(), 'setDate');
    renderAt('/section/work');
    expect(spy).not.toHaveBeenCalled();
    expect(useDayStore.getState().date).toBe(STORE_DATE);
  });

  it('queryDate 恰好等于当前 store.date：等值短路，setDate 调用 0 次', () => {
    const spy = vi.spyOn(useDayStore.getState(), 'setDate');
    renderAt(`/section/work?date=${STORE_DATE}`);
    expect(spy).toHaveBeenCalledTimes(0);
    expect(useDayStore.getState().date).toBe(STORE_DATE);
  });
});
