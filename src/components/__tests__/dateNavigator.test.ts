// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DateNavigator } from '@/components/date/DateNavigator';
import { todayKey } from '@/utils/date';

/**
 * DateNavigator 的渲染 / 点击行为（QA 补的覆盖）。
 *
 * 为什么需要这个测试：FIX 2 给组件加了可选 `onDateClick`，其中一条硬性要求是
 * 「不传 onDateClick 时，点中间日期仍然调用 onToday」。
 * 负向验证证明：把这条分支改坏（把 `onDateClick ?? onToday` 换成空函数）后，
 * 当时全量 280 个用例仍然全绿 —— 该行为此前完全没有测试覆盖。
 * 这里用 jsdom 真渲染 + 真派发 click 把它锁住。
 *
 * 实现约束（为什么不用 @testing-library/react）：
 * - vite.config.ts 的 test.include 只收 `*.test.ts`，check-test-baseline.mjs 同款；
 *   写成 .tsx 两边都收不到。故用 `createElement` 代替 JSX。
 * - 未安装 RTL，直接用 react-dom/client 挂载；jsdom 通过文件顶部的
 *   `@vitest-environment` 指令单文件启用，不影响其余测试的 node 环境。
 */

// React 18 的 act 需要这个开关，否则会打印「not wrapped in act」警告
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function mount(element: ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
});

function buttonByLabel(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === label,
  );
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** 远早于今天，`isToday` 必为 false（用它避免依赖真实系统日期） */
const NOT_TODAY = '2000-01-01';

describe('DateNavigator — 不传 onDateClick（TodayPage 的用法）', () => {
  it('点中间日期调用 onToday（FIX 2 硬性要求，此前无任何覆盖）', () => {
    const onToday = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const container = mount(
      createElement(DateNavigator, { date: NOT_TODAY, onPrev, onNext, onToday }),
    );

    const center = buttonByLabel(container, '回到今天');
    expect(center).toBeDefined();
    click(center!);

    expect(onToday).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('「今天」胶囊常驻在日期行右侧（概念稿形态），全组件共 ‹ / 日期 / › / 胶囊 四个按钮', () => {
    const container = mount(
      createElement(DateNavigator, {
        date: NOT_TODAY,
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday: vi.fn(),
      }),
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(4);
    // 胶囊是最后一个按钮；日期按钮在不传 onDateClick 时也用「回到今天」标签，
    // 故不能按 label 找（会先命中日期按钮），要按位置取
    const pill = buttons[buttons.length - 1];
    expect(pill.getAttribute('aria-label')).toBe('回到今天');
    expect(pill.textContent).toBe('今天');
  });
});

describe('DateNavigator — 传 onDateClick（TimelinePage 的用法）', () => {
  it('点中间日期调用 onDateClick，不调用 onToday', () => {
    const onDateClick = vi.fn();
    const onToday = vi.fn();
    const container = mount(
      createElement(DateNavigator, {
        date: NOT_TODAY,
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday,
        onDateClick,
      }),
    );

    const center = buttonByLabel(container, '点击选择日期');
    expect(center).toBeDefined();
    click(center!);

    expect(onDateClick).toHaveBeenCalledTimes(1);
    expect(onToday).not.toHaveBeenCalled();
  });

  it('date !== today 时出现「今天」快捷键，点它调用 onToday', () => {
    const onToday = vi.fn();
    const container = mount(
      createElement(DateNavigator, {
        date: NOT_TODAY,
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday,
        onDateClick: vi.fn(),
      }),
    );

    const shortcut = buttonByLabel(container, '回到今天');
    expect(shortcut).toBeDefined();
    expect(shortcut!.textContent).toBe('今天');
    click(shortcut!);
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it('date === today 时「今天」胶囊仍然渲染，点它调用 onToday', () => {
    const onToday = vi.fn();
    const container = mount(
      createElement(DateNavigator, {
        date: todayKey(),
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday,
        onDateClick: vi.fn(),
      }),
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(4);
    const pill = buttons[buttons.length - 1];
    expect(pill.textContent).toBe('今天');
    click(pill as HTMLButtonElement);
    expect(onToday).toHaveBeenCalledTimes(1);
  });
});
