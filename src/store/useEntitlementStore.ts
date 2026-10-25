import { create } from 'zustand';
import type { Entitlement, FeatureKey, Plan } from '@/domain/types';
import { clock, entitlementGateway, purchaseGateway, repos } from './bootstrap';
import {
  defaultEntitlement,
  evaluateGrace,
  isFeatureUnlocked,
} from '@/services/entitlementService';
import { useAuthStore } from './useAuthStore';

interface EntitlementState {
  /** 当前权益快照（默认免费态，保证 useFeature 在任何时候都能判权） */
  entitlement: Entitlement;
  loading: boolean;
  /** 开机即读本地缓存快照（不等登录：权益是本机购买记录，登录与否都应在） */
  hydrate: () => Promise<void>;
  /** 拉取并缓存权益（登录后 / 启动时调用；本地实现即读 Dexie，云端实现才是真相源） */
  refresh: () => Promise<void>;
  /** 开通 / 续费某套餐（模拟支付），成功后快照即时生效 */
  purchase: (plan: Plan) => Promise<void>;
  /** 恢复购买（重放本机已购权益） */
  restore: () => Promise<void>;
  /** 本地判定某功能点是否解锁（结合当前权益 + 时间判定，不发请求） */
  isUnlocked: (feature: FeatureKey) => boolean;
}

export const useEntitlementStore = create<EntitlementState>((set, get) => ({
  entitlement: defaultEntitlement(clock.now()),
  loading: false,

  async hydrate() {
    try {
      const cached = await repos.entitlements.get();
      if (cached) set({ entitlement: evaluateGrace(cached, clock.now()) });
    } catch {
      // 读不到缓存就维持免费态
    }
  },

  async refresh() {
    const auth = useAuthStore.getState();
    // 未登录：权益不随网关走，只认本机缓存（设备级订阅，见 hydrate）
    if (auth.status !== 'authenticated' || !auth.account || !auth.token) {
      set({ loading: false });
      return;
    }
    set({ loading: true });
    try {
      const fresh = await entitlementGateway.fetch(auth.account.userId, auth.token);
      const evaluated = evaluateGrace(fresh, clock.now());
      await repos.entitlements.upsert(evaluated);
      set({ entitlement: evaluated, loading: false });
    } catch {
      // 拉取失败：回落到本地缓存（若有），否则免费态 —— 离线/服务端抖动都不该阻断使用
      let cached: Entitlement | undefined;
      try {
        cached = await repos.entitlements.get();
      } catch {
        cached = undefined;
      }
      set({
        entitlement: cached ? evaluateGrace(cached, clock.now()) : defaultEntitlement(clock.now()),
        loading: false,
      });
    }
  },

  async purchase(plan) {
    set({ loading: true });
    try {
      const fresh = await purchaseGateway.purchase(plan);
      const evaluated = evaluateGrace(fresh, clock.now());
      await repos.entitlements.upsert(evaluated);
      set({ entitlement: evaluated, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  async restore() {
    set({ loading: true });
    try {
      const fresh = await purchaseGateway.restore();
      const evaluated = evaluateGrace(fresh, clock.now());
      set({ entitlement: evaluated, loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  isUnlocked(feature) {
    // 快照可能是旧的：每次判定都按当前时间重新过一遍宽限/到期
    const current = evaluateGrace(get().entitlement, clock.now());
    return isFeatureUnlocked(feature, current);
  },
}));
