import { describe, expect, it } from 'vitest';
import {
  PLAN_MATRIX,
  PLAN_RANK,
  defaultEntitlement,
  evaluateGrace,
  isFeatureUnlocked,
  isPaidFeature,
  isPlanAtLeast,
} from '@/services/entitlementService';
import type { Entitlement, FeatureKey } from '@/domain/types';

describe('entitlementService — 套餐映射', () => {
  it('当前仅 advancedExport / adFree 为付费点，均映射到 pro', () => {
    expect(PLAN_MATRIX.advancedExport).toBe('pro');
    expect(PLAN_MATRIX.adFree).toBe('pro');
    expect(isPaidFeature('advancedExport')).toBe(true);
    expect(isPaidFeature('adFree')).toBe(true);
  });

  it('isPlanAtLeast：高套餐自动包含低套餐', () => {
    expect(isPlanAtLeast('free', 'free')).toBe(true);
    expect(isPlanAtLeast('pro', 'free')).toBe(true);
    expect(isPlanAtLeast('team', 'pro')).toBe(true);
    expect(isPlanAtLeast('free', 'pro')).toBe(false);
    expect(isPlanAtLeast('pro', 'team')).toBe(false);
    expect(PLAN_RANK.free).toBeLessThan(PLAN_RANK.pro);
    expect(PLAN_RANK.pro).toBeLessThan(PLAN_RANK.team);
  });
});

describe('entitlementService — isFeatureUnlocked', () => {
  const features: FeatureKey[] = ['advancedExport', 'adFree'];

  it('无权益快照 → 一律锁定', () => {
    for (const f of features) {
      expect(isFeatureUnlocked(f, undefined)).toBe(false);
      expect(isFeatureUnlocked(f, null)).toBe(false);
    }
  });

  it('免费 / none 态 → 锁定', () => {
    expect(isFeatureUnlocked('advancedExport', defaultEntitlement(1000))).toBe(false);
  });

  it('pro 且生效中（active / trialing / grace）→ 解锁', () => {
    for (const state of ['active', 'trialing', 'grace'] as const) {
      const ent: Entitlement = { ...defaultEntitlement(1000), plan: 'pro', state };
      expect(isFeatureUnlocked('advancedExport', ent)).toBe(true);
      expect(isFeatureUnlocked('adFree', ent)).toBe(true);
    }
  });

  it('pro 但 expired → 锁定（到期只锁门，绝不删数据）', () => {
    const ent: Entitlement = { ...defaultEntitlement(1000), plan: 'pro', state: 'expired' };
    expect(isFeatureUnlocked('advancedExport', ent)).toBe(false);
  });

  it('team 套餐自动包含 pro 权益', () => {
    const ent: Entitlement = { ...defaultEntitlement(1000), plan: 'team', state: 'active' };
    expect(isFeatureUnlocked('advancedExport', ent)).toBe(true);
  });
});

describe('entitlementService — evaluateGrace', () => {
  it('免费 / none 态原样返回', () => {
    const ent = defaultEntitlement(1000);
    expect(evaluateGrace(ent, 9_999_999)).toBe(ent);
  });

  it('未过期 → 保持 active', () => {
    const ent: Entitlement = { ...defaultEntitlement(0), plan: 'pro', state: 'active', expireAt: 1000 };
    expect(evaluateGrace(ent, 500).state).toBe('active');
  });

  it('到期但在宽限内 → grace', () => {
    const ent: Entitlement = {
      ...defaultEntitlement(0),
      plan: 'pro',
      state: 'active',
      expireAt: 1000,
      graceUntil: 2000,
    };
    expect(evaluateGrace(ent, 1500).state).toBe('grace');
  });

  it('到期且过了宽限 → expired', () => {
    const ent: Entitlement = {
      ...defaultEntitlement(0),
      plan: 'pro',
      state: 'grace',
      expireAt: 1000,
      graceUntil: 2000,
    };
    expect(evaluateGrace(ent, 3000).state).toBe('expired');
  });

  it('续费成功（时间已回补）→ 从 grace/expired 复位为 active', () => {
    const ent: Entitlement = { ...defaultEntitlement(0), plan: 'pro', state: 'expired', expireAt: 5000 };
    expect(evaluateGrace(ent, 1000).state).toBe('active');
  });
});
