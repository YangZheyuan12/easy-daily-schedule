import type { EntitlementGateway } from '@/domain/ports';
import type { AuthToken, Entitlement } from '@/domain/types';
import type { EntitlementRepository } from '@/domain/ports';
import type { Clock } from '@/services/clock';
import { defaultEntitlement } from '@/services/entitlementService';

/**
 * **本地权益网关**：从 Dexie `entitlements` 表读权益快照。
 *
 * 本地优先架构下，「服务端」就是本机 IndexedDB —— 这是唯一真相源。
 * 没有网络请求，所以不存在拉取失败；`useEntitlementStore.refresh()`
 * 的失败回落分支仍然保留，那是给将来的真实云端网关用的。
 *
 * 接 WorkBuddy 云服务时替换本文件（带 userId + token 打云端），上层零改动。
 */
export class LocalEntitlementGateway implements EntitlementGateway {
  constructor(
    private readonly entitlements: EntitlementRepository,
    private readonly clock: Clock,
  ) {}

  async fetch(_userId: string, _token: AuthToken): Promise<Entitlement> {
    const stored = await this.entitlements.get();
    return stored ?? defaultEntitlement(this.clock.now());
  }
}
