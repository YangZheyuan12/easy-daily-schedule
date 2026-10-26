import type { Repositories } from '@/domain/ports';
import { toAppError } from '@/domain/errors';
import { createRepositories } from '@/repositories';
import { systemClock, type Clock } from '@/services/clock';
import { AuthService } from '@/services/authService';
import { LocalAuthGateway } from '@/platform/auth/localAuthGateway';
import { LocalEntitlementGateway } from '@/platform/auth/localEntitlementGateway';
import { LocalPurchaseGateway } from '@/platform/auth/localPurchaseGateway';
import { SecureTokenStore } from '@/platform/auth/secureTokenStore';
import { PersistenceService } from '@/services/persistenceService';
import { toLocalTime } from '@/services/syncService';
import { UndoService } from '@/services/undoService';
import { AiService } from '@/services/aiService';
import { createAiGateway } from '@/platform/ai';
import { SecureAiKeyStore } from '@/platform/ai/secureAiKeyStore';
import { PURGE_AFTER_MS } from '@/domain/constants';

/**
 * 依赖装配。
 *
 * 全项目唯一的初始化入口：创建仓储 → 创建服务 → 注册页面生命周期。
 * 上层（store / 组件）只拿到接口，不知道底层是 IndexedDB 还是别的。
 */

export const repos: Repositories = createRepositories();
export const clock: Clock = systemClock;
export const undoService = new UndoService(clock);

/*
 * 账号与权益装配（本地优先：全部端点都是本机实现，零网络请求）。
 *
 * - `LocalAuthGateway`：验证码登录（本地模拟短信/邮件）+ 本机账号；
 * - `LocalEntitlementGateway`：权益快照读 Dexie（本地即真相源）；
 * - `LocalPurchaseGateway`：模拟支付的开通 / 续费 / 恢复购买；
 * - `SecureTokenStore`：token 进 Capacitor Preferences（原生）/ localStorage（Web），
 *   AES-GCM 加密落盘。
 *
 * 接 WorkBuddy 云服务 / 真实支付时，只换这四个 platform 实现，业务零改动。
 */
export const authGateway = new LocalAuthGateway(repos.account);
export const entitlementGateway = new LocalEntitlementGateway(repos.entitlements, clock);
export const purchaseGateway = new LocalPurchaseGateway(repos.entitlements, clock);
export const tokenStore = new SecureTokenStore();
export const authService = new AuthService(authGateway, tokenStore, repos.account, clock);

/*
 * AI 模块装配（本地优先：用户自带 API，无后端）。
 *
 * - `SecureAiKeyStore`：API Key 走 AES-GCM 信封安全存储（与 token 同等级）；
 * - `aiService`：纯逻辑服务，网关通过 `createAiGateway` 注入（第二阶段挂真实实现）。
 * 业务层只认识 `aiService`，不认识具体厂商，换接入方式零改动。
 */
export const aiKeyStore = new SecureAiKeyStore();
export const aiService = new AiService(repos, aiKeyStore, clock, createAiGateway);

type ErrorHandler = (error: unknown) => void;

const errorHandlers = new Set<ErrorHandler>();

/** 注册全局错误处理器（UI 用它弹提示） */
export function onError(handler: ErrorHandler): () => void {
  errorHandlers.add(handler);
  return () => errorHandlers.delete(handler);
}

function emitError(error: unknown): void {
  const appError = toAppError(error);
  for (const handler of errorHandlers) handler(appError);
}

export const persistence = new PersistenceService(repos, {
  onError: emitError,
});

let lifecycleBound = false;

/**
 * 绑定页面生命周期：切后台 / 关闭前强制落盘。
 *
 * 这是「零丢失」的关键 —— IndexedDB 的异步事务在页面被回收时可能来不及提交，
 * 所以 visibilitychange 与 pagehide 两个时机都要兜。
 */
export function bindLifecycle(): () => void {
  if (lifecycleBound) return () => undefined;
  lifecycleBound = true;

  const flush = () => {
    void persistence.flush('lifecycle');
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  addEventListener('visibilitychange', onVisibilityChange);
  addEventListener('pagehide', flush);

  return () => {
    removeEventListener('visibilitychange', onVisibilityChange);
    removeEventListener('pagehide', flush);
    lifecycleBound = false;
  };
}

/**
 * 启动时清理超过 7 天的软删记录。
 *
 * 🔴 开启同步后多了一条约束：**只清理「删除动作已经推上云」的 tombstone**。
 * 物理删掉一条还没同步出去的删除记录，云端永远不知道它删过，
 * 下一轮同步时对端那条「还活着」的行会被当成新数据推回来 —— 删除被复活。
 * 代价是清理最多推迟到下一次成功同步，这比复活数据划算得多。
 */
export async function purgeExpiredSoftDeletes(): Promise<void> {
  try {
    const cutoff = clock.now() - PURGE_AFTER_MS;
    const state = await repos.syncState.get();
    // 未开启同步（userId 为空）时传 null，按老规则全清 —— 没有对端就谈不上复活
    const syncedThrough =
      state.userId !== null ? toLocalTime(state.lastPushedAt, state.serverTimeOffset) : null;

    const purgeable: unknown[] = [
      repos.items,
      repos.tasks,
      repos.timeSlots,
      repos.inspirations,
    ];
    for (const repo of purgeable) {
      const candidate = repo as {
        purgeExpired?: (cutoff: number, syncedThrough: number | null) => Promise<number>;
      };
      if (typeof candidate.purgeExpired === 'function') {
        await candidate.purgeExpired(cutoff, syncedThrough);
      }
    }
    // 清理孤儿图片：所属条目已不存在（被物理清理）的附件一并删除。
    // 传 items 表**全部** id（含软删未到期），保证「还能撤销」的条目图片不被误删。
    const existingItemIds = new Set(await repos.items.listAllIds());
    await repos.itemImages.purgeOrphans(existingItemIds);
    // 任务图片按 tasks 表判定存活（两张表互不干涉，不能混用同一个 id 集合）
    const existingTaskIds = new Set((await repos.tasks.listAll()).map((t) => t.id));
    await repos.taskImages.purgeOrphans(existingTaskIds);
    // 定住完成记录：模板被物理清理后，其完成记录即成孤儿，一并删除。
    // 传 tasks 表**全部** id（含软删未到期），保证「还能撤销」的模板完成记录不被误删。
    await repos.pinCompletions.purgeOrphans(existingTaskIds);
  } catch (error) {
    // 清理失败不影响启动，静默即可
    emitError(error);
  }
}

export { emitError };
