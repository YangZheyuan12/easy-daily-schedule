import type { Entitlement, FeatureKey, Plan } from '@/domain/types';

/**
 * 权益门禁纯逻辑（零浏览器 API，可单测）。
 *
 * 服务端是权益的**真相源**，本模块只负责「拿着服务端给的快照，本地怎么判权」。
 * 加新付费点 = 在 `FEATURES` 加一个枚举 + 在 `PLAN_MATRIX` 映射到所需档位，
 * 表结构、存储、UI 框架都不用动。
 */

/** 套餐档位排序，越大权限越高。新增档位在此注册 */
export const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  pro: 1,
  team: 2,
};

/**
 * 功能点 → 所需最低套餐。
 * 🔴 当前只把「高级导出 / 去广告」设为付费（pro）。多端实时同步等暂不收费，
 * 但模型已预留：将来要收费，往这里加一行即可。
 */
export const PLAN_MATRIX: Record<FeatureKey, Plan> = {
  advancedExport: 'pro',
  adFree: 'pro',
};

/** 全部功能点（驱动升级弹层枚举、测试遍历） */
export const FEATURES: readonly FeatureKey[] = ['advancedExport', 'adFree'];

/** 处于这些状态才视为「权益生效中」 */
const UNLOCKED_STATES = new Set<Entitlement['state']>(['active', 'trialing', 'grace']);

/** 该功能点是否属于「付费墙内」（免费用户会看到升级入口） */
export function isPaidFeature(feature: FeatureKey): boolean {
  return PLAN_RANK[PLAN_MATRIX[feature]] > PLAN_RANK.free;
}

/** plan 是否达到 required 档位（含相等） */
export function isPlanAtLeast(plan: Plan, required: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

/**
 * 某功能点是否解锁。
 *
 * 权益快照缺失或状态不在生效集合 → 一律 false（宁可少给，不可越权）。
 * 命中档位门槛（>= 所需档位）才 true —— 高套餐自动包含低套餐权益。
 */
export function isFeatureUnlocked(
  feature: FeatureKey,
  entitlement: Entitlement | null | undefined,
): boolean {
  if (!entitlement) return false;
  if (!UNLOCKED_STATES.has(entitlement.state)) return false;
  return isPlanAtLeast(entitlement.plan, PLAN_MATRIX[feature]);
}

/**
 * 免费态默认快照（未登录 / 无任何订阅时用）。
 */
export function defaultEntitlement(now: number): Entitlement {
  return {
    id: 'current',
    plan: 'free',
    state: 'none',
    expireAt: null,
    graceUntil: null,
    provider: null,
    receiptRef: null,
    updatedAt: now,
  };
}

/**
 * 依当前时间重新判定权益状态（纯函数）。
 *
 * - 付费态到期：仍在宽限内 → `grace`（继续解锁，给用户续费缓冲）；
 *   过了宽限 → `expired`（锁功能，但**不删数据**）。
 * - 续费成功（时间已回补到未过期）：把 `grace`/`expired` 复位为 `active`。
 * 🔴 只改 `state`，绝不动用户已付费产生的本地数据 —— 到期只锁门，不删内容。
 */
export function evaluateGrace(entitlement: Entitlement, now: number): Entitlement {
  if (entitlement.plan === 'free' || entitlement.state === 'none') return entitlement;

  const expired = entitlement.expireAt !== null && now >= entitlement.expireAt;
  if (expired) {
    const withinGrace = entitlement.graceUntil !== null && now < entitlement.graceUntil;
    if (withinGrace) {
      return entitlement.state === 'grace' ? entitlement : { ...entitlement, state: 'grace' };
    }
    return entitlement.state === 'expired' ? entitlement : { ...entitlement, state: 'expired' };
  }

  // 未过期却停在 grace/expired：续费成功，复位为生效中
  if (entitlement.state === 'grace' || entitlement.state === 'expired') {
    return { ...entitlement, state: 'active' };
  }
  return entitlement;
}
