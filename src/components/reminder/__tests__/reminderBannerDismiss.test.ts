// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 提醒横幅的「✕ 临时收起」要**跨页保持**（2026-10-16 用户要求）：
 * 在今日页收起后切去时间轴再回来，不能又弹一遍 —— 否则「临时收起」在 Tab 之间毫无意义。
 *
 * 同时锁内容派生的 dismiss 键：又有新时段到期（集合变化）时自动重新弹出，
 * 这条旧行为不能因搬家到 store 而丢。
 */
const FIXED_NOW = 14 * 60; // 固定当前时间 14:00，让「已到期」判定不随跑测试的钟点变
vi.mock('@/hooks/useNowMin', () => ({ useNowMin: () => FIXED_NOW }));

import { ReminderBanner } from '@/components/reminder/ReminderBanner';
import { useDayStore } from '@/store/useDayStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useUiStore } from '@/store/useUiStore';
import { makeSlot } from '@/services/__tests__/fixtures';
import { todayKey } from '@/utils/date';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderBanner(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(ReminderBanner));
  });
  mounted.push({ root, container });
  return container;
}

function dismissButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('[aria-label="收起提醒"]');
}

/** 卸载全部已挂载的根（模拟切去别的 Tab） */
function unmountAll() {
  act(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
}

beforeEach(() => {
  useUiStore.setState({ dismissedReminder: null });
  useDayStore.setState({ date: todayKey() });
  useTimeSlotStore.setState({
    slots: [makeSlot({ id: 's1', startMin: 9 * 60, endMin: 10 * 60, content: '交周报' })],
    loading: false,
  });
});

afterEach(() => {
  unmountAll();
});

describe('提醒横幅 — 收起状态跨页保持', () => {
  it('有到期时段时在页面顶部提示', () => {
    const container = renderBanner();
    expect(container.textContent).toContain('交周报');
    expect(dismissButton(container)).toBeTruthy();
  });

  it('点 ✕ 收起 → 卸载重挂载（切 Tab 再回来）不重新弹出', () => {
    const first = renderBanner();
    act(() => {
      dismissButton(first)!.click();
    });
    expect(dismissButton(first)).toBeNull();

    unmountAll();
    expect(dismissButton(renderBanner())).toBeNull();
  });

  it('又有新时段到期 → 自动重新弹出（dismiss 键跟着到期集合变）', () => {
    const first = renderBanner();
    act(() => {
      dismissButton(first)!.click();
    });
    unmountAll();

    act(() => {
      useTimeSlotStore.setState({
        slots: [
          makeSlot({ id: 's1', startMin: 9 * 60, endMin: 10 * 60, content: '交周报' }),
          makeSlot({ id: 's2', startMin: 13 * 60, endMin: 14 * 60, content: '取快递' }),
        ],
        loading: false,
      });
    });

    const second = renderBanner();
    expect(dismissButton(second)).toBeTruthy();
    expect(second.textContent).toContain('取快递');
  });
});
