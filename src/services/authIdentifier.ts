/**
 * 登录标识符（手机号 / 邮箱）纯校验与脱敏（零浏览器 API，可单测）。
 *
 * UI 与 `platform/auth` 网关共用同一套判定，避免「按钮说格式不对、
 * 网关却说可以登录」的两套口径。
 */

export type IdentifierKind = 'phone' | 'email';

const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 识别标识符形态；无法识别返回 null */
export function detectIdentifier(value: string): IdentifierKind | null {
  const trimmed = value.trim();
  if (PHONE_RE.test(trimmed)) return 'phone';
  if (EMAIL_RE.test(trimmed)) return 'email';
  return null;
}

export function isValidIdentifier(value: string): boolean {
  return detectIdentifier(value) !== null;
}

/** 脱敏展示：138****8888 / z***@qq.com */
export function maskIdentifier(value: string): string {
  const trimmed = value.trim();
  if (detectIdentifier(trimmed) === 'phone') {
    return `${trimmed.slice(0, 3)}****${trimmed.slice(7)}`;
  }
  const at = trimmed.indexOf('@');
  if (at <= 0) return trimmed;
  const name = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  const head = name.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(1, name.length - 1))}${domain}`;
}
