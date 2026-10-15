import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 配置（路线 B：原生壳打包）。
 *
 * ⚠️ 关于 iOS 的 `server.iosScheme`（默认 `capacitor`）——刻意**不改**：
 * 网上能查到的「把 iosScheme 改成 ionic / https」是**从 Cordova 迁移**场景的处方
 * （origin 从 `ionic://` 变成 `capacitor://` 会导致旧数据读不到）。本项目是全新 App，
 * 没有历史 origin，改 scheme 没有收益；且 WKWebView **不允许**接管 `http`/`https`，
 * 硬配会直接起不来。origin 自始至终是 `capacitor://`，数据是连续的。
 *
 * ⚠️ 真正要防的是另一件事：**iOS 会回收 WebView 的网站数据**（存储吃紧时 IndexedDB /
 * localStorage 可能被清空）。本项目数据 100% 在本地且目前没有导出能力，
 * 所以「数据导出 / 导入」应尽早排期 —— 见 docs/MOBILE-APP-MIGRATION.md §待办。
 */
const config: CapacitorConfig = {
  appId: 'com.yangzheyuan.dailyschedule',
  appName: '日程表',
  /** 与 `vite build` 的产物目录对齐；改 vite 的 outDir 要同步改这里 */
  webDir: 'dist',
  plugins: {
    Keyboard: {
      /**
       * `native`：让 WebView 自己压缩视口，`useKeyboardAvoid` 的 visualViewport
       * 高度差才拿得到值。改成 `'body'` / `'none'` 会让键盘避让失效。
       *
       * ⚠️ 副作用（Android 尤其明显）：`native` 走 `adjustResize`，**布局视口**
       * 会被一起压缩，于是 `fixed bottom-0` 的底部导航栏并不钉在屏幕底，
       * 而是浮到键盘上面挡住正在输入的内容。所以 `BottomTabBar` 会在键盘弹起时
       * 整条收下去（`useKeyboardVisible`）—— 不要试图靠改这个字段解决，
       * 改了键盘避让就失效了。
       */
      resize: 'native',
    },
  },
};

export default config;
