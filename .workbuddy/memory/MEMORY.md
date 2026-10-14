# 项目长期记忆 · 日程表软件（daily_schedule_app）

## 定位与规模（冻结快照，采集 2026-10-14）
移动端优先 **H5 网页**（Vite+React），不是 App。5 个底部 Tab：今日/时间轴/任务/日历/我的。
**纯前端无后端**，数据全存 IndexedDB。云同步（dexie-cloud）是 P2。
生产代码约 **8.8k 行 TS/TSX**（另 575 行 CSS + 6.9k 行测试）；`dist` 396KB（JS 369KB + CSS 28KB）。
分层行数（不含测试）：domain 495 / services 2098 / store 985 / utils 343 / hooks 216 /
components 2754 / pages 1125 / theme 158 / router 33 / repositories 618。
→ 无浏览器 API 的纯净层（domain+services+store+utils）约 **3.9k 行，占生产代码 44%**。

| 项 | 选型 | 关键理由 |
| --- | --- | --- |
| 构建 | Vite 5 + React 18 + TS | — |
| UI | **Tailwind 3 + 手写组件**（MUI 已移除） | 与 preflight 冲突、+300KB、迁小程序全废 |
| 路由 | React Router 6（HashRouter） | — |
| 状态 | **Zustand 4.5** | 选择器订阅避免全量重渲染；`getState()` 可在 React 外调（flush 刚需） |
| 存储 | **Dexie 4**（IndexedDB） | 复合索引 `[date+sectionId]`、`bulkPut`（递归软删刚需） |
| ID | **nanoid** | 不用 `crypto.randomUUID`（需 secure context，小程序无） |
| 日期 | 自写 `utils/date.ts`，**本地时区** | 严禁 `toISOString().slice(0,10)`（UTC 推移 bug） |
| 主题 | **CSS 变量 + `data-theme`**，Tailwind 色名全指向变量 | 零运行时依赖 |

## 架构红线（CRITICAL）
1. **分层单向**：UI → Store → services → domain；repositories 是 domain/ports 的适配器
2. `src/domain/`、`src/services/` **禁止** window / document / localStorage / indexedDB / visualViewport
   —— 迁小程序 100% 复用的前提，由零依赖脚本 `scripts/check-layers.mjs`（`npm run check:layers`）卡口。
   **项目无 eslint / prettier 依赖，不要把红线说成 ESLint 强制**（文档仍有几处历史错误表述）
3. `src/repositories/` 是唯一允许碰存储 API 的层；`repositories/index.ts` 的 `createRepositories()` 是**唯一装配点**
4. 树用**邻接表**（`id`+`parentId`+`order`），不用嵌套 JSON / 物化路径
5. **软删只改 `deletedAt`**，其他字段不动 —— 撤销能完整恢复层级/顺序/折叠态的前提
6. 持久化：输入防抖 500ms + 离散操作立即写 + `visibilitychange`/`pagehide` 强制 flush

## 主题系统（三套，paper 为默认）
`paper`（纸感暖白）/ `plain`（素白）/ `nocturne`（夜航深色）。差异是**六维同时变**：
底色/卡片形态/圆角/分隔策略/阴影/信息密度。
- **语义类名永不变，值换成变量**：`bg-surface` / `text-ink-faint` / `border-edge-strong` / `text-accent` /
  `text-heart` / `text-star` / `rounded-card`。组件零改动。
- 变量用 `R G B` 三元组（`--c-surface: 255 254 250`），Tailwind 写 `rgb(var(--c-surface) / <alpha-value>)`，
  这样 `bg-surface/95` 才生效。**不要写回 hex。**
- 板块色运行时用 `sectionColor(cfg)` / `sectionTint(cfg)`（返回 `rgb(var(--c-work))`）；
  `SectionConfig.color/tint` 只作设计稿基准值。**组件内联 style 出现 hex = 回归。**
- 落点：`src/theme/themes.ts` / `useThemeStore.ts`（`repos.settings` key `theme`）/ `useApplyTheme.ts`
  （**唯一**写 `data-theme` 处）。`index.html` 有内联防闪烁脚本读 `dsa:theme`。切换器在「我的」页。

## 字号刻度（八档）
在 `src/styles/index.css` 的 `:root{--fs-*}`，映射进 `tailwind.config.ts`：
`micro 12 / caption 13 / meta 14 / body 15 / lead 16 / heading 18 / title 24 / display 32`。
- **组件里禁止写 `text-[15px]`**，一律语义类名。值写成纯字符串（不带 lineHeight），否则盖掉 `leading-*`。
  **字号不进主题系统**，只定义一份。
- ① **13px 是可读文字地板**，「今日」是基准屏（组头 18 / 顶层条目 16 / 子项与输入 15 / 计数 13）；
  12px 只给塞不下的计数徽标（仅 `TreeRow`）。② **每次提档必跑** `scripts/tools/overflow-scan.js`。
- `PageHeader` 副标题 `text-body`(15)，四屏共用；`DateNavigator.subtitleText` `text-caption`(13)；
  时间轴时间列 14（**列宽 ≥100px**，否则 `09:00–10:00` 折行）。

## 底部导航与安全区（联动值）
胶囊 **h70** · 图标 21 · 标签 caption(13) · 内 padding 4 · 底距 16 → 占 86px。
三处主操作按钮与 `UndoBar` 用 `bottom-[100px]`，`AppShell` 内容 `pb-[120px]`。**改一处同步四处。**
**安全区只能叠加不能替代**：`safe-top`/`safe-bottom` 是覆盖式的，会清零同元素 `pb-4`。
一律显式 calc：`pb-[calc(16px+env(safe-area-inset-bottom))]`。

## 日历页双语义（导航约定）
只有一个日历组件，靠 `location.state.pickDateFrom` 分语义：
- **回看**（底部 Tab 进）：点一格只更新摘要卡，不跳页
- **选日子**（今日/任务/时间轴点进来）：`useDayStore.setDate` + `navigate(pickFrom,{replace:true})` 回原页
**不要再新开 DatePickerSheet**。入口：今日页 `DateNavigator.onDateClick`、任务页 `PageHeader.subtitle`
里的 `<button aria-label="选择日期">`、时间轴页 `onDateClick`。`PageHeader.subtitle` 类型是 `ReactNode`。
**`?date=` 必须经 `isValidDateKey` 校验后单向 bootstrap 进 `useDayStore`**，不引入第二个日期变量。

## 业务口径
- 板块完成率 = **顶层条目**完成数 ÷ 顶层总数；子项不重复计入分母；父条目显示直系 `子项完成/子项总数`
- 加权口径（Σ顶层完成÷Σ顶层总数）作 `DaySummary.overall`，用于日历摘要卡
- 主页编号 = 展示序号，仅四板块**顶层条目**跨组连续 1~N；子项/灵感不编号
- 时间段带 `sectionId` 时按 `done` 折叠进该板块完成度；不带只贡献「当天有记录」。
  灵感只贡献「有记录」，不进 sections/overall/日历色点
- **R-043（2026-10-14 已实现，同日改版）任务分组 + 同步到今日**：
  🔴 **分组不是分段容器** —— 任务页保持**单一列表平铺**，分组只是每行的一个属性
  （行首标记）。曾按五分组分段渲染，用户明确要求退回平铺：
  「只是想在填写时可以选择是否分组」。分段会连带造出「空组要不要显示」
  「跨组换位怎么算」两个伪问题。
  行首标记：四大板块=实心色点，「其他」=**空心圈**（形态上就表达"未分组"）；
  **聚焦（正在填写）该行时才在标记旁展开组名**，静态排版只留点。
  「同步到今日」按钮 + `ConfirmSheet` 确认 → 把四大板块任务**一次性复制**成今日页条目
  （追加到该板块顶层末尾，`done` 跟随）。**「其他」不参与同步**。
  - 🔴 **一次性复制，不是投影**（与 R-042 的时间段相反）：用户要的是「按钮 + 确认」这个动作语义。
    去重靠 `Item.sourceTaskId`（`planTaskSync` 排掉已同步的）→ 重复点不会堆两份。
  - `Task.sectionId: TaskSectionKey`（四大 + `'other'`）；**老数据归一化为 `'other'`，不是板块** ——
    默认成「工作」会让一次同步凭空造出一批条目。新任务默认也是 `'other'`。
  - **零 Dexie 变更**：新字段都不是索引 → `DB_VERSION` 仍为 3，无需迁移。
  - **`move` 是全局换位，不看分组**（曾改成组内换位，随改版一起退回）：
    列表平铺时若限制组内换位，按「下移」会毫无反应，而下面明明还有一行 → 像按钮坏了。
    边界 = 整条列表的首尾。
- **R-042（2026-10-14 已实现）时间段同步到今日页**：`sectionId !== null` 且未软删的时间段，
  **只读投影**进今日页对应板块（`DiaryEntry.kind === 'timeSlot'`），排在该板块条目**之后**，
  与顶层条目一起参与跨组连续编号；勾选直接写回 `TimeSlot.done`。
  🔴 **只读投影，绝不复制成 Item** —— 一份数据就没有双向同步问题，撤销语义也单一
  （`entries[i].item` 恒 undefined，有单测卡着）。
  今日页组头计数 = 顶层条目 + 归类时间段，与 `DaySummary.sections` 口径对齐
  （此前组头只数条目、日历摘要卡数两者，同一天两处数字不一致）。
  **刻意不改 `SectionPage`**：板块详情页只数 items —— 它管的是条目树，
  加入只读时间段行会让编辑交互变复杂（不能缩进/加子项）。这是「今日=汇总视图，板块页=条目编辑视图」的区分。
- `order` 步长 1000，中点插入。**末位公式** `children.length===0 ? ORDER_STEP : maxOrder+ORDER_STEP`
- **🔴 展示顺序一律从 `order` 派生，不是数组位置**：渲染端 `.filter(alive).sort(compareByOrder)`；
  `useTaskStore.move` 只在存活任务间换位（软删的仍占数组，会白占一次位移），`order` 原样保留 → 撤销自动回位。
  `compareByOrder` 在 `src/domain/constants.ts`。**曾踩真 bug**：`move()` 改了 order 但页面按数组
  `map` 渲染 → 「按钮点了没反应、刷新才换位」。
- Tab 挂到「上一个同级兄弟」；Shift+Tab 子树 level 递归 -1；层级软上限 8；撤销窗口 5s；软删 7 天物理清理
- **主页快捷新增（R-039）路径不同**：灵感走 `useInspirationStore.add(date, content)`；
  四板块走 `useItemStore.addSibling(null, date, sectionId, title)`。
  **必须一次性带标题建成，禁止「先建空条目再 setTitle」**
- 往某板块内联新增会让后续板块**编号顺延**（定义决定，不是 bug）
- **空状态必须可操作**：曾因 `diaryService` 里 `if (rows.length===0) continue;` 把空板块连新增入口
  一起隐藏。空容器可以省，**入口不能省**。

## 农历 / 节气 / 节日（R-040 一期）
落点 `src/services/lunar/`（lunarData/lunarService/solarTermService/festivalService）+ `src/hooks/useDayFestivals.ts`。
- **节气 ≠ 查表**：实时解太阳视黄经（Meeus ch.25 低精度）+ 牛顿迭代 + 整数 JDN 换算 **+8h 北京时间定日**，
  `λ(k)=(285+15k) mod 360`。**禁止退回平均值紧凑公式**（1980 立春/冬至、2010 惊蛰/立秋 全错一天）；
  **不得用 `getUTCDate()` 定日**。
- 农历表**用外部锚点验证**（已知春节/闰月），结构不变量是同义反复。残留：不改年长的闰月序号篡改检不出。
- `lunarToSolar` 越界（1900-01-31 / 2100-12-31）返回 `null`。
- 展示点**仅两处**：今日页 `DateNavigator.subtitleText`、日历页 `DaySummaryCard`
  （`data-testid="day-summary-festival"`）。月历格子与年视图不显示，格子高度不变。

## 数据实体（Dexie v3，`DB_VERSION=3`）
`items`(树)/`tasks`/`days`/`selfStatus:'&date'`/`timeSlots:'&id,date,[date+sectionId],deletedAt'`/
`inspirations:'&id,date,deletedAt'`。v1→v2 删 `reviews`；v2→v3 加 `inspirations`。

## 文档索引
- `docs/PRD.md`（R-001~R-016、R-030~R-041；R-041 纪念日=二期未实现）
- `docs/ARCHITECTURE.md`（§4 现状稿对齐真实 src/；§9-B~§9-E 增量专章；附录 B 追溯矩阵）
- `docs/TASKS.md`（T01–T16=P0/P1，T17–T33=增量；M1–M10）
- `docs/MOBILE-APP-MIGRATION.md`（2026-10-14 新增：H5→手机 App 的四条路线评估）
- `README.md`（启动方式、能力表、MVP 验收路径）

## 常用命令
```bash
npm run dev / build / preview
npm run verify        # check:layers + typecheck + test + build
npm run check:layers  # 分层红线（自写 node 脚本）
npm test              # vitest 快路径
npm run test:strict   # 逐文件跑并校验无文件漏跑
```

## 🔴 五条验收教训
1. **`tsc --noEmit` 必须单独跑，测试绿 ≠ 代码干净。** 重复两行 `import type` 造成 TS2300，
   但 vitest 全绿、`vite build` 也通过（`import type` 运行时被擦除）。**只有 tsc 能发现。**
2. **`npm test` 显绿不等于跑全了。** 沙箱偶发 EPERM 会**静默丢掉某个测试文件**，退出码仍是 0。
   怀疑漏跑用 `test:strict`。
3. **自写校验脚本必须先做负向验证（证明它真会失败）。** `test:strict` 曾把「1 个用例失败」
   误报成环境 EPERM（宽松正则先命中失败彩带标题）。只在绿灯路径验证过的工具，「通过」毫无信息量。
4. **测试文件名只能是 `*.test.ts`，`.test.tsx` 是双漏**：`vite.config.ts` 的 `test.include` 与
   `check-test-baseline.mjs` 都只收 `*.test.ts`。组件测试首行加 `// @vitest-environment jsdom`
   + 用 `createElement` 代替 JSX。
5. **验证期工作树是「移动靶」，闸门数字要在最后一个写者停下后才采信。** 纪律：跑闸门前
   `grep -rn "NEGATIVE-VERIFY" src/` 确认无残留；文档里的文件数/行数一律写「冻结快照 + 采集时间」，
   从属句改写成不依赖数值的表述。

## 版本控制
- 远端 **https://github.com/YangZheyuan12/easy-daily-schedule**（公开），`main` 跟踪 `origin/main`。
- `.gitignore` 取舍有含义：`.workbuddy/memory/` **入库**；`.workbuddy/tmp/` **不入库**（scratch）。
- 长期有用的界面验证/度量工具在 **`scripts/tools/`**（入库，见其 README）；字号改动必跑
  `scripts/tools/overflow-scan.js`。
- 提交 author `杨喆媛 <517130023@qq.com>` **未关联 GitHub 账号**（`verified:false`）→ 不计入贡献图。

## 环境坑（Windows）
1. **git：代理 shell 里的 git 不是用户在用的那个。** PortableGit 排在 `/d/apps/Git/cmd/git` 前面，
   且其 `credential.helper` 不可用。→ **凡涉及凭据（push/pull/fetch）必须显式调
   `/d/apps/Git/cmd/git.exe`**。项目 git 在 `D:\apps\Git`。
2. **统计数字必须能找到独立印证路径**（已踩四次：非 ASCII 路径被 `core.quotePath` 转义致 38 张 PNG
   漏审、`tr -d '\0'` 压行数、`trees?recursive=1` 把目录算成文件）。规则：git 路径列表一律 `-z`+`xargs -0`；
   `trees?recursive=1` 只数 `"type":"blob"`；报数前先找第二条路径核对。
3. **npm optional deps bug** 会让 `@rollup/rollup-win32-x64-msvc`、`@esbuild/win32-x64` 缺失。
   解法：`npm install @rollup/rollup-win32-x64-msvc @esbuild/win32-x64 --no-save`
4. **沙箱代理放行名单会变**，别信「刚才还能推」。逐主机探测
   `curl -x $http_proxy -o /dev/null -w "%{http_code}" https://<host>`。`dangerouslyDisableSandbox`
   不解除网络限制。

## 移动端打包（路线 B：Capacitor，2026-10-14 已落地）
决策：自用 + 别人 clone 可用 / iOS 要能用 / **不做系统通知** / 走 Capacitor 套壳。
- 依赖：Capacitor **8.5.3**（core/app/keyboard/status-bar + cli@dev + android/ios 平台）。
  **工具链硬要求：Node 22+ / Xcode 26+ / Android Studio Otter 2025.2.1+。**
- `capacitor.config.ts`（`webDir: 'dist'`，`plugins.Keyboard.resize: 'native'`）。
  ⚠️ **刻意不改 `server.iosScheme`**（默认 `capacitor`）：网上「改 scheme」是**从 Cordova 迁移**
  的处方（origin 变了旧数据读不到）；本项目无历史 origin，且 **WKWebView 不允许接管 http/https**。
- **真正的风险是 iOS 会回收 WebView 网站数据**（IndexedDB 可能被清空），
  而本项目 100% 数据在本地且无导出能力 → 「数据导出/导入」应提到最高优先级（PRD 里还在 P1）。
- `android/` `ios/` **入库**；`.gitignore` 只忽略 build/Pods/`cap sync` 生成物。
- `src/platform/capacitorBridge.ts`：切后台 `appStateChange` 强制 flush + 状态栏配色跟随主题 +
  去 iOS 键盘工具条。**只被 `main.tsx` import** —— 因为 `@capacitor/*` 进 vitest 的 node
  环境有风险，绝不能被 `store/` 或任何被测试 import 的模块牵连。内部全部用
  `Capacitor.isNativePlatform()` 兜住，Web 构建零副作用。
- `capacitor.config.ts` 已加进 `tsconfig.node.json` 的 include：配置键写错只有 tsc 能发现，
  `cap sync` 会静默忽略未知键（`ios: { scheme }` 就是这么被抓出来的，正确写法是
  顶层 `server.iosScheme`）。
- scripts：`mobile:sync` / `mobile:android` / `mobile:ios`。
- `vite.config.ts` 的 `base` = `process.env.VITE_BASE_PATH ?? '/'`（Pages 子路径部署用，
  默认不影响本地与 Capacitor）。
- CI：`.github/workflows/{ci,mobile,pages}.yml` —— 网页闸门 / Android debug APK /
  **iOS 未签名 .app**（装不上 iPhone，需 Xcode + 免费 Apple ID 签名，7 天有效期）/ Pages 部署。
  iOS job 用 `macos-26` runner（Capacitor 8 要 Xcode 26+）。
- 🔴 **Capacitor 8 的 iOS 工程是纯 SPM**：`ios/App/` 下**没有 `.xcworkspace`、没有 `Podfile`**，
  插件依赖走 `ios/App/CapApp-SPM/Package.swift`。所以 xcodebuild 必须用
  **`-project ios/App/App.xcodeproj`**，写 `-workspace` 会直接报「does not exist」。
  （我最初就是照老经验写了 -workspace，靠 `ls ios/App` 才发现的。）

## ⚠️ 已知未修问题（发现即记账，别重复发现）
- **数据导出 / 导入缺失**：配合 Capacitor 后这是最高优先级风险（见上节 iOS 回收数据）。
- ~~键盘避让未接通~~ **已于 2026-10-14 修掉**：`Sheet` 现在消费 `--keyboard-offset`
  （外层 `paddingBottom: var(--keyboard-offset,0px)` + 面板 `maxHeight` 减去同值；
  无键盘时变量不存在→回落 0px，布局与修复前一致）。
- **文档仍把分层红线说成 ESLint 强制**（真实是 `check-layers.mjs`）：
  `ARCHITECTURE.md:23/24/2106` + §3.3、`TASKS.md:31/139/180/386/394/436`；
  但 `ARCHITECTURE.md:255` 已有正确更正注，属内部不一致。
- **PRD `L667`** 仍写「环形图用 SVG 手写或轻量库」，而环形图 UI 已移除。
