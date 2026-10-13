# 从「网页」到「手机 App」——现状体检与改造路线评估

> 采集时间：2026-10-14（代码快照：`src/` 131 个文件，生产代码约 8.8k 行 TS/TSX + 575 行 CSS，
> 测试约 6.9k 行；`dist/` 产物 396 KB，其中 JS 369 KB + CSS 28 KB）
>
> 本文只做**评估与改动清单**，不改任何代码。

---

## 一、先回答问题：它现在是什么？

**它是一个移动端优先的网页（H5 / Web App），不是 App。**

判断依据（都是可以直接验的硬事实）：

| 证据 | 说明 |
| --- | --- |
| 根目录有 `index.html` + `vite.config.ts` | 标准 Vite 前端工程，产出的是 `dist/index.html` + 静态资源 |
| `package.json` 里 `dev` = `vite`、`build` = `vite build` | 产物是**静态托管**用的文件夹，不是 `.apk` / `.ipa` |
| `src/main.tsx` 用 `createRoot(document.getElementById('root'))` | 挂载在浏览器 DOM 上，这是网页的标志 |
| 路由用 `react-router-dom` 的 **HashRouter** | 注释里写明「静态托管下 BrowserRouter 刷新会 404」 |
| 数据存 **IndexedDB（Dexie）** + 设置存 **localStorage** | 浏览器专属存储，原生 App 里没有 |
| `dist/` 只有 `index.html` + 1 个 JS + 1 个 CSS | 没有原生工程（无 `android/`、`ios/`、`project.config.json`） |
| 没有任何 PWA 配置 | 全库搜不到 `serviceWorker` / `manifest.json`，无 `public/` 目录 |

补充一句：它**没有后端**。所有数据在浏览器本地，这也是它能被低成本搬上手机的前提。

**「手机上能用」的最低门槛其实已经达到了**：`vite.config.ts` 里 `server.host = true`，
手机和电脑在同一局域网就能直接访问 `http://<电脑IP>:5173` 真机调试；
`npm run build` 出来的 `dist/` 丢到任意静态托管（GitHub Pages / Vercel / 对象存储）就是一个网址。

---

## 二、好消息：架构早就为「迁移」留好了口子

这个项目的分层不是摆设，是**真在执行的硬红线**（由 `npm run check:layers` 卡口）：

```
UI（components / pages）  ← 唯一碰浏览器 DOM 的地方
   ↓
Store（Zustand）
   ↓
Services / Domain         ← 禁止出现 window / document / localStorage / indexedDB
   ↓
Repositories              ← 唯一允许碰存储 API 的层
```

实测扫描结果（排除 repositories 与测试文件后，全库只有 **8 处** 触碰浏览器 API，见第四节）。
而 `src/domain/ports.ts` 的注释里早就写着：

> 将来迁微信小程序时新增 `WxStorageRepository`，只需替换 `src/repositories/index.ts` 一个装配点，业务代码零改动。

按层拆分的代码量（不含测试）：

| 层 | 行数 | 是否含浏览器 API | 迁移时的处置 |
| --- | --- | --- | --- |
| `domain/` 类型·常量·端口·错误 | 495 | ✅ 零 | **原样复用** |
| `services/` 业务服务（含农历/节气/节日） | 2098 | ✅ 零 | **原样复用** |
| `store/` Zustand 状态 | 985 | ⚠️ 1 处 `visibilitychange` | 改 1 个函数 |
| `utils/` 日期·防抖·数组 | 343 | ✅ 零 | **原样复用** |
| `hooks/` | 216 | ⚠️ 1 处 `visualViewport` | 换实现 |
| `components/` | 2754 | ⚠️ 2 处（Sheet / TimeRuler） | 换实现 |
| `pages/` | 1125 | ❌ 依赖路由 | 需适配 |
| `theme/` | 158 | ⚠️ 1 处 `documentElement` | 换实现 |
| `router/` | 33 | ❌ HashRouter | 换实现 |
| `repositories/` | 618 | ❌ Dexie + localStorage | **整套替换** |
| `styles/index.css` | 575 | — | 大部分可复用 |

**结论：约 3.9k 行（占生产代码 44%）是零浏览器依赖的纯逻辑，可以 100% 搬走不动。**
需要真正重写的是「存储适配器 + 渲染宿主入口 + 少量 DOM 触摸点」，量级在千行以内，不是重写 App。

---

## 三、四条路线对比

| 路线 | 改动量 | 周期（粗估） | 上架/分发 | 能拿到系统通知吗 | 我的评价 |
| --- | --- | --- | --- | --- | --- |
| **A. PWA**（加 manifest + Service Worker） | **最小**，只加文件，业务代码不动 | 1–2 天 | 不用上架，发网址；可「添加到主屏幕」 | ❌ iOS 不支持 Web Push 之外的本地通知 | ⭐ 最快验证，但不是「真 App」 |
| **B. Capacitor 套壳打包**（推荐） | **小**，复用现有 Web 代码 | 1–2 周 | 可出 `.apk` / `.ipa`，能上应用商店 | ✅ 有官方本地通知插件 | ⭐⭐ **最划算** |
| **C. 微信小程序**（Taro 转译） | **中**，渲染层要换 | 3–5 周 | 微信小程序，需 AppID + 审核 | ❌ 订阅消息要服务端，纯本地做不到 | ⭐⭐ 想进微信生态才选 |
| **D. React Native 重写** | **最大**，UI 全部重写 | 6 周+ | 原生双端 | ✅ | ❌ 不推荐，浪费已有 8.8k 行 |

---

## 四、必须改的地方（全库扫描出的真实清单）

以下 9 项是**不管走哪条路线都要面对的差异点**，A 路线基本不用动，B 动 3 项，C 全动。

| # | 位置 | 现在用了什么 | 为什么在 App 里不行 | B（Capacitor） | C（小程序） |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/main.tsx:6` | `document.getElementById('root')` + `createRoot` | 小程序无 DOM | ✅ 不用改（仍是 WebView） | ❌ 换成小程序入口 |
| 2 | `src/repositories/*`（618 行） | Dexie / IndexedDB | 小程序无 IndexedDB | ✅ 不用改（WebView 支持） | ❌ 重写一套 `WxStorageRepository` |
| 3 | `src/repositories/LocalSettingsRepository.ts` | `localStorage` | 同上 | ✅ 不用改 | ❌ 换 `wx.setStorageSync` |
| 4 | `src/router/AppRouter.tsx` | `HashRouter` + `window.history` | 小程序有自己的页面栈 | ✅ 不用改 | ❌ 换 Taro 路由 / `wx.navigateTo` |
| 5 | `src/store/bootstrap.ts:55-64` | `visibilitychange` / `pagehide` 强制落盘 | 小程序是 `onHide` / `onUnload` | ⚠️ 建议加 `@capacitor/app` 监听 | ❌ 换生命周期 |
| 6 | `src/components/ui/Sheet.tsx:57-60` | `document.body.style.overflow` 锁滚动 | 小程序无 `body` | ✅ 不用改 | ❌ 换 `catchtouchmove` / `page-meta` |
| 7 | `src/components/ui/TimeRuler.tsx:182-190` | `window` 上的 `pointermove/up/cancel` | 小程序是 `touch*` 事件 | ✅ 不用改 | ❌ 换 touch 事件 |
| 8 | `src/hooks/useKeyboardAvoid.ts:14-28` | `window.visualViewport` + 写 `--keyboard-offset` | 小程序无 visualViewport | ⚠️ 用 `@capacitor/keyboard` | ❌ 用 `adjust-position` |
| 9 | `src/theme/useApplyTheme.ts:23-35` + `index.html:12-32` | `document.documentElement.dataset.theme` + 内联防闪脚本 | 小程序无 `documentElement` | ✅ 不用改 | ❌ 换 `page-meta` 或根节点 class |

> 顺带一个**已知未修的既有 bug**（`src/hooks/useKeyboardAvoid.ts`）：它把键盘高度写进了
> `--keyboard-offset`，但全仓库没有任何地方消费这个变量**——也就是说键盘避让目前实际没接通。
> 无论走哪条路线都建议顺手修掉。

---

## 五、逐路线展开

### 路线 A：PWA（成本最低，今天就能有「类 App」体验）

**要加的东西**（全部是新增文件，业务代码一行不改）：

- `public/manifest.webmanifest`：`name` / `icons`（192、512）/ `display: "standalone"` / `theme_color`
- `public/icon-192.png`、`icon-512.png`：从 `designs/` 里的概念稿导出
- Service Worker：建议用 `vite-plugin-pwa`（零配置，自动注册 + precache）
- `index.html` 已有 `apple-mobile-web-app-capable`，再补 `apple-touch-icon` 即可

**成本**：约 1–2 天，主要在图标资源和真机联调。

**坑（必须提前知道）**：

- **iOS 上 PWA 没有本地通知**，你现在的「时间块到期提醒」（`src/services/reminderService.ts`
  的应用内横幅）在 App 未打开时**不会响**。这在 iOS 上无法用 PWA 解决。
- iOS 的「添加到主屏幕」入口藏得深，用户教育成本高。
- 数据仍在 IndexedDB，清缓存 / 换设备会丢，没有导出能力（导出是 P1，还没做）。

**适合**：先给自己和家人用，验证产品形态。

---

### 路线 B：Capacitor 打包原生 App（⭐ 推荐）

**原理**：把 `dist/` 塞进一个原生 WebView 壳。你的 React 代码、Tailwind 样式、
IndexedDB 存储**全部原样运行**，只在需要原生能力时调插件。

**要做的**：

```bash
npm i -D @capacitor/cli @capacitor/core
npx cap init "日程表" com.yourcompany.dailyschedule --web-dir dist
npm i @capacitor/android @capacitor/ios
npm run build && npx cap sync
npx cap open android    # 或 npx cap open ios
```

**改动清单**：

| 项 | 处置 |
| --- | --- |
| 业务代码 / 样式 / 存储 | **零改动** |
| `vite.config.ts` | 无需改（Capacitor 直接吃 `dist/`；因为是 HashRouter，本地文件协议也不会 404） |
| 第四节 #5 | 装 `@capacitor/app`，把 `bindLifecycle()` 的 flush 也挂到 `appStateChange` / `pause` |
| 第四节 #8 | 装 `@capacitor/keyboard`，顺手把「键盘避让没接通」这个旧 bug 修掉 |
| 状态栏 / 安全区 | 装 `@capacitor/status-bar`；`env(safe-area-inset-*)` 在 WebView 里仍然生效，现有写法可直接沿用 |
| 系统通知（可选，P2） | 装 `@capacitor/local-notifications`，把应用内提醒升级为真通知 |
| 图标 / 启动图 | 需要一套 Android 各密度图标 + iOS AppIcon，用 `npx capacitor-assets generate` 自动生成 |
| 退出确认（可选） | Android 返回键，用 `@capacitor/app` 的 `backButton` |

**成本**：1–2 周（含真机调试、图标、上架材料）。

**坑**：

- **iOS 构建必须有 macOS + Xcode**；Windows 只能出 Android。若你要 iOS，要么借 Mac，
  要么用 CI（如 GitHub Actions + macOS runner）。
- **iOS 上 IndexedDB 的持久化**历史上出现过被系统回收的案例。建议第二阶段加一份
  `@capacitor/preferences` 或 Filesystem 的**镜像备份 / 导出**，别把鸡蛋全放 IndexedDB。
- **上架门槛（国内尤其注意）**：国内安卓商店现在普遍要 **App 备案（工信部）** + **软件著作权**；
  Google Play 一次性 25 美元；App Store 99 美元/年，且需要隐私清单、审核合规。
  如果只是自己用，**不下架也行**——直接装 `.apk` 就能用，无所谓上架。

**适合**：想要「真正的 App 图标 + 离线 + 通知」，且不打算重写代码。

---

### 路线 C：微信小程序

**为什么改动比 B 大**：小程序**没有 DOM**，React 不能直接跑在里面。必须先上跨端框架把
React/JSX 编译成小程序的 WXML/WXSS —— 主流选择是 **Taro**（uni-app 是 Vue 生态，对你不合适）。

**改动清单**：

| 项 | 处置 | 量级 |
| --- | --- | --- |
| 构建体系 | Vite → Taro CLI（保留 Vite 编译可选）；新增 `project.config.json`、`app.config.ts` | 中 |
| 第四节 #1 | `main.tsx` → `app.ts` + 页面入口 | 小 |
| 第四节 #2/#3 | **重写整套存储层**：`WxStorageRepository`（7 个接口：`items/tasks/days/selfStatus/timeSlots/inspirations/settings`），走 `wx.setStorageSync` / Taro Storage，或直接上 `wx-cloud` | **大，约 400–600 行** |
| 第四节 #4 | `HashRouter` → Taro 路由；`AppShell` 的底部 Tab → `app.config.ts` 的 `tabBar`（**原生 tabBar，性能更好但样式受限**） | 中 |
| 第四节 #5 | `visibilitychange/pagehide` → `onHide` / `onUnload`（Taro 有对应生命周期） | 小 |
| 第四节 #6/#7 | `Sheet` 的 body 锁滚 → `catchtouchmove`；`TimeRuler` 的 pointer → touch 事件 | 中 |
| 第四节 #8/#9 | `visualViewport` → `adjust-position`；`data-theme` → 根节点 class + `page-meta` | 中 |
| CSS / Tailwind | 小程序不支持全部 CSS 选择器与伪类；Tailwind 需配 `rpx` 单位转换，**任意值（如 `pb-[calc(16px+env(...))]`）要逐个过** | **中偏大** |
| `index.html` 内联防闪脚本 | 直接删掉（无 `document`） | 小 |
| 包体 | 主包限 2 MB、总包 20 MB；你的 369 KB JS 完全够 | 无风险 |

**成本**：3–5 周（含适配踩坑、真机预览、审核）。

**坑**：

- **Taro 与 React 18 的版本兼容性必须先用官方模板跑通再动手**，别直接在现有工程上改。
  Tailwind + Taro 的组合同样要先做最小验证（尤其 `rpx` 与 `env(safe-area-inset-*)`）。
- **订阅消息需要服务端**。你现在的应用内提醒（`reminderService`）在小程序里只能保留
  「打开时弹横幅」，做不到「到点了系统推送」——那需要服务器 + `wx.requestSubscribeMessage`。
  这是**产品能力上的真实退化**，不是工程问题。
- 需要**小程序 AppID**（个人主体可注册）；类目选「工具」类一般没问题，但涉及「记录/健康」
  类数据时审核可能问询，隐私协议要写清楚「数据仅存本地」。
- `nanoid` 等 npm 包在小程序里可用，但 `crypto` 相关实现要确认（这也是当初不用
  `crypto.randomUUID` 的原因之一，选型是对的）。

**适合**：目标是进微信生态、方便分享给微信好友、不想走应用商店备案。

---

### 路线 D：React Native 重写（不推荐）

`components/`（2754 行）+ `pages/`（1125 行）+ 575 行 CSS 全部作废，Tailwind 换
NativeWind 或 StyleSheet。能复用的是 `domain/` + `services/` + `utils/`（约 2.9k 行）。
投入产出比最差，除非你有明确的原生性能或原生能力诉求（目前看没有）。

---

## 六、建议怎么走

```
第 0 步（今天，0 成本）
  npm run build → 把 dist/ 传到任意静态托管 → 手机 Safari/Chrome 打开
  → 先确认「这个产品在手机上的体验你满意」，再谈打包

第 1 步（1–2 天）PWA
  加 manifest + vite-plugin-pwa + 图标 → 「添加到主屏幕」
  → 验证日常使用是否够用；如果够，就停在这

第 2 步（1–2 周）Capacitor
  出 .apk 自用 / 上架；顺手修键盘避让，加本地通知
  → 这是「手机 App」的主流答案

（可选分支）微信小程序
  如果你要的是微信内分发，走 Taro；注意通知能力会退化
```

---

---

## 六点五、决策与落地记录（2026-10-14）

> 上面第一~七节是**评估**，这一节是**已经做出来的事**。评估结论保留原文不改写。

### 决策输入

- 使用者：目前自用，**但希望别人 clone 下来也能用**
- 平台：**iOS 要能用**
- 系统通知：**不需要**
- 路线：**B（Capacitor 原生壳）**

### 已落地的改动

| # | 改动 | 位置 |
| --- | --- | --- |
| 1 | 引入 Capacitor 8.5.3：`core` / `app` / `keyboard` / `status-bar` + `cli`(dev) + `android` / `ios` 平台 | `package.json` |
| 2 | Capacitor 配置（含「为什么不改 `iosScheme`」的理由） | `capacitor.config.ts` |
| 3 | `android/`、`ios/` 原生工程已生成**并入库**（`.gitignore` 只忽略构建产物与 `cap sync` 生成物） | 仓库根目录 |
| 4 | 原生桥接：切后台强制落盘 / 状态栏配色跟随主题 / 去掉 iOS 键盘工具条；**浏览器里是空操作** | `src/platform/capacitorBridge.ts`（只被 `main.tsx` import） |
| 5 | 修掉键盘避让「没接通」的旧 bug：`Sheet` 终于消费 `--keyboard-offset` | `src/components/ui/Sheet.tsx` |
| 6 | 打包脚本 | `package.json`：见下 |
| 7 | `base` 支持环境变量（GitHub Pages 子路径部署用，默认 `'/'` 不影响本地与 Capacitor） | `vite.config.ts` |
| 8 | CI：网页质量闸门 / Android APK / iOS 产物 / Pages 部署 | `.github/workflows/{ci,mobile,pages}.yml` |

```bash
npm run mobile:sync      # vite build + cap sync（两端都同步）
npm run mobile:android   # 同步并打开 Android Studio
npm run mobile:ios       # 同步并打开 Xcode
```

### 三条分发路径（门槛从低到高）

1. **网页（0 门槛，推荐先做这个）**
   `pages.yml` 会把网页版部署到 GitHub Pages。iPhone 上用 Safari 打开 → 分享 →
   「添加到主屏幕」，就有一个 App 图标，离线可用（数据在 IndexedDB）。
   ⚠️ 需要先在仓库 Settings → Pages → Source 选 **GitHub Actions**（只设一次）。
2. **Android**：`mobile.yml` 产出 **debug APK**，可直接装到手机，不需要任何账号。
3. **iOS**：**必须有 Mac + Xcode**（Capacitor 8 要求 Xcode 26+）。CI 只能出
   **未签名 `.app`**，装不到 iPhone 上 —— 落地路径只有两条：
   在有 Xcode 的 Mac 上打开 `ios/App/App.xcworkspace` 用 **自己的 Apple ID 免费签名**
   （7 天有效期，到期重签，自用够用）；或买 Apple Developer（99 美元/年）配证书走完整签名。

### 还没做 / 建议下一步

- **🔴 数据导出 / 导入（最高优先级）**。iOS 会回收 WebView 的网站数据，
  存储吃紧时 IndexedDB 可能被清空，而本项目 100% 数据在本地、目前没有导出能力。
  「导出成 JSON + 导入」是唯一兜底，PRD 里它被排在 P1，建议提到最前。
- 应用图标 / 启动图：现在用的是 Capacitor 默认图标（`npx capacitor-assets generate` 可自动生成）。
- 上架相关：国内安卓要 App 备案 + 软著，iOS 要开发者账号 —— 自用则全部不需要。
- Android 返回键退出确认（可选，用 `@capacitor/app` 的 `backButton`）。

---

## 七、需要你拍板的四件事

1. **谁用？** 只有你自己 → `.apk` 装上就行，不用备案不用上架；
   要给别人用 → 得上架，国内安卓要备案+软著，iOS 要开发者账号，这些是**流程成本不是技术成本**。
2. **要不要系统通知？** 要 → PWA 在 iOS 上出局，只能 B（或 C 但要加服务端）。
3. **iOS 还是 Android？** 要 iOS 打包必须有 macOS/Xcode，Windows 做不到。
4. **微信生态重要吗？** 重要 → 走 C，接受提醒能力退化和 3–5 周周期；
   不重要 → 走 B，一周多就能拿到真 App。

---

## 八、附：这次评估用到的命令

```bash
# 分层红线（确认 domain/services 真的零浏览器依赖）
npm run check:layers

# 全库扫描浏览器 API 触摸点
grep -rn -E "\b(window|document|localStorage|indexedDB|navigator|visualViewport)\b" \
  src --include=*.ts --include=*.tsx | grep -v __tests__ | grep -v src/repositories/

# 分层代码量
for d in domain services store utils hooks components pages theme router repositories; do
  n=$(find src/$d -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*__tests__*" -print0 \
      | xargs -0 wc -l | tail -1 | awk '{print $1}'); echo "$d: $n"; done
```
