// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 「我的」页折叠卡：**默认收起**（用户要求「所有卡片默认是收起的」）。
 *
 * 为什么值得单测：这是纯展示层约定，改回去（defaultOpen 翻回 true）不会有任何
 * 类型错误、也不会红任何其它测试 —— 只有这条会把「六张卡全摊开」拦下来。
 *
 * 展开态跨页保持（2026-10-16 用户要求）：展开着切去别的 Tab 再回来还得是展开的。
 * 状态在 UI store 里，所以每条用例前必须复位 —— 否则上一条点过的展开会漏到下一条。
 */
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { useUiStore } from '@/store/useUiStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderCard(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // children 走 props（createElement 的三段式重载在这里推断不出 CollapsibleCardProps）
  const body = createElement('div', { 'data-testid': 'card-body' }, '三个主题');
  act(() => {
    root.render(
      createElement(CollapsibleCard, {
        title: '外观主题',
        hint: '纸谱',
        expandKey: 'test:card',
        children: body,
      }),
    );
  });
  mounted.push({ root, container });
  return container;
}

/** 卸载全部已挂载的根（模拟切走页面） */
function unmountAll() {
  act(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
}

beforeEach(() => {
  // 展开态在 store 里跨用例存活，必须复位，否则「默认收起」的断言会读到上一条的展开
  useUiStore.setState({ expansions: {} });
});

afterEach(() => {
  unmountAll();
});

describe('CollapsibleCard — 默认收起', () => {
  it('首次渲染内容不在 DOM 里，标题与 hint 仍在', () => {
    const container = renderCard();

    expect(container.querySelector('[data-testid="card-body"]')).toBeNull();
    expect(container.textContent).toContain('外观主题');
    // hint 折叠时也要看得见（当前用的是哪套主题，不用展开就知道）
    expect(container.textContent).toContain('纸谱');
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('点标题 → 展开；再点 → 收起', () => {
    const container = renderCard();
    const header = container.querySelector<HTMLButtonElement>('button')!;

    act(() => {
      header.click();
    });
    expect(container.querySelector('[data-testid="card-body"]')).toBeTruthy();
    expect(header.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      header.click();
    });
    expect(container.querySelector('[data-testid="card-body"]')).toBeNull();
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('展开后切走再回来（卸载重挂载）→ 仍是展开的', () => {
    const first = renderCard();
    act(() => {
      first.querySelector<HTMLButtonElement>('button')!.click();
    });
    expect(first.querySelector('[data-testid="card-body"]')).toBeTruthy();

    // 切走：Tab 切换会卸载页面组件
    unmountAll();

    const second = renderCard();
    expect(second.querySelector('[data-testid="card-body"]')).toBeTruthy();
    expect(second.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
  });
});
