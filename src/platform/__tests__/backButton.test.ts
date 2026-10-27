import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeIsNative = vi.hoisted(() => vi.fn());
const fakeAddListener = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: fakeIsNative },
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: fakeAddListener },
}));

import { isNativePlatform, onBackButton } from '@/platform/backButton';

describe('backButton — 系统返回拦截', () => {
  beforeEach(() => {
    fakeIsNative.mockReset();
    fakeAddListener.mockReset();
  });

  it('Web：isNativePlatform 透传，onBackButton 返回 no-op 且不注册监听', () => {
    fakeIsNative.mockReturnValue(false);

    expect(isNativePlatform()).toBe(false);
    const unsub = onBackButton(() => undefined);
    expect(fakeAddListener).not.toHaveBeenCalled();
    // no-op 不抛错
    expect(() => unsub()).not.toThrow();
  });

  it('原生：注册 backButton，事件触发时回调被调用，unsub 移除监听', async () => {
    fakeIsNative.mockReturnValue(true);
    const remove = vi.fn();
    fakeAddListener.mockResolvedValue({ remove });

    let captured: ((e: { canGoBack: boolean }) => void) | undefined;
    fakeAddListener.mockImplementation((_name: string, cb: (e: { canGoBack: boolean }) => void) => {
      captured = cb;
      return Promise.resolve({ remove });
    });

    const handler = vi.fn();
    const unsub = onBackButton(handler);

    // 监听是异步注册的，等一拍
    await Promise.resolve();
    expect(fakeAddListener).toHaveBeenCalledWith('backButton', expect.any(Function));

    captured?.({ canGoBack: true });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
