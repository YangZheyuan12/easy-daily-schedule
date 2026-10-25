import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { useAuthStore } from '@/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { isValidIdentifier } from '@/services/authIdentifier';

/** 重发冷却（秒） */
const COOLDOWN_SEC = 60;

/**
 * 登录 / 注册弹层（验证码登录）。
 *
 * 手机号或邮箱 + 验证码；未注册的标识符首次登录即自动建号。
 * 本应用没有真实短信 / 邮件服务，验证码是**本地模拟**的：
 * 网关把 6 位码回传进来（`devCode`），界面直接展示 —— 这不是Bug，
 * 是本地账号方案的既定行为（接真实消息服务后该展示自动消失）。
 */
export function LoginSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const requestCode = useAuthStore((s) => s.requestCode);
  const signIn = useAuthStore((s) => s.signIn);

  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 关闭时清空，避免下次打开残留上一次的输入
  useEffect(() => {
    if (open) return;
    setIdentifier('');
    setCode('');
    setDevCode(null);
    setCooldown(0);
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const startCooldown = () => {
    setCooldown(COOLDOWN_SEC);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const handleRequestCode = async () => {
    if (busy || cooldown > 0) return;
    if (!isValidIdentifier(identifier)) {
      pushToast('请输入正确的手机号或邮箱', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await requestCode(identifier);
      setDevCode(result.devCode ?? null);
      startCooldown();
      pushToast('验证码已发送');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '获取验证码失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async () => {
    if (busy) return;
    if (!isValidIdentifier(identifier)) {
      pushToast('请输入正确的手机号或邮箱', 'error');
      return;
    }
    if (code.trim().length === 0) {
      pushToast('请输入验证码', 'error');
      return;
    }
    setBusy(true);
    try {
      await signIn({ identifier, code });
      pushToast('登录成功');
      onClose();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '登录失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const canSignIn = isValidIdentifier(identifier) && code.trim().length > 0 && !busy;

  return (
    <Sheet open={open} onClose={onClose} title="登录 / 注册">
      <div className="pt-4 space-y-4">
        <p className="text-caption leading-5 text-ink-faint">
          使用手机号或邮箱验证码登录。未注册的账号将自动创建；账号信息只存本机，不上传。
        </p>

        <label className="block space-y-1.5">
          <span className="text-body text-ink">手机号 / 邮箱</span>
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="如 13812345678 或 name@qq.com"
            inputMode="email"
            autoComplete="off"
            className="w-full bg-surface-sunken rounded-sm border border-surface-line px-3 py-2.5 text-body text-ink outline-none placeholder:text-ink-faint"
          />
        </label>

        <div className="flex items-end gap-2">
          <label className="flex-1 space-y-1.5">
            <span className="text-body text-ink">验证码</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6 位验证码"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              className="w-full bg-surface-sunken rounded-sm border border-surface-line px-3 py-2.5 text-body text-ink outline-none placeholder:text-ink-faint tabular-nums"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleRequestCode()}
            disabled={busy || cooldown > 0}
            className="press shrink-0 min-h-[42px] px-4 rounded-card border border-surface-line text-body text-ink disabled:opacity-50"
          >
            {cooldown > 0 ? `重新获取（${cooldown}s）` : '获取验证码'}
          </button>
        </div>

        {devCode && (
          <div className="rounded-card border border-dashed border-accent/50 bg-accent-soft px-3 py-2.5">
            <p className="text-caption leading-5 text-ink-muted">
              本地模拟验证码：
              <span className="text-lead font-semibold text-accent tabular-nums">{devCode}</span>
            </p>
            <p className="text-caption leading-5 text-ink-faint">
              本应用未接入短信 / 邮件服务，验证码在此直接展示，5 分钟内有效。
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleSignIn()}
          disabled={!canSignIn}
          className="press w-full min-h-tap rounded-card bg-accent text-lead text-accent-fg disabled:opacity-50"
        >
          {busy ? '处理中…' : '登录 / 注册'}
        </button>
      </div>
    </Sheet>
  );
}
