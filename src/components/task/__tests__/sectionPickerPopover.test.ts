// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * 任务行的**分组气泡**验证（从底部抽屉改成按钮下方气泡后的回归锁）。
 *
 * 用户要求：点任务条目下方的「分组」时，弹窗长在对应分组按钮的**下方**，
 * 以气泡形式出现，不要出现在底部；动效是扩大 / 缩小。
 * 追加要求：气泡要**浮于整个页面上方**，不能被页面元素挡住。
 *
 * 覆盖：
 * ① 气泡真的是气泡（`role="menu"`），整页再没有底部抽屉（`role="dialog"`）；
 * ② 气泡 portal 到 body + `fixed` + 高层级 z-index —— 页面里的 `m-rise`
 *    （动画期间 transform 造层叠上下文）、fixed 悬浮按钮、底栏都盖不住它；
 * ③ 展开用的是左上角放大动效（`m-pop-tl`），不是旧的右上角那套；
 * ④ 点选项 → 分组真的改掉（按钮标签跟着变），气泡播完退场后卸载。
 */
const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    tasks: { listByDate: vi.fn().mockResolvedValue([]) },
    items: { listByDate: vi.fn().mockResolvedValue([]) },
    settings: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) },
  },
  fakePersistence: { markTasks: vi.fn(), markItems: vi.fn(), scheduleImmediate: vi.fn() },
  fakeClock: { now: () => 1700000000000 },
  fakeUndo: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: fakeUndo,
}));

import { TasksPage } from '@/pages/TasksPage';
import { useDayStore } from '@/store/useDayStore';
import { useTaskStore } from '@/store/useTaskStore';
import { makeTask } from '@/services/__tests__/fixtures';
import { ORDER_STEP } from '@/domain/constants';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATE = '2026-10-10';

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function render(): HTMLDivElement {
  const element = createElement(
    MemoryRouter,
    { initialEntries: ['/tasks'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    createElement(
      Routes,
      null,
      createElement(Route, { path: '/tasks', element: createElement(TasksPage) }),
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

function groupButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label^="分组"]');
  if (!button) throw new Error('找不到分组按钮');
  return button;
}

/** 气泡已 portal 到 body，要在 document 上找 */
function picker(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="menu"][aria-label="选择分组"]');
}

function setOneTask(): void {
  useTaskStore.setState({
    tasks: [makeTask({ id: 't1', content: '第一', order: ORDER_STEP, sectionId: 'work' })],
    loading: false,
    lastCreatedId: null,
    pendingUndo: null,
  });
}

beforeEach(() => {
  useDayStore.setState({ date: DATE, selfStatus: null });
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
    for (const { root } of mounted) root.unmount();
  });
  vi.useRealTimers();
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.restoreAllMocks();
});

describe('任务分组气泡（不再是底部抽屉）', () => {
  it('点分组 → 出现的是气泡菜单，整页没有底部抽屉', () => {
    setOneTask();
    const container = render();

    expect(picker()).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      groupButton(container).click();
    });

    expect(picker(), '点分组后没有出现气泡').toBeTruthy();
    // 气泡 ≠ 抽屉：抽屉是 role="dialog" 且从底部升起
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('气泡 portal 到 body + fixed + 高层级：页面元素盖不住它', () => {
    setOneTask();
    const container = render();

    act(() => {
      groupButton(container).click();
    });

    const menu = picker()!;
    // 挂在 body 上（不在页面容器里）—— 与页面元素彻底分层
    expect(container.contains(menu), '气泡没有 portal 到页面外').toBe(false);
    expect(document.body.contains(menu)).toBe(true);
    // fixed 定位 + z-[55]：高于底栏（z-30）与各页 fixed 悬浮按钮，低于 toast（z-60）
    expect(menu.className).toContain('fixed');
    expect(menu.className).toContain('z-[55]');
    // 贴着锚点摆过位置（jsdom 里 getBoundingClientRect 全是 0，只能验证「摆过了」）
    expect(menu.style.top).not.toBe('');
    expect(menu.style.visibility).toBe('visible');
    // 左上角放大展开（与右上角那套 m-pop-tr 区分开）
    expect(menu.className).toContain('m-pop-tl');
  });

  it('点选项 → 分组真的改掉（按钮标签跟着变），气泡播完退场后卸载', () => {
    setOneTask();
    const container = render();

    act(() => {
      groupButton(container).click();
    });
    const menu = picker()!;
    const study = Array.from(menu.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => (b.textContent ?? '').includes('学习'),
    );
    expect(study, '气泡里没有「学习」选项').toBeTruthy();

    act(() => {
      study!.click();
    });

    // 分组真改了：行内那颗色点旁边的标签从「工作」变成「学习」
    expect(useTaskStore.getState().tasks[0].sectionId).toBe('study');
    expect(groupButton(container).getAttribute('aria-label')).toContain('学习');

    // 退场动效播完（120ms）才卸载 —— 瞬间消失会让人怀疑误触
    expect(picker(), '退场动效还没播就卸载了').toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(picker()).toBeNull();
  });
});
