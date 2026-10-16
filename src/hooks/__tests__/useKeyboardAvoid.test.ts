// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 键盘避让的**阈值防抖**（2026-10-16 第九轮，配合「添加弹窗闪一下」修复）。
 *
 * 背景：`useKeyboardAvoid` 把 `innerHeight - vv.height - vv.offsetTop` 写成 CSS
 * 变量 `--keyboard-offset`，抽屉（Sheet）用它做 paddingBottom / maxHeight 避让。
 * 键盘弹起是个几百毫秒的动画，两个高度值的变化**不同步**，过渡帧里会算出
 * 瞬时几十 px 的小偏移 —— 原样写进变量就会让抽屉位置跳一下（用户看到的「闪一下」）。
 *
 * 本文件锁的契约：小于 120px 的 offset 一律当作 0（过滤抖动），
 * 真键盘（远超阈值）照常避让；卸载时清掉变量。
 */
import { useKeyboardAvoid } from '@/hooks/useKeyboardAvoid';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OFFSET_THRESHOLD = 120;

let listeners: Array<() => void> = [];
let innerHeightValue = 800;
let vvHeight = 800;

/** jsdom 没有 visualViewport，innerHeight 也只读 —— 造一个可控的假视口 */
function installFakeViewport() {
  listeners = [];
  innerHeightValue = 800;
  vvHeight = 800;
  const vv = {
    height: vvHeight,
    offsetTop: 0,
    addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_type: string, fn: () => void) => {
      listeners = listeners.filter((item) => item !== fn);
    },
  };
  Object.defineProperty(window, 'visualViewport', {
    value: vv,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    get: () => innerHeightValue,
  });
}

/** 模拟一次视口变化：innerHeight 与 vv.height 分别给值（可以不同步，正是抖动的来源） */
function fireResize(nextInner: number, nextVv: number) {
  innerHeightValue = nextInner;
  (window.visualViewport as unknown as { height: number }).height = nextVv;
  act(() => {
    for (const listener of listeners) listener();
  });
}

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function mountProbe(): void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  function Probe() {
    useKeyboardAvoid();
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  mounted.push({ root, container });
}

function cssOffset(): string {
  return document.documentElement.style.getPropertyValue('--keyboard-offset');
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  document.documentElement.style.removeProperty('--keyboard-offset');
});

describe('useKeyboardAvoid — offset 阈值防抖', () => {
  it('无键盘（差值为 0）→ 变量为 0px', () => {
    installFakeViewport();
    mountProbe();
    expect(cssOffset()).toBe('0px');
  });

  it(`过渡帧小偏移（${OFFSET_THRESHOLD - 1}px < 阈值）→ 仍写 0px，不抖动`, () => {
    installFakeViewport();
    mountProbe();

    // 键盘刚冒头：vv.height 先掉了 80px，innerHeight 还没跟上
    fireResize(800, 720);
    expect(cssOffset()).toBe('0px');
  });

  it(`真键盘（差值 ${OFFSET_THRESHOLD + 180}px > 阈值）→ 照常写偏移，避让不失效`, () => {
    installFakeViewport();
    mountProbe();

    fireResize(800, 400);
    expect(cssOffset()).toBe('400px');
  });

  it('键盘收起 → 偏移归 0，不残留', () => {
    installFakeViewport();
    mountProbe();

    fireResize(800, 400);
    expect(cssOffset()).toBe('400px');
    fireResize(800, 795); // 收起过程中的小残差
    fireResize(800, 800);
    expect(cssOffset()).toBe('0px');
  });

  it('卸载 → 变量被清除（不污染下一个页面）', () => {
    installFakeViewport();
    mountProbe();
    fireResize(800, 400);
    expect(cssOffset()).toBe('400px');

    for (const { root, container } of mounted.splice(0)) {
      act(() => root.unmount());
      container.remove();
    }
    expect(cssOffset()).toBe('');
  });
});
