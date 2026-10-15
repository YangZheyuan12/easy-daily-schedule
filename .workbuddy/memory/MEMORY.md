# 项目长期记忆 · 日程表软件（daily_schedule_app）

## 定位与规模（冻结快照，采集 2026-10-14）
移动端优先 **H5 网页**（Vite+React），不是 App。5 个底部 Tab：今日/时间轴/任务/日历/我的。
**纯前端无后端**，数据全存 IndexedDB。云同步（dexie-cloud）是 P2。
生产代码约 **8.8k 行 TS/TSX**（另 575 行 CSS + 6.9k 行测试）；`dist` ≈ 426KB（JS 426KB + CSS 32KB）。
→ 无浏览器 API 的纯净层（domain+services+store+utils）约 **3.9k 行，占生产代码 44%**。

## 技术选型
构建 Vite5+React18+TS ｜ UI **Tailwind3 + 手写组件**（MUI 已移除，+300KB/迁小程序全废）｜
路由 React Router6 HashRouter ｜ 状态 **Zustand4.5**（选择器订阅；`getState()` 可 React 外调供 flush）｜
存储 **Dexie4**（IndexedDB，复合索引 `[date+sectionId]`、`bulkPut`）｜ ID **nanoid**（禁 `crypto.randomUUID`）｜
日期 自写 `utils/date.ts` **本地时区**（禁 `toISOString().slice(0,10)`）｜ 主题 CSS 变量+`data-theme` 零运行时依赖。

## 架构红线（CRITICAL）
1. **分层单向**：UI → Store → services → domain；repositories 是 domain/ports 的适配器。
2. `src/domain/`、`src/services/` **禁止** window/document/localStorage/indexedDB/visualViewport —— 迁小程序 100% 复用的前提，由 `scripts/check-layers.mjs`（`npm run check:layers`）卡口。**项目无 eslint/prettier**，别把红线说成 ESLint 强制。
3. `src/repositories/` 是唯一允许碰存储 API 的层；`repositories/index.ts` 的 `createRepositories()` 是**唯一装配点**。
4. 树用**邻接表**（`id`+`parentId`+`order`），不用嵌套 JSON/物化路径。
5. **软删只改 `deletedAt`**，其他字段不动（撤销完整恢复层级/顺序/折叠态的前提）。
6. 持久化：输入防抖 500ms + 离散操作立即写 + `visibilitychange`/`pagehide` 强制 flush。
7. 🔴 `check-layers.mjs` 是**正则**匹配，`services/` 里变量/参数**不能叫 `window`**（会误判成浏览器 API，曾踩 23 处违规）。一律用 `timeWindow`；`document`/`location`/`history` 同理别当变量名。
8. `SectionKey` 从 `@/domain/enums` 导入，**不在** `domain/types` 导出（曾 TS2459）。

## 主题系统（三套，paper 默认）
`paper`/`plain`/`nocturne` 差异是**六维同时变**（底色/卡片形态/圆角/分隔/阴影/密度）。
- 语义类名永不变、值换变量：`bg-surface`/`text-ink-faint`/`border-edge-strong`/`text-accent`/`text-heart`/`text-star`/`rounded-card`。
- 变量用 `R G B` 三元组（`--c-surface: 255 254 250`），Tailwind 写 `rgb(var(--c-surface) / <alpha-value>)` 才支持 `bg-surface/95`。**不写回 hex**（组件内联 hex = 回归）。
- 板块色 `sectionColor(cfg)`/`sectionTint(cfg)`（返回 `rgb(var(--c-work))`）。落点：`src/theme/{themes,useThemeStore,useApplyTheme}.ts`（`useApplyTheme` 是**唯一**写 `data-theme` 处）。

## 字号刻度（八档，只定义一份，不进主题）
`micro12/caption13/meta14/body15/lead16/heading18/title24/display32`。
- 组件禁写 `text-[15px]`，一律语义类名（值纯字符串，否则盖掉 `leading-*`）。
- 13px 是可读地板；今日基准屏 组头18/顶层16/子项与输入15/计数13；12px 仅 `TreeRow` 计数徽标。
- 每次提档必跑 `scripts/tools/overflow-scan.js`。

## 底部导航与安全区（联动值）
胶囊 h70·图标21·标签caption13·内padding4·底距16 → 占86px。主操作按钮与 `UndoBar` 用 `bottom-[100px]`，`AppShell` 内容 `pb-[120px]`。安全区只能**叠加不能替代**（覆盖式会清零 `pb-4`）→ 一律 `pb-[calc(16px+env(safe-area-inset-bottom))]`。

## 日历页双语义（导航约定）
靠 `location.state.pickDateFrom` 分：**回看**（底部 Tab 进，点格只更新摘要卡不跳页）/ **选日子**（今日/任务/时间轴点进来，`useDayStore.setDate`+`navigate(pickFrom,{replace:true})` 回原页）。**别新开 DatePickerSheet**。`?date=` 经 `isValidDateKey` 校验后单向 bootstrap 进 `useDayStore`。

## 业务口径
- 板块完成率 = **顶层条目**完成数÷顶层总数；子项不进分母；父条目显示直系 `子项完成/子项总数`。
- 加权口径（Σ顶层完成÷Σ顶层总数）作 `DaySummary.overall`（日历摘要卡）。主页编号仅四板块**顶层条目**跨组连续 1~N；子项/灵感不编号。
- 时间段带 `sectionId` 按 `done` 折叠进该板块；不带只贡献「当天有记录」。灵感只贡献「有记录」，不进 sections/overall/日历色点。
- `order` 步长1000 中点插入；末位 `children.length===0 ? ORDER_STEP : maxOrder+ORDER_STEP`。
- 🔴 **展示顺序一律从 `order` 派生**（渲染端 `.filter(alive).sort(compareByOrder)`），不是数组位置（曾踩 move 改 order 但按数组 map 渲染的 bug）。
- Tab 挂「上一个同级兄弟」；Shift+Tab 子树 level 递归-1；层级软上限8；撤销窗口5s；软删7天物理清理。
- 主页快捷新增（R-039）：灵感走 `useInspirationStore.add`；四板块走 `useItemStore.addSibling(null,date,sectionId,title)`，**必须一次性带标题建成**。
- 往某板块内联新增会让后续板块编号顺延（定义决定）。

### 关键已实现增量
- **R-042 时间段只读投影进今日页**：`sectionId!==null` 且未软删的时间段投影为 `DiaryEntry.kind==='timeSlot'`，排条目之后、参与跨组编号，勾选写回 `TimeSlot.done`。**绝不复制成 Item**（撤销语义单一）。今日组头计数=顶层条目+归类时间段。刻意不改 `SectionPage`。
- **R-043 任务分组+同步到今日**：任务页单一列表平铺，分组是行首属性标记（四大=实心色点，「其他」=空心圈）。「同步到今日」按钮+`ConfirmSheet` → 四大板块任务**一次性复制**成今日条目（去重靠 `Item.sourceTaskId`）；「其他」不参与。`Task.sectionId` 默认 `'other'`。零 Dexie 变更（当时 DB_VERSION=3）。`move` 是全局换位（不看分组）。
- **R-044 周视图+本月时长条**：时间轴「本周」=课程表（周一~周日×纵向时间，重叠并排绝不叠放，时间窗按当周自动收窄，编辑走日维度 `useTimeSlotStore` 不新建写路径）；今日「本周」=四板块田字格；日历月视图加本月时长条。时长口径「实际优先、未记录回退计划、只算目标月」。三处都是**只读派生**。`useRangeStore` 区间一次查、带竞态守卫。
- **R-046（2026-10-15 已实现，同日改版）条目图片附件**：**新表 `itemImages`（DB_VERSION=4）** 存 Blob，`itemId` 索引；`useItemImageStore` 管 `byItem`；`useObjectUrl` 安全回收对象 URL；孤儿图在 `purgeExpiredSoftDeletes` 按 `items` 全量 id 清理。图片仅四板块条目（顶层+子项），时间轴投影/灵感暂不支持。
  🔴 **入口唯一（用户纠偏）**：上传/删除/看大图只在**条目详情抽屉** `ItemSheet`（板块页点行尾「⋯」打开）里的 `ItemImageSection`；**今日列表只做只读预览**（行内缩略图条，与任务条同现、可折叠、点开大图），已删掉今日行尾「⋯」与独立 `ItemImageSheet`。该段落排在此抽屉**第一位**（任务描述之前）。理由：图片与描述/评价同级=「改这一条记录」，两个可写入口会让用户困惑「我在今日加的图去哪了」。
  ⚠️ `loadForItems` 是**覆盖式**写 `byItem`、只有一个全局 `loadedKey`，今日(key=日期+id串)与抽屉(key=itemId)会互相判重击；因路由切换必卸载另一页、重挂载 key 已变会自动重拉（自愈），暂不改 store 语义。

## 农历/节气/节日（R-040）
落点 `src/services/lunar/`+`src/hooks/useDayFestivals.ts`。节气实时解太阳视黄经（Meeus ch.25）+牛顿迭代+整数JDN+**+8h 北京时间定日**，禁平均值紧凑公式、禁 `getUTCDate()`。`lunarToSolar` 越界(1900-01-31/2100-12-31)返 null。展示仅两处：今日 `DateNavigator.subtitleText`、日历 `DaySummaryCard`(`data-testid="day-summary-festival"`)。

## 数据实体（Dexie，`DB_VERSION=4`）
`items`(树)/`tasks`/`days`/`selfStatus:'&date'`/`timeSlots:'&id,date,[date+sectionId],deletedAt'`/`inspirations`/`itemImages:'&id,itemId'`。
v1→v2 删 `reviews`；v2→v3 加 `inspirations`；v4 加 `itemImages`。每个 `version(n)` 必须声明完整 schema。

## 文档索引
`docs/PRD.md`（R-001~R-016、R-030~R-041，R-041 纪念日=二期）/ `docs/ARCHITECTURE.md`（§4 现状+§9-B~E 增量+附录B）/ `docs/TASKS.md` / `docs/MOBILE-APP-MIGRATION.md` / `README.md`。

## 常用命令
`npm run dev/build/preview` ｜ `npm run verify`(check:layers+typecheck+test+build) ｜ `npm run check:layers` ｜ `npm test` ｜ `npm run test:strict`(逐文件+漏跑校验)。

## 验收教训（5 条）
1. **`tsc --noEmit` 必须单独跑**，测试绿≠代码干净（重复 `import type` 仅 tsc 能抓）。
2. **`npm test` 显绿≠跑全了**；沙箱偶发 EPERM 静默丢文件、退出码仍 0 → 用 `test:strict`。
3. 自写校验脚本**先负向验证**（证明真会失败），否则绿灯无意义。
4. 测试文件名只收 `*.test.ts`（`.test.tsx` 双漏）；组件测试首行 `// @vitest-environment jsdom`+`createElement`。
5. 验证期工作树是移动靶，闸门数字最后写者停下后才采信；文档数字写「冻结快照+采集时间」。

## 版本控制
远端 `https://github.com/YangZheyuan12/easy-daily-schedule`（公开），`main` 跟踪 `origin/main`。`.workbuddy/memory/` 入库、`.workbuddy/tmp/` 不入库。提交 author `杨喆媛 <517130023@qq.com>` 未关联 GitHub（`verified:false`）→ 不计入贡献图。

## 环境坑（Windows）
1. **git 凭据必须用 `/d/apps/Git/cmd/git.exe`**（PortableGit 排在前面且 credential.helper 不可用）。
2. 统计数字要独立印证路径（git 路径列表 `-z`+`xargs -0`；`trees?recursive=1` 只数 `"type":"blob"`）。
3. npm optional deps bug 会缺 `@rollup/rollup-win32-x64-msvc`/`@esbuild/win32-x64` → `npm install ... --no-save`。
4. 🔴 **`curl` 不通 ≠ git 不通**，别据此断言推不了；凡 push 先真跑一次（`git fetch`→看 `origin/main..main`→push）。

## 移动端打包（Capacitor 8.5.3，2026-10-14 落地）
依赖 core/app/keyboard/status-bar + cli@dev + android/ios；工具链要 Node22+/Xcode26+/Android Studio Otter 2025.2.1+。
- `capacitor.config.ts`：`webDir:'dist'`、`plugins.Keyboard.resize:'native'`；**刻意不改 `server.iosScheme`**（WKWebView 不准接管 http/https）。
- 🔴 **真正风险是 iOS 回收 WebView 网站数据**（IndexedDB 可能被清）→ **数据导出/导入提最高优先级**（PRD 仍在 P1）。
- 🔴 **`appId`（`com.yangzheyuan.dailyschedule`）/ 安卓 applicationId 是数据连续性红线**：改包名 = 系统判为另一个 App = 新沙盒 = 旧数据即使没卸载也读不到。
- **数据安全口径（2026-10-15 答疑）**：覆盖安装（不删旧版）数据保留；**先删旧版再装 = 沙盒删除 = 全丢**；iOS 还可能在存储吃紧时清 WebView 数据。当前**无任何导出/导入**（已 grep 确认），删了就找不回。另：把数据额外写一份到 `@capacitor/preferences`（iOS UserDefaults）可让 iCloud/谷歌备份带上它，且天然是桌面小组件的数据源。
- `android/` `ios/` 入库（`.gitignore` 只忽略 build/Pods/sync 生成物）。
- `src/platform/capacitorBridge.ts`：切后台强制 flush+状态栏跟随主题+去 iOS 键盘工具条；**只被 `main.tsx` import**（防 `@capacitor/*` 牵连 vitest）。`Capacitor.isNativePlatform()` 兜住，Web 零副作用。
- CI：`.github/workflows/{ci,mobile,pages}.yml`。iOS job **只编译校验不出产物**（macos-26 runner，xcodebuild 不下 `.app`）。
- 🔴 **Capacitor 8 iOS 是纯 SPM**：`ios/App/` 无 `.xcworkspace`/`Podfile`，xcodebuild 必须用 `-project ios/App/App.xcodeproj`。
- **备案（2026-10-15 调研）**：**桌面小组件不需单独备案**（无独立包名，随主包分发）；备案义务在 App 本身。本 App 是纯本地单机工具，通管局有「单机不联网 APP 无需备案」口径，但**上架国内商店渠道强制要备案号**。个人主体限非经营性工具类。
- **若做小组件的真门槛**：数据在 WebView 的 IndexedDB，原生小组件读不到 → 须经 Capacitor 插件把当日快照写到 iOS App Group / Android SharedPreferences 共享区；iOS 还需加 Widget Extension target。

## 数据备份（R-047，2026-10-15 已实现）
纯本地 + 无账号同步 ⇒ 卸载 / 换机 / iOS 回收 WebView 数据 = 全丢，备份是唯一解药。
- 三层分工（守分层红线）：`services/backupService.ts` **纯**构建/解析/校验（`BACKUP_VERSION`、`app:'daily-schedule'`、软删不过滤进备份、坏 JSON/异 app/未来版本都拒绝）；
  `platform/{fileBridge,imageCodec}.ts` 才碰浏览器 API（`a[download]` 下载、`input[type=file]` 选文件、Blob↔base64）；
  `store/useBackupStore.ts` 编排（读 `listAll` → 转图 → 落文件；导入后 `refreshStores()` 重拉当日）。
- 导入两语义：**合并**=upsert（同主键覆盖，幂等）；**覆盖**=先 `clearEverything()` 再写。
  图片默认不带（base64 膨胀 ~1/3），勾选「备份包含图片」才导。
- 数据层为此补：`timeSlots/inspirations/itemImages/selfStatus.listAll`、`selfStatus.upsertMany+clearAll`、`days.upsertMany+clearAll`。
- UI：`MePage` 的「数据备份」卡（导出 / 导入 + 合并/覆盖 Sheet + toast）。

## 安卓覆盖安装（2026-10-15 已修根因）
🔴 根因是**签名不一致**：debug 用本机 `debug.keystore`、release 原先根本没配签名 →
系统拒绝升级 → 只能卸载 → 沙盒删除 → IndexedDB 全丢。次要原因是 `versionCode` 常年 1。
- 修法：`android/app/build.gradle` 读 `android/app/keystore.properties`（**不提交**），
  让 **debug 与 release 共用同一把钥匙** + `versionCode` 递增（现 2）。
- 步骤/报错对照/「第一次仍需卸载一次」的恢复流程见 `docs/ANDROID-SIGNING.md`。
- 验证：`adb install -r <apk>`（保留数据重装）；`INSTALL_FAILED_UPDATE_INCOMPATIBLE`=签名不符，
  `VERSION_DOWNGRADE`=versionCode 降低。
- 🔴 keystore 丢了就再也发不出「官方升级」包（届时只能卸载重装）；**也不能提交**（仓库公开）。

## 已知未修问题
- ~~数据导出/导入缺失~~（R-047 已实现）。
- 文档仍把分层红线说成 ESLint 强制（`ARCHITECTURE.md`/`TASKS.md` 多处，与 §3.3 更正注内部不一致）。
- **PRD L667** 仍写「环形图用 SVG/轻量库」，而环形图 UI 已移除。
