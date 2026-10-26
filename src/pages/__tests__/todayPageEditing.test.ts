// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * 今日页「主页直接编辑」验证（渲染层）。
 *
 * 用户要求：今日页所有事件项都能在主页直接编辑 —— 点条目文字行内改；
 * 每个事件后面加三个点，点开就是板块页编辑时那张气泡（图片 / 描述 / 子分支 / 删除）；
 * 时间轴投影过来的条目不做修改。
 *
 * 覆盖：
 * ① 条目行尾有「⋯」，点开 = 全局 drawer 打开 + `ItemSheet`（role="dialog"）出现；
 * ② 抽屉标题带着条目名，删除按钮在位（与板块页同一张抽屉）；
 * ③ 时间段投影行**没有**「⋯」（只读，去时间轴改）；
 * ④ 已「同步到今日」的时间段：投影行让位给同步成的条目（不会一页两条一样的内容）。
 */
const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    items: { listByDate: vi.fn().mockResolvedValue([]) },
    inspirations: { listByDate: vi.fn().mockResolvedValue([]) },
    timeSlots: { listByDate: vi.fn().mockResolvedValue([]) },
    itemImages: { listByItemIds: vi.fn().mockResolvedValue([]) },
    settings: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) },
  },
  fakePersistence: {
    markItems: vi.fn(),
    markTimeSlots: vi.fn(),
    scheduleImmediate: vi.fn(),
  },
  fakeClock: { now: () => 1700000000000 },
  fakeUndo: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: fakeUndo,
}));

import { TodayPage } from '@/pages/TodayPage';
import { useDayStore } from '@/store/useDayStore';
import { useItemStore } from '@/store/useItemStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useUiStore } from '@/store/useUiStore';
import { makeItem, makeSlot } from '@/services/__tests__/fixtures';
import { ORDER_STEP } from '@/domain/constants';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATE = '2026-10-10';

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function render(): HTMLDivElement {
  const element = createElement(
    MemoryRouter,
    { initialEntries: ['/today'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    createElement(Routes, null, createElement(Route, { path: '/today', element: createElement(TodayPage) })),
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
  useDayStore.setState({ date: DATE, selfStatus: null });
  useUiStore.setState({ drawerItemId: null, toasts: [] });
  useItemStore.setState({ items: [], lastCreatedId: null, pendingUndo: null, loading: false });
  useTimeSlotStore.setState({ slots: [], date: DATE, loading: false });
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.restoreAllMocks();
});

describe('今日页 — 主页直接编辑', () => {
  it('点条目行尾「⋯」→ 打开与板块页同一张详情抽屉（含标题与删除）', () => {
    useItemStore.setState({
      items: [makeItem({ id: 'w1', title: '写周报', sectionId: 'work', date: DATE, order: ORDER_STEP })],
    });
    const container = render();

    const more = container.querySelector<HTMLButtonElement>('button[aria-label^="编辑「"]');
    expect(more, '条目行尾没有「⋯」按钮').toBeTruthy();

    act(() => {
      more!.click();
    });

    // 抽屉打开：role=dialog，标题带着条目名
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog, '点「⋯」没有弹出详情抽屉').toBeTruthy();
    expect(dialog!.textContent).toContain('写周报');
    // 与板块页同一张抽屉：右上角主操作是删除
    expect(dialog!.textContent).toContain('删除');
  });

  it('时间段**不再**投影到今日页（2026-10-26：只有同步成条目才出现）', () => {
    useTimeSlotStore.setState({
      slots: [makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '游泳课' })],
      date: DATE,
      loading: false,
    });
    const container = render();

    // 没有「⋯」编辑按钮（投影行已移除）
    expect(container.querySelector('button[aria-label^="编辑「"]')).toBeNull();
    // 时间段不再自动投影：页面上不应该出现「游泳课」这条时间段行
    const slotButton = Array.from(container.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').includes('游泳课'),
    );
    expect(slotButton).toBeUndefined();
  });

  it('已同步成条目的时间段：作为正常条目显示（不投影，只此一条）', () => {
    useTimeSlotStore.setState({
      slots: [makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '游泳课' })],
      date: DATE,
      loading: false,
    });
    useItemStore.setState({
      items: [
        makeItem({
          id: 'i1',
          title: '游泳课',
          sectionId: 'work',
          date: DATE,
          order: ORDER_STEP,
          sourceSlotId: 's1',
        }),
      ],
    });
    const container = render();

    // 「游泳课」只出现一次（作为同步成的条目，带「⋯」可编辑）
    const occurrences = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent ?? '').includes('游泳课'),
    );
    expect(occurrences).toHaveLength(1);
    // 且这一条是可编辑的条目行（行尾有「⋯」）
    expect(container.querySelector('button[aria-label^="编辑「"]')).toBeTruthy();
  });
});
