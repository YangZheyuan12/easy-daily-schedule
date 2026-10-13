// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { BottomTabBar } from '@/components/layout/BottomTabBar';

/**
 * 底部导航的滑动指示器。
 *
 * 锁两件容易改坏的事：
 * 1. 指示器是**独立浮层**（不是给激活项加背景）—— 它必须存在，否则「滑过去」的手感消失；
 * 2. 不在任何 Tab 上时（板块详情页）**不能**有 Tab 处于激活态，指示器要淡出。
 *    早先的实现用 NavLink 的 isActive 判断，行为正确；换成手写 pathname 匹配后
 *    很容易顺手写成 `findIndex(...) || 0`，那样 /section/work 会错误地高亮「今日」。
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 里没有 ResizeObserver（组件用它跟踪旋转 / 键盘导致的宽度变化）
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
});

function mount(initialPath: string): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const element: ReactElement = createElement(
    MemoryRouter,
    { initialEntries: [initialPath] },
    createElement(BottomTabBar),
  );
  act(() => {
    root.render(element);
  });
  mounted.push({ root, container });
  return container;
}

const indicatorOf = (container: HTMLElement) => container.querySelector('nav span[aria-hidden]')!;

describe('BottomTabBar — 滑动指示器', () => {
  it('五个 Tab 都在（今日 / 任务 / 时间轴 / 日历 / 我的）', () => {
    const container = mount('/today');
    const labels = Array.from(container.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual(['今日', '任务', '时间轴', '日历', '我的']);
  });

  it('在 Tab 页：指示器显示，当前项标记 aria-current', () => {
    const container = mount('/today');
    expect(indicatorOf(container).className).not.toContain('opacity-0');
    expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe('今日');
  });

  it('切到任务页：指示器仍在，激活项换人', () => {
    const container = mount('/tasks');
    expect(indicatorOf(container).className).not.toContain('opacity-0');
    expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe('任务');
  });

  it('不在 Tab 上的页面（板块详情）：没有任何项激活，指示器淡出', () => {
    const container = mount('/section/work');
    expect(container.querySelector('a[aria-current="page"]')).toBeNull();
    expect(indicatorOf(container).className).toContain('opacity-0');
  });
});
