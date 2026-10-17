import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * 当前 App 版本号的读取。
 *
 * 原生端用 `App.getInfo().version`（即 android/app/build.gradle 的 versionName，
 * 如 "1.2"）；Web 端没有原生壳，返回一个兜底常量（与 package.json 的 version 对齐）。
 *
 * 与 `capacitorBridge.ts` 同一理由：`@capacitor/*` 只能出现在 `src/platform/`，
 * 且只被 UI 层 import（测试不经过 main.tsx，不会在 node 里加载 Capacitor）。
 */

/** Web 兜底版本号：与 package.json 的 `version` 字段保持一致 */
export const WEB_FALLBACK_VERSION = '0.1.0';

/** 读取当前版本号（原生 = versionName，Web = 兜底常量） */
export async function getCurrentVersion(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return WEB_FALLBACK_VERSION;
  try {
    const info = await App.getInfo();
    return info.version || WEB_FALLBACK_VERSION;
  } catch {
    return WEB_FALLBACK_VERSION;
  }
}
