// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * TasksPage 任务行的**顺序与行内操作**独立验证（渲染层）。
 *
 * 背景（真 bug，用户报「点了没有任何反应」）：
 * `useTaskStore.move` 把 `order` 换好了，但 TasksPage 直接按数组位置渲染，
 * 于是按钮点下去页面上纹丝不动 —— 刷新一下才「突然」换位。
 * 所以这里的判据只能是 **DOM 里输入框的先后顺序**，不能是内存里的 order。
 *
 * 覆盖：
 * ① 数组顺序与 order 不一致时，渲染必须以 order 为准；
 * ② 点「下移」后 DOM 顺序真的换位；
 * ③ 首行上移 / 末行下移置灰（`disabled`）—— 按钮要自己说「到头了」，
 *    而不是点下去什么都不发生；
 * ④ 软删任务既不渲染、也不占换位名额。
 *
 * 本项目的 vite.config.ts 只收 `*.test.ts`，故用 createElement 代替 JSX；
 * jsdom 经文件顶部指令单文件启用，不影响其余测试的 node 环境。
 */
const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    tasks: { listByDate: vi.fn().mockResolvedValue([]) },
    items: { listByDate: vi.fn().mockResolvedValue([]) },
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
    { initialEntries: ['/today'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    createElement(
      Routes,
      null,
      createElement(Route, { path: '/today', element: createElement(TasksPage) }),
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

/** DOM 里输入框的先后顺序 = 用户看到的顺序 */
function renderedContents(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[placeholder="今天要做什么…"]')).map(
    (input) => input.value,
  );
}

function buttons(container: HTMLElement, label: '上移' | '下移'): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`));
}

const T = (id: string, content: string, order: number, extra: Record<string, unknown> = {}) =>
  makeTask({ id, content, order, date: DATE, createdAt: order, ...extra });

beforeEach(() => {
  useDayStore.setState({ date: DATE, selfStatus: null });
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.restoreAllMocks();
});

describe('TasksPage — 展示顺序由 order 派生（回归：数组顺序 ≠ 展示顺序）', () => {
  it('任务数组故意乱序时，渲染仍按 order 排列', () => {
    useTaskStore.setState({
      tasks: [
        T('t3', '第三', ORDER_STEP * 3),
        T('t1', '第一', ORDER_STEP),
        T('t2', '第二', ORDER_STEP * 2),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });

    // 修复前这里是 ['第三', '第一', '第二']（数组顺序）
    expect(renderedContents(render())).toEqual(['第一', '第二', '第三']);
  });

  it('点「下移」→ DOM 顺序真的换位（这正是用户报「点了没反应」的那一下）', () => {
    useTaskStore.setState({
      tasks: [T('t1', '第一', ORDER_STEP), T('t2', '第二', ORDER_STEP * 2), T('t3', '第三', ORDER_STEP * 3)],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    const container = render();
    expect(renderedContents(container)).toEqual(['第一', '第二', '第三']);

    act(() => {
      buttons(container, '下移')[0]!.click();
    });

    expect(renderedContents(container)).toEqual(['第二', '第一', '第三']);
  });

  it('点「上移」→ 末行往上挪一位', () => {
    useTaskStore.setState({
      tasks: [T('t1', '第一', ORDER_STEP), T('t2', '第二', ORDER_STEP * 2), T('t3', '第三', ORDER_STEP * 3)],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    const container = render();

    act(() => {
      buttons(container, '上移')[2]!.click();
    });

    expect(renderedContents(container)).toEqual(['第一', '第三', '第二']);
  });

  it('软删的任务不渲染，也不占换位名额（下移跨过的是下一个存活任务）', () => {
    useTaskStore.setState({
      tasks: [
        T('t1', '第一', ORDER_STEP),
        T('dead', '已删', Math.floor(ORDER_STEP * 1.5), { deletedAt: 4000 }),
        T('t2', '第二', ORDER_STEP * 2),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    const container = render();
    expect(renderedContents(container)).toEqual(['第一', '第二']);

    act(() => {
      buttons(container, '下移')[0]!.click();
    });

    expect(renderedContents(container)).toEqual(['第二', '第一']);
  });
});

describe('TasksPage — 行到边界时按钮置灰，而不是静默无反应', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [T('t1', '第一', ORDER_STEP), T('t2', '第二', ORDER_STEP * 2), T('t3', '第三', ORDER_STEP * 3)],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
  });

  it('首行「上移」disabled、末行「下移」disabled，中间行两个都可用', () => {
    const container = render();
    const up = buttons(container, '上移');
    const down = buttons(container, '下移');

    expect(up.map((b) => b.disabled)).toEqual([true, false, false]);
    expect(down.map((b) => b.disabled)).toEqual([false, false, true]);
  });

  it('只剩一条任务时，上移和下移都不可用', () => {
    useTaskStore.setState({
      tasks: [T('only', '唯一', ORDER_STEP)],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    const container = render();

    expect(buttons(container, '上移')[0]!.disabled).toBe(true);
    expect(buttons(container, '下移')[0]!.disabled).toBe(true);
  });
});
