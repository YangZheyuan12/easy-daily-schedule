// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 跨页展开态 hook：`useExpanded`。
 *
 * 用户要求（2026-10-16）：「展开着期限任务切去别的页面再切换回来时，
 * 它依然要是展开的状态，其他类似的展开收起条目同理」。
 *
 * 这条用例锁的是机制本身：状态活在 UI store 里、组件只是它的视图 ——
 * 卸载再挂载（= 切 Tab 再回来）不丢，同一 key 的两个实例共享同一份状态。
 * 组件侧的接线另由 taskPreviewCards / collapsibleCard 的用例锁。
 */
import { useExpanded } from '@/hooks/useExpanded';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderProbe(key: string, defaultOpen = false): HTMLButtonElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  function Probe() {
    const { open, toggle } = useExpanded(key, defaultOpen);
    return createElement('button', { 'data-open': String(open), onClick: toggle }, 'probe');
  }
  act(() => {
    root.render(createElement(Probe));
  });
  mounted.push({ root, container });
  return container.querySelector('button')!;
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.click();
  });
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

afterEach(() => {
  unmountAll();
});

describe('useExpanded — 跨页保持的展开态', () => {
  it('默认值：没表达过意愿时取 defaultOpen（两种取值都锁）', () => {
    expect(renderProbe('k-default-closed').dataset.open).toBe('false');
    expect(renderProbe('k-default-open', true).dataset.open).toBe('true');
  });

  it('点一下展开、再点收起', () => {
    const button = renderProbe('k-toggle');
    click(button);
    expect(button.dataset.open).toBe('true');
    click(button);
    expect(button.dataset.open).toBe('false');
  });

  it('同一 key 的两个实例共享状态（两个页面读同一处 UI）', () => {
    const first = renderProbe('k-shared');
    const second = renderProbe('k-shared');
    expect(second.dataset.open).toBe('false');

    click(first);
    expect(first.dataset.open).toBe('true');
    // 另一个实例不重新挂载也跟着变 —— 状态在 store，不在组件里
    expect(second.dataset.open).toBe('true');
  });

  it('卸载再挂载（切 Tab 再回来）→ 保持展开', () => {
    const first = renderProbe('k-remount');
    click(first);
    expect(first.dataset.open).toBe('true');

    unmountAll();
    const again = renderProbe('k-remount');
    expect(again.dataset.open).toBe('true');

    // 收起也一样保持：用户明确收过，回来不该又摊开
    click(again);
    expect(again.dataset.open).toBe('false');
    unmountAll();
    expect(renderProbe('k-remount').dataset.open).toBe('false');
  });

  it('不同 key 互不干扰', () => {
    const a = renderProbe('k-a');
    click(a);
    expect(renderProbe('k-b').dataset.open).toBe('false');
  });
});
