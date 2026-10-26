/**
 * 检查更新的「网络」侧：拉 GitHub 最新 Release + 打开下载页。
 *
 * 与 `fileBridge.ts` 同理：这里才是允许碰浏览器 API 的地方。
 * 纯的版本解析 / 比对逻辑在 `services/updateService.ts`，本文件只负责
 * 「把字节取回来」和「把用户带到下载页」，一个字节的业务判断都不做。
 */

/** GitHub 最新 Release API（仓库公开，可匿名访问） */
const RELEASE_API_URL =
  'https://api.github.com/repos/YangZheyuan12/easy-daily-schedule/releases/latest';

/** 拉取超时：检查更新是用户点一下的即时动作，卡 10 秒就该放弃 */
const FETCH_TIMEOUT_MS = 10_000;

/** 最新 Release 的原始字段（版本号解析不在这里做） */
export interface LatestRelease {
  tagName: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
}

/**
 * 拉取最新 Release。任何失败（网络 / 超时 / 限流 / 还没有任何 Release）
 * 都返回 `null` —— 检查更新失败不该让「我的」页崩掉，交给 UI 提示即可。
 */
export async function fetchLatestRelease(): Promise<LatestRelease | null> {
  // 小工具容器禁止联网（fetch）与 window.open，本函数整体降级为空操作
  if (import.meta.env.VITE_MINITOOL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      tag_name?: unknown;
      body?: unknown;
      html_url?: unknown;
      published_at?: unknown;
    };
    return {
      tagName: typeof data.tag_name === 'string' ? data.tag_name : '',
      body: typeof data.body === 'string' ? data.body : '',
      htmlUrl: typeof data.html_url === 'string' ? data.html_url : '',
      publishedAt: typeof data.published_at === 'string' ? data.published_at : '',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 打开下载链接。
 *
 * web 与原生壳统一走 `window.open(..., '_blank')`：Capacitor 的 Android
 * `BridgeWebChromeClient` 会把 `_blank` 的 window.open 转成系统浏览器打开，
 * 不会把 App 的 WebView 带离应用。不新增 `@capacitor/browser` 依赖。
 */
export function openExternalUrl(url: string): void {
  if (!url) return;
  if (import.meta.env.VITE_MINITOOL) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
