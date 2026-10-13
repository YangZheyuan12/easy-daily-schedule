import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { persistence } from '@/store/bootstrap';
import { useThemeStore } from '@/theme/useThemeStore';
import type { ThemeId } from '@/theme/themes';

/**
 * 原生桥接：**只在 Capacitor 容器内生效**，浏览器里是彻底的空操作。
 *
 * 为什么要单独一个文件、且只被 `main.tsx` import：
 * - `src/domain/`、`src/services/` 有红线禁止碰浏览器 / 原生 API，不能放那儿；
 * - `@capacitor/*` 在 vitest 的 node 环境里加载有风险，所以**不能**被
 *   `store/` 或任何会被测试 import 的模块牵连进来 —— 只有 `main.tsx` 在链路最末端，
 *   测试永远不会走到它。
 *
 * 全部调用都用 `Capacitor.isNativePlatform()` 兜住，Web 构建引入它零副作用。
 */

/**
 * 主题 → 状态栏文字色。
 *
 * ⚠️ Capacitor 的命名是反直觉的：
 * `Style.Dark` = 「深色底用」→ 浅色文字；`Style.Light` = 「浅色底用」→ 深色文字。
 */
function statusBarStyleFor(theme: ThemeId): Style {
  return theme === 'nocturne' ? Style.Dark : Style.Light;
}

/**
 * 绑定原生能力，返回清理函数（HMR 卸载时用到）。
 *
 * 三件事：
 * 1. **切后台强制落盘**。iOS 的 WKWebView 在 App 进后台时**不保证**触发
 *    `visibilitychange` / `pagehide`（`src/store/bootstrap.ts` 里那两个监听可能等不到），
 *    一旦被系统回收就会丢掉防抖窗口里的编辑。这里补 `appStateChange`。
 * 2. **状态栏配色跟随主题**，否则深色主题下状态栏文字会看不清。
 * 3. 去掉 iOS 键盘上方的「完成」工具条 —— 抽屉里本来就有自己的保存按钮。
 */
export function setupNativeBridge(): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  const cleanups: Array<() => void> = [];

  void App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) void persistence.flush('lifecycle');
  })
    .then((handle) => {
      cleanups.push(() => void handle.remove());
    })
    .catch(() => undefined);

  void StatusBar.setStyle({ style: statusBarStyleFor(useThemeStore.getState().theme) }).catch(
    () => undefined,
  );
  cleanups.push(
    useThemeStore.subscribe((state) => {
      void StatusBar.setStyle({ style: statusBarStyleFor(state.theme) }).catch(() => undefined);
    }),
  );

  void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);

  return () => {
    for (const fn of cleanups) fn();
  };
}
