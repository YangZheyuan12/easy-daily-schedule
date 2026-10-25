import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Sheet';
import { LoginSheet } from '@/components/auth/LoginSheet';
import { PaywallSheet } from '@/components/auth/PaywallSheet';
import { useAuthStore } from '@/store/useAuthStore';
import { useEntitlementStore } from '@/store/useEntitlementStore';
import { clock } from '@/store/bootstrap';
import { evaluateGrace, isFeatureUnlocked } from '@/services/entitlementService';
import { maskIdentifier } from '@/services/authIdentifier';
import { formatShortDate, toDateKey } from '@/utils/date';

/**
 * 「账号与会员」卡（我的页）。
 *
 * 账号是**可选叠加层**：不登录也能用全部本地功能（本地优先红线）；
 * 登录的意义在于管理会员权益，以及为将来的多端同步做准备。
 * 会员权益是**本机购买记录**：未登录时已开通的 Pro 同样生效。
 */
export function AccountCard() {
  const status = useAuthStore((s) => s.status);
  const account = useAuthStore((s) => s.account);
  const signOut = useAuthStore((s) => s.signOut);
  const entitlement = useEntitlementStore((s) => s.entitlement);

  const [loginOpen, setLoginOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const current = evaluateGrace(entitlement, clock.now());
  const proActive = isFeatureUnlocked('advancedExport', current);
  const identifier = account ? (account.phone ?? account.email) : null;

  const planLabel = proActive
    ? `Pro${current.expireAt !== null ? ` · 至 ${formatShortDate(toDateKey(new Date(current.expireAt)))}` : ''}`
    : '免费版';

  const handleSignOut = async () => {
    setConfirmSignOut(false);
    await signOut();
  };

  return (
    <div className="space-y-1">
      {status === 'authenticated' && identifier ? (
        <div className="flex items-center justify-between gap-3 min-h-[44px]">
          <span className="flex items-center gap-2 min-w-0">
            <Icon name="user" size={16} className="shrink-0 text-ink-faint" />
            <span className="text-body text-ink truncate">{maskIdentifier(identifier)}</span>
          </span>
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="press shrink-0 text-caption text-ink-faint px-2 min-h-[30px] rounded-pill"
          >
            退出登录
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLoginOpen(true)}
          className="press w-full flex items-center justify-between gap-3 min-h-[44px] text-left"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Icon name="user" size={16} className="shrink-0 text-ink-faint" />
            <span className="text-body text-ink">登录 / 注册</span>
          </span>
          <span className="flex items-center gap-1 shrink-0 text-caption text-ink-faint">
            验证码登录
            <Icon name="chevron-right" size={14} />
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => setPaywallOpen(true)}
        className="press w-full flex items-center justify-between gap-3 min-h-[44px] text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon name="star" size={16} className="shrink-0 text-ink-faint" />
          <span className="text-body text-ink">会员权益</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <span className={proActive ? 'text-caption font-medium text-accent' : 'text-caption text-ink-faint'}>
            {planLabel}
          </span>
          {!proActive && (
            <span className="text-caption text-accent border border-accent/50 rounded-pill px-1.5 py-0.5">
              升级
            </span>
          )}
          <Icon name="chevron-right" size={14} className="text-ink-faint" />
        </span>
      </button>

      <p className="text-caption leading-5 text-ink-faint pt-1">
        账号信息只存本机；不登录也能使用全部本地功能。会员权益为本机购买记录，
        卸载 App 后需重新开通（请定期导出备份文件）。
      </p>

      <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} />
      <PaywallSheet open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      <ConfirmDialog
        open={confirmSignOut}
        title="退出登录"
        description="只会清除登录状态；业务数据与本机会员权益不受影响。确定退出吗？"
        confirmText="退出"
        cancelText="取消"
        onConfirm={() => void handleSignOut()}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}
