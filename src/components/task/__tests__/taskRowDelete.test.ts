// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * 删除任务的**退场动效**验证（用户要求「给删除某条任务也做一个 ui 动效」）。
 *
 * 为什么需要这条锁：软删是即时的（改 `deletedAt` 后行立刻从列表消失）。
 * 不播动画的话，用户只看到「点了一下、整行没了」，不知道刚才那条去了哪。
 * 现在的约定是：先播「高度收拢 + 淡出」（下面的行平滑上移补位），
 * 播完（280ms，与 `--m-dur-3` 对齐）才真删。
 *
 * 覆盖：
 * ① 点删除 → 行**还在** DOM 里，且 store 里还没软删（动效播完才删）；
 * ② 280ms 后 → 真删了，行消失；
 * ③ 退格删空行（Backspace）走同一条动效路径，不是瞬间消失。
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

function titles(container: HTMLElement): HTMLTextAreaElement[] {
  return Array.from(
    container.querySelectorAll<HTMLTextAreaElement>('textarea[placeholder="今天要做什么…"]'),
  );
}

/** 聚焦某一行（删除按钮只在聚焦时出现），返回该行标题框 */
function focusRow(container: HTMLElement, index: number): HTMLTextAreaElement {
  const title = titles(container)[index];
  act(() => {
    title.focus();
  });
  return title;
}

function deleteButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('button[aria-label="删除"]');
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

describe('删除任务有退场动效（播完才真软删）', () => {
  it('点删除 → 行还在、store 还没软删；280ms 后才真删、行才消失', () => {
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 't1', content: '第一', order: ORDER_STEP }),
        makeTask({ id: 't2', content: '第二', order: ORDER_STEP * 2 }),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    const container = render();
    expect(titles(container)).toHaveLength(2);

    focusRow(container, 0);
    const button = deleteButton(container)!;
    expect(button, '聚焦后应出现删除按钮').toBeTruthy();

    act(() => {
      button.click();
    });

    // 动效途中：行仍在 DOM 里，store 里也还没软删
    expect(titles(container)).toHaveLength(2);
    expect(useTaskStore.getState().tasks[0].deletedAt).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // 播完才真删：行消失，且走的是软删（快照在，撤销条照常出现）
    expect(titles(container)).toHaveLength(1);
    expect(titles(container)[0].value).toBe('第二');
    expect(useTaskStore.getState().tasks[0].deletedAt).toBe(1700000000000);
    expect(useTaskStore.getState().pendingUndo?.ids).toEqual(['t1']);
  });

  it('动画途中重复点删除只算一次（不会连删两条）', () => {
    useTaskStore.setState({
      tasks: [
        makeTask({ id: 't1', content: '第一', order: ORDER_STEP }),
        makeTask({ id: 't2', content: '第二', order: ORDER_STEP * 2 }),
      ],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    const container = render();

    focusRow(container, 0);
    const button = deleteButton(container)!;
    act(() => {
      button.click();
      button.click();
      button.click();
    });

    expect(useTaskStore.getState().tasks.every((t) => t.deletedAt === null)).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(useTaskStore.getState().tasks.filter((t) => t.deletedAt !== null)).toHaveLength(1);
  });

  it('清空标题后退格删除也播同一条动效（不是瞬间消失）', () => {
    useTaskStore.setState({
      tasks: [makeTask({ id: 't1', content: '', order: ORDER_STEP })],
      loading: false,
      lastCreatedId: null,
      pendingUndo: null,
    });
    const container = render();

    const title = focusRow(container, 0);
    act(() => {
      title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    });

    expect(titles(container)).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0].deletedAt).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(titles(container)).toHaveLength(0);
    expect(useTaskStore.getState().tasks[0].deletedAt).toBe(1700000000000);
  });
});
