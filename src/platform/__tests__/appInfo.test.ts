import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeIsNative = vi.hoisted(() => vi.fn());
const fakeGetInfo = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: fakeIsNative },
}));

vi.mock('@capacitor/app', () => ({
  App: { getInfo: fakeGetInfo },
}));

import { getCurrentVersion, WEB_FALLBACK_VERSION } from '@/platform/appInfo';

describe('getCurrentVersion — 版本号读取', () => {
  beforeEach(() => {
    fakeIsNative.mockReset();
    fakeGetInfo.mockReset();
  });

  it('Web：返回兜底常量，不碰原生 App.getInfo', async () => {
    fakeIsNative.mockReturnValue(false);

    await expect(getCurrentVersion()).resolves.toBe(WEB_FALLBACK_VERSION);
    expect(fakeGetInfo).not.toHaveBeenCalled();
  });

  it('原生：返回 App.getInfo().version（versionName）', async () => {
    fakeIsNative.mockReturnValue(true);
    fakeGetInfo.mockResolvedValue({ version: '1.2' });

    await expect(getCurrentVersion()).resolves.toBe('1.2');
    expect(fakeGetInfo).toHaveBeenCalledTimes(1);
  });

  it('原生：version 为空时兜底', async () => {
    fakeIsNative.mockReturnValue(true);
    fakeGetInfo.mockResolvedValue({ version: '' });

    await expect(getCurrentVersion()).resolves.toBe(WEB_FALLBACK_VERSION);
  });

  it('原生：getInfo 抛错时兜底', async () => {
    fakeIsNative.mockReturnValue(true);
    fakeGetInfo.mockRejectedValue(new Error('bridge not available'));

    await expect(getCurrentVersion()).resolves.toBe(WEB_FALLBACK_VERSION);
  });
});
