// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRecentlyChanged } from '@/hooks/useRecentlyChanged';

/**
 * `useRecentlyChanged` 是整套微动效的开关，它坏掉的方式都很隐蔽：
 *
 * - 挂载时返回 true → 打开页面所有「已完成」的条目会集体弹一下（页面在抖）
 * - 值不变也返回 true → 每次输入、每次切主题都重播动画
 *
 * 这两种都不会报错、也不会让别的用例变红，所以必须有正反两面用例把它钉住。
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
  vi.useRealTimers();
});

/** 把 hook 的返回值渲染成 DOM（true → 带 data-hit） */
function Probe({ value, holdMs }: { value: unknown; holdMs?: number }) {
  const hit = useRecentlyChanged(value, holdMs);
  return createElement('span', { 'data-hit': hit ? 'yes' : 'no' });
}

function mount(value: unknown, holdMs?: number, rerenderTarget?: { set: (v: unknown) => void }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Host() {
    const [current, setCurrent] = useState(value);
    useEffect(() => {
      if (rerenderTarget) rerenderTarget.set = setCurrent;
    }, []);
    return createElement(Probe, { value: current, holdMs });
  }

  act(() => {
    root.render(createElement(Host));
  });
  mounted.push({ root, container });
  return container;
}

const hitOf = (container: HTMLElement) =>
  container.querySelector('span')?.getAttribute('data-hit');

describe('useRecentlyChanged', () => {
  it('首次渲染不触发（否则开页面时所有已完成条目会一起弹）', () => {
    const container = mount(true);
    expect(hitOf(container)).toBe('no');
  });

  it('值真的变了才触发', () => {
    vi.useFakeTimers();
    const target = { set: (_v: unknown) => {} };
    const container = mount(false, undefined, target);

    act(() => target.set(true));
    expect(hitOf(container)).toBe('yes');
  });

  it('持有一段时间后自动复位（不会永久挂着动画类）', () => {
    vi.useFakeTimers();
    const target = { set: (_v: unknown) => {} };
    const container = mount(false, 300, target);

    act(() => target.set(true));
    expect(hitOf(container)).toBe('yes');

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(hitOf(container)).toBe('no');
  });

  it('值没变的重渲染不触发（每次输入都不该重播动画）', () => {
    vi.useFakeTimers();
    const target = { set: (_v: unknown) => {} };
    const container = mount(false, 300, target);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    // 反复写入同一个值：hook 内部用 Object.is 比较，必须全部忽略
    act(() => target.set(false));
    act(() => target.set(false));
    expect(hitOf(container)).toBe('no');
  });
});
