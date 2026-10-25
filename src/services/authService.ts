import type { Clock } from './clock';
import type { AuthToken, CodeRequestResult, Session, SignInCredential } from '@/domain/types';
import type { AccountRepository, AuthGateway, TokenStore } from '@/domain/ports';
import { DomainError } from '@/domain/errors';
import { isValidIdentifier } from './authIdentifier';

/**
 * 鉴权会话编排（纯逻辑，零浏览器 API）。
 *
 * 它自己不碰任何存储或网络 —— 一切都通过注入的端口完成：
 * - `AuthGateway`：唯一打网络的地方（当前本地实现，见 platform/auth）。
 * - `TokenStore`：敏感令牌的安全存储（Capacitor Preferences / Web 兜底）。
 * - `AccountRepository`：账号画像的 IndexedDB 缓存。
 *
 * 迁移微信小程序 / 接真实云服务时，替换这三个端点的实现即可，本文件 100% 复用。
 */

/** 过期判定的安全边界：提前这么多秒就认为「即将过期」，主动刷新 */
const EXPIRY_SKEW_MS = 5_000;

export class AuthService {
  constructor(
    private readonly gateway: AuthGateway,
    private readonly tokenStore: TokenStore,
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  isExpired(token: AuthToken, now: number = this.clock.now()): boolean {
    return now >= token.expiresAt - EXPIRY_SKEW_MS;
  }

  /** 取「有效」token：未过期直接用；将过期则尝试刷新；刷新失败返回 null（按未登录处理） */
  private async validToken(token: AuthToken): Promise<AuthToken | null> {
    if (!this.isExpired(token)) return token;
    try {
      const refreshed = await this.gateway.refreshToken(token);
      await this.tokenStore.save(refreshed);
      return refreshed;
    } catch {
      return null;
    }
  }

  /**
   * 冷启动恢复登录态：有有效 token 且本地有账号画像 → 恢复会话；否则返回 null（匿名）。
   * token 在但画像没了视为未登录（等下次 signIn 重建）。
   */
  async restore(): Promise<Session | null> {
    const stored = await this.tokenStore.load();
    if (!stored) return null;
    const token = await this.validToken(stored);
    if (!token) {
      await this.tokenStore.clear();
      return null;
    }
    const account = await this.accounts.get();
    if (!account) return null;
    return { account, token };
  }

  /**
   * 请求登录验证码（先做本地格式校验，不合法就不麻烦网关）。
   * 网关的返回（含模拟渠道的 devCode）原样透传，由 UI 决定怎么展示。
   */
  async requestCode(identifier: string): Promise<CodeRequestResult> {
    const trimmed = identifier.trim();
    if (!isValidIdentifier(trimmed)) {
      throw new DomainError('请输入正确的手机号或邮箱');
    }
    return this.gateway.requestCode(trimmed);
  }

  /** 登录：网关换会话 → 令牌进安全存储 → 账号画像进缓存 → 返回会话 */
  async signIn(credential: SignInCredential): Promise<Session> {
    const session = await this.gateway.signIn({
      identifier: credential.identifier.trim(),
      code: credential.code.trim(),
    });
    await this.tokenStore.save(session.token);
    await this.accounts.upsert({ ...session.account, updatedAt: this.clock.now() });
    return session;
  }

  /** 登出：先尽力清对端会话，再清本地令牌与画像（对端失败不影响本地登出） */
  async signOut(): Promise<void> {
    try {
      await this.gateway.signOut();
    } catch {
      // 对端清理失败不应阻断本地登出
    }
    await this.tokenStore.clear();
    await this.accounts.clear();
  }
}
