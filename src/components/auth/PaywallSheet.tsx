import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import { useEntitlementStore } from '@/store/useEntitlementStore';
import { useUiStore } from '@/store/useUiStore';
import { clock } from '@/store/bootstrap';
import { evaluateGrace, isFeatureUnlocked } from '@/services/entitlementService';
import { PRO_PRICE_LABEL } from '@/platform/auth/localPurchaseGateway';
import { formatShortDate, toDateKey } from '@/utils/date';
import type { FeatureKey } from '@/domain/types';

/**
 * Pro 升级弹层（会员墙）。
 *
 * 卖点清单来自 `entitlementService.PLAN_MATRIX` 覆盖的付费点
 * （当前：高级导出 / 去广告）—— 加付费点只需改那里，本弹层自动多一行。
 *
 * 🔴 购买走 `LocalPurchaseGateway`（本地模拟支付，不产生真实扣费）。
 * 接 iOS 内购 / 微信支付时只换网关实现，本文件零改动。
 */

/** 付费点的展示文案（与 PLAN_MATRIX 的 key 一一对应） */
const FEATURE_COPY: Record<FeatureKey, { name: string; desc: string }> = {
  advancedExport: { name: '高级导出', desc: '更多备份格式与分享模板' },
  adFree: { name: '去除广告', desc: '全程无广告干扰' },
};

const FEATURE_ORDER: FeatureKey[] = ['advancedExport', 'adFree'];

export function PaywallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entitlement = useEntitlementStore((s) => s.entitlement);
  const loading = useEntitlementStore((s) => s.loading);
  const purchase = useEntitlementStore((s) => s.purchase);
  const restore = useEntitlementStore((s) => s.restore);
  const pushToast = useUiStore((s) => s.pushToast);
  const [restoring, setRestoring] = useState(false);

  // 每次渲染按当前时间过一遍宽限 / 到期判定，保证「已过期」即时反映
  const current = evaluateGrace(entitlement, clock.now());
  const proActive = isFeatureUnlocked('advancedExport', current);
  const expired = current.state === 'expired';

  const handlePurchase = async () => {
    try {
      await purchase('pro');
      pushToast(expired ? '已续费（本地模拟支付）' : '已开通 Pro（本地模拟支付）');
      onClose();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '开通失败，请稍后再试', 'error');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restore();
      pushToast('已恢复购买');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '恢复购买失败', 'error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="会员权益">
      <div className="pt-4 space-y-4">
        {/* 当前权益状态 */}
        <div className="flex items-center justify-between">
          <span className="text-body text-ink">当前权益</span>
          <span
            className={
              proActive
                ? 'text-lead font-semibold text-accent'
                : 'text-lead font-semibold text-ink-faint'
            }
          >
            {proActive ? 'Pro' : '免费版'}
          </span>
        </div>
        {proActive && current.expireAt !== null && (
          <p className="-mt-2 text-caption text-ink-faint">
            有效期至 {formatShortDate(toDateKey(new Date(current.expireAt)))}
            {current.state === 'grace' ? '（宽限期中，请尽快续费）' : ''}
          </p>
        )}
        {expired && (
          <p className="-mt-2 text-caption text-heart">权益已过期，付费功能已锁定（数据不受影响）</p>
        )}

        {/* 权益对比 */}
        <div className="rounded-card border border-surface-line overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface-line bg-surface-sunken">
            <span className="text-caption text-ink-faint">功能</span>
            <span className="flex items-center gap-6 text-caption text-ink-faint">
              <span className="w-8 text-center">免费</span>
              <span className="w-8 text-center text-accent font-semibold">Pro</span>
            </span>
          </div>
          {FEATURE_ORDER.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between px-3 py-2.5 border-b border-surface-line last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block text-body text-ink">{FEATURE_COPY[key].name}</span>
                <span className="block text-caption text-ink-faint">{FEATURE_COPY[key].desc}</span>
              </span>
              <span className="flex items-center gap-6 shrink-0">
                <span className="w-8 flex justify-center text-ink-faint">
                  <Icon name="close" size={14} />
                </span>
                <span className="w-8 flex justify-center text-accent">
                  <Icon name="check" size={16} strokeWidth={2.6} />
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* 开通 / 续费 */}
        <div className="rounded-card border border-accent/40 bg-accent-soft px-3.5 py-3 space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-lead font-semibold text-ink">Pro 会员</span>
            <span className="text-lead font-semibold text-accent">{PRO_PRICE_LABEL}</span>
          </div>
          <p className="text-caption leading-5 text-ink-muted">
            到期只锁付费功能，绝不删除你的任何数据；可随时在本页恢复购买。
          </p>
          <button
            type="button"
            onClick={() => void handlePurchase()}
            disabled={loading}
            className="press w-full min-h-tap rounded-card bg-accent text-lead text-accent-fg disabled:opacity-50"
          >
            {loading ? '处理中…' : expired ? '续费 Pro' : proActive ? '续费 Pro' : '立即开通'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleRestore()}
          disabled={restoring}
          className="press w-full min-h-[38px] rounded-card text-body text-ink-faint disabled:opacity-50"
        >
          {restoring ? '恢复中…' : '恢复购买'}
        </button>

        {/* 本地模拟支付声明（接真实支付后移除本块） */}
        <p className="text-caption leading-5 text-ink-faint">
          🔔 当前为本地模拟支付：不会产生任何真实扣费。正式版本将接入应用内购买
          （iOS App Store / 微信支付）后真实收费，本机已开通的权益在过渡期内仍然有效。
        </p>
      </div>
    </Sheet>
  );
}
