import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthToken } from '@/domain/types';
import { makeAuthToken, makeEntitlement } from '@/services/__tests__/fixtures';

/**
 * useEntitlementStore 编排验证（QA）。
 *
 * `bootstrap`（clock / entitlementGateway / purchaseGateway / repos）与 `useAuthStore`
 * 整体换成假实现，验 store 自己的逻辑：未登录→免费、登录拉取→按档位解锁、过期→锁门、
 * 拉取失败→回落本地缓存、购买→快照生效、hydrate→开机读缓存。
 * 判权口径复用真实 `entitlementService`。
 */
const { fakeClock, fakeGateway, fakePurchase, fakeRepo, fakeAuth, authState } = vi.hoisted(() => {
  const state = {
    now: 1000,
    status: 'anonymous' as 'unknown' | 'anonymous' | 'authenticated',
    account: null as null | { userId: string },
    token: null as null | AuthToken,
  };
  return {
    authState: state,
    fakeClock: { now: () => state.now },
    fakeGateway: { fetch: vi.fn() },
    fakePurchase: { purchase: vi.fn(), restore: vi.fn() },
    fakeRepo: { entitlements: { get: vi.fn(), upsert: vi.fn(), clear: vi.fn() } },
    fakeAuth: { getState: () => state },
  };
});

vi.mock('@/store/bootstrap', () => ({
  clock: fakeClock,
  entitlementGateway: fakeGateway,
  purchaseGateway: fakePurchase,
  repos: fakeRepo,
}));

vi.mock('@/store/useAuthStore', () => ({ useAuthStore: fakeAuth }));

import { useEntitlementStore } from '@/store/useEntitlementStore';

function reset(): void {
  useEntitlementStore.setState({ entitlement: makeEntitlement(), loading: false });
  authState.now = 1000;
  authState.status = 'anonymous';
  authState.account = null;
  authState.token = null;
  fakeGateway.fetch.mockReset();
  fakePurchase.purchase.mockReset();
  fakePurchase.restore.mockReset();
  fakeRepo.entitlements.get.mockReset();
  fakeRepo.entitlements.upsert.mockReset();
}

function authenticate(): void {
  authState.status = 'authenticated';
  authState.account = { userId: 'u1' };
  authState.token = makeAuthToken();
}

describe('useEntitlementStore', () => {
  beforeEach(reset);

  it('未登录 → 免费态，付费功能锁定，且不打网关', async () => {
    await useEntitlementStore.getState().refresh();
    const s = useEntitlementStore.getState();
    expect(s.entitlement.plan).toBe('free');
    expect(s.isUnlocked('advancedExport')).toBe(false);
    expect(s.isUnlocked('adFree')).toBe(false);
    expect(fakeGateway.fetch).not.toHaveBeenCalled();
  });

  it('登录且 pro 生效 → 付费功能解锁，并缓存快照', async () => {
    authenticate();
    fakeGateway.fetch.mockResolvedValue(
      makeEntitlement({ plan: 'pro', state: 'active', expireAt: authState.now + 60_000 }),
    );

    await useEntitlementStore.getState().refresh();

    expect(fakeGateway.fetch).toHaveBeenCalledOnce();
    expect(fakeRepo.entitlements.upsert).toHaveBeenCalledOnce();
    const s = useEntitlementStore.getState();
    expect(s.isUnlocked('advancedExport')).toBe(true);
    expect(s.isUnlocked('adFree')).toBe(true);
  });

  it('pro 但已过期 → 判定 expired，功能锁定（不删数据）', async () => {
    authenticate();
    fakeGateway.fetch.mockResolvedValue(
      makeEntitlement({ plan: 'pro', state: 'active', expireAt: 500 }),
    );

    await useEntitlementStore.getState().refresh();

    const s = useEntitlementStore.getState();
    expect(s.entitlement.state).toBe('expired');
    expect(s.isUnlocked('advancedExport')).toBe(false);
  });

  it('拉取失败 → 回落本地缓存（pro 缓存仍解锁）', async () => {
    authenticate();
    fakeGateway.fetch.mockRejectedValue(new Error('offline'));
    fakeRepo.entitlements.get.mockResolvedValue(
      makeEntitlement({ plan: 'pro', state: 'active', expireAt: authState.now + 60_000 }),
    );

    await useEntitlementStore.getState().refresh();

    expect(useEntitlementStore.getState().isUnlocked('advancedExport')).toBe(true);
  });

  it('拉取失败且无缓存 → 免费态', async () => {
    authenticate();
    fakeGateway.fetch.mockRejectedValue(new Error('offline'));
    fakeRepo.entitlements.get.mockResolvedValue(undefined);

    await useEntitlementStore.getState().refresh();

    expect(useEntitlementStore.getState().entitlement.plan).toBe('free');
  });

  it('hydrate：开机读本地缓存，pro 缓存即时生效（未登录也认）', async () => {
    fakeRepo.entitlements.get.mockResolvedValue(
      makeEntitlement({ plan: 'pro', state: 'active', expireAt: authState.now + 60_000 }),
    );

    await useEntitlementStore.getState().hydrate();

    expect(useEntitlementStore.getState().isUnlocked('advancedExport')).toBe(true);
  });

  it('hydrate：无缓存 → 维持免费态，不炸', async () => {
    fakeRepo.entitlements.get.mockResolvedValue(undefined);

    await useEntitlementStore.getState().hydrate();

    expect(useEntitlementStore.getState().entitlement.plan).toBe('free');
  });

  it('purchase：走购买网关 → 落库 → 功能即时解锁', async () => {
    fakePurchase.purchase.mockResolvedValue(
      makeEntitlement({ plan: 'pro', state: 'active', expireAt: authState.now + 60_000 }),
    );

    await useEntitlementStore.getState().purchase('pro');

    expect(fakePurchase.purchase).toHaveBeenCalledWith('pro');
    expect(fakeRepo.entitlements.upsert).toHaveBeenCalledOnce();
    expect(useEntitlementStore.getState().isUnlocked('advancedExport')).toBe(true);
  });

  it('purchase：网关抛错 → 向上抛（UI 弹错误提示），快照不被污染', async () => {
    fakePurchase.purchase.mockRejectedValue(new Error('支付渠道不可用'));

    await expect(useEntitlementStore.getState().purchase('pro')).rejects.toThrow('支付渠道不可用');
    expect(fakeRepo.entitlements.upsert).not.toHaveBeenCalled();
    expect(useEntitlementStore.getState().entitlement.plan).toBe('free');
  });

  it('restore：重放本机已购权益', async () => {
    fakePurchase.restore.mockResolvedValue(
      makeEntitlement({ plan: 'pro', state: 'active', expireAt: authState.now + 60_000 }),
    );

    await useEntitlementStore.getState().restore();

    expect(fakePurchase.restore).toHaveBeenCalledOnce();
    expect(useEntitlementStore.getState().isUnlocked('adFree')).toBe(true);
  });
});
