import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 配置（路线 B：原生壳打包）。
 *
 * 🔴 iOS 的 `scheme` 必须在这里**显式钉死**成 `'App'`（Capacitor 8 CLI 的默认值）。
 *
 * 为什么不能只在 json 里改：`ios/App/App/capacitor.config.json` 是 `cap sync` 的
 * **生成物**，ts 里不写就会在每次 sync 时被默认值覆盖。
 *
 * 为什么不能用 https：WKWebView **不允许**为内置 scheme（`http` / `https` / `file`）
 * 注册 URLSchemeHandler —— Capacitor 的 `CAPBridgeViewController` 直接调
 * `setURLSchemeHandler(_:forURLScheme:)`，没有任何兜底，传 https 会在真机上
 * 抛异常、启动即崩。本项目生成物里曾残留过 `"scheme": "https"`，这次一并纠正。
 *
 * 为什么抄 CLI 的默认值 'App'：CLI 生成 `packageClassList` 等配置时用的就是它，
 * 显式写成同一个值，才不会出现「ts 里 capacitor、sync 后变 App」的漂移。
 * 新 origin 是 `app://localhost`；iOS 端从未真正运行过（Windows 无法构建），
 * 没有历史数据需要迁移。
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
  ios: {
    /** 见文件头注释：https 会让 WKWebView 直接崩，必须用 CLI 默认的 'App' */
    scheme: 'App',
  },
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
