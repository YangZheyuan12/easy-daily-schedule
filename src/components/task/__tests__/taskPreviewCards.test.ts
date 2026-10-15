// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * 任务页底部两张卡（期限任务 / 长时目标）的**默认收起**验证。
 *
 * 用户要求：期限任务和长时目标默认在底部堆叠，而非紧跟条目之后。
 * 所以预览列表默认不渲染，两张卡只剩两行标题整齐堆在底部；
 * 想看预览点展开箭头，跳管理页点标题或「管理」。
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
import { useUiStore } from '@/store/useUiStore';
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

/** 卸载全部已挂载的根（模拟切去别的 Tab） */
function unmountAll() {
  act(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
}

beforeEach(() => {
  useDayStore.setState({ date: DATE, selfStatus: null });
  // 展开态活在 UI store 里、跨用例存活，必须复位，否则「默认收起」会读到上一条的展开
  useUiStore.setState({ expansions: {} });
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.restoreAllMocks();
});

describe('期限任务 / 长时目标：默认在底部收起堆叠', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 'd1', content: '交论文', order: ORDER_STEP, kind: 'deadline' }),
        makeTask({ id: 'g1', content: '读完一本书', order: ORDER_STEP, kind: 'goal' }),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
  });

  it('两张卡默认收起：只剩标题，预览列表不渲染', () => {
    const container = render();

    const deadline = container.querySelector<HTMLElement>('[data-testid="deadline-card"]')!;
    const goal = container.querySelector<HTMLElement>('[data-testid="goal-card"]')!;
    expect(deadline).toBeTruthy();
    expect(goal).toBeTruthy();
    expect(deadline.dataset.expanded).toBe('false');
    expect(goal.dataset.expanded).toBe('false');

    // 预览内容不在 DOM 里（不是「渲染了但藏起来」—— 收起就不该占无障碍树）
    expect(deadline.textContent).not.toContain('交论文');
    expect(goal.textContent).not.toContain('读完一本书');
    // 标题行仍在：计数看得见，用户知道里面有几条
    expect(deadline.textContent).toContain('期限任务');
    expect(goal.textContent).toContain('长时目标');
  });

  it('点展开箭头 → 预览列表出现；再点一次收起', () => {
    const container = render();
    const deadline = container.querySelector<HTMLElement>('[data-testid="deadline-card"]')!;

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="deadline-card-toggle"]')!
        .click();
    });

    expect(deadline.dataset.expanded).toBe('true');
    expect(deadline.textContent).toContain('交论文');

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="deadline-card-toggle"]')!
        .click();
    });
    expect(deadline.dataset.expanded).toBe('false');
    expect(deadline.textContent).not.toContain('交论文');
  });

  it('空列表时展开也只显示一句说明（不渲染空 ul）', () => {
    useTaskStore.setState({
      tasks: [],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    const container = render();

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="goal-card-toggle"]')!.click();
    });

    const goal = container.querySelector<HTMLElement>('[data-testid="goal-card"]')!;
    expect(goal.textContent).toContain('还没有长时目标');
    expect(goal.querySelector('ul')).toBeNull();
  });

  it('展开后切去别的页面再回来 → 期限任务仍是展开的', () => {
    const first = render();
    act(() => {
      first.querySelector<HTMLButtonElement>('[data-testid="deadline-card-toggle"]')!.click();
    });
    expect(
      first.querySelector<HTMLElement>('[data-testid="deadline-card"]')!.dataset.expanded,
    ).toBe('true');

    // 切走：Tab 切换卸载整个任务页
    unmountAll();

    const second = render();
    const deadline = second.querySelector<HTMLElement>('[data-testid="deadline-card"]')!;
    expect(deadline.dataset.expanded).toBe('true');
    expect(second.textContent).toContain('交论文');
    // 另一张卡没被点过，仍是默认收起
    expect(
      second.querySelector<HTMLElement>('[data-testid="goal-card"]')!.dataset.expanded,
    ).toBe('false');
  });
});
