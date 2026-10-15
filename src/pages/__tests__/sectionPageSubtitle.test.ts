// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * SectionPage 副标题「N项」独立验证（2026-10-16 用户要求）。
 *
 * 背景：用户要求「今日页组头显示 N项，点进去的编辑页面也显示 N项」。
 * 上一轮删掉了副标题里的「完成 x%」，本轮换成纯计数：日期 + 「N项」，
 * N = 该板块当天的**顶层**条目数（与今日页组头同一口径：子项是条目内部
 * 分支，不单独计数；时间段只在今日页投影，本页不出现故不计）。
 *
 * 本文件复用 sectionPageDateBootstrap.test.ts 的隔离方式（mock bootstrap），
 * 但全部自行渲染与断言，不依赖它的用例。
 */

const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    items: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    tasks: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    timeSlots: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    inspirations: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    selfStatus: { get: vi.fn().mockResolvedValue(undefined), listBetween: vi.fn().mockResolvedValue([]) },
    days: { ensure: vi.fn().mockResolvedValue(undefined) },
    itemImages: { listByItemIds: vi.fn().mockResolvedValue([]) },
  },
  fakePersistence: { markSelfStatus: vi.fn(), flush: vi.fn(), markItem: vi.fn(), markItems: vi.fn() },
  fakeClock: { now: () => 1700000000000 },
  fakeUndo: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: fakeUndo,
}));

import { SectionPage } from '@/pages/SectionPage';
import { useDayStore } from '@/store/useDayStore';
import { useItemStore } from '@/store/useItemStore';
import { makeItem } from '@/services/__tests__/fixtures';
import { ORDER_STEP } from '@/domain/constants';

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
  useItemStore.setState({ items: [], loading: false, lastCreatedId: null, pendingUndo: null });
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.restoreAllMocks();
});

describe('SectionPage 副标题「N项」', () => {
  it('N = 顶层条目数（子项不计入）；空板块显示「0项」', () => {
    useItemStore.setState({
      items: [
        makeItem({ id: 'w1', sectionId: 'work', order: ORDER_STEP }),
        makeItem({ id: 'w2', sectionId: 'work', order: ORDER_STEP * 2 }),
        // 子项：条目内部的分支，不进副标题计数
        makeItem({ id: 'w2c', sectionId: 'work', parentId: 'w2', level: 1, order: ORDER_STEP }),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });

    const container = renderAt('/section/work');

    expect(container.textContent).toContain('10月10日 · 2项');
  });

  it('空板块副标题为「日期 · 0项」，且不再出现完成率', () => {
    const container = renderAt('/section/work');

    expect(container.textContent).toContain('10月10日 · 0项');
    expect(container.textContent).not.toContain('完成');
    expect(container.textContent).not.toContain('%');
  });

  it('只数本板块的条目（其他板块的不混入）', () => {
    useItemStore.setState({
      items: [
        makeItem({ id: 'w1', sectionId: 'work', order: ORDER_STEP }),
        makeItem({ id: 's1', sectionId: 'study', order: ORDER_STEP }),
        makeItem({ id: 's2', sectionId: 'study', order: ORDER_STEP * 2 }),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });

    const container = renderAt('/section/work');

    expect(container.textContent).toContain('10月10日 · 1项');
  });
});
