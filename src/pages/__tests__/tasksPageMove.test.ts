// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * TasksPage 任务行的**顺序与行结构**验证（渲染层）。
 *
 * 背景（真 bug，用户报「点了没有任何反应」）：
 * `useTaskStore.move` 把 `order` 换好了，但 TasksPage 直接按数组位置渲染，
 * 于是按钮点下去页面上纹丝不动 —— 刷新一下才「突然」换位。
 * 所以这里的判据只能是 **DOM 里输入框的先后顺序**，不能是内存里的 order。
 *
 * 覆盖：
 * ① 数组顺序与 order 不一致时，渲染必须以 order 为准；
 * ② `move` 之后 DOM 顺序真的换位（回归上，现在不再经由行内按钮触发）；
 * ③ 软删任务既不渲染、也不占换位名额；
 * ④ 行内**没有**上移 / 下移按钮（用户要求移除）；
 * ⑤ 分组标记与描述框**同一行**，且分组在前。
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

/**
 * DOM 里输入框的先后顺序 = 用户看到的顺序。
 *
 * 标题现在是 **textarea**（长标题要能折行，单行 input 会把超出部分横向吞掉），
 * 所以这里按 placeholder 找 textarea 而不是 input —— 顺带把「标题不是单行 input」
 * 这件事锁住：哪天有人改回 input，这三个顺序用例会集体取到空数组而失败。
 */
function renderedContents(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLTextAreaElement>('textarea[placeholder="今天要做什么…"]'),
  ).map((input) => input.value);
}

/** 按 placeholder 精确取描述框（页里有标题与描述两个 textarea） */
function descriptionBox(container: HTMLElement): HTMLTextAreaElement {
  return container.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder="描述（可选）"]',
  ) as HTMLTextAreaElement;
}

function buttons(container: HTMLElement, label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`));
}

const T = (id: string, content: string, order: number, extra: Record<string, unknown> = {}) =>
  makeTask({ id, content, order, date: DATE, createdAt: order, ...extra });

function setTasks(tasks: ReturnType<typeof T>[]): void {
  useTaskStore.setState({
    tasks,
    loading: false,
    lastCreatedId: null,
    pendingUndo: null,
  });
}

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
    setTasks([
      T('t3', '第三', ORDER_STEP * 3),
      T('t1', '第一', ORDER_STEP),
      T('t2', '第二', ORDER_STEP * 2),
    ]);

    // 修复前这里是 ['第三', '第一', '第二']（数组顺序）
    expect(renderedContents(render())).toEqual(['第一', '第二', '第三']);
  });

  it('move 之后 DOM 顺序真的换位（这就是当年「点了没反应」的那一下）', () => {
    setTasks([
      T('t1', '第一', ORDER_STEP),
      T('t2', '第二', ORDER_STEP * 2),
      T('t3', '第三', ORDER_STEP * 3),
    ]);
    const container = render();
    expect(renderedContents(container)).toEqual(['第一', '第二', '第三']);

    // 行内上移 / 下移按钮已移除，换位改由 store 动作驱动（拖拽等后续交互）
    act(() => {
      useTaskStore.getState().move('t1', 1);
    });

    expect(renderedContents(container)).toEqual(['第二', '第一', '第三']);
  });

  it('软删的任务不渲染，也不占换位名额（下移跨过的是下一个存活任务）', () => {
    setTasks([
      T('t1', '第一', ORDER_STEP),
      T('dead', '已删', Math.floor(ORDER_STEP * 1.5), { deletedAt: 4000 }),
      T('t2', '第二', ORDER_STEP * 2),
    ]);
    const container = render();
    expect(renderedContents(container)).toEqual(['第一', '第二']);

    act(() => {
      useTaskStore.getState().move('t1', 1);
    });

    expect(renderedContents(container)).toEqual(['第二', '第一']);
  });
});

describe('TasksPage — 行内不再有上移 / 下移按钮', () => {
  it('整页找不到「上移」「下移」', () => {
    setTasks([
      T('t1', '第一', ORDER_STEP),
      T('t2', '第二', ORDER_STEP * 2),
    ]);
    const container = render();

    expect(buttons(container, '上移')).toHaveLength(0);
    expect(buttons(container, '下移')).toHaveLength(0);
  });
});

describe('TasksPage — 分组与描述同一行', () => {
  it('分组按钮在前、描述框在后，且描述框是 textarea（可换行）', () => {
    setTasks([
      T('t1', '第一', ORDER_STEP, { sectionId: 'work', description: '一段很长的描述' }),
    ]);
    const container = render();

    const textarea = descriptionBox(container);
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('一段很长的描述');

    /*
      分组胶囊外包了一层 `relative`（气泡浮层的锚点），所以第一格是这层壳、
      壳里第一个元素才是分组按钮。这条断言同时锁住两件事：
      分组仍在描述之前；气泡是**长在按钮旁边**而不是飘到别处。
    */
    const metaRow = textarea.parentElement!;
    const groupWrap = metaRow.firstElementChild!;
    const groupButton = groupWrap.querySelector<HTMLButtonElement>('button[aria-label^="分组"]');
    expect(groupButton).toBeTruthy();
    expect(groupWrap.firstElementChild).toBe(groupButton);
  });

  it('标题本身也是 textarea（长标题折行，不再被单行 input 横向吞掉）', () => {
    setTasks([T('t1', '一条写得很长的任务', ORDER_STEP)]);
    const container = render();

    const title = container.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="今天要做什么…"]',
    );
    expect(title).toBeTruthy();
    expect(title!.value).toBe('一条写得很长的任务');
    // 单行的标志：rows=1 + 不出现横向滚动，靠自动增高（resize-none）撑开
    expect(title!.classList.contains('resize-none')).toBe(true);
    expect(container.querySelector('input[placeholder="今天要做什么…"]')).toBeNull();
  });
});
