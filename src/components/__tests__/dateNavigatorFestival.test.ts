// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DateNavigator } from '@/components/date/DateNavigator';
import { DaySummaryCard } from '@/components/calendar/DaySummaryCard';
import type { DaySummary } from '@/domain/types';

/**
 * DateNavigator 新增 `subtitleText` 副标题后的行为锁（渲染层）。
 *
 * 契约：
 * - 不传 / 空串时，DOM 与加此功能前一致（按钮数不变、不产生副标题节点）。
 * - 传值时，副标题渲染在**与主日期同一个动画块内**（随日期切换一起滑入 / 出），
 *   且按钮数不变。
 * - 无论有没有副标题，‹ / › / 今天 / 中间日期 四个回调行为都不变。
 * - 越界日期 + DaySummaryCard 渲染不崩溃，且不显示任何农历 / 节日文本。
 *
 * 说明：项目 vite.config.ts 只收 `*.test.ts`，故用 createElement 代替 JSX；
 * jsdom 经文件顶部指令单文件启用。
 */

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

/** 远早于今天，`isToday` 必为 false（避免依赖真实系统日期） */
const NOT_TODAY = '2000-01-01';
const SUBTITLE = '九月初三 · 中秋节';

/** 现有 dateNavigator.test.ts 的实际按钮数（‹ / 日期 / › / 今天胶囊 = 4） */
const BUTTON_COUNT = 4;

describe('DateNavigator — 不传 subtitleText（保持原行为）', () => {
  it('按钮数不变（4），且不渲染任何副标题节点', () => {
    const container = mount(
      createElement(DateNavigator, {
        date: NOT_TODAY,
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday: vi.fn(),
      }),
    );
    expect(container.querySelectorAll('button')).toHaveLength(BUTTON_COUNT);
    // 无副标题 → 不应出现 text-caption 的第二行
    expect(container.querySelectorAll('.text-caption')).toHaveLength(0);
    expect(container.textContent).not.toContain('九月初三');
  });

  it('传空串 subtitleText 等价于不传（不产生多余 DOM）', () => {
    const container = mount(
      createElement(DateNavigator, {
        date: NOT_TODAY,
        subtitleText: '',
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday: vi.fn(),
      }),
    );
    expect(container.querySelectorAll('button')).toHaveLength(BUTTON_COUNT);
    expect(container.querySelectorAll('.text-caption')).toHaveLength(0);
  });

  it('回调依旧：不传 onDateClick 时点中间日期调用 onToday', () => {
    const onToday = vi.fn();
    const container = mount(
      createElement(DateNavigator, { date: NOT_TODAY, onPrev: vi.fn(), onNext: vi.fn(), onToday }),
    );
    const center = buttonByLabel(container, '回到今天');
    expect(center).toBeDefined();
    click(center!);
    expect(onToday).toHaveBeenCalledTimes(1);
  });
});

describe('DateNavigator — 传 subtitleText', () => {
  function renderWithSubtitle(overrides: Record<string, unknown> = {}) {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onToday = vi.fn();
    const onDateClick = vi.fn();
    const container = mount(
      createElement(DateNavigator, {
        date: NOT_TODAY,
        subtitleText: SUBTITLE,
        onPrev,
        onNext,
        onToday,
        onDateClick,
        ...overrides,
      }),
    );
    return { container, onPrev, onNext, onToday, onDateClick };
  }

  it('按钮数仍为 4（未因副标题改变按钮数量）', () => {
    const { container } = renderWithSubtitle();
    expect(container.querySelectorAll('button')).toHaveLength(BUTTON_COUNT);
  });

  it('副标题渲染出来，且位于与主日期同一个动画块内', () => {
    const { container } = renderWithSubtitle();
    expect(container.textContent).toContain(SUBTITLE);

    const subtitleEl = Array.from(container.querySelectorAll('span')).find(
      (span) => span.textContent === SUBTITLE,
    );
    expect(subtitleEl, '应能找到副标题节点').toBeDefined();
    // 同一个 key={date} 动画块：父节点带 m- 动画类
    const animatedBlock = subtitleEl!.parentElement;
    expect(animatedBlock).not.toBeNull();
    expect(animatedBlock!.className).toMatch(/\bm-(fade|slide-right|slide-left)\b/);
    // 主日期文字也在同一个动画块内
    expect(animatedBlock!.textContent).toContain('1月1日');
  });

  it('副标题用语义字号 / 颜色类（不写死 px / hex）', () => {
    const { container } = renderWithSubtitle();
    const subtitleEl = Array.from(container.querySelectorAll('span')).find(
      (span) => span.textContent === SUBTITLE,
    )!;
    expect(subtitleEl.className).toContain('text-caption');
    expect(subtitleEl.className).toContain('text-ink-faint');
    expect(subtitleEl.className).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(subtitleEl.className).not.toMatch(/text-\[\d+px\]/);
  });

  it('‹ / › / 今天 / 中间日期 四个回调都照常触发', () => {
    const { container, onPrev, onNext, onToday, onDateClick } = renderWithSubtitle();

    click(buttonByLabel(container, '前一天')!);
    click(buttonByLabel(container, '后一天')!);
    const pill = container.querySelectorAll('button')[BUTTON_COUNT - 1] as HTMLButtonElement;
    click(pill);
    click(buttonByLabel(container, '点击选择日期')!);

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onToday).toHaveBeenCalledTimes(1); // 仅来自「今天」胶囊
    expect(onDateClick).toHaveBeenCalledTimes(1);
  });
});

describe('DaySummaryCard — 农历 / 节日行 & 越界不崩', () => {
  function summary(dateKey: string): DaySummary {
    return {
      date: dateKey,
      hasData: false,
      sections: {
        work: { done: 0, total: 0 },
        study: { done: 0, total: 0 },
        fitness: { done: 0, total: 0 },
        life: { done: 0, total: 0 },
      },
      taskDone: 0,
      taskTotal: 0,
      mood: 0,
      body: 0,
      overall: 0,
    } as DaySummary;
  }

  it('2025-10-06（中秋）→ 显示「八月十五 · 中秋节」', () => {
    const container = mount(
      createElement(DaySummaryCard, {
        dateKey: '2025-10-06',
        summary: summary('2025-10-06'),
        onGo: vi.fn(),
      }),
    );
    const line = container.querySelector('[data-testid="day-summary-festival"]');
    expect(line).not.toBeNull();
    expect(line!.textContent).toBe('八月十五 · 中秋节');
    // 语义字号 / 颜色类，无写死 px / hex
    expect(line!.className).toContain('text-caption');
    expect(line!.className).toContain('text-ink-faint');
    expect(line!.className).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it('越界日期 1899-12-31 → 不崩溃，且不渲染农历 / 节日行', () => {
    const container = mount(
      createElement(DaySummaryCard, {
        dateKey: '1899-12-31',
        summary: summary('1899-12-31'),
        onGo: vi.fn(),
      }),
    );
    // 卡片仍在（标题行渲染），但没有副标题行
    expect(container.textContent).toContain('12月31日');
    expect(container.querySelector('[data-testid="day-summary-festival"]')).toBeNull();
    expect(container.textContent).not.toContain('Invalid');
  });
});
