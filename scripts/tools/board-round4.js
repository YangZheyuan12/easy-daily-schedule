/**
 * 验收板 v2：所有「改后」用**元素级截图**（精确），
 * 所有「改前」用**原生分辨率裁切**（在 780px 宽的页面里 1:1 截取，不用猜 margin）。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:5173';
// 中间裁切产物写在脚本同目录（原为写死的 .workbuddy/tmp，随脚本迁出；同一轮内写出即读回）
const TMP = path.resolve(__dirname);
const DESIGNS = 'D:/myProjects/日程表软件/designs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataUri = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

/** 在原生分辨率下裁切一张 780px 宽的整页图（y/height 为源像素） */
async function crop(browser, src, y, height, out) {
  const p = await browser.newPage();
  await p.setViewport({ width: 780, height: 400, deviceScaleFactor: 1 });
  await p.setContent(
    `<style>*{margin:0;padding:0}div{position:relative;width:780px;height:${height}px;overflow:hidden}` +
      `img{position:absolute;top:-${y}px;left:0;width:780px;display:block}</style>` +
      `<div><img src="${dataUri(src)}"></div>`,
    { waitUntil: 'networkidle0' },
  );
  await sleep(150);
  await p.screenshot({ path: out, clip: { x: 0, y: 0, width: 780, height } });
  await p.close();
  return out;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // ══ A. 任务页 ══
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0' });
  await sleep(1600);
  for (const t of ['写周报', '看两篇论文', '跑步 5km']) {
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((e) =>
        (e.textContent || '').includes('添加任务'),
      );
      b && b.click();
    });
    await sleep(320);
    await page.keyboard.type(t, { delay: 8 });
    await sleep(200);
  }
  // 标记页头与两个任务行
  await page.evaluate(() => {
    document.querySelector('header').setAttribute('data-shot', 'header');
    const rows = Array.from(document.querySelectorAll('div.flex.items-center.min-h-tap')).filter((d) =>
      d.querySelector('input[placeholder="今天要做什么…"]'),
    );
    rows.forEach((r, i) => r.setAttribute('data-shot', `row${i}`));
  });

  await (await page.$('[data-shot="header"]')).screenshot({ path: path.join(TMP, 'sh-header-after.png') });
  await page.evaluate(() => document.querySelector('input[placeholder="今天要做什么…"]').focus());
  await sleep(450);
  await (await page.$('[data-shot="row0"]')).screenshot({ path: path.join(TMP, 'sh-row0.png') });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[placeholder="今天要做什么…"]'))[1].focus(),
  );
  await sleep(450);
  await (await page.$('[data-shot="row1"]')).screenshot({ path: path.join(TMP, 'sh-row1.png') });

  // 全页（交付用）
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await sleep(450);
  await page.screenshot({ path: path.join(DESIGNS, 'impl-23-任务页-副标题放大.png') });

  // ══ B. 我的页 ══
  await page.goto(`${BASE}/#/me`, { waitUntil: 'networkidle0' });
  await sleep(1400);
  const aboutMeta = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('div')).find(
      (d) => d.firstElementChild && d.firstElementChild.textContent === '关于',
    );
    card.setAttribute('data-shot', 'about');
    const r = card.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  });
  await (await page.$('[data-shot="about"]')).screenshot({ path: path.join(TMP, 'sh-about-after.png') });
  await page.screenshot({ path: path.join(DESIGNS, 'impl-24-我的-关于精简.png') });
  console.log('关于卡（CSS px）：', JSON.stringify(aboutMeta));

  // ══ C. 改前裁切（源图 780 宽 @2x）══
  await crop(browser, path.join(DESIGNS, 'impl-11-任务-字号放大.png'), 0, 190, path.join(TMP, 'sh-header-before.png'));
  await crop(
    browser,
    path.join(DESIGNS, 'impl-21-我的-对齐后.png'),
    Math.round((aboutMeta.top - 10) * 2),
    Math.round((aboutMeta.height + 14) * 2),
    path.join(TMP, 'sh-about-before.png'),
  );
  console.log('裁切完成');

  // ══ D. 拼板 ══
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8" />
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1220px;background:#F7F3EA;font:14px/1.7 "PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#2D2A24;padding:36px 40px 44px}
  h1{font-size:25px;letter-spacing:-.4px}
  .sub{margin-top:5px;font-size:13px;color:#8C8577}
  h2{margin:28px 0 12px;font-size:16px;display:flex;align-items:center;gap:9px}
  h2 .n{width:21px;height:21px;border-radius:999px;background:#8B5E34;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;font-weight:600;flex:0 0 auto}
  h2 small{font-weight:400;color:#8C8577;font-size:12.5px}
  .row{display:grid;gap:20px}
  .c2{grid-template-columns:1fr 1fr}
  .card{background:#fff;border:1px solid #EFE9DC;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(45,42,36,.05)}
  .cap{padding:8px 14px 11px;font-size:12.5px;color:#6B6455}
  .cap b{color:#2D2A24}
  .tag{display:inline-block;font-size:11px;color:#8B5E34;background:#F4EFE4;border-radius:999px;padding:1px 8px;margin-right:6px}
  .shot{background:#FBF7EF;padding:10px 12px}
  .shot img{width:100%;display:block}
  .mono{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#8B5E34}
  ul{margin:6px 0 0 17px;font-size:12.5px;color:#6B6455}li{margin-bottom:2px}
  .note{padding:13px 16px;font-size:12.5px;color:#6B6455;line-height:1.8}
  footer{margin-top:26px;font-size:12px;color:#A39B8B;line-height:1.9;border-top:1px solid #EFE9DC;padding-top:13px}
</style></head><body>
<h1>本轮改动验收 · 4 项</h1>
<div class="sub">截图来自真实运行（390×844 @2x）· 数字为实测 computed style</div>

<h2><span class="n">1</span>页头副标题放大 <small>13px → 15px · 任务 / 日历 / 我的 / 板块详情共用的页头</small></h2>
<div class="row c2">
  <div class="card"><div class="shot"><img src="${dataUri(path.join(TMP, 'sh-header-before.png'))}" /></div>
    <div class="cap"><span class="tag">改前 13px</span>比下面的「完成 x/y」正文还小两档，视线会自动跳过这一行</div></div>
  <div class="card"><div class="shot"><img src="${dataUri(path.join(TMP, 'sh-header-after.png'))}" /></div>
    <div class="cap"><span class="tag">改后 15px</span>日期后的箭头 11→13px；实测 <span class="mono">15px</span>，七屏裁字扫描 <b>0 处</b></div></div>
</div>

<h2><span class="n">2</span>任务行「上移 / 下移」—— 它原来真的坏了 <small>点了没反应是 bug，不是错觉</small></h2>
<div class="row c2">
  <div class="card"><div class="shot"><img src="${dataUri(path.join(TMP, 'sh-row1.png'))}" /></div>
    <div class="cap"><span class="tag">可用</span>两个箭头收进一个下沉底胶囊 = 一件事（重排这一行），删除另起一格</div></div>
  <div class="card"><div class="shot"><img src="${dataUri(path.join(TMP, 'sh-row0.png'))}" /></div>
    <div class="cap"><span class="tag">边界</span>首行「上移」<b>disabled · opacity .25</b>（末行「下移」同理）—— 按钮自己说「到头了」</div></div>
</div>
<div class="card" style="margin-top:16px">
  <div class="note"><b>根因</b>：<span class="mono">useTaskStore.move()</span> 把 <span class="mono">order</span> 换好了，但任务页按<b>数组位置</b>渲染 —— 数据写进库了、页面纹丝不动，<b>刷新一下反而「突然」换了位</b>。<br />
  <b>修法</b>：展示顺序改为从 <span class="mono">order</span> 派生（与板块树 <span class="mono">buildTree</span> 同一套约定）；换位只在<b>存活</b>任务之间进行（软删任务还留在数组里，会白占一次位移），它的 <span class="mono">order</span> 原样保留 —— 删除后撤销即可回到原来的名次。</div>
  <ul style="padding:0 16px 13px 33px">
    <li>实测：<span class="mono">写周报 | 看论文 | 跑步</span> → 点首行「下移」→ <span class="mono">看论文 | 写周报 | 跑步</span> → 刷新后一致 ✓</li>
    <li>新增 15 个用例（store 9 + 渲染 6）。做过双向负向验证：去掉排序 → 4 例变红；不过滤软删 → 4 例变红</li>
  </ul>
</div>

<h2><span class="n">3</span>日历 月 ↔ 年 切换动效 <small>段控滑块横移 + 面板按「拉近 / 拉远」进场</small></h2>
<div class="row c2">
  <div class="card"><div class="shot"><img src="${dataUri(path.join(DESIGNS, 'impl-25-日历-月视图.png'))}" /></div>
    <div class="cap"><span class="tag">月视图</span>滑块在左 · 面板 <span class="mono">m-zoom-in</span>（1.04 → 1 收拢）</div></div>
  <div class="card"><div class="shot"><img src="${dataUri(path.join(DESIGNS, 'impl-26-日历-年视图.png'))}" /></div>
    <div class="cap"><span class="tag">年视图</span>滑块滑到右 · 面板 <span class="mono">m-zoom-out</span>（0.965 → 1 展开）</div></div>
</div>
<div class="card" style="margin-top:16px"><div class="note">
  <b>逐帧实测</b>　滑块 transform：<span class="mono">0 → 33.9 → 50.1 → 54px</span>（280ms，一个段宽）<br />
  进年视图 scale：<span class="mono">0.965 → 0.981 → 0.991 → 1.000</span>　·　进月视图 scale：<span class="mono">1.040 → 1.021 → 1.007 → 1.000</span><br />
  <b>不回弹</b>：整块面板只用 ease-out（动效规则 1，大面板一抖就廉价）。两段等宽 → 位移量恰是一个段宽，不需要 ResizeObserver 测量（少一处会坏的地方）。<br />
  <b>顺带堵住</b>：<span class="mono">1.04×</span> 起手那一刻面板比视口宽约 8px，会闪出横向滚动条。给动画区加 <span class="mono">overflow-x: clip</span>（不用 hidden —— clip 不创建滚动容器，不碰 sticky 页头）；逐帧复测 <span class="mono">scrollWidth 恒为 390 = clientWidth</span>。
</div></div>

<h2><span class="n">4</span>我的页「关于」只留第一句 <small>设置页不是产品介绍页</small></h2>
<div class="row c2">
  <div class="card"><div class="shot"><img src="${dataUri(path.join(TMP, 'sh-about-before.png'))}" /></div>
    <div class="cap"><span class="tag">改前</span>一句话 + 「四大板块 + 树状拆解，30 秒内记完今天做了什么、做得怎么样。」</div></div>
  <div class="card"><div class="shot"><img src="${dataUri(path.join(TMP, 'sh-about-after.png'))}" /></div>
    <div class="cap"><span class="tag">改后</span>只留「一款移动端优先的日程与完成情况记录工具。」+ 版本号</div></div>
</div>

<footer>
  闸门：check:layers ✓（116 源文件）· typecheck ✓ · test:strict ✓ <b>365 用例 · 30 文件 · 0 失败</b> · build ✓（CSS 28.63 kB / JS 359.79 kB）<br />
  裁字扫描（clientWidth vs scrollWidth）：今日 / 任务 / 时间轴 / 日历-月 / 日历-年 / 我的 / 板块详情 —— 全部 0 处 · 页面报错 0
</footer>
</body></html>`;

  const htmlPath = path.join(TMP, 'board-round4.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const board = await browser.newPage();
  await board.setViewport({ width: 1220, height: 1000, deviceScaleFactor: 2 });
  await board.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await sleep(700);
  await board.screenshot({ path: path.join(DESIGNS, 'impl-22-本轮改动.png'), fullPage: true });
  console.log('board =>', path.join(DESIGNS, 'impl-22-本轮改动.png'));

  await browser.close();
})();
