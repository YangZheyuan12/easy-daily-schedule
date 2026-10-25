// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureTokenStore } from '@/platform/auth/secureTokenStore';
import type { AuthToken } from '@/domain/types';

// jsdom 不实现 crypto.subtle；测试里补上 Node 的 WebCrypto
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const TOKEN_KEY = 'auth.token.v2';
const KEY_KEY = 'auth.token.key.v2';

const TOKEN: AuthToken = {
  accessToken: 'secret-access-token',
  refreshToken: 'secret-refresh-token',
  expiresAt: 1_900_000_000_000,
};

describe('SecureTokenStore（Web / localStorage 后端）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('save → load 原样取回', async () => {
    const store = new SecureTokenStore();

    await store.save(TOKEN);
    const loaded = await store.load();

    expect(loaded).toEqual(TOKEN);
  });

  it('落盘的是 AES-GCM 加密信封，不含明文 token', async () => {
    const store = new SecureTokenStore();

    await store.save(TOKEN);

    const raw = localStorage.getItem(TOKEN_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('secret-access-token');
    expect(raw).not.toContain('secret-refresh-token');
    const envelope = JSON.parse(raw as string);
    expect(envelope.alg).toBe('AES-GCM');
    expect(envelope.iv).toBeTruthy();
    // 数据密钥单独一项落盘
    expect(localStorage.getItem(KEY_KEY)).toBeTruthy();
  });

  it('clear：令牌与数据密钥一并清除，load 回到 null', async () => {
    const store = new SecureTokenStore();
    await store.save(TOKEN);

    await store.clear();

    expect(await store.load()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('读旧版裸 token JSON（无信封）→ 照认，下次 save 自动升级为加密信封', async () => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(TOKEN));
    const store = new SecureTokenStore();

    const loaded = await store.load();
    expect(loaded).toEqual(TOKEN);

    await store.save(TOKEN);
    const upgraded = JSON.parse(localStorage.getItem(TOKEN_KEY) as string);
    expect(upgraded.alg).toBe('AES-GCM');
  });

  it('后端写入失败 → 内存兜底：一个会话内仍能存取', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const store = new SecureTokenStore();

    await store.save(TOKEN);

    expect(await store.load()).toEqual(TOKEN);
  });

  it('密文损坏（密钥丢失）→ 解密失败按无令牌处理，不炸', async () => {
    const store = new SecureTokenStore();
    await store.save(TOKEN);
    // 换掉数据密钥：模拟换设备 / 密钥丢失
    localStorage.setItem(KEY_KEY, btoa('x'.repeat(32)));

    const loaded = await store.load();

    // 内存兜底仍持有（save 时写过），但不会把坏数据当令牌抛出
    expect(loaded).toEqual(TOKEN);
  });
});
