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

describe('DateNavigator — 视图切换模式（TodayPage / TimelinePage）', () => {
  const base = { onPrev: vi.fn(), onNext: vi.fn() };

  it('天视图且看的不是今天 → 右上角直接是「回到今天」入口，点它即回今天', () => {
    const onToday = vi.fn();
    const container = mount(
      createElement(DateNavigator, {
        ...base,
        date: NOT_TODAY,
        onToday,
        onDateClick: vi.fn(),
        viewMode: 'day',
        onViewModeChange: vi.fn(),
      }),
    );

    const pill = container.querySelector<HTMLButtonElement>('[data-testid="back-to-today"]');
    expect(pill).toBeTruthy();
    /*
      胶囊里的可见文案是「今天」（配 ↺ 图标）—— 这一行的横向预算是死的，
      四个字会把日期挤成省略号（2026-10-17「切日期排版乱」的同一处修复）。
      语义完整版本在 aria-label 与浮层里那一行，这里顺手把两者都钉住。
    */
    expect(pill!.textContent).toBe('今天');
    expect(pill!.getAttribute('aria-label')).toBe('回到今天');
    click(pill!);
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  /*
    「日期排版会随着日期变宽 / 变窄而抖」的回归防线（2026-10-17）。
    左侧整块 flex-1 + 中间日期槽再 flex-1 ⇒ 两个箭头的横向位置只由容器宽度决定，
    与当天是「9 日」还是「10 日」无关；日期本身保留 nowrap + truncate，
    窄屏上宁可出省略号也不把导航栏撑破。
  */
  it('切日期不会再带动整行重排：左块与日期槽都吃满弹性剩余空间', () => {
    const container = mount(
      createElement(DateNavigator, {
        ...base,
        date: todayKey(),
        onToday: vi.fn(),
        onDateClick: vi.fn(),
        viewMode: 'day',
        onViewModeChange: vi.fn(),
      }),
    );

    const left = container.firstElementChild?.firstElementChild as HTMLElement;
    expect(left.className).toContain('flex-1');

    const dateSlot = left.children[1] as HTMLElement;
    expect(dateSlot.className).toContain('flex-1');
    expect(container.querySelector('[aria-label="后一天"]')?.className).toContain('shrink-0');
  });

  it('天视图且就是今天 → 右上角回到「当日」切换胶囊，不显示「回到今天」', () => {
    const container = mount(
      createElement(DateNavigator, {
        ...base,
        date: todayKey(),
        onToday: vi.fn(),
        onDateClick: vi.fn(),
        viewMode: 'day',
        onViewModeChange: vi.fn(),
      }),
    );

    expect(container.querySelector('[data-testid="back-to-today"]')).toBeNull();
    expect(buttonByLabel(container, '切换当日 / 本周视图')).toBeDefined();
  });

  it('切视图的菜单是右上角浮层（role=menu），不是底部抽屉（role=dialog）', () => {
    const onViewModeChange = vi.fn();
    const container = mount(
      createElement(DateNavigator, {
        ...base,
        date: todayKey(),
        onToday: vi.fn(),
        onDateClick: vi.fn(),
        viewMode: 'day',
        onViewModeChange,
      }),
    );

    expect(container.querySelector('[role="menu"]')).toBeNull();

    click(buttonByLabel(container, '切换当日 / 本周视图')!);

    const menu = container.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    // Sheet 挂的是 role="dialog" —— 在就说明又退回底部抽屉了
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const week = Array.from(menu!.querySelectorAll('button')).find(
      (button) => button.textContent === '本周',
    );
    click(week as HTMLButtonElement);
    expect(onViewModeChange).toHaveBeenCalledWith('week');
  });

  it('就是今天 → 菜单里没有「回到今天」（点了不会有变化，还会把菜单撑宽）', () => {
    const container = mount(
      createElement(DateNavigator, {
        ...base,
        date: todayKey(),
        onToday: vi.fn(),
        onDateClick: vi.fn(),
        viewMode: 'day',
        onViewModeChange: vi.fn(),
      }),
    );

    click(buttonByLabel(container, '切换当日 / 本周视图')!);
    const menu = container.querySelector('[role="menu"]')!;
    const labels = Array.from(menu.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(labels).toContain('当日');
    expect(labels).toContain('本周');
    expect(labels.some((text) => text.includes('回到今天'))).toBe(false);
  });

  it('看的不是今天（周视图，胶囊不被顶掉）→ 菜单里有「回到今天」', () => {
    const container = mount(
      createElement(DateNavigator, {
        ...base,
        date: NOT_TODAY,
        onToday: vi.fn(),
        onDateClick: vi.fn(),
        viewMode: 'week',
        onViewModeChange: vi.fn(),
      }),
    );

    click(buttonByLabel(container, '切换当日 / 本周视图')!);
    const menu = container.querySelector('[role="menu"]')!;
    const labels = Array.from(menu.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(labels.some((text) => text.includes('回到今天'))).toBe(true);
  });
});
