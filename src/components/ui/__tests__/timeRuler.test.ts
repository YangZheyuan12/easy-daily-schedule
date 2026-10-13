// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TimeRuler } from '@/components/ui/TimeRuler';

/**
 * 时间刻度尺。锁住四条**用一次就忘不掉的规则**：
 * ① 刻度数量（24 时 + 12 分，步长 5）—— 步长被改成 1 会多出 60 个刻度，性能与手感都变；
 * ② 点小时只改时、点分钟只改分（互相不能吃掉对方）；
 * ③ 值未设置时只是「预览」，**不能在没交互的情况下回调 onChange**（否则打开抽屉就改了数据）；
 * ④ 存量非整 5 分钟的值得显示原值、只把最近刻度高亮（不许悄悄取整）。
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

const hourRow = (container: HTMLElement) =>
  container.querySelector('div[role="group"][aria-label*="小时"]')!;
const minuteRow = (container: HTMLElement) =>
  container.querySelector('div[role="group"][aria-label*="分钟"]')!;
/** 读数那一行是刻度行之前的一个兄弟节点 */
const readoutOf = (container: HTMLElement) =>
  hourRow(container).previousElementSibling?.textContent ?? '';

const mark = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

function render(value: number, extra: { pending?: boolean } = {}) {
  const onChange = vi.fn();
  const container = mount(
    createElement(TimeRuler, {
      value,
      onChange,
      fieldKey: 'start',
      fieldLabel: '开始时间',
      ...extra,
    }),
  );
  return { container, onChange };
}

describe('TimeRuler — 时间刻度尺', () => {
  it('① 小时 24 格、分钟 12 格（步长 5 分钟）', () => {
    const { container } = render(9 * 60);
    expect(hourRow(container).querySelectorAll('button')).toHaveLength(24);
    expect(minuteRow(container).querySelectorAll('button')).toHaveLength(12);
    expect(mark(container, '0 点')).toBeTruthy();
    expect(mark(container, '23 点')).toBeTruthy();
    expect(mark(container, '55 分')).toBeTruthy();
  });

  it('② 选中项被 aria-pressed 标出，且同一维度只有一格选中', () => {
    const { container } = render(9 * 60 + 30);
    expect(mark(container, '9 点').getAttribute('aria-pressed')).toBe('true');
    expect(mark(container, '8 点').getAttribute('aria-pressed')).toBe('false');
    expect(mark(container, '30 分').getAttribute('aria-pressed')).toBe('true');
    expect(hourRow(container).querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(minuteRow(container).querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });

  it('③ 点小时只改时、点分钟只改分', () => {
    const { container, onChange } = render(9 * 60 + 30);
    act(() => {
      mark(container, '13 点').click();
    });
    expect(onChange).toHaveBeenLastCalledWith(13 * 60 + 30);

    act(() => {
      mark(container, '45 分').click();
    });
    expect(onChange).toHaveBeenLastCalledWith(9 * 60 + 45);
  });

  it('④ 值未设置（pending）：读数带「设为」，且不交互就不回调 onChange', () => {
    const { container, onChange } = render(10 * 60 + 30, { pending: true });
    expect(readoutOf(container)).toContain('未设置');
    expect(readoutOf(container)).toContain('设为');
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      mark(container, '11 点').click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('⑤ 存量非整 5 分钟的值：读数显示真值，只把最近刻度高亮', () => {
    const { container } = render(9 * 60 + 7);
    expect(readoutOf(container)).toContain('09:07');
    // 7 分 → 最近的 5 分刻度
    expect(mark(container, '5 分').getAttribute('aria-pressed')).toBe('true');
    expect(mark(container, '10 分').getAttribute('aria-pressed')).toBe('false');
  });

  it('⑥ 58 分不会被卷进下一小时（高亮停在 55 分）', () => {
    const { container } = render(9 * 60 + 58);
    expect(mark(container, '55 分').getAttribute('aria-pressed')).toBe('true');
    expect(mark(container, '9 点').getAttribute('aria-pressed')).toBe('true');
  });

  it('⑦ 越界值被夹到合法范围（负值 → 00:00，超一天 → 23:59），且读数与高亮同源', () => {
    const low = render(-30);
    expect(readoutOf(low.container)).toContain('00:00');
    expect(mark(low.container, '0 点').getAttribute('aria-pressed')).toBe('true');
    expect(mark(low.container, '0 分').getAttribute('aria-pressed')).toBe('true');

    const high = render(99 * 60);
    expect(readoutOf(high.container)).toContain('23:59');
    expect(mark(high.container, '23 点').getAttribute('aria-pressed')).toBe('true');
    // 59 分 → 最近的 55 分刻度（不能卷到下一小时的 00 分）
    expect(mark(high.container, '55 分').getAttribute('aria-pressed')).toBe('true');
    expect(mark(high.container, '0 分').getAttribute('aria-pressed')).toBe('false');
  });
});
