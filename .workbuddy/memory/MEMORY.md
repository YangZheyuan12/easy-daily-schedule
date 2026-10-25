# 项目长期记忆 · 日程表软件

## 定位与选型（2026-10 快照）
移动端优先 H5（Vite5+React18+TS+Tailwind3），Capacitor 8 套壳，HashRouter。5 Tab：今日/时间轴/任务/日历/我的。
纯前端无后端，数据全存 IndexedDB（Dexie v7，11 stores，`version(n)` 必须声明完整 schema）。Zustand4.5。
ID nanoid；日期用自写 `utils/date.ts`。

## 架构红线（CRITICAL）
1. 分层单向：UI → Store → services → domain；repositories 是 domain/ports 适配器，`createRepositories()` 唯一装配点。
2. `domain/`+`services/` 禁 window/document/localStorage/indexedDB/visualViewport，`check:layers` 卡口；**无 eslint/prettier**。
   🔴 check-layers 是正则：services 里变量不能叫 `window`/`document`/`location`/`history`。
3. 树用邻接表；展示顺序一律从 order 派生（`.filter(alive).sort(compareByOrder)`）。
4. 软删只改 `deletedAt`；持久化=防抖 500ms+离散立即写+切后台 flush。
5. `SectionKey` 从 `@/domain/enums` 导入，不在 `domain/types` 导出。

## 主题 / 字号 / 底栏
语义类名永不变、值换变量（`R G B` 三元组 + `rgb(var(--c-x) / <alpha-value>)`，不写回 hex）。
字号八档 micro12…display32 只此一份，禁 `text-[15px]`。底栏占 86px：主按钮/UndoBar `bottom-[100px]`、内容 `pb-[120px]`。
🔴 键盘弹起全部 fixed 底部元素统一收（`useKeyboardVisible`+`KEYBOARD_HIDDEN_CLASS`，位置瞬切只过渡透明度）。

## 业务口径（2026-10-15/16 用户决策）
- 🔴 全应用列表无行内勾选框；完成态=删除线+淡化，切换走详情。详情抽屉无「完成」，主操作位是删除。
- 🔴 今日页主页直接编辑：点标题行内编辑（Enter/失焦提交、Esc 取消、空保留原标题）；行尾「⋯」→
  `useUiStore.openDrawer` 打开与板块页**同一张** ItemSheet。时间段投影行只读。
- 时间段同步到今日：`Item.sourceSlotId` 去重（零 Dexie 变更）；有存活条目指向的时段不投影；未分组不可同步。
- 🔴 进度显示已删（0/3、完成 x%），组头改纯计数「N项」（顶层条目+归组时间段；子项不计）。
- 🔴 展开/收起跨页保持：`useUiStore.expansions`+`hooks/useExpanded(key, default)`，TaskPreviewCard/CollapsibleCard/
  SelfStatusCard/SectionRow/ImageStrip/ReminderBanner 都走它；刷新重置。
- order 步长 1000；撤销 5s；软删 7 天清理。

## 每日固定任务（v7，2026-10-25）
- 数据模型 = **每天自动生成的例行模板**：`routines` 表（跨日期复用模板，软删只改 `deletedAt`）+ `routineCompletions` 表（按 `routineId + date` 维度，id=`${routineId}@${date}`，每天独立勾选）。
- 模板软删级联清理该模板全部完成记录（`persistence.hardDeleteRoutineCompletions`）；`purgeExpiredSoftDeletes` 末步 `purgeOrphans` 清孤儿完成记录。
- 接入：任务页（上方 `RoutineSection`）+ 今日页（当日视图顶部）；`AppShell` 切日期 `loadDate`、`useBackupStore` 刷新链路均纳入。
- `computeRoutineProgress(routines, completions, date)` → `{done,total,ratio}`（total=0 时 ratio=0，杜绝 NaN）。固定任务**不参与**同步（LWW 实体仅 item/task/timeSlot/inspiration/selfStatus）。
- 详见 `docs/ARCHITECTURE.md` §4.6 / §9（数据表 `routines` / `routineCompletions`）。

## 任务页 / 时间轴（2026-10-17 功能）
- 🔴 每日任务列表**行尾拖拽手柄**（自写 `hooks/useDragSort`，零依赖 pointer events）上下重排 →
  落盘 `reorderIds` 重写 order（步长1000）；其余行同步让位动画，抬起层抬 z-index。
- 🔴 期限任务/长时目标**不再弹窗**：点进去行内直接改标题+描述（textarea 行内编辑，与今日页同思路）；
  右侧「⋯」才开 `TaskKindComposer` 抽屉（期限日期/删除/图片等低频动作收在里面）。ticks 与文字垂直居中。
- 任务支持图片：`TaskImage` 独立 `taskImages` 表（taskId 索引，区别于 itemImages 的 itemId），
  `useTaskImageStore`+`IndexedDbTaskImageRepository`；抽屉上传 + 列表缩略图；备份纳入 `BackupTaskImage`。
- 期限日期选择空白根因：`index.css` 全局 `input{appearance-none}` 擦掉 date 外观 → 给 date input
  单独回 `appearance:auto` + 预填今天（避免选不了日期就保存不了）。
- 时间轴切日期排版乱：`DateNavigator` 中间宽度稳定（箭头不位移）；`loadDate` 先清 slots 避免跨日期残留；
  切日期不再逐行错峰重播动效。

## 浮层 / 导航
- 「回到今天」：今日/时间轴非今天 → 胶囊变「回到今天」。
- 🔴 `ui/Popover.tsx` 传 `anchorRef` 才不遮挡：portal 到 body+fixed+z-[55]、scroll 捕获跟随、放不下上翻；
  根因是层叠上下文不是 z-index。

## 🔴 键盘 / 抽屉
- **抽屉内禁 `autoFocus`**：Keyboard.resize=native（adjustResize）下键盘在 Sheet 入场动画（m-sheet-up 280ms）
  中途弹起 → 布局视口压缩 → fixed inset-0 抽屉半空中变高 = 「闪一下」。改延迟 280ms focus（TaskKindComposer）。
- `useKeyboardAvoid` 的 offset 有 120px 阈值防抖（innerHeight 与 vv.height 过渡帧不同步会产出瞬时小偏移）。

## 🔴 同步内核（2026-10-19 落地，未接后端）
- 平行通道：`domain/ports` 的 `SyncGateway` → `services/syncService`（纯逻辑）；
  IndexedDB 仍是唯一真相源。**别再用「云端替换 repository」的思路**（stub 已改成否决记录）。
- 🔴 排序键 `syncStamp = max(updatedAt, deletedAt)`（软删只改 deletedAt，用 updatedAt 当游标
  = 删除推不上去 = 对端复活记录）。
- 🔴 时间轴：上网一律服务端轴（含 record 内字段），`offset = serverTime − localNow`，落库平移回本地轴；
  双游标只记服务端轴。pull 重叠 5s、分批 500、最多 50 页；先 pull 后 push。
- 裁决（`domain/sync.ts`，本地与云端共用）：删除优先 → updatedAt → deviceId 字典序 → 同设备同戳=same。
- 同步实体：item/task/timeSlot/inspiration/selfStatus；`Day` 与两张图片表**不参与**。
- Dexie **v6**：`syncMeta`（&key 单行 state）+ 五张 LWW 表补 `updatedAt` 索引。
- 🔴 软删清理必须带 `syncedThrough`（只清已推上云的 tombstone），否则删除被对端复活。
- 待办：认证 UI / `store/syncStore` / 首次登录归属 / 图片 hash 去重；iOS 有第三方登录则必须
  同时提供 Sign in with Apple + 账号删除入口 + 隐私政策。详见 `docs/SYNC.md`。

## 🔴 Android 原生
- appId `com.yangzheyuan.dailyschedule` 是数据连续性红线，先删旧版再装=全丢。
- 签名：keystore=`android/dailyschedule.keystore`（密码在 `android/app/keystore.properties`，均 gitignore 未提交），
  debug/release 共用。CI mobile.yml 探测式：配 4 个 secrets 才出签名 release 包；旧签名包升级仍需卸载一次。
- 🔴 **Capacitor WebView 无 DownloadListener → `<a download>`（Blob URL）不落地**；备份导出走本地插件
  `SaveFilePlugin`：API 29+ MediaStore.Downloads 写公共「下载」目录免权限；API 24-28 File 直写+manifest maxSdk=28。
  Filesystem 公共目录 Android 11+ 不可用（别试）。
- 🔴 导出=「先存下载目录 + 再弹系统分享面板」两步：插件 `shareText` 用 FileProvider 取 content Uri 起
  `ACTION_SEND` 选器（微信/QQ/网盘都出现），**不用** @capacitor/share（它只认 file:// 且要额外配置）。
  文件名必须回填 MediaStore 真实名（重名会被系统改「xxx (1)」），否则提示与落盘对不上。
- 备份 R-047（合并/覆盖，纯本地删了找不回）；课表 R-049 复制粘贴+`platform/textCodec`（GBK 兜底）。

## 验收教训
1. `tsc --noEmit` 单独跑。2. 🔴 沙箱 EPERM 会静默丢测试文件（退出码 0）→ 必核对 Test Files = `find src -name "*.test.ts" | wc -l`。
3. 自写校验脚本先负向验证。4. 测试只收 `*.test.ts`；组件测试首行 `// @vitest-environment jsdom`+`createElement`。

## 账号同步 / iOS（2026-10-19 决策）
- 用户定：账号做**实时多端同步**（非仅云备份）；后端用 **WorkBuddy 云服务**；**iOS 先做功能适配**，打包上架后置。
- 🔴 `repositories/CloudRepository.stub.ts` 的思路是「替换 repository 实现」（云端当真相源），
  与本地优先同步**不兼容** —— 本地 IndexedDB 仍是真相源。同步要另开一条**平行于 repositories** 的通道：
  `domain/ports` 加 `SyncGateway` → `repositories/CloudSyncRepository` 实现 → `services/syncService`（纯逻辑可单测）
  → `platform/` 只放认证与网络；`store/syncStore` 管状态与触发。
- 同步内核：行级 LWW by `updatedAt`（相等用 `deviceId` 字典序兜底保证收敛）、**删除优先于修改**；
  游标**只认服务端时间**（本地记 offset），拉取带 ~5s 重叠窗口；pull/push 分批 500。
  🔴 缺 `updatedAt` 的表：`Day` / `ItemImage` / `TaskImage`（图片不参与 LWW，按内容 hash 去重、懒加载）。
- 🔴 软删 7 天清理必须加「已同步过」条件，否则删除会被对端复活。
- 🔴 iOS 导出/分享**不能**用自研 Swift 插件：Capacitor 只把 npm 包形态的插件写进
  `capacitor.config.json` 的 `packageClassList`（`cli/util/iosplugin.js` 只扫 node_modules 插件目录），
  App target 里的 Swift 文件不会被注册，`cap sync` 还会冲掉手改的类名。
  → 用官方 `@capacitor/filesystem`（Documents + `UIFileSharingEnabled`）+ `@capacitor/share`。
- 🔴 iOS `scheme` 必须在 `capacitor.config.ts` 里钉死 `'App'`：`https` 会让 WKWebView 的
  `setURLSchemeHandler` 抛异常 —— 启动即崩。`ios/App/App/capacitor.config.json` 是 sync 生成物，写 ts 才算数。
- iOS 已完成（2026-10-19）：Info.plist（锁竖屏 / arm64 / zh_CN / `ITSAppUsesNonExemptEncryption=false` /
  相机文案）、自有图标（`scripts/tools/make-app-icon.mjs`，1024 单尺寸）、
  键盘原生高度 `--keyboard-native-height`（`hooks/keyboardMetrics.ts` 统一读取）、
  切后台无图快照双写 `Documents/Backups/snapshot-latest.json` + 库空启动提示恢复。
- ⚠️ 以上未在真机验证：Windows 无法编译 iOS，首次需 Mac 跑 `docs/MOBILE-APP-MIGRATION.md` 的 5 条清单。
- 上架合规：提供微信登录则 iOS 必须同时有 Sign in with Apple；必须有账号删除入口 + 隐私政策。

## PWA / 主屏幕（2026-10-19）
- `public/manifest.webmanifest` + `apple-touch-icon`(180) + standalone meta；图标由
  `scripts/tools/make-app-icon.mjs` 一并出到 `public/`（180/192/512，去 alpha）。
- 🔴 `src/platform/pwaBridge.ts` 注册 SW 的三道闸：**原生壳永不注册**（Capacitor 自己管发版，
  SW 再缓存 = 装新版跑旧代码且难查）/ 开发模式不注册 / 失败静默。
- SW 策略：导航 network-first（发版即生效，不用维护缓存版本号）+ 资源 stale-while-revalidate。
- 局域网 http 下拿不到 SW（浏览器只在 https/localhost 给），但图标/全屏不依赖 SW。
- iOS 真机无 Mac 时：Safari 局域网直连（`npm run dev`，vite 已 `host:true`）可验证 Web 层；
  原生导出/分享/快照/状态栏必须 Mac。Safari 里导出走 `<a download>` ≠ 原生壳行为，别误判。

## 版本控制 / 环境
git 必须用 `/d/apps/Git/cmd/git.exe`；
🔴 push 报 502/SSL unexpected eof 时：**沙箱外（dangerouslyDisableSandbox）+ 清空代理变量**
`https_proxy= http_proxy= HTTPS_PROXY= HTTP_PROXY= git push origin main` 才通。curl 不通 ≠ git 不通。
命令：`npm run verify` / `npm test` / `npm run test:strict`。
