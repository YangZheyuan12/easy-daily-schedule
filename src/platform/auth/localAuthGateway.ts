import type { AuthGateway } from '@/domain/ports';
import type { Account, AuthToken, CodeRequestResult, Session, SignInCredential } from '@/domain/types';
import type { AccountRepository } from '@/domain/ports';
import { DomainError } from '@/domain/errors';
import { newId } from '@/services/idService';
import { detectIdentifier } from '@/services/authIdentifier';

/**
 * **本地鉴权网关**：验证码登录 + 本机账号，不发任何网络请求。
 *
 * 这是一个完整的本地账号系统，不是「占位」：
 * - 验证码「短信/邮件」是**本地模拟**的 —— 本应用没有真实消息服务，
 *   生成的 6 位码通过 `devCode` 回传，由界面直接展示（见 LoginSheet）。
 * - 账号画像进 `AccountRepository`（Dexie `account` 表）；token 由
 *   `authService` 送进 `TokenStore`（安全存储），两者都不经过网络。
 * - 首次登录的手机号/邮箱自动建号；同一设备重复登录同一账号则复用原 userId。
 *
 * 接真实后端（WorkBuddy 云服务 / 微信 / Apple）时替换本文件即可，
 * `services/authService` 与上层零改动 —— 这就是「平行通道」端口化的好处。
 */

/** 验证码有效期 5 分钟 */
const CODE_TTL_MS = 5 * 60 * 1000;
/** 同一验证码最多试 5 次，超过作废（防爆破） */
const MAX_ATTEMPTS = 5;
/** 本地会话有效期 30 天（没有服务端可刷新，到期走 refreshToken 续期） */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface PendingCode {
  code: string;
  expiresAt: number;
  attempts: number;
}

function randomSixDigits(): string {
  // 6 位验证码：本地模拟渠道，Math.random 足够（不承担安全职责）
  return String(Math.floor(Math.random() * 900_000) + 100_000);
}

export class LocalAuthGateway implements AuthGateway {
  /** 内存态的待验证码（刷新页面即失效，符合验证码语义；账号与令牌不在这里） */
  private pending = new Map<string, PendingCode>();
  /** 单次页面会话内记住当前会话（冷启动恢复走 tokenStore + 账号缓存，不依赖此字段） */
  private current: Session | null = null;

  constructor(private readonly accounts: AccountRepository) {}

  async requestCode(identifier: string): Promise<CodeRequestResult> {
    const code = randomSixDigits();
    this.pending.set(identifier, {
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    });
    return { devCode: code, expiresInSec: CODE_TTL_MS / 1000 };
  }

  async signIn(credential: SignInCredential): Promise<Session> {
    const kind = detectIdentifier(credential.identifier);
    if (!kind) throw new DomainError('请输入正确的手机号或邮箱');

    const pending = this.pending.get(credential.identifier);
    if (!pending) throw new DomainError('请先获取验证码');
    if (Date.now() > pending.expiresAt) {
      this.pending.delete(credential.identifier);
      throw new DomainError('验证码已过期，请重新获取');
    }
    if (pending.attempts >= MAX_ATTEMPTS) {
      this.pending.delete(credential.identifier);
      throw new DomainError('验证码错误次数过多，请重新获取');
    }
    if (pending.code !== credential.code) {
      pending.attempts += 1;
      throw new DomainError('验证码不正确');
    }
    this.pending.delete(credential.identifier);

    const session = await this.establish(kind, credential.identifier);
    this.current = session;
    return session;
  }

  /** 取号或建号，签发本地会话 */
  private async establish(kind: 'phone' | 'email', identifier: string): Promise<Session> {
    const existing = await this.accounts.get();
    const sameOwner =
      existing !== undefined &&
      (kind === 'phone' ? existing.phone === identifier : existing.email === identifier);

    const now = Date.now();
    const account: Account = sameOwner
      ? { ...(existing as Account), updatedAt: now }
      : {
          id: 'current',
          userId: newId('usr'),
          phone: kind === 'phone' ? identifier : null,
          email: kind === 'email' ? identifier : null,
          displayName: null,
          avatarUrl: null,
          createdAt: now,
          updatedAt: now,
        };

    const token: AuthToken = {
      accessToken: newId('tok'),
      refreshToken: newId('ref'),
      expiresAt: now + SESSION_TTL_MS,
    };
    return { account, token };
  }

  async signOut(): Promise<void> {
    this.pending.clear();
    this.current = null;
  }

  async getStoredSession(): Promise<Session | null> {
    return this.current;
  }

  async refreshToken(token: AuthToken): Promise<AuthToken> {
    // 本地会话没有服务端可续，直接签发一个更晚过期的新 accessToken
    return {
      accessToken: newId('tok'),
      refreshToken: token.refreshToken,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
  }
}
