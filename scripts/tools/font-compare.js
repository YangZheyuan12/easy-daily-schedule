/* 字号对齐 · 改前/改后 对照图 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const DESIGNS = path.resolve(__dirname, '..', '..', 'designs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCREENS = [
  ['今日', 'z-before-today.png', 'z-after-today.png'],
  ['任务', 'z-before-tasks.png', 'z-after-tasks.png'],
  ['时间轴', 'z-before-timeline.png', 'z-after-timeline.png'],
  ['日历', 'z-before-calendar.png', 'z-after-calendar.png'],
  ['我的', 'z-before-me.png', 'z-after-me.png'],
  ['添加时间段抽屉', 'z-before-sheet.png', 'z-after-sheet.png'],
];

const dataUri = (file) =>
  `data:image/png;base64,${fs.readFileSync(path.join(DESIGNS, file)).toString('base64')}`;

const blocks = SCREENS.map(
  ([name, before, after]) => `
  <div class="block">
    <div class="bt">${name}</div>
    <div class="pair">
      <figure><img src="${dataUri(before)}" /><figcaption>改前</figcaption></figure>
      <figure><img src="${dataUri(after)}" /><figcaption>改后</figcaption></figure>
    </div>
  </div>`,
).join('');

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><style>
  *{box-sizing:border-box}
  body{margin:0;padding:36px 40px 34px;width:1440px;background:#fbf8f2;color:#2d2a24;
    font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;
    -webkit-font-smoothing:antialiased}
  h1{font-size:26px;margin:0;letter-spacing:-.3px}
  .sub{margin-top:8px;font-size:13.5px;color:#6b6455;line-height:1.7}
  .sub b{color:#9c6b3f}
  .grid{margin-top:26px;display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
  .block{background:#fffefa;border:1px solid #eae3d5;border-radius:14px;padding:14px 14px 10px;
    box-shadow:0 1px 2px rgba(45,42,36,.05)}
  .bt{font-size:14px;font-weight:600;color:#2d2a24;margin-bottom:10px;display:flex;align-items:center;gap:7px}
  .bt::before{content:'';width:7px;height:7px;border-radius:50%;background:#9c6b3f}
  .pair{display:flex;gap:10px}
  figure{margin:0;flex:1;min-width:0}
  img{display:block;width:100%;border-radius:8px;border:1px solid #eae3d5}
  figcaption{margin-top:6px;text-align:center;font-size:11.5px;color:#a39b8b}
  .foot{margin-top:24px;font-size:12px;color:#a39b8b;line-height:1.8}
</style></head><body>
  <h1>各屏字号对齐「今日」· 改前 / 改后</h1>
  <div class="sub">
    基准屏「今日」的层级是 <b>组头 18 / 顶层条目 16 / 子项与输入 15 / 计数 13</b>。
    <b>13px 是可读文字的地板</b>，12px 只留给计数徽标 ——
    所以本轮把任务行、时间轴时间列、日历星期与摘要卡、我的页各档、抽屉按钮与说明全部提档。<br />
    底部导航同步放大：胶囊 62→70、图标 18→21、标签 11→13（<code>text-label</code> 档位就此退役）。
  </div>
  <div class="grid">${blocks}</div>
  <div class="foot">
    截图视口 390×844（iPhone 14 逻辑尺寸）。裁字扫描确认 0 处文字被省略号吃掉 ——
    字号只差 1px 时，这类回归在缩略图上完全看不出来。
  </div>
</body></html>`;

fs.writeFileSync(path.join(__dirname, 'fontcompare.html'), html, 'utf8');

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
  await p.goto('file:///' + path.join(__dirname, 'fontcompare.html').replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
  });
  await sleep(600);
  await p.screenshot({ path: path.join(DESIGNS, 'impl-16-字号对齐-前后对照.png'), fullPage: true });
  console.log('saved impl-16-字号对齐-前后对照.png');
  await b.close();
})();
