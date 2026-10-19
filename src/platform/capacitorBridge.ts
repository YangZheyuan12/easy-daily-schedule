import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { persistence } from '@/store/bootstrap';
import { useBackupStore } from '@/store/useBackupStore';
import { useUiStore } from '@/store/useUiStore';
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
    if (!isActive) {
      /*
        顺序不能反：**先把防抖窗口里的编辑落进 IndexedDB，再写快照**。
        反过来的话，快照里缺的正是「用户最后那几下编辑」—— 而这恰恰是最想保住的部分。
      */
      void persistence
        .flush('lifecycle')
        .then(() => useBackupStore.getState().writeSnapshot())
        .catch(() => undefined);
    }
  })
    .then((handle) => {
      cleanups.push(() => void handle.remove());
    })
    .catch(() => undefined);

  /*
    启动自检（仅 iOS 实现）：本地库空了、而沙盒里还留着快照 —— 多半是 WKWebView 的
    站点数据被系统回收了。这里**只提示、不自动恢复**：自动把空库换成旧快照，万一用户
    是主动清空数据的，就变成了「强行回滚」。恢复必须由用户点。
  */
  void useBackupStore
    .getState()
    .checkSnapshotRecovery()
    .then((message) => {
      if (message) useUiStore.getState().pushToast(message);
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

  /*
    iOS 键盘高度：原生事件报的是**屏幕上的真实高度**，比从两个视口高度反推可靠。
    `Keyboard.resize = 'native'` 下 WKWebView 会同时压缩布局视口与 visual viewport，
    前端常见的「innerHeight − vv.height」判据在 iOS 上可能恒为 0，键盘弹起了却检测不到。

    只把高度写进 CSS 变量，**不碰 React 状态**：`useKeyboardAvoid` / `useKeyboardVisible`
    读这个变量做判据。网页端与 Android 上没有这个变量（读到 0），行为与以前完全一致 ——
    Android 已有的双判据逻辑经过验证，没必要为了「统一」去冒回归风险。
  */
  if (Capacitor.getPlatform() === 'ios') {
    void Keyboard.addListener('keyboardDidShow', (info) => {
      document.documentElement.style.setProperty(
        '--keyboard-native-height',
        `${info.keyboardHeight}px`,
      );
    })
      .then((handle) => {
        cleanups.push(() => {
          void handle.remove();
          document.documentElement.style.removeProperty('--keyboard-native-height');
        });
      })
      .catch(() => undefined);

    void Keyboard.addListener('keyboardDidHide', () => {
      document.documentElement.style.setProperty('--keyboard-native-height', '0px');
    })
      .then((handle) => {
        cleanups.push(() => void handle.remove());
      })
      .catch(() => undefined);
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}
