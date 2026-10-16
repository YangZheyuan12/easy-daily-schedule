# 项目长期记忆 · 日程表软件（daily_schedule_app）

## 定位与选型（2026-10 快照）
移动端优先 **H5 网页**（Vite5+React18+TS+Tailwind3 手写组件），Capacitor 8 套壳，HashRouter。
5 Tab：今日/时间轴/任务/日历/我的。**纯前端无后端**，数据全存 IndexedDB（Dexie4 v4 七表：
items/tasks/days/selfStatus/timeSlots/inspirations/itemImages，每个 `version(n)` 必须声明完整 schema）。
状态 Zustand4.5（选择器订阅；`getState()` 可 React 外调）。ID nanoid（禁 `crypto.randomUUID`）；
日期自写 `utils/date.ts` 本地时区（禁 `toISOString().slice(0,10)`）。

## 架构红线（CRITICAL）
1. 分层单向：UI → Store → services → domain；repositories 是 domain/ports 适配器，`createRepositories()` 唯一装配点。
2. `domain/`+`services/` 禁 window/document/localStorage/indexedDB/visualViewport（迁小程序前提），
   `scripts/check-layers.mjs`（`npm run check:layers`）卡口；**项目无 eslint/prettier**，别说成 ESLint 强制。
3. 🔴 check-layers 是**正则**：services 里变量不能叫 `window`/`document`/`location`/`history`（曾踩 23 处）。
4. 树用邻接表（id+parentId+order）；**展示顺序一律从 order 派生**（`.filter(alive).sort(compareByOrder)`），不是数组位置。
5. 软删只改 `deletedAt`；持久化=输入防抖 500ms+离散操作立即写+`visibilitychange`/`pagehide` flush。
6. `SectionKey` 从 `@/domain/enums` 导入，不在 `domain/types` 导出（曾 TS2459）。

## 主题 / 字号 / 底栏
三主题 paper/plain/nocturne 六维同变；语义类名永不变、值换变量（`bg-surface`/`text-ink-faint`/`rounded-card`），
变量 `R G B` 三元组 + Tailwind `rgb(var(--c-x) / <alpha-value>)`，**不写回 hex**；`useApplyTheme` 唯一写 `data-theme`。
字号八档 micro12…display32 只此一份，组件禁 `text-[15px]`，13px 可读地板。底栏占 86px：主按钮/UndoBar
`bottom-[100px]`、内容 `pb-[120px]`。🔴 键盘弹起底栏整条收下去（`useKeyboardVisible`），别改 capacitor Keyboard.resize。

## 业务口径（含 2026-10-15/16 用户决策）
- 板块完成率=顶层完成÷顶层总数；加权作 `DaySummary.overall`；主页编号仅四板块顶层条目跨组 1~N。
- 时间段带 sectionId 按 done 折进板块；灵感只贡献「有记录」。order 步长 1000；撤销 5s；软删 7 天清理。
- 🔴 全应用列表无行内勾选框；完成态=删除线+淡化，切换走详情。
- 🔴 今日页主页直接编辑：点标题行内编辑（Enter/失焦提交、Esc 取消、空保留原标题）；行尾「⋯」→
  `useUiStore.openDrawer` 打开与板块页**同一张** ItemSheet。时间段投影行只读。板块页保留非必经。
- 时间段同步到今日：`Item.sourceSlotId` 去重（零 Dexie 变更）；今日页有存活条目指向它的时段**不投影**
  （删同步条目投影回来）；未分组不可同步、已同步锁定。
- 条目详情抽屉**无「完成」**：主操作位是删除（仍过 ConfirmDialog）。
- 任务行第二行=分组+描述同一行；删除有退场动效（`m-row-exit`，280ms 后才软删）。
- 🔴 **进度显示已删**（2026-10-16）：今日组头 x/y、工作页副标题「完成 x%」、田字格 x/y、板块树父行
  子项 x/y 全移除；`progressService` 与日历摘要卡口径保留；任务页副标题/进度条未动（用户未提）。
- 🔴 **展开/收起跨页保持**（2026-10-16）：`useUiStore.expansions`（key→bool）+ `hooks/useExpanded(key, default)`；
  TaskPreviewCard(`expandKey`)、CollapsibleCard、SelfStatusCard、SectionRow、ImageStrip、
  ReminderBanner(`dismissedReminder`) 都走它。刷新重置。key：`tasks:*`/`me:*`/`today:*`/`images:{itemId}`。

## 浮层 / 导航
- 「回到今天」：今日/时间轴天视图非今天 → 胶囊变「回到今天」；任务页非今天 → right 出按钮。
- 🔴 `ui/Popover.tsx` 传 `anchorRef` 才不遮挡：portal 到 body+fixed+z-[55]，layout effect 摆位、
  scroll 捕获跟随、放不下上翻；根因是层叠上下文不是 z-index。`m-pop-tr`/`m-pop-tl` 角上放大。
- 日历双语义 `location.state.pickDateFrom`；两种模式都写 `useDayStore.setDate`。

## 板块自定义（R-048）
名称/颜色/图标可改，键与数量固定 4。显示一律走 `useSectionConfigs()`，别 import `SECTION_CONFIGS`（=过期默认值）。
`color: string | null`，null=没改过。持久化 settings 键 `sectionProfiles`。

## 其它模块
农历 R-040 `services/lunar/`（+8h 定日，越界返 null）；备份 R-047 `services/backupService.ts`（合并/覆盖，
🔴 纯本地删了找不回）；课表 R-049 网页登录后复制粘贴+`platform/textCodec`（GBK 兜底）+`TimeSlot.seriesId`
整批软删清旧。🔴 appId `com.yangzheyuan.dailyschedule` 是数据连续性红线，先删旧版再装=全丢。

## 验收教训
1. `tsc --noEmit` 单独跑。2. 🔴 沙箱 EPERM 会静默丢测试文件（退出码 0）→ 必核对
   Test Files = `find src -name "*.test.ts" | wc -l`。3. 自写校验脚本先负向验证。
4. 测试只收 `*.test.ts`；组件测试首行 `// @vitest-environment jsdom`+`createElement`。
5. 文档数字写「冻结快照+采集时间」。

## 版本控制 / 环境
远端 github.com/YangZheyuan12/easy-daily-schedule（公开）。git 必须用 `/d/apps/Git/cmd/git.exe`；
🔴 push 报 502 / SSL unexpected eof 时：**沙箱外（dangerouslyDisableSandbox）+ 清空代理变量**
`https_proxy= http_proxy= HTTPS_PROXY= HTTP_PROXY= git push origin main` 才通（沙箱内代理必挂、
直连必 reset；fetch 间歇可用但不可依赖；偶发 SIGTERM 无输出=重试即可）。curl 不通 ≠ git 不通。
命令：`npm run verify`（layers+typecheck+test+build）/ `npm test` / `npm run test:strict`。

## Android 签名（2026-10-16 建成）
专用 keystore=`android/dailyschedule.keystore`（RSA2048/10000天/别名 dailyschedule/密码在
`android/app/keystore.properties`，两文件均 gitignore 未提交）。debug/release 共用它 → 本地构建
签名即固定。versionCode 已 2→3。CI：mobile.yml 探测式——配了 4 个 secrets
（ANDROID_KEYSTORE_BASE64/_PASSWORD、KEY_ALIAS、KEY_PASSWORD）才出签名 release 包并上传；
没配只跑 debug 构建验证、不上传产物、job 绿。🔴 用户手机旧签名包升级仍需卸载一次（先备份）。
