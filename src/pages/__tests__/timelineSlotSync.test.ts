// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * 时间轴「同步到今日」的勾选流程验证（渲染层）。
 *
 * 用户要求：时间轴加一个「同步到今日」按钮，点击之后出现勾选框，
 * 用户可以选择想要的时间轴事件来同步到今日页表中。
 *
 * 覆盖：
 * ① 点按钮 → 进入勾选模式：行首出现勾选框，底部换成「取消 + 同步 N 项」；
 * ② 没归板块的时间段勾选框禁用（今日页条目必须落在某个板块下）；
 * ③ 已同步过的时段**默认勾选且可取消**（再确认 = 更新今日页那条，而非堆出第二条）；
 * ④ 勾选 → 确认 → 真落成今日页条目（新建）或更新已有条目（`sourceSlotId` 去重、标题与板块正确）；
 * ⑤ 取消 → 退出勾选模式，不产生任何条目。
 */
const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    tasks: { listByDate: vi.fn().mockResolvedValue([]) },
    items: { listByDate: vi.fn().mockResolvedValue([]) },
    timeSlots: { listByDate: vi.fn().mockResolvedValue([]) },
    inspirations: { listByDate: vi.fn().mockResolvedValue([]) },
    settings: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) },
  },
  fakePersistence: {
    markTasks: vi.fn(),
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

import { TimelinePage } from '@/pages/TimelinePage';
import { useDayStore } from '@/store/useDayStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useItemStore } from '@/store/useItemStore';
import { makeItem, makeSlot } from '@/services/__tests__/fixtures';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATE = '2026-10-10';

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function render(): HTMLDivElement {
  const element = createElement(
    MemoryRouter,
    { initialEntries: ['/timeline'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    createElement(
      Routes,
      null,
      createElement(Route, { path: '/timeline', element: createElement(TimelinePage) }),
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

/** 勾选框（行首那一列） */
function checkboxes(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'),
  ).filter((b) => (b.getAttribute('aria-label') ?? '').includes('同步这一项'));
}

function byTestId(container: HTMLElement, testId: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`找不到 data-testid="${testId}"`);
  return el;
}

function setSlots(slots: ReturnType<typeof makeSlot>[]): void {
  useTimeSlotStore.setState({ slots, date: DATE, loading: false });
}

beforeEach(() => {
  useDayStore.setState({ date: DATE, selfStatus: null });
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

describe('时间轴 → 同步到今日（勾选模式）', () => {
  const grouped = () => makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '开组会', startMin: 540 });
  const ungrouped = () => makeSlot({ id: 's2', date: DATE, sectionId: null, content: '睡午觉', startMin: 720 });

  it('点「同步到今日」→ 行首出现勾选框，底部换成「取消 + 同步 N 项」', () => {
    setSlots([grouped(), ungrouped()]);
    const container = render();

    expect(checkboxes(container)).toHaveLength(0);

    act(() => {
      byTestId(container, 'timeline-sync-button').click();
    });

    // 两条时段各一个勾选框
    expect(checkboxes(container)).toHaveLength(2);
    // 底部主操作换成取消 + 同步（添加时间段按钮让位）
    expect(container.textContent).not.toContain('+ 添加时间段');
    const confirm = byTestId(container, 'timeline-sync-confirm');
    expect(confirm.textContent).toContain('同步');
    expect(confirm.disabled).toBe(true); // 还没勾任何一项
  });

  it('没归板块的时间段不能勾（虚线禁用态）', () => {
    setSlots([grouped(), ungrouped()]);
    const container = render();

    act(() => {
      byTestId(container, 'timeline-sync-button').click();
    });

    const boxes = checkboxes(container);
    // 按行顺序：s1（归了工作）可勾，s2（未分组）禁用
    expect(boxes[0]!.disabled).toBe(false);
    expect(boxes[1]!.disabled).toBe(true);
    expect(boxes[1]!.getAttribute('title')).toContain('未分组');
  });

  it('已同步过的时段默认勾选且可取消；确认后更新已有条目而非新建', () => {
    // 时间轴把标题改了，今日页那条还停留在旧标题 → 确认应当把今日页更新成新标题
    setSlots([
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '开组会（改）', startMin: 540 }),
    ]);
    useItemStore.setState({
      items: [makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '开组会', sourceSlotId: 's1' })],
    });
    const container = render();

    act(() => {
      byTestId(container, 'timeline-sync-button').click();
    });

    const boxes = checkboxes(container);
    expect(boxes).toHaveLength(1);
    // 默认勾选；且**可取消**（不再是锁死的禁用态 —— 「再同步」现在语义是更新）
    expect(boxes[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(boxes[0]!.disabled).toBe(false);
    // 确认按钮可点：这次会「更新 1 项」
    const confirm = byTestId(container, 'timeline-sync-confirm');
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toContain('更新');

    act(() => {
      confirm.click();
    });

    // 没有新增条目，而是更新了已有的那条
    const items = useItemStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('i1');
    expect(items[0]?.title).toBe('开组会（改）');
    expect(items[0]?.sourceSlotId).toBe('s1');
  });

  it('勾选 → 确认 → 落成今日页条目（板块、标题、来源标记都对）', () => {
    setSlots([grouped(), ungrouped()]);
    const container = render();

    act(() => {
      byTestId(container, 'timeline-sync-button').click();
    });
    act(() => {
      checkboxes(container)[0]!.click();
    });

    const confirm = byTestId(container, 'timeline-sync-confirm');
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toContain('1');

    act(() => {
      confirm.click();
    });

    const items = useItemStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('开组会');
    expect(items[0]?.sectionId).toBe('work');
    expect(items[0]?.sourceSlotId).toBe('s1');
    expect(items[0]?.date).toBe(DATE);

    // 退出勾选模式
    expect(checkboxes(container)).toHaveLength(0);
    expect(container.textContent).toContain('+ 添加时间段');
  });

  it('取消 → 退出勾选模式，不产生任何条目', () => {
    setSlots([grouped()]);
    const container = render();

    act(() => {
      byTestId(container, 'timeline-sync-button').click();
    });
    act(() => {
      checkboxes(container)[0]!.click();
    });
    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent === '取消',
      )!.click();
    });

    expect(checkboxes(container)).toHaveLength(0);
    expect(useItemStore.getState().items).toHaveLength(0);
  });
});
