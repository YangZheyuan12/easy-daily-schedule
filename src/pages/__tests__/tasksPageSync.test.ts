// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * TasksPage「同步到今日」勾选流程验证（渲染层）。
 *
 * 复现用户报的 bug：「点了同步之后显示『今日页已是最新』，但今日页并没有更新」。
 * 目标是验证：分组任务 → 点同步 → 勾选 → 确认，是否真能落成今日页条目。
 */
const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    tasks: { listByDate: vi.fn().mockResolvedValue([]), listAll: vi.fn().mockResolvedValue([]) },
    pinCompletions: { listByDate: vi.fn().mockResolvedValue([]) },
    items: { listByDate: vi.fn().mockResolvedValue([]) },
    timeSlots: { listByDate: vi.fn().mockResolvedValue([]) },
    inspirations: { listByDate: vi.fn().mockResolvedValue([]) },
  },
  fakePersistence: {
    markTasks: vi.fn(),
    markItems: vi.fn(),
    markPinCompletion: vi.fn(),
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

import { TasksPage } from '@/pages/TasksPage';
import { useDayStore } from '@/store/useDayStore';
import { useTaskStore } from '@/store/useTaskStore';
import { useItemStore } from '@/store/useItemStore';
import { makeTask } from '@/services/__tests__/fixtures';

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

function byTestId(container: HTMLElement, testId: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`找不到 data-testid="${testId}"`);
  return el;
}

/** 同步勾选框（行首那一列，aria-label 含「同步」） */
function syncBoxes(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')).filter(
    (b) => (b.getAttribute('aria-label') ?? '').includes('同步'),
  );
}

beforeEach(() => {
  useDayStore.setState({ date: DATE, selfStatus: null });
  useTaskStore.setState({
    tasks: [],
    currentDate: DATE,
    loading: false,
    lastCreatedId: null,
    pendingUndo: null,
  });
  useItemStore.setState({ items: [], lastCreatedId: null, pendingUndo: null, loading: false });
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.restoreAllMocks();
});

describe('任务页 → 同步到今日（勾选模式）', () => {
  it('分组任务：点同步 → 勾选 → 确认 → 落成今日页条目', () => {
    useTaskStore.setState({
      tasks: [makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '开组会' })],
      currentDate: DATE,
      loading: false,
    });
    const container = render();

    act(() => {
      byTestId(container, 'task-sync-button').click();
    });

    const boxes = syncBoxes(container);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.disabled).toBe(false);

    act(() => {
      boxes[0]!.click();
    });

    const confirm = byTestId(container, 'task-sync-confirm');
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toContain('1');

    act(() => {
      confirm.click();
    });

    const items = useItemStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('开组会');
    expect(items[0]?.sectionId).toBe('work');
    expect(items[0]?.sourceTaskId).toBe('t1');
    expect(items[0]?.date).toBe(DATE);
  });
});

describe('任务页同步 — 定住任务边界', () => {
  it('定住任务本体（pinFrom === date）：可同步，落成条目', () => {
    useTaskStore.setState({
      tasks: [makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '开组会', pinFrom: DATE })],
      currentDate: DATE,
      loading: false,
    });
    const container = render();

    act(() => {
      byTestId(container, 'task-sync-button').click();
    });

    const boxes = syncBoxes(container);
    expect(boxes).toHaveLength(1);
    // 定住本体（pinFrom === date）不是投影，应可勾选
    expect(boxes[0]!.disabled).toBe(false);
  });

  it('定住投影（pinFrom < date）不可同步：只有投影任务时点同步不进入勾选模式', () => {
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 't1', date: '2026-10-09', sectionId: 'work', content: '开组会', pinFrom: '2026-10-09' }),
      ],
      currentDate: DATE,
      loading: false,
    });
    const container = render();

    act(() => {
      byTestId(container, 'task-sync-button').click();
    });

    // 投影任务被排除，可同步数为 0 → 不进入勾选模式（无勾选框）
    const boxes = syncBoxes(container);
    expect(boxes).toHaveLength(0);
    // 底部仍是「添加任务」，不是「取消 + 同步」
    expect(container.textContent).toContain('+ 添加任务');
  });
});
