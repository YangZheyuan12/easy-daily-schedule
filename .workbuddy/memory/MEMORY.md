# 项目长期记忆 · 日程表软件（daily_schedule_app）

## 定位与技术选型
移动端优先 H5 日程表，5 个底部 Tab：今日 / 时间轴 / 任务 / 日历 / 我的。
**纯前端无后端**，数据全存 IndexedDB；"启动验收" = `npm run dev`，没有 server/DB 要起。
云同步（`dexie-cloud-addon`）是 P2。
- **今日**：日记体统一列表（工作/学习/健身/生活/灵感五组，顶层条目**跨组连续编号**，不落库）
  + 紧凑自我状态条（mood♥ / body★）。**五组每组底部都有内联快速添加**（R-039），直接落库不跳页；
  组头 / 条目点击才进板块详情页。
- **时间轴**：时间块既可规划（可挂未来日期）也可记录（计划/实际时间 + 完成勾选），应用内到期提醒。
- **四板块**条目支持无限层级缩进树，含任务描述与个人评价（1–5 星 + 文字）。
- **日历 / 节日（R-040 第一期已交付）**：今日页日期栏副标题 + 日历摘要卡标题下显示「农历月日 · 节日」。
  **零联网、零新增依赖**。调休「休 / 班」**不做** —— 它依赖国务院年度公告，这正是零联网得以成立的原因。
  自定义纪念日（R-041）为第二期，未实现。

| 项 | 选型 | 关键理由 |
| --- | --- | --- |
| 构建 / 框架 | Vite 5 + React 18 + TS | — |
| UI | **Tailwind 3 + 手写移动端组件**（MUI 已移除） | MUI 与 Tailwind preflight 冲突、包体 +300KB、迁小程序全废 |
| 路由 | React Router 6（HashRouter） | — |
| 状态 | **Zustand 4.5** | 选择器订阅避免 100+ 节点全量重渲染；`getState()` 可在 React 外调（pagehide flush 刚需）；纯 JS 便于迁小程序 |
| 存储 | **Dexie 4**（IndexedDB） | 复合索引 `[date+sectionId]`、`bulkPut` 批量写（递归软删刚需）、可平滑上云 |
| ID | **nanoid** | 不用 `crypto.randomUUID`（需 secure context，小程序无） |
| 日期 | 自写 `utils/date.ts`，**基于本地时区** | 严禁 `toISOString().slice(0,10)`（UTC 推移 bug） |
| 图表 | 无环形图（进度环被 SelfStatus 取代）；日历打点/迷你月手写 CSS | 不引入 ECharts，零包体 |
| 主题 | **CSS 变量 + `data-theme`，Tailwind 色名全部指向变量** | 零运行时依赖，不引入 next-themes |

## 主题系统（三套，C 为默认）
`paper`（纸感暖白，**默认**）/ `plain`（素白极简）/ `nocturne`（夜航微光，深色）。
差异不只在配色，而是**六维同时变**：底色 / 卡片形态 / 圆角 / 分隔策略 / 阴影 / 信息密度（行距）。
- **语义类名永不变，值换成变量**：`bg-surface` / `text-ink-faint` / `border-edge-strong` / `text-accent` /
  `text-heart` / `text-star` / `rounded-card` 在三主题下自动换值，组件零改动。
- 变量用 `R G B` 三元组（`--c-surface: 255 254 250`），Tailwind 侧写 `rgb(var(--c-surface) / <alpha-value>)`，
  这样 `bg-surface/95` 才生效。**不要写回 hex。**
- 板块色运行时一律用 `sectionColor(cfg)` / `sectionTint(cfg)`（返回 `rgb(var(--c-work))`）；
  `SectionConfig.color/tint` 只作**设计稿基准值**（SVG 属性、测试断言）。组件内联 style 出现 hex = 回归。
- 落点：`src/theme/themes.ts`（纯元数据）/ `useThemeStore.ts`（Zustand + `repos.settings`，key `theme`）/
  `useApplyTheme.ts`（**唯一**写 `data-theme` 处）。`index.html` 有内联防闪烁脚本，读 `dsa:theme`。
- 切换器在「我的」页（`ThemeSwitcher`），每行用**该主题自己的圆角** + 底/面/重音三色预览。

## 架构红线（CRITICAL）
1. **分层严格单向**：UI → Store → services → domain；repositories 作为适配器实现 domain/ports
2. `src/domain/`、`src/services/` **禁止** window / document / localStorage / indexedDB / visualViewport
   —— 迁微信小程序 100% 复用的前提，ESLint `no-restricted-globals` + `check:layers` 双卡口
3. `src/repositories/` 是唯一允许碰存储 API 的地方；`repositories/index.ts` 是**唯一装配点**
4. 树用**邻接表**（`id` + `parentId` + 同层 `order`），不用嵌套 JSON / 物化路径
5. **软删只改 `deletedAt`，其他字段一律不动** —— 撤销能完整恢复层级/顺序/折叠态的根本前提
6. 持久化：输入防抖 500ms + 离散操作立即写 + `visibilitychange`/`pagehide` 强制 flush

## 日历页双语义（导航约定）
只有**一个**日历组件，靠 `location.state.pickDateFrom` 分语义：
- **回看**（底部 Tab 进）：点一格只更新摘要卡，不跳页 —— 回看要连着比好几天，跳页会丢月份
- **选日子**（今日 / 任务 / 时间轴的日期点进来）：点一格 → `useDayStore.setDate` +
  `navigate(pickFrom, {replace:true})` 回原页，并临时补返回按钮。
  **不要再新开 DatePickerSheet** —— 日历取数逻辑会被复制两份。
入口：今日页 `DateNavigator.onDateClick`、任务页 `PageHeader.subtitle` 里的 `<button aria-label="选择日期">`、
时间轴页 `onDateClick`。因此 `PageHeader.subtitle` 类型是 `ReactNode`（只让「日期」可点，「完成 2/6」纯文本）。
**`?date=` 参数必须经 `isValidDateKey` 校验后单向 bootstrap 进 `useDayStore`**，不得再引入第二个日期变量。

## 字号刻度（Font scale）
- **八档**写在 `src/styles/index.css` 的 `:root{--fs-*}`，映射进 `tailwind.config.ts` 的 `fontSize`：
  `micro 12 / caption 13 / meta 14 / body 15 / lead 16 / heading 18 / title 24 / display 32`。
- **组件里禁止写 `text-[15px]`**，一律语义类名。整站缩放只改那八行。值写成纯字符串（不带 lineHeight），
  否则会盖掉组件里的 `leading-*`。**字号不进主题系统**，只定义一份。
- **两条铁律**：① **13px 是可读文字的地板**，「今日」是基准屏（组头 18 / 顶层条目 16 / 子项与输入 15 /
  计数 13），其余屏不得更小；12px 只留给塞不下的计数徽标（目前仅 `TreeRow`）。
  ② **每次提档都要跑裁字扫描** `.workbuddy/tmp/overflow-scan.js`。
- 今日页层级：组头 heading(18,600) ＞ 顶层条目 lead(16) ＞ 内联添加 body(15, 弱化色)。
- **`PageHeader` 副标题 = `text-body`(15)**，**四屏共用**（任务/日历/我的/板块详情）→ 改它必跑裁字扫描。
- `DateNavigator.subtitleText` 用 `text-caption`(13)；时间轴时间列 14（**列宽必须 ≥100px**，否则 `09:00–10:00` 折行）。

## 底部导航与安全区
- 胶囊 **h70** · 图标 **21** · 标签 `text-caption`(13) · 内 padding 4 · 底距 16。
- **联动值，改一处必须同步四处**：70 + 16 = 占 86px → 三处主操作按钮与 `UndoBar` 用 `bottom-[100px]`
  （留 14px 缝）、`AppShell` 内容 `pb-[120px]`。
- **安全区只能叠加、不能替代**：`safe-top`/`safe-bottom` 与 `spacing.safe` 是覆盖式的，非刘海屏下会把同元素的
  `pb-4`/`pt-2` 一起清零。已全部删除，一律显式 calc：`pb-[calc(16px+env(safe-area-inset-bottom))]`。

## 概念稿规格基线（别再凭感觉猜）
概念稿 = Ardot 文件 `735618508376319`（区 `3:4` 是 C 完整版 7 屏），导出 PNG 在 `designs/C*.png`。
**改 UI 前先用 `batch_read` 读节点树 + `capture_layout` 核尺寸**，比对着截图猜快得多。
概念稿原始字号（Tab 10 / 星期 11 / 辅助 12 / 组头·按钮 13 / 条目·输入 14 / 顶层 15 / Sheet 标题 17 /
主标题 22）**仅作历史参考，不要再拿它对 UI** —— 已两轮整体放大。规范图：
`designs/typography-01-字号刻度v2.png`（旧的九档版已作废，移到 `.workbuddy/tmp/`）。
- 组头 h32 · 色点 8×8 · 组名 heading(18) SemiBold；顶层条目 h34 · 编号 caption · 勾选框 18×18 r9 · 标题 lead(16)；
  子项 h30 · paddingLeft 24 · 勾选框 15×15 · 标题 body(15)
- 内联快速添加 h40 · r10 · 底 `#F4EFE4` · 提示 body(15) · 「添加」meta(14)
- 底部 Tab 图标：今日 **太阳** / 任务 清单 / 时间轴 时钟 / 日历 日历 / 我的 **人形**（`Icon` 的 `sun`/`user`）
- 时间轴屏**没有页面大标题**，直接以日期导航开场；其余屏有 title(24) 主标题
- `SectionConfig.placeholder`：四板块统一 **「记录一项{板块}…」**，灵感组 `记录一条灵感…`

## 业务口径约定
- 板块完成率 = **顶层条目**完成数 ÷ 顶层总数；子项**不重复计入分母**；父条目显示直系 `子项完成/子项总数`
- 加权口径（Σ顶层完成 ÷ Σ顶层总数）作 `DaySummary.overall` 用于日历摘要卡（主页进度环已移除）
- 主页编号 = 展示序号，仅四板块**顶层条目**跨组连续 1~N；子项 / 灵感不编号
- 时间段带 `sectionId` 时按 `done` 折叠进该板块完成度；不带只贡献「当天有记录」。
  灵感只贡献「有记录」，不进 sections/overall/日历色点
- `order` 步长 1000，中点插入；精度耗尽时同层重排。**新增末位公式**：
  `children.length === 0 ? ORDER_STEP : maxOrderOf(children) + ORDER_STEP`
- **🔴 展示顺序一律从 `order` 派生，不是数组位置**（与 `buildTree` 排子节点同一套约定）：
  渲染端 `.filter(alive).sort(compareByOrder)`；`useTaskStore.move` 只在**存活**任务之间换位
  （软删任务仍留在数组里，会白占一次位移），其 `order` 原样保留 → 撤销自动回原名次。
  `compareByOrder` 在 `src/domain/constants.ts`（排序是业务规则，store 与仓储共用一份）。
  **曾踩的真 bug**：`move()` 换好了 `order`、页面却按数组顺序 `map` 渲染 → 「按钮点了没反应、刷新反而换了位」。
- Tab 只能挂到「上一个同级兄弟」下；Shift+Tab 子树 level 递归 -1。层级上限软提示 8 层；撤销窗口 5s；
  软删 7 天后启动时物理清理
- **主页快捷新增（R-039）落库路径不同**：灵感走 `useInspirationStore.add(date, content)`；
  四板块走 `useItemStore.addSibling(null, date, sectionId, title)`（`anchorId=null` 追加该板块顶层末尾）。
  **必须一次性带标题建成，禁止「先建空条目再 setTitle」**（两次落盘 + 瞬时空标题条目）。
- 往某板块内联新增会让后续板块**编号顺延**（work 变 1、2 则 study 顺延为 3）—— 定义决定的，不是 bug
- **空状态必须可操作**：曾为了「清爽」在 `diaryService` 里 `if (rows.length === 0) continue;`，
  把空板块连同它的新增入口一起隐藏了。空容器可以省，**入口不能省**。

## 农历 / 节气 / 节日（R-040，第一期）
- 落点：`src/services/lunar/lunarData.ts`（压缩农历表 `LUNAR_INFO` 201 项，1900–2100）、
  `lunar/lunarService.ts`（`solarToLunar` / `lunarToSolar` / `formatLunarMonthDay` / `lunarMonthDays` / `leapMonthOf`）、
  `solarTermService.ts`、`festivalService.ts`（`getFestivals` / `getFestivalLine`）、
  `src/hooks/useDayFestivals.ts`（UI 唯一入口）。
- **节气 ≠ 查表**：`solarTermService` 实时求解**太阳视黄经**（Meeus 第 25 章低精度）+ 牛顿迭代 +
  纯整数 JDN↔公历换算 **+8h 北京时间定日**，目标黄经 `λ(k) = (285 + 15k) mod 360`，k=0..23。
  **禁止退回平均值紧凑公式** —— 那条路有真实偏差（1980 立春、1980 冬至、2010 惊蛰、2010 立秋 全错一天）。
  也**不得用 `new Date(ms).getUTCDate()` 定日**（节气按北京时间定义，UTC 会串一天）。
- 农历表**用外部锚点验证**：结构不变量（月长之和 == 两个正月初一之间的天数）是**同义反复**，
  两边解的是同一段比特，堵不住表损坏。只有「已知春节日期」「已知闰月」这类外部事实才是真锚点。
  已知残留：不改变年长的闰月**序号**篡改，若该年不在闰月锚点集合内，仍检不出。
- `lunarToSolar` 结果越出 `SUPPORTED_SOLAR_MIN/MAX`（1900-01-31 / 2100-12-31）返回 `null`，保证往返一致。
- `getFestivalLine` = ≤2 个节日名用 `' · '` 连接，优先级 农历传统 ＞ 公历 ＞ 西方 ＞ 节气；
  除夕按当年腊月**实际天数**算（`lunarMonthDays`，不写死 30）；清明只走节气通道产出一次，不重复。
- 展示点**仅两处**：今日页 `DateNavigator.subtitleText`、日历页 `DaySummaryCard`
  （`data-testid="day-summary-festival"`）。**月历格子与年视图不显示**，格子高度不变；时间轴页不传副标题。
  不传 / 传空串时 **DOM 与加此功能前逐字节一致**（`hasSubtitle && 'min-w-0'` 条件类名）。

## 数据实体（Dexie v3，`DB_VERSION = 3`）
`items`(树) / `tasks` / `days` / `selfStatus: '&date'` / `timeSlots: '&id, date, [date+sectionId], deletedAt'` /
`inspirations: '&id, date, deletedAt'`。v1→v2 删 `reviews`；v2→v3 加 `inspirations`。
**R-040 第一期零新表、零 schema 变更。**

## 文档索引
- `docs/PRD.md` — 产品需求（R-001~R-016、R-030~R-041；R-039 内联快速添加，R-040 农历/节气/节日，R-041 纪念日=二期未实现）
- `docs/ARCHITECTURE.md` — 系统架构 v1.5/1.6（§4 现状稿对齐真实 `src/`；§9-B~§9-E 增量专章；附录 B 追溯矩阵）
- `docs/TASKS.md` — 任务分解（T01–T16 = P0/P1，T17–T33 = 各增量；里程碑 M1–M10）
- `README.md` — 启动方式、能力表、MVP 验收路径

## 常用命令
```bash
npm run dev            # 开发服务器（host 已开，手机同局域网可访问）
npm run verify         # check:layers + typecheck + test + build 一条龙
npm run check:layers   # 分层红线检查（自写 node 脚本，零额外依赖）
npm test               # vitest 标准快路径
npm run test:strict    # 逐文件执行 vitest 并校验无文件被漏跑（防静默丢文件）
```

## 🔴 五条必须牢记的验收教训
1. **`tsc --noEmit` 必须单独跑，测试绿 ≠ 代码干净。**
   实际发生过：重复的两行 `import type` 造成 TS2300，但 vitest 全绿、`vite build` 也通过
   ——`import type` 运行时被完全擦除，测试与打包都看不见。**只有 tsc 能发现。**
2. **`npm test` 显绿不等于跑全了。** 沙箱会让 vitest 偶发 EPERM 并**静默丢掉某个测试文件**，
   退出码仍是 0。重定向 TEMP/TMP 到项目内目录**无效**（已回滚）。怀疑漏跑用 `npm run test:strict`。
3. **任何自写的校验脚本，必须先做负向验证：证明它真的会失败。**
   `test:strict` 上线时全绿，但造反例后发现它把「1 个用例失败」误报成「环境 EPERM」——
   宽松正则 `/Tests\s+/` 先命中了失败彩带标题而非底部 summary。
   一个只在绿灯路径验证过的工具，给出的「通过」毫无信息量。
4. **测试文件名只能是 `*.test.ts`，写 `.test.tsx` 是「双漏」。**
   `vite.config.ts` 的 `test.include` 与 `scripts/check-test-baseline.mjs` 都只收 `*.test.ts`
   —— `.test.tsx` vitest 不跑、strict 脚本也不收，是最坏的一种假保护。
   组件测试统一 `.test.ts`：首行 `// @vitest-environment jsdom`（单文件生效）+ 用 `createElement` 代替 JSX。
5. **验证期间工作树是「移动靶」，闸门数字必须在最后一个写者停下后才采信。**
   踩过三次：串跑 tsc→test→build 时 `build` 红在 `TS6133`（298 用例仍全绿）；§4 快照后 QA 又补测试，行数差 37；同类再差 14。
   **纪律**：跑闸门前先 `grep -rn "NEGATIVE-VERIFY" src/` 确认无破坏残留 + 确认所有写者已停；
   文档里的文件数/行数一律写「冻结快照 + 采集时间」，**从属句里的数字改写成不依赖数值的表述**
   （如「不计入上表合计」），否则主合计一变从属句就会再次过期。

## 环境坑（Windows + npm 10.9.7）
npm 的 optional dependencies bug 会导致 `@rollup/rollup-win32-x64-msvc`、`@esbuild/win32-x64` 缺失，
vite/vitest 启动即报 MODULE_NOT_FOUND。
解法：`npm install @rollup/rollup-win32-x64-msvc @esbuild/win32-x64 --no-save`
