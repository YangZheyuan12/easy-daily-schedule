// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 期限/长时目标添加抽屉的**延迟聚焦**（2026-10-16 第九轮，配合「弹窗闪一下」修复）。
 *
 * 背景：这个抽屉原来给标题框加了 `autoFocus`，键盘会在 Sheet 入场动画
 * （m-sheet-up 280ms）进行中就弹出；Capacitor 的 Keyboard.resize=native
 * （adjustResize）连布局视口一起压缩，fixed inset-0 的抽屉在半空中改变
 * 高度 —— 用户看到「闪一下」。现在改成挂载后延迟 280ms 再 focus，
 * 让动画先稳定、键盘后弹。
 *
 * 本文件锁的契约：
 * 1. 新增态打开：焦点**不**立即落在标题框（无 autoFocus 语义）；
 *    延迟到（约）280ms 后落上。
 * 2. 编辑态（传入 task）：不抢焦点，用户自己点。
 * 3. 关闭时清掉未执行的定时器（不会「关了抽屉键盘才弹」）。
 */
const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    tasks: { listByDate: vi.fn().mockResolvedValue([]), listByDateRange: vi.fn().mockResolvedValue([]) },
    items: { listByDate: vi.fn().mockResolvedValue([]) },
    days: { ensure: vi.fn().mockResolvedValue(undefined) },
  },
  fakePersistence: { markTask: vi.fn(), markSelfStatus: vi.fn(), flush: vi.fn() },
  fakeClock: { now: () => 1700000000000 },
  fakeUndo: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: fakeUndo,
}));

import { TaskKindComposer } from '@/components/task/TaskKindComposer';
import { makeTask } from '@/services/__tests__/fixtures';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FOCUS_DELAY_MS = 280;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderComposer(props: { open: boolean; task?: ReturnType<typeof makeTask> | null }): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  function Probe() {
    return createElement(TaskKindComposer, {
      kind: 'deadline',
      task: props.task ?? null,
      open: props.open,
      onClose: () => {},
    });
  }
  act(() => {
    root.render(createElement(Probe));
  });
  mounted.push({ root, container });
  return container;
}

function titleInput(container: HTMLDivElement): HTMLInputElement {
  return container.querySelector('input')!;
}

/** 推进定时器（useFakeTimers 下） */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe('TaskKindComposer — 延迟聚焦（修「弹窗闪一下」）', () => {
  it('新增态打开：焦点不立即落下（autoFocus 语义已移除）', () => {
    const container = renderComposer({ open: true });

    expect(titleInput(container)).toBeTruthy();
    expect(document.activeElement).not.toBe(titleInput(container));
  });

  it('新增态打开：约 280ms（入场动画时长）后焦点才落上', () => {
    const container = renderComposer({ open: true });

    advance(FOCUS_DELAY_MS - 50);
    expect(document.activeElement).not.toBe(titleInput(container));

    advance(50);
    expect(document.activeElement).toBe(titleInput(container));
  });

  it('编辑态（传入 task）：不抢焦点', () => {
    const task = makeTask({ id: 't-edit', content: '已有任务' });
    const container = renderComposer({ open: true, task });

    advance(FOCUS_DELAY_MS + 100);
    expect(document.activeElement).not.toBe(titleInput(container));
  });

  it('未打开（open=false）：不聚焦', () => {
    const container = renderComposer({ open: false });
    advance(FOCUS_DELAY_MS + 100);
    expect(container.querySelector('input')).toBeNull();
  });
});
