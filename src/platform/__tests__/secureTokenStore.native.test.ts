// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthToken } from '@/domain/types';

// jsdom 不实现 crypto.subtle；测试里补上 Node 的 WebCrypto
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/** 原生路径：Capacitor 可用、Preferences 用内存 Map 模拟 */
const { prefsStore } = vi.hoisted(() => ({ prefsStore: new Map<string, string>() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async (opts: { key: string }) => ({ value: prefsStore.get(opts.key) ?? null }),
    set: async (opts: { key: string; value: string }) => {
      prefsStore.set(opts.key, opts.value);
    },
    remove: async (opts: { key: string }) => {
      prefsStore.delete(opts.key);
    },
  },
}));

const { SecureTokenStore } = await import('@/platform/auth/secureTokenStore');

const TOKEN: AuthToken = {
  accessToken: 'secret-access-token',
  refreshToken: 'secret-refresh-token',
  expiresAt: 1_900_000_000_000,
};

describe('SecureTokenStore（原生 / Preferences 后端）', () => {
  beforeEach(() => {
    prefsStore.clear();
  });

  it('save → load 原样取回（经 Preferences，不走 localStorage）', async () => {
    const store = new SecureTokenStore();

    await store.save(TOKEN);

    expect(prefsStore.has('auth.token.v2')).toBe(true);
    expect(localStorage.getItem('auth.token.v2')).toBeNull();
    expect(await store.load()).toEqual(TOKEN);
  });

  it('Preferences 里是加密信封，不含明文 token', async () => {
    const store = new SecureTokenStore();

    await store.save(TOKEN);

    const raw = prefsStore.get('auth.token.v2') as string;
    expect(raw).not.toContain('secret-access-token');
    expect(JSON.parse(raw).alg).toBe('AES-GCM');
  });

  it('clear：Preferences 两项一并清除', async () => {
    const store = new SecureTokenStore();
    await store.save(TOKEN);

    await store.clear();

    expect(prefsStore.has('auth.token.v2')).toBe(false);
    expect(prefsStore.has('auth.token.key.v2')).toBe(false);
    expect(await store.load()).toBeNull();
  });
});
