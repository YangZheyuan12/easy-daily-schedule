import { create } from 'zustand';
import type { Account, AuthToken, CodeRequestResult, SignInCredential } from '@/domain/types';
import { authService } from './bootstrap';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  /** 当前登录账号画像（非敏感）；匿名时为 null */
  account: Account | null;
  /** 内存态令牌（不持久化；刷新页面后由安全存储恢复，不依赖此字段） */
  token: AuthToken | null;
  initializing: boolean;
  /** 冷启动恢复会话：AppShell 启动时调用一次 */
  init: () => Promise<void>;
  /** 请求登录验证码（本地模拟渠道会把验证码回显在结果里，供 UI 展示） */
  requestCode: (identifier: string) => Promise<CodeRequestResult>;
  /** 凭验证码登录（首次自动建号） */
  signIn: (credential: SignInCredential) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  account: null,
  token: null,
  initializing: true,

  async init() {
    try {
      const session = await authService.restore();
      set(
        session
          ? { status: 'authenticated', account: session.account, token: session.token, initializing: false }
          : { status: 'anonymous', account: null, token: null, initializing: false },
      );
    } catch {
      set({ status: 'anonymous', account: null, token: null, initializing: false });
    }
  },

  async requestCode(identifier) {
    return authService.requestCode(identifier);
  },

  async signIn(credential) {
    const session = await authService.signIn(credential);
    set({ status: 'authenticated', account: session.account, token: session.token });
  },

  async signOut() {
    await authService.signOut();
    set({ status: 'anonymous', account: null, token: null });
  },
}));
