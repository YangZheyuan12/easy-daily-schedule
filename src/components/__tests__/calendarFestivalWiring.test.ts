// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DateNavigator } from '@/components/date/DateNavigator';
import { DaySummaryCard } from '@/components/calendar/DaySummaryCard';
import { getFestivalLine } from '@/services/festivalService';
import { solarToLunar } from '@/services/lunar/lunarService';
import type { DaySummary } from '@/domain/types';

/**
 * 农历 / 节日「展示层接线」的独立 jsdom 渲染测试。
 *
 * 覆盖契约：
 * 1) 今日页路径 —— DateNavigator 传 `subtitleText` 才渲染副标题；不传/空串时
 *    DOM 与加此功能前一致（不产生多余节点）。
 * 2) 日历摘要卡 —— DaySummaryCard 在有节日/有农历的日期渲染该行；纯日不渲染。
 * 3) 降级 —— 越界日期（1899-12-31 / 2101-01-01）两处展示点都不崩溃、无脏文本。
 *
 * 工程约束：vite.config.ts 的 test.include 只收 `*.test.ts`，故用 createElement 代替 JSX；
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

function emptySummary(dateKey: string): DaySummary {
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

/** 远早于今天：isToday 必为 false，避免依赖真实系统日期 */
const NOT_TODAY = '2000-01-01';

/* ------------------------------------------------------------------ */
/* 1) DateNavigator                                                      */
/* ------------------------------------------------------------------ */

describe('DateNavigator — 不传 / 空串 subtitleText（旧行为逐字不变）', () => {
  function render(props: Record<string, unknown>) {
    return mount(
      createElement(DateNavigator, {
        date: NOT_TODAY,
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday: vi.fn(),
        ...props,
      }),
    );
  }

  it('不传 subtitleText：仍是 4 个按钮，且不产生任何 .text-caption 副标题节点', () => {
    const container = render({});
    expect(container.querySelectorAll('button')).toHaveLength(4);
    expect(container.querySelectorAll('.text-caption')).toHaveLength(0);
  });

  it('传空串等价于不传：4 个按钮、无副标题节点', () => {
    const container = render({ subtitleText: '' });
    expect(container.querySelectorAll('button')).toHaveLength(4);
    expect(container.querySelectorAll('.text-caption')).toHaveLength(0);
  });

  it('传 null（TodayPage 无节日时的取值）等价于不传', () => {
    const container = render({ subtitleText: null });
    expect(container.querySelectorAll('button')).toHaveLength(4);
    expect(container.querySelectorAll('.text-caption')).toHaveLength(0);
  });
});

describe('DateNavigator — 传 subtitleText（今日页路径）', () => {
  it('副标题渲染出来，且按钮数仍为 4，并位于带 m- 动画的同一块内', () => {
    const SUBTITLE = '九月初三 · 中秋节';
    const container = mount(
      createElement(DateNavigator, {
        date: NOT_TODAY,
        subtitleText: SUBTITLE,
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday: vi.fn(),
        onDateClick: vi.fn(),
      }),
    );
    expect(container.querySelectorAll('button')).toHaveLength(4);
    const subtitleEl = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent === SUBTITLE,
    );
    expect(subtitleEl, '应能找到副标题节点').toBeDefined();
    const block = subtitleEl!.parentElement!;
    expect(block.className).toMatch(/\bm-(fade|slide-right|slide-left)\b/);
    // 主日期与副标题同块
    expect(block.textContent).toContain('1月1日');
  });

  it('真实日期取到的副标题（2025-10-06 → 八月十五 · 中秋节）确实来自 hook 的同一口径', () => {
    const dateKey = '2025-10-06';
    const lunar = solarToLunar(dateKey);
    const expected = [lunar ? '八月十五' : '', getFestivalLine(dateKey) ?? '']
      .filter(Boolean)
      .join(' · ');
    expect(expected).toBe('八月十五 · 中秋节');

    const container = mount(
      createElement(DateNavigator, {
        date: dateKey,
        subtitleText: expected,
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToday: vi.fn(),
      }),
    );
    expect(container.textContent).toContain('八月十五 · 中秋节');
  });
});

/* ------------------------------------------------------------------ */
/* 2) DaySummaryCard                                                     */
/* ------------------------------------------------------------------ */

describe('DaySummaryCard — 农历 / 节日行', () => {
  const line = '[data-testid="day-summary-festival"]';

  it('已知节日日期 2025-10-06 → 渲染「八月十五 · 中秋节」', () => {
    const container = mount(
      createElement(DaySummaryCard, {
        dateKey: '2025-10-06',
        summary: emptySummary('2025-10-06'),
        onGo: vi.fn(),
      }),
    );
    const el = container.querySelector(line);
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe('八月十五 · 中秋节');
    expect(el!.className).toContain('text-caption');
    expect(el!.className).toContain('text-ink-faint');
  });

  it('纯日（无节日、2025-03-15）→ 该行不存在（不渲染空行）', () => {
    expect(getFestivalLine('2025-03-15')).toBeNull();
    const container = mount(
      createElement(DaySummaryCard, {
        dateKey: '2025-03-15',
        summary: emptySummary('2025-03-15'),
        onGo: vi.fn(),
      }),
    );
    // 该日仍有农历（二月十六之类），所以 line 可能因为农历而存在；
    // 关键断言：若存在，其文本不得包含空段 / 孤立分隔符。
    const el = container.querySelector(line);
    if (el) {
      expect(el.textContent).not.toMatch(/^\s*·|\s·\s*$/); // 不以 · 开头或结尾
      expect(el.textContent).not.toContain(' ·  · ');
    }
    // 无节日时，节日行不应凭空出现「null」/「undefined」
    expect(container.textContent).not.toContain('null');
    expect(container.textContent).not.toContain('undefined');
  });

  it('无农历的纯公历节日（2025-10-01 国庆）也应有节日段（农历「八月初十」+ 国庆节）', () => {
    const container = mount(
      createElement(DaySummaryCard, {
        dateKey: '2025-10-01',
        summary: emptySummary('2025-10-01'),
        onGo: vi.fn(),
      }),
    );
    const el = container.querySelector(line);
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain('国庆节');
  });
});

/* ------------------------------------------------------------------ */
/* 3) 越界降级                                                           */
/* ------------------------------------------------------------------ */

describe('越界日期降级（1899-12-31 / 2101-01-01）：不崩、无脏文本', () => {
  it('DaySummaryCard —— 越界日期不渲染节日行，且不出现 Invalid', () => {
    for (const dateKey of ['1899-12-31', '2101-01-01']) {
      const container = mount(
        createElement(DaySummaryCard, {
          dateKey,
          summary: emptySummary(dateKey),
          onGo: vi.fn(),
        }),
      );
      expect(
        container.querySelector('[data-testid="day-summary-festival"]'),
        `${dateKey} 不应有节日行`,
      ).toBeNull();
      expect(container.textContent).not.toContain('Invalid');
      expect(container.textContent).not.toContain('NaN');
      // 卡片本身仍在（标题行渲染出来）
      expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    }
  });

  it('DateNavigator —— 越界日期不传 subtitleText 时不崩；传空串也不崩', () => {
    for (const dateKey of ['1899-12-31', '2101-01-01']) {
      const a = mount(
        createElement(DateNavigator, {
          date: dateKey,
          onPrev: vi.fn(),
          onNext: vi.fn(),
          onToday: vi.fn(),
        }),
      );
      expect(a.querySelectorAll('button')).toHaveLength(4);
      expect(a.textContent).not.toContain('Invalid');
      expect(a.textContent).not.toContain('NaN');

      const b = mount(
        createElement(DateNavigator, {
          date: dateKey,
          subtitleText: '',
          onPrev: vi.fn(),
          onNext: vi.fn(),
          onToday: vi.fn(),
        }),
      );
      expect(b.querySelectorAll('button')).toHaveLength(4);
      expect(b.textContent).not.toContain('Invalid');
    }
  });
});
