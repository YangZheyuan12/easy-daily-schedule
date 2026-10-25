import { describe, expect, it } from 'vitest';
import { AuthService } from '@/services/authService';
import { createFixedClock } from '@/services/clock';
import { makeAccount, makeAuthToken } from '@/services/__tests__/fixtures';
import type { AuthGateway } from '@/domain/ports';
import type { Account, AuthToken, Session } from '@/domain/types';

const NOW = 1000;

class FakeTokenStore {
  stored: AuthToken | null = null;
  saved = 0;
  cleared = 0;
  async save(t: AuthToken) {
    this.stored = t;
    this.saved += 1;
  }
  async load() {
    return this.stored;
  }
  async clear() {
    this.stored = null;
    this.cleared += 1;
  }
}

class FakeAccounts {
  saved: Account | null = null;
  upserts = 0;
  async get() {
    return this.saved ?? undefined;
  }
  async upsert(a: Account) {
    this.saved = a;
    this.upserts += 1;
  }
  async clear() {
    this.saved = null;
  }
}

class FakeGateway implements AuthGateway {
  signInCalls = 0;
  signOutCalls = 0;
  refreshCalls = 0;
  requestCodeCalls = 0;
  signOutThrows = false;
  refreshThrows = false;

  async requestCode(_identifier: string) {
    this.requestCodeCalls += 1;
    return { devCode: '123456', expiresInSec: 300 };
  }
  async signIn(_credential: { identifier: string; code: string }): Promise<Session> {
    this.signInCalls += 1;
    return {
      account: makeAccount({ userId: 'u1' }),
      token: makeAuthToken({ accessToken: 'a1', expiresAt: NOW + 60_000 }),
    };
  }
  async signOut() {
    this.signOutCalls += 1;
    if (this.signOutThrows) throw new Error('remote signout failed');
  }
  async getStoredSession() {
    return null;
  }
  async refreshToken(token: AuthToken): Promise<AuthToken> {
    this.refreshCalls += 1;
    if (this.refreshThrows) throw new Error('refresh failed');
    return makeAuthToken({ accessToken: 'a2', refreshToken: token.refreshToken, expiresAt: NOW + 120_000 });
  }
}

function make() {
  const tokenStore = new FakeTokenStore();
  const accounts = new FakeAccounts();
  const gateway = new FakeGateway();
  const service = new AuthService(gateway, tokenStore, accounts, createFixedClock(NOW));
  return { tokenStore, accounts, gateway, service };
}

describe('AuthService', () => {
  it('requestCode：透传网关结果（含模拟渠道的 devCode）', async () => {
    const { gateway, service } = make();

    const result = await service.requestCode('13812345678');

    expect(gateway.requestCodeCalls).toBe(1);
    expect(result.devCode).toBe('123456');
    expect(result.expiresInSec).toBe(300);
  });

  it('requestCode：标识符格式不合法 → 抛 DomainError，且不打扰网关', async () => {
    const { gateway, service } = make();

    await expect(service.requestCode('not-a-contact')).rejects.toThrow('请输入正确的手机号或邮箱');
    expect(gateway.requestCodeCalls).toBe(0);
  });

  it('signIn：换会话 → 令牌进安全存储 → 账号进缓存 → 返回会话', async () => {
    const { tokenStore, accounts, gateway, service } = make();

    const session = await service.signIn({ identifier: '13812345678', code: '123456' });

    expect(session.account.userId).toBe('u1');
    expect(gateway.signInCalls).toBe(1);
    expect(tokenStore.stored?.accessToken).toBe('a1');
    expect(accounts.upserts).toBe(1);
    expect(accounts.saved?.userId).toBe('u1');
    // 账号画像的 updatedAt 取自时钟，可预测
    expect(accounts.saved?.updatedAt).toBe(NOW);
  });

  it('signIn：标识符与验证码的首尾空白被裁剪后再交给网关', async () => {
    const { gateway, service } = make();

    await service.signIn({ identifier: '  13812345678 ', code: ' 123456 ' });

    expect(gateway.signInCalls).toBe(1);
  });

  it('signOut：清对端 + 清本地令牌与画像；对端失败仍完成本地登出', async () => {
    const { tokenStore, accounts, gateway, service } = make();
    await service.signIn({ identifier: '13812345678', code: '123456' });
    gateway.signOutThrows = true;

    await service.signOut();

    expect(tokenStore.stored).toBeNull();
    expect(accounts.saved).toBeNull();
  });

  it('restore：无令牌 → null', async () => {
    const { service } = make();
    expect(await service.restore()).toBeNull();
  });

  it('restore：有效令牌 + 有账号画像 → 恢复会话', async () => {
    const { tokenStore, accounts, service } = make();
    tokenStore.stored = makeAuthToken({ expiresAt: NOW + 60_000 });
    accounts.saved = makeAccount({ userId: 'u1' });

    const session = await service.restore();
    expect(session?.account.userId).toBe('u1');
    expect(session?.token.accessToken).toBe('access-token');
  });

  it('restore：令牌过期 → 刷新成功 → 用新令牌恢复', async () => {
    const { tokenStore, accounts, gateway, service } = make();
    tokenStore.stored = makeAuthToken({ accessToken: 'old', refreshToken: 'r', expiresAt: NOW });
    accounts.saved = makeAccount({ userId: 'u1' });

    const session = await service.restore();

    expect(gateway.refreshCalls).toBe(1);
    expect(session?.token.accessToken).toBe('a2');
    expect(tokenStore.stored?.accessToken).toBe('a2');
  });

  it('restore：令牌过期且刷新失败 → 清令牌并返回 null', async () => {
    const { tokenStore, accounts, gateway, service } = make();
    tokenStore.stored = makeAuthToken({ expiresAt: NOW });
    accounts.saved = makeAccount({ userId: 'u1' });
    gateway.refreshThrows = true;

    expect(await service.restore()).toBeNull();
    expect(tokenStore.stored).toBeNull();
  });

  it('restore：有令牌但无账号画像 → null（等下次登录重建）', async () => {
    const { tokenStore, service } = make();
    tokenStore.stored = makeAuthToken({ expiresAt: NOW + 60_000 });
    expect(await service.restore()).toBeNull();
  });

  it('isExpired：带 5s 安全边界', () => {
    const { service } = make();
    expect(service.isExpired(makeAuthToken({ expiresAt: NOW + 60_000 }))).toBe(false);
    expect(service.isExpired(makeAuthToken({ expiresAt: NOW + 4_000 }))).toBe(true);
    expect(service.isExpired(makeAuthToken({ expiresAt: NOW - 1 }))).toBe(true);
  });
});
