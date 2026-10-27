import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * 原生「返回」拦截助手。
 *
 * Android 的**侧边滑动返回**（边缘手势）与硬件返回键，在 Capacitor 原生壳里都触发
 * `App` 的 `backButton` 事件。注册监听并 `preventDefault()` 后，原本「关闭 App / 默认返回」
 * 的动作被拦截，改由我们自定义语义（例如关闭全屏浮层）。
 *
 * ⚠️ 只在原生壳生效：`isNativePlatform()` 兜住，Web / PWA 构建为零副作用空操作。
 *    与 `capacitorBridge.ts` 同理，全部 `@capacitor/*` 调用集中在此，UI 组件只调本文件。
 *
 * 用法：
 *   const unsubscribe = onBackButton(() => { ... });
 *   // 之后 unsubscribe();
 */

/** 是否运行在 Capacitor 原生壳（Android / iOS）。 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 注册系统返回监听。
 *
 * 官方约定：**注册 backButton 监听本身就会禁用「默认返回行为」**（默认会退出 App /
 * 走网页回退），完全由回调决定做什么。因此这里只需注册 + 在回调里写自定义语义；
 * 取消订阅后默认行为自动恢复（再按一次才会退出 App，符合「先关浮层、再退 App」的预期）。
 *
 * 返回取消订阅函数（在 Web 构建下立即返回 no-op）。
 */
export function onBackButton(handler: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  const cleanups: Array<() => void> = [];
  void App.addListener('backButton', () => {
    handler();
  })
    .then((handle) => {
      cleanups.push(() => void handle.remove());
    })
    .catch(() => undefined);

  return () => {
    for (const fn of cleanups) fn();
  };
}
