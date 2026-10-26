// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * DiaryList 组头「N项」纯计数独立验证（2026-10-16 用户要求）。
 *
 * 背景：上一轮按用户要求去掉了「0/3」这类进度显示，组头只剩色点 + 组名，
 * 用户觉得光秃；本轮改回一行**纯计数**小字「N项」，数量来自分类下面的事件数。
 *
 * 被验证的契约：
 * 1. 四板块组头 = 「N项」，N = 本板块**顶层条目 + 归到本板块的时间段**（与日历
 *    摘要卡 `DaySummary.sections` 同一口径）；子项不计入；空组显示「0项」。
 * 2. `sectionId === null`（未归类）的时间段不进任何组。
 * 3. 灵感组头同样显示「N项」，N = 当天灵感条数。
 * 4. 只放数量、不放完成率（不含 '/' 与 '%'）。
 *
 * 板块详情页副标题的「N项」（顶层条目口径）在 sectionPageSubtitle.test.ts 验证。
 *
 * 说明：本项目 vite.config.ts 只收 `*.test.ts`，故用 createElement 代替 JSX；
 * jsdom 经文件顶部指令单文件启用。
 */

const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    items: { listByDate: vi.fn().mockResolvedValue([]) },
    inspirations: { listByDate: vi.fn().mockResolvedValue([]) },
    itemImages: { listByItemIds: vi.fn().mockResolvedValue([]) },
  },
  fakePersistence: {
    markItems: vi.fn(),
    scheduleImmediate: vi.fn().mockResolvedValue(undefined),
    markInspiration: vi.fn(),
    markSelfStatus: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
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

import { DiaryList } from '@/components/diary/DiaryList';
import { useItemStore } from '@/store/useItemStore';
import { useInspirationStore } from '@/store/useInspirationStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { makeItem, makeSlot, makeInspiration } from '@/services/__tests__/fixtures';
import { ORDER_STEP } from '@/domain/constants';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATE = '2026-10-10';

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderDiary(date = DATE): HTMLDivElement {
  const element = createElement(
    MemoryRouter,
    { initialEntries: ['/today'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    createElement(
      Routes,
      null,
      createElement(Route, { path: '*', element: createElement(DiaryList, { date }) }),
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

/** 取某个分组组头的文本（四板块是 <button>，灵感组是 <div class="h-8">） */
function headerText(container: HTMLElement, groupName: string): string {
  const sections = Array.from(container.querySelectorAll('section'));
  for (const section of sections) {
    const header = section.querySelector('button, div.h-8');
    if (header && header.textContent?.includes(groupName)) return header.textContent;
  }
  throw new Error(`找不到组头含「${groupName}」的分组`);
}

beforeEach(() => {
  useItemStore.setState({ items: [], loading: false, lastCreatedId: null, pendingUndo: null });
  useInspirationStore.setState({ inspirations: [], loading: false });
  useTimeSlotStore.setState({ slots: [], loading: false });
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.restoreAllMocks();
});

describe('DiaryList 组头「N项」— 四板块', () => {
  it('N = 顶层条目 + 归到本板块的时间段；子项不计入；空组显示「0项」', () => {
    useItemStore.setState({
      items: [
        makeItem({ id: 'w1', sectionId: 'work', order: ORDER_STEP }),
        makeItem({ id: 'w2', sectionId: 'work', order: ORDER_STEP * 2 }),
        // 子项：属于条目内部的分支，不单独进组头计数
        makeItem({ id: 'w2c', sectionId: 'work', parentId: 'w2', level: 1, order: ORDER_STEP }),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });

    const container = renderDiary();

    expect(headerText(container, '工作')).toContain('2项');
    expect(headerText(container, '学习')).toContain('0项');
    expect(headerText(container, '健身')).toContain('0项');
    expect(headerText(container, '生活')).toContain('0项');
    expect(headerText(container, '灵感')).toContain('0项');
  });

  it('时间段**不再**投影计入 N项（2026-10-26：只有同步成条目才出现）', () => {
    useItemStore.setState({
      items: [makeItem({ id: 'w1', sectionId: 'work', order: ORDER_STEP })],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    useTimeSlotStore.setState({
      slots: [
        makeSlot({ id: 's1', sectionId: 'work', order: ORDER_STEP }),
        makeSlot({ id: 's2', sectionId: null, order: ORDER_STEP * 2 }),
      ],
      loading: false,
    });

    const container = renderDiary();

    // 时间段不再自动投影：N 项只看本板块条目（1 条），归类和未归类的时间段都不计入
    expect(headerText(container, '工作')).toContain('1项');
    expect(headerText(container, '学习')).toContain('0项');
  });

  it('软删的条目不进计数（deletedAt 非空即不可见）', () => {
    useItemStore.setState({
      items: [
        makeItem({ id: 'w1', sectionId: 'work', order: ORDER_STEP }),
        makeItem({ id: 'w2', sectionId: 'work', order: ORDER_STEP * 2, deletedAt: 123 }),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });

    const container = renderDiary();

    expect(headerText(container, '工作')).toContain('1项');
  });

  it('只放数量、不放完成率（组头文本不含 "/" 与 "%"）', () => {
    useItemStore.setState({
      items: [
        makeItem({ id: 'w1', sectionId: 'work', order: ORDER_STEP, done: true }),
        makeItem({ id: 'w2', sectionId: 'work', order: ORDER_STEP * 2 }),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });

    const container = renderDiary();

    const header = headerText(container, '工作');
    expect(header).toContain('2项');
    expect(header).not.toContain('/');
    expect(header).not.toContain('%');
  });
});

describe('DiaryList 组头「N项」— 灵感组', () => {
  it('N = 当天灵感条数；为空显示「0项」', () => {
    useInspirationStore.setState({
      inspirations: [
        makeInspiration({ id: 'i1', order: ORDER_STEP }),
        makeInspiration({ id: 'i2', order: ORDER_STEP * 2 }),
      ],
      loading: false,
    });

    const container = renderDiary();

    expect(headerText(container, '灵感')).toContain('2项');
  });
});
