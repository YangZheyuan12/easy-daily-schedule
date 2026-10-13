# scripts/tools —— 界面验证 / 截图 / 度量工具链

基于 `puppeteer-core` 的一次性**运行时验收工具集**：驱动一份真实 Chrome 打开本项目的 dev server，
对**字号、时间选择器、底部导航、动效、日历缩放溢出**等做视觉与运行时的量测、截图、对照。
它们不是单元测试（那在 `src/` 里由 vitest 跑），而是「肉眼 + 读数」的验收辅助——截图看不出的
裁字 / 溢出 / 动画，靠这些脚本读 computed style 与逐帧采样来判定。

> 这批脚本原先散落在 `.workbuddy/tmp/`（scratch，不入库，随时可能被清理）。为免丢失，已整体迁到本目录
> `scripts/tools/` 并纳入版本控制。文件名一律保持不变（记忆文件与文档可能按名引用）。

## 前置条件（重要，先读）

1. **`puppeteer-core` 当前不在项目依赖里。** 这批脚本靠 `.workbuddy/tmp/node_modules` 才能 `require`
   到它；迁到 `scripts/tools/` 后，Node 会从本目录向上找 `node_modules`，**找不到** `puppeteer-core`。
   两种解法（任选其一，本项目**不擅自改 `package.json`**）：
   - 安装为开发依赖：`npm i -D puppeteer-core`
   - 或复用旧的 tmp 依赖目录：`NODE_PATH=.workbuddy/tmp/node_modules node scripts/tools/xxx.js`
2. **模块作用域**：这 24 个脚本是 CommonJS（`require`），而项目根 `package.json` 声明了
   `"type": "module"`。本目录下的 `package.json` 只有一行 `"type": "commonjs"`（**无依赖**），
   作用是把 `scripts/tools/` 划回 CommonJS——否则 `require` 会在 ESM 作用域下报
   `require is not defined in ES module scope`。**不要删它。**
2. **需要一份 Chrome / Edge。** 脚本默认写死 `C:/Program Files/Google/Chrome/Application/chrome.exe`
   （仅 `overflow-scan.js` 支持用 `CHROME_PATH` 覆盖）。
3. **需要一个已启动的 dev server**：先 `npm run dev`。注意脚本里 **5173 与 5174 两种端口混用**：
   绝大多数写死 `http://localhost:5173`（`const BASE`），`screenshot.js` 与 `trace.js` 用 `5174`。
   端口不符时改脚本里的 `BASE`，或让 dev server 落在对应端口（`overflow-scan.js` 可用 `BASE_URL` 覆盖）。

## 环境变量

| 变量 | 适用脚本 | 默认 | 说明 |
| --- | --- | --- | --- |
| `BASE_URL` | `overflow-scan.js` | `http://localhost:5173` | dev server 地址 |
| `CHROME_PATH` | `overflow-scan.js` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | 浏览器可执行文件路径 |

```bash
BASE_URL=http://localhost:5174 CHROME_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe" \
  node scripts/tools/overflow-scan.js
```

> 只有 `overflow-scan.js` 做了环境变量化——它是**项目约定**要求「每次改字号都要跑」的裁字扫描器，
> 端口/浏览器可配置才实用。其余脚本保持原样（不在本次改动范围内）。

## 生成物落点（别误提交）

脚本运行时会写出文件，多数落在**本目录**或项目 `designs/`：

- 落在本目录：`frames/`、`spec/`、`*.html`（`filmstrip.html` / `fontcompare.html` / `board-round4.html`）、
  `v-*.png` / `t-*.png` / `m-repro.png` / `sh-*.png` 等中间截图。
- 落在项目 `designs/`：`impl-*.png`、`motion-00-拉片.png` 等成品对照图（这些是**要入库**的交付图）。

本目录下的中间产物**不应提交**；`designs/` 下的成品图是预期产物。

## 分类

### 一、活工具（建议常用，16 个）

| 脚本 | 做什么 | 运行方式 |
| --- | --- | --- |
| `overflow-scan.js` | **约定强制**：逐屏扫描「文字被裁」的元素，报 `scrollWidth-clientWidth` 差值。**每次改字号必跑** | `node scripts/tools/overflow-scan.js` |
| `screenshot.js` | 指定 URL 截一张图（通用小工具） | `node scripts/tools/screenshot.js [url] [out.png]` |
| `shots.js` | 逐路由（今日/任务/时间轴/日历/我的）整页截图，写出 `v-*.png` | `node scripts/tools/shots.js` |
| `seed-shot.js` | 先播种演示数据再整屏截图（适配 TimeRuler 抽屉） | `node scripts/tools/seed-shot.js` |
| `nav-metrics.js` | 量底部导航实际尺寸 + 悬浮元素是否压住导航，写 `designs/z-after-tabbar.png` | `node scripts/tools/nav-metrics.js` |
| `ruler-check.js` | 检查放大后刻度尺两行数字有没有被裁/错位 | `node scripts/tools/ruler-check.js` |
| `timepicker-spec.js` | 从真实界面裁出时间选择器各状态，拼成状态规格对照图 | `node scripts/tools/timepicker-spec.js` |
| `typography.js` | 字号放大 + 时间刻度尺验收：读字号层级/ hover 加深 / 拖动滚动量 / 保存态 | `node scripts/tools/typography.js` |
| `fontscale.js` | **字号刻度 codemod**：把 `text-[Npx]` 机械替换成语义类名。⚠️ **会改写 `src/` 下文件** | `node scripts/tools/fontscale.js` |
| `font-compare.js` | 字号对齐「改前/改后」对照图（读 `designs/` 下的截图） | `node scripts/tools/font-compare.js` |
| `deliver.js` | 交付截图：字号放大 + 新版时间选择器，输出到 `designs/` | `node scripts/tools/deliver.js` |
| `round4-verify.js` | 本轮四项改动的运行时验收（任务行上下移换位、月↔年切换动画、关于精简、副标题不裁字） | `node scripts/tools/round4-verify.js` |
| `typo-verify.js` | 时间抽屉行为回归（打开复位、结束早于开始不落负区间、时间列不越界、保存态配色） | `node scripts/tools/typo-verify.js` |
| `board-round4.js` | 验收板 v2：元素级截图 + 原生裁切拼板，产出 `designs/impl-22-本轮改动.png` | `node scripts/tools/board-round4.js` |
| `filmstrip.js` | 抓动效逐帧（刻度/tab/抽屉/卡片/拖动）拼成「拉片」，产出 `designs/motion-00-拉片.png` | `node scripts/tools/filmstrip.js` |
| `trace.js` | 通用排障：打印页面 console / pageerror / HTTP≥400 响应 | `node scripts/tools/trace.js` |

### 二、历史迭代版（后者取代前者，通常不必再跑，6 个）

| 脚本 | 做什么 | 运行方式 |
| --- | --- | --- |
| `motion.js` | 早期「动效证明」脚本（读实时样式证「动」而非「跳」） | `node scripts/tools/motion.js` |
| `motion2.js` | `motion.js` 的迭代版 | `node scripts/tools/motion2.js` |
| `motion3.js` | `motion2.js` 的最新迭代版 | `node scripts/tools/motion3.js` |
| `zoom-overflow.js` | 初版：测月↔年缩放动画是否撑出横向滚动（选择器未命中，结论不算数） | `node scripts/tools/zoom-overflow.js` |
| `zoom-overflow2.js` | 重测：每帧重查面板节点（key 变化会换节点，旧引用 rect 全 0） | `node scripts/tools/zoom-overflow2.js` |
| `zoom-overflow3.js` | 复验：`m-zoom-in`（1.04→1）不再撑出横向溢出，页头 sticky 不受影响 | `node scripts/tools/zoom-overflow3.js` |

### 三、已结案的一次性复现脚本（对应已修复的 bug，2 个）

| 脚本 | 做什么 | 运行方式 |
| --- | --- | --- |
| `move-repro.js` | 复现「任务行上移/下移点了没反应」（看点击后 DOM 里输入框 value 顺序是否变） | `node scripts/tools/move-repro.js` |
| `pickdate.js` | 复现「日历选日」问题 | `node scripts/tools/pickdate.js` |

## 分类依据（一句话）

- **活工具 / 历史迭代版 / 已结案**：以首行注释为准——无注释但按 `motion`/`zoom-overflow` 尾号递增、
  且时间戳逐分钟递进、后者注释里写明「重测 / 复验」的，判为同一条调查链上的迭代版，后者取代前者；
  注释写明「复现 XXX」且对应 bug 已由回归脚本覆盖的，判为已结案一次性脚本。
- `fontscale.js` 虽被归入「活工具」，但它其实是**改源码的 codemod**（不是纯验收），已在表中标 ⚠️。
- `filmstrip.js` 无首行注释，但其产出 `designs/motion-00-拉片.png` 是长期交付物，判为活工具。

## 已知注意事项

- **`font-compare.js` 的输入缺失**：它读 `designs/z-before-*.png` / `designs/z-after-*.png`，
  而这些文件当前**不在** `designs/` 里（与本次迁移无关，历史遗留）——运行会读文件失败。
- **`board-round4.js` 依赖 `designs/` 输入**：读 `impl-11-任务-字号放大.png`、`impl-21-我的-对齐后.png`、
  `impl-25-日历-月视图.png`、`impl-26-日历-年视图.png`（均在库）。
- **中间产物写在脚本同目录**：`board-round4.js`（`sh-*.png`、`board-round4.html`）与 `move-repro.js`
  （`m-repro.png`）的中间产物落在本目录——它们原写死在 `.workbuddy/tmp/`，随脚本迁出后改为相对脚本自身位置，
  同一轮内写出即读回，因此不依赖 tmp 的既存文件。
