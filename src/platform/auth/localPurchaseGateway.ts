import type { PurchaseGateway } from '@/domain/ports';
import type { Entitlement, Plan } from '@/domain/types';
import type { EntitlementRepository } from '@/domain/ports';
import type { Clock } from '@/services/clock';
import { DomainError } from '@/domain/errors';
import { defaultEntitlement, evaluateGrace } from '@/services/entitlementService';
import { newId } from '@/services/idService';

/**
 * **本地购买网关（模拟支付）**：开通 / 续费 / 恢复购买。
 *
 * 🔴 这是**本地模拟**，不会产生真实扣费：没有接任何支付渠道
 * （iOS App Store 内购 / 微信支付）。它的职责是把「购买 → 权益生效」
 * 这条链路完整跑通，并确立契约：
 *
 * - 购买 = 生成权益快照（provider: 'local'，receiptRef 为本地订单号）；
 * - 续费在原有到期日上**顺延**，不制造第二份订阅；
 * - 快照由调用方（`useEntitlementStore`）落库，本网关只负责产出。
 *
 * 接真实支付时替换本文件：支付 SDK 下单 → 服务端校验回执 → 返回权益快照。
 * store / UI / 权益判定全部零改动。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 订阅时长（天）。UI 价格文案与这里必须一致，改一处要改两处 */
export const PRO_SUB_DAYS = 30;
/** 过期宽限（天）：到期后仍可短暂使用，给续费缓冲 */
export const PRO_GRACE_DAYS = 3;
/** 价格展示文案（模拟定价，正式定价随支付渠道确定） */
export const PRO_PRICE_LABEL = `¥6 / 月`;

export class LocalPurchaseGateway implements PurchaseGateway {
  constructor(
    private readonly entitlements: EntitlementRepository,
    private readonly clock: Clock,
  ) {}

  async purchase(plan: Plan): Promise<Entitlement> {
    if (plan === 'free') throw new DomainError('免费套餐无需开通');

    const now = this.clock.now();
    const current = await this.entitlements.get();

    // 续费顺延：同一套餐且未过期 → 从原到期日接着算；否则从现在起算
    const renewable =
      current !== undefined && current.plan === plan && current.expireAt !== null && current.expireAt > now;
    const base = renewable ? (current as Entitlement).expireAt ?? now : now;

    const entitlement: Entitlement = {
      id: 'current',
      plan,
      state: 'active',
      expireAt: base + PRO_SUB_DAYS * DAY_MS,
      graceUntil: base + (PRO_SUB_DAYS + PRO_GRACE_DAYS) * DAY_MS,
      provider: 'local',
      receiptRef: newId('ord'),
      updatedAt: now,
    };
    await this.entitlements.upsert(entitlement);
    return entitlement;
  }

  async restore(): Promise<Entitlement> {
    const stored = await this.entitlements.get();
    if (!stored) return defaultEntitlement(this.clock.now());
    // 恢复时同样按当前时间过一遍宽限/到期判定
    return evaluateGrace(stored, this.clock.now());
  }
}
