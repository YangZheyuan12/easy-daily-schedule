/**
 * 检查更新的「纯逻辑」：版本号解析与比对（零浏览器 API）。
 *
 * 为什么拆在这里：`src/services/` 是迁微信小程序时要 100% 复用的内核，
 * 一旦碰到 fetch / window 就废了。所以本文件只做「字符串 ↔ 版本号」和
 * 「谁新谁旧」，真正拉网络在 `src/platform/updateBridge.ts`。
 *
 * 版本号解析规则（与 CI 的 Release body 约定配套）：
 * - Release body 首行固定写 `version: <x.y.z>`，这是**唯一权威来源**；
 * - 若 body 里没有这一行（老 Release），回退到 `tag_name` 里的版本号；
 * - 都拿不到 → 判定「没有可解析的版本号」，不误报更新。
 */

/** 语义版本号：`1` / `1.2` / `1.2.3` / `1.2.3.4`（每段纯数字，最多四段） */
const VERSION_PATTERN = String.raw`\d+(?:\.\d+){0,3}`;

/** 匹配形如 `1.2` 或 `v1.2.3` 的版本号（用于从 tag / 版本串里抠数字） */
const VERSION_RE = new RegExp(`(${VERSION_PATTERN})`);

/** 匹配「一行 `version: x.y.z`」——Release body 里的权威版本行（支持中文冒号与 v 前缀） */
const VERSION_LINE_RE = new RegExp(String.raw`^\s*version\s*[:：]\s*v?(${VERSION_PATTERN})`, 'im');

/** 检查更新结果 */
export interface UpdateCheck {
  /** 是否有比当前更新的版本 */
  hasUpdate: boolean;
  /** 解析出来的最新版本号；解析不到为 null */
  latestVersion: string | null;
}

/** 从任意字符串里抠出第一个形如 x.y.z 的版本号；没有则返回 null */
export function parseVersion(input: string): string | null {
  if (!input) return null;
  const match = input.match(VERSION_RE);
  return match ? match[1] : null;
}

/**
 * 从 Release 的 body + tag_name 里解析最新版本号。
 * body 里的 `version:` 行优先，其次才是 tag_name。
 */
export function extractReleaseVersion(body: string, tagName: string): string | null {
  const lineMatch = (body ?? '').match(VERSION_LINE_RE);
  if (lineMatch) return lineMatch[1];
  return parseVersion(tagName ?? '');
}

/**
 * 比较两个版本号：a > b 返回 1，a < b 返回 -1，相等 / 无法解析返回 0。
 * 逐段比较数字，缺的段按 0 算（`1.2` vs `1.2.0` 视为相等）。
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  const aParts = left.split('.').map(Number);
  const bParts = right.split('.').map(Number);
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

/**
 * 汇总判断：给定最新 Release 的 body / tag_name 与当前版本，返回是否有更新。
 */
export function evaluateUpdate(
  body: string,
  tagName: string,
  currentVersion: string,
): UpdateCheck {
  const latestVersion = extractReleaseVersion(body, tagName);
  return {
    hasUpdate: latestVersion !== null && compareVersions(latestVersion, currentVersion) > 0,
    latestVersion,
  };
}
