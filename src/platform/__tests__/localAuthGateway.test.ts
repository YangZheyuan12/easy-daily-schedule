import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAuthGateway } from '@/platform/auth/localAuthGateway';
import type { AccountRepository } from '@/domain/ports';
import type { Account } from '@/domain/types';

/** 内存版账号仓储（只用到 get） */
class FakeAccounts implements AccountRepository {
  saved: Account | undefined;
  async get() {
    return this.saved;
  }
  async upsert(account: Account) {
    this.saved = account;
  }
  async clear() {
    this.saved = undefined;
  }
}

const PHONE = '13812345678';

describe('LocalAuthGateway', () => {
  let accounts: FakeAccounts;
  let gateway: LocalAuthGateway;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T12:00:00+08:00'));
    accounts = new FakeAccounts();
    gateway = new LocalAuthGateway(accounts);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requestCode：回传 6 位模拟验证码与有效期', async () => {
    const result = await gateway.requestCode(PHONE);
    expect(result.devCode).toMatch(/^\d{6}$/);
    expect(result.expiresInSec).toBe(300);
  });

  it('signIn：正确验证码 → 建号并签发会话（手机号入画像，token 30 天后过期）', async () => {
    const { devCode } = await gateway.requestCode(PHONE);

    const session = await gateway.signIn({ identifier: PHONE, code: devCode! });

    expect(session.account.userId).toMatch(/^usr_/);
    expect(session.account.phone).toBe(PHONE);
    expect(session.account.email).toBeNull();
    expect(session.token.refreshToken).toMatch(/^ref_/);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(session.token.expiresAt - Date.now()).toBeGreaterThan(thirtyDays - 1000);
    expect(session.token.expiresAt - Date.now()).toBeLessThanOrEqual(thirtyDays);
  });

  it('signIn：同一标识符重复登录 → 复用原 userId，只更新 updatedAt', async () => {
    const first = await gateway.requestCode(PHONE);
    const s1 = await gateway.signIn({ identifier: PHONE, code: first.devCode! });
    accounts.saved = s1.account;

    vi.advanceTimersByTime(60_000); // 时间前进，updatedAt 才能拉开
    const second = await gateway.requestCode(PHONE);
    const s2 = await gateway.signIn({ identifier: PHONE, code: second.devCode! });

    expect(s2.account.userId).toBe(s1.account.userId);
    expect(s2.account.updatedAt).toBeGreaterThan(s1.account.updatedAt);
  });

  it('signIn：不同标识符 → 新建 userId', async () => {
    const first = await gateway.requestCode(PHONE);
    const s1 = await gateway.signIn({ identifier: PHONE, code: first.devCode! });
    accounts.saved = s1.account;

    const second = await gateway.requestCode('name@qq.com');
    const s2 = await gateway.signIn({ identifier: 'name@qq.com', code: second.devCode! });

    expect(s2.account.userId).not.toBe(s1.account.userId);
    expect(s2.account.email).toBe('name@qq.com');
    expect(s2.account.phone).toBeNull();
  });

  it('signIn：未请求验证码 → 提示先获取', async () => {
    await expect(gateway.signIn({ identifier: PHONE, code: '123456' })).rejects.toThrow(
      '请先获取验证码',
    );
  });

  it('signIn：验证码错误 → 报错且可重试；连续 5 次错误后作废', async () => {
    const { devCode } = await gateway.requestCode(PHONE);

    // 前 5 次错误都给「验证码不正确」，可重试
    for (let i = 0; i < 5; i += 1) {
      await expect(gateway.signIn({ identifier: PHONE, code: '000000' })).rejects.toThrow(
        '验证码不正确',
      );
    }
    // 第 6 次：即使验证码正确也已作废
    await expect(gateway.signIn({ identifier: PHONE, code: devCode! })).rejects.toThrow(
      '验证码错误次数过多，请重新获取',
    );
  });

  it('signIn：验证码 5 分钟后过期', async () => {
    const { devCode } = await gateway.requestCode(PHONE);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await expect(gateway.signIn({ identifier: PHONE, code: devCode! })).rejects.toThrow(
      '验证码已过期，请重新获取',
    );
  });

  it('signIn：标识符格式不合法 → 直接拒绝（连码都不看）', async () => {
    await expect(gateway.signIn({ identifier: '12345', code: '123456' })).rejects.toThrow(
      '请输入正确的手机号或邮箱',
    );
  });

  it('signOut：清掉待验证码，重新登录要走完整流程', async () => {
    const { devCode } = await gateway.requestCode(PHONE);
    await gateway.signOut();

    await expect(gateway.signIn({ identifier: PHONE, code: devCode! })).rejects.toThrow(
      '请先获取验证码',
    );
  });

  it('refreshToken：换新 accessToken、保留 refreshToken、顺延有效期', async () => {
    const refreshed = await gateway.refreshToken({
      accessToken: 'old',
      refreshToken: 'keep-me',
      expiresAt: Date.now(),
    });

    expect(refreshed.accessToken).not.toBe('old');
    expect(refreshed.refreshToken).toBe('keep-me');
    expect(refreshed.expiresAt).toBeGreaterThan(Date.now());
  });
});
