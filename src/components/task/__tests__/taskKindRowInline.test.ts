// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 期限任务 / 长时目标的行：**不用弹窗就能直接改**（2026-10-17 第十轮）。
 *
 * 之前是「点任意一行 → 底部抽屉升起」，改两个字也要等一个面板滑上来、改完再等它
 * 滑下去；现在标题与描述就是行内的输入框，右侧「⋯」才打开抽屉（删除 / 图片 /
 * 改日期这些低频动作在里面）。
 *
 * 本文件锁的契约：
 * 1. 标题与描述都是行内 textarea —— 想改就当场改，不需要先打开任何抽屉；
 * 2. 行尾「⋯」存在，且只有点它才会去叫编辑抽屉；
 * 3. 整行同一个 44px 行盒、全部垂直居中 —— 「文字和框框没对齐」的回归防线；
 * 4. 拖拽手柄只在外部传了 handleProps 时出现。
 */
const setContent = vi.fn();
const setDescription = vi.fn();
const toggleDone = vi.fn();

vi.mock('@/store/useTaskStore', () => ({
  useTaskStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setContent, setDescription, toggleDone }),
}));

// 图片条挂载时会读库；这一测只关心行本身的结构与交互，整体替身掉
vi.mock('@/components/task/TaskImageStrip', () => ({
  TaskImageStrip: () => createElement('span', { 'data-testid': 'image-strip' }),
}));

import { TaskKindRow, type TaskKindRowProps } from '@/components/task/TaskKindRow';
import { makeTask } from '@/services/__tests__/fixtures';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderRow(props: Partial<TaskKindRowProps> = {}): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const finalProps: TaskKindRowProps = {
    task: makeTask({ id: 't1', content: '交课程设计初稿', kind: 'deadline', dueDate: '2026-10-20' }),
    kind: 'deadline',
    dueLabel: '期限 10月20日',
    onOpenSheet: () => {},
    ...props,
  };
  act(() => {
    root.render(createElement(TaskKindRow, finalProps));
  });
  mounted.push({ root, container });
  return container;
}

function typeInto(el: HTMLElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  setContent.mockReset();
  setDescription.mockReset();
  toggleDone.mockReset();
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe('TaskKindRow — 不用弹窗的直接编辑', () => {
  it('标题是行内 textarea：改它直接写 store，不经过任何抽屉', () => {
    const container = renderRow();

    const title = container.querySelector('[aria-label="任务标题"]') as HTMLTextAreaElement;
    expect(title).toBeTruthy();
    expect(title.tagName).toBe('TEXTAREA');
    expect(title.value).toBe('交课程设计初稿');

    // 页面上不存在任何 dialog —— 抽屉没被叫起来
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    typeInto(title, '交课程设计终稿');
    expect(setContent).toHaveBeenCalledWith('t1', '交课程设计终稿');
  });

  it('描述也是行内 textarea（第二行），与期限胶囊同排', () => {
    const container = renderRow({
      task: makeTask({
        id: 't1',
        content: '交初稿',
        kind: 'deadline',
        dueDate: '2026-10-20',
        description: '先画流程图',
      }),
    });

    const desc = container.querySelector('[aria-label="任务描述"]') as HTMLTextAreaElement;
    expect(desc).toBeTruthy();
    expect(desc.value).toBe('先画流程图');

    typeInto(desc, '先画泳道图');
    expect(setDescription).toHaveBeenCalledWith('t1', '先画泳道图');
    // 期限胶囊在同一行
    expect(container.textContent).toContain('期限 10月20日');
  });

  it('行尾「⋯」：点它才去叫编辑抽屉', () => {
    const onOpenSheet = vi.fn();
    const container = renderRow({ onOpenSheet });

    const more = container.querySelector('[data-testid="task-kind-more"]') as HTMLElement;
    expect(more).toBeTruthy();
    act(() => {
      more.click();
    });
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
  });

  it('勾选完成不会误开抽屉', () => {
    const onOpenSheet = vi.fn();
    const container = renderRow({ onOpenSheet });

    act(() => {
      (container.querySelector('[aria-label="标记为已完成"]') as HTMLElement).click();
    });
    expect(onOpenSheet).not.toHaveBeenCalled();
    expect(toggleDone).toHaveBeenCalledWith('t1');
  });

  it('拖拽手柄只在传了 handleProps 时出现', () => {
    const withHandle = renderRow({ handleProps: { onPointerDown: () => {}, style: {} } });
    expect(withHandle.querySelector('[aria-label^="拖动排序"]')).toBeTruthy();

    const without = renderRow();
    expect(without.querySelector('[aria-label^="拖动排序"]')).toBeNull();
  });

  /*
    「文字和框框没对齐」的回归防线。
    早先这一行是 `items-start` + 手调 `pt-1.5`，方框比文字首行低了约 4px；
    现在必须与任务页 / 今日页同为「一个 44px 行盒 + 全部 items-center」。
  */
  it('标题行是 44px 行盒且整体垂直居中（对齐回归防线）', () => {
    const container = renderRow();
    const row = container.querySelector('.min-h-tap') as HTMLElement;

    expect(row).toBeTruthy();
    expect(row.className).toContain('items-center');
    expect(row.className).not.toContain('items-start');
  });
});
