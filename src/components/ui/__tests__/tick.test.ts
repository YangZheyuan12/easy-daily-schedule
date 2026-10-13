// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Tick } from '@/components/ui/Tick';

/**
 * 勾选框的动效规则（这套动效里最容易被改坏的一条）。
 *
 * 关键约束：**动画类只能在「刚被勾上/取消」时出现**。
 * 如果写成 `className={done ? 'm-tick' : ''}`，打开页面时所有已完成条目都会弹一下 ——
 * 一个页面全在抖的应用，比完全没有动效更糟。
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
});

function mount(element: ReactElement): { root: Root; container: HTMLDivElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  const entry = { root, container };
  mounted.push(entry);
  return entry;
}

/** 勾选框的视觉盒子 = 按钮里那个 span */
const boxOf = (container: HTMLElement) => container.querySelector('button > span')!;

describe('Tick — 勾选微动效', () => {
  it('挂载时就是完成态：有对勾，但不播动画', () => {
    const { container } = mount(createElement(Tick, { done: true, onToggle: () => {} }));

    expect(boxOf(container).className).not.toContain('m-tick');
    expect(container.querySelector('svg')).not.toBeNull(); // 对勾已经画好
  });

  it('挂载时是未完成态：空盒子，也没有动画', () => {
    const { container } = mount(createElement(Tick, { done: false, onToggle: () => {} }));

    expect(boxOf(container).className).not.toContain('m-tick');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('真的勾上那一刻才播动画', () => {
    const { root, container } = mount(createElement(Tick, { done: false, onToggle: () => {} }));
    expect(boxOf(container).className).not.toContain('m-tick');

    act(() => {
      root.render(createElement(Tick, { done: true, onToggle: () => {} }));
    });

    expect(boxOf(container).className).toContain('m-tick');
  });

  it('无障碍标签跟随状态（「标记为已完成 / 未完成」）', () => {
    const undone = mount(createElement(Tick, { done: false, onToggle: () => {} }));
    expect(undone.container.querySelector('button')?.getAttribute('aria-label')).toBe('标记为已完成');

    const done = mount(createElement(Tick, { done: true, onToggle: () => {} }));
    expect(done.container.querySelector('button')?.getAttribute('aria-label')).toBe('标记为未完成');
  });
});
