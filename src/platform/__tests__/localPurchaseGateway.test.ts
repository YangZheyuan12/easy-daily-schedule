import { describe, expect, it } from 'vitest';
import { LocalPurchaseGateway, PRO_SUB_DAYS } from '@/platform/auth/localPurchaseGateway';
import { createFixedClock } from '@/services/clock';
import { defaultEntitlement } from '@/services/entitlementService';
import type { EntitlementRepository } from '@/domain/ports';
import type { Entitlement } from '@/domain/types';

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

class FakeEntitlements implements EntitlementRepository {
  stored: Entitlement | undefined;
  upserts = 0;
  async get() {
    return this.stored;
  }
  async upsert(entitlement: Entitlement) {
    this.stored = entitlement;
    this.upserts += 1;
  }
  async clear() {
    this.stored = undefined;
  }
}

function make() {
  const entitlements = new FakeEntitlements();
  const gateway = new LocalPurchaseGateway(entitlements, createFixedClock(NOW));
  return { entitlements, gateway };
}

describe('LocalPurchaseGateway', () => {
  it('purchase(pro)：生效中快照 + 30 天有效期 + 3 天宽限 + 本地订单号，并落库', async () => {
    const { entitlements, gateway } = make();

    const result = await gateway.purchase('pro');

    expect(result.plan).toBe('pro');
    expect(result.state).toBe('active');
    expect(result.expireAt).toBe(NOW + PRO_SUB_DAYS * DAY_MS);
    expect(result.graceUntil).toBe(NOW + (PRO_SUB_DAYS + 3) * DAY_MS);
    expect(result.provider).toBe('local');
    expect(result.receiptRef).toMatch(/^ord_/);
    expect(entitlements.upserts).toBe(1);
    expect(entitlements.stored?.plan).toBe('pro');
  });

  it('purchase(free)：免费套餐无需开通', async () => {
    const { gateway } = make();
    await expect(gateway.purchase('free')).rejects.toThrow('免费套餐无需开通');
  });

  it('续费：在未过期的原到期日上顺延，不制造第二份订阅', async () => {
    const { entitlements, gateway } = make();
    entitlements.stored = {
      ...defaultEntitlement(NOW - DAY_MS),
      plan: 'pro',
      state: 'active',
      expireAt: NOW + 10 * DAY_MS,
      graceUntil: NOW + 13 * DAY_MS,
    };

    const result = await gateway.purchase('pro');

    // 从原到期日（+10 天）接着 +30 天，而不是从今天起算
    expect(result.expireAt).toBe(NOW + 40 * DAY_MS);
  });

  it('续费：已过期的订阅从头起算', async () => {
    const { entitlements, gateway } = make();
    entitlements.stored = {
      ...defaultEntitlement(NOW - DAY_MS),
      plan: 'pro',
      state: 'expired',
      expireAt: NOW - DAY_MS,
      graceUntil: NOW + 2 * DAY_MS,
    };

    const result = await gateway.purchase('pro');

    expect(result.expireAt).toBe(NOW + PRO_SUB_DAYS * DAY_MS);
  });

  it('restore：有购买记录 → 按当前时间重新判定（过期 → expired）', async () => {
    const { entitlements, gateway } = make();
    entitlements.stored = {
      ...defaultEntitlement(NOW),
      plan: 'pro',
      state: 'active',
      expireAt: NOW - DAY_MS,
      graceUntil: NOW - 1000,
    };

    const result = await gateway.restore();

    expect(result.plan).toBe('pro');
    expect(result.state).toBe('expired');
  });

  it('restore：无购买记录 → 免费态', async () => {
    const { gateway } = make();

    const result = await gateway.restore();

    expect(result.plan).toBe('free');
    expect(result.state).toBe('none');
  });
});
