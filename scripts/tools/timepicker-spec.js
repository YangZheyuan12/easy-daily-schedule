/**
 * 时间选择器「状态规格」：
 * 每个状态都从真实界面裁下来（不是另写一套 CSS 复刻 —— 那种图会随代码漂移而说谎），
 * 再拼成一张对照图。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:5173';
const OUT = 'D:/myProjects/日程表软件/designs';
const TMP = path.resolve(__dirname, 'spec');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boxOf = (page, sel, pad = 6) =>
  page.evaluate(
    (s, p) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, r.x - p),
        y: Math.max(0, r.y - p),
        width: Math.min(window.innerWidth - Math.max(0, r.x - p), r.width + p * 2),
        height: r.height + p * 2,
      };
    },
    sel,
    pad,
  );

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });

  const clickText = async (text) => {
    await page.evaluate((t) => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => (b.textContent || '').trim() === t,
      );
      if (btn) btn.click();
    }, text);
    await sleep(420);
  };

  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle0' });
  await sleep(1400);
  await clickText('+ 添加时间段');
  await sleep(700);

  // ── ① 保存按钮：禁用态（内容为空） ──
  const saveSel = () => {
    return 'div[role="dialog"] button';
  };
  let saveBox = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '保存',
    );
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20 };
  });
  await page.screenshot({ path: path.join(TMP, 'save-disabled.png'), clip: saveBox });
  const saveW = Math.round(saveBox.width);

  // ── ② chip 未设置态（结束 / 实际开始 / 实际结束 都是 --:--） ──
  const chipBox = await boxOf(page, 'div[role="dialog"] .grid.grid-cols-2', 8);
  await page.screenshot({ path: path.join(TMP, 'chips-empty.png'), clip: chipBox });
  const chipW = Math.round(chipBox.width);

  // ── ③ 刻度尺：默认（无悬停） ──
  let rulerBox = await boxOf(page, 'div[role="group"][aria-label*="小时"]', 0);
  rulerBox = {
    x: 0,
    y: rulerBox.y - 30,
    width: 390,
    height: rulerBox.height + 30 + (await page.evaluate(() => {
      const m = document.querySelector('div[role="group"][aria-label*="分钟"]');
      return m.getBoundingClientRect().height;
    })) + 6,
  };
  await page.screenshot({ path: path.join(TMP, 'ruler-idle.png'), clip: rulerBox });

  // ── ④ 刻度尺：悬停某一格（放大 + 加深） ──
  await page.hover('[aria-label="3 点"]');
  await sleep(420);
  let hoverBox = await boxOf(page, 'div[role="group"][aria-label*="小时"]', 0);
  hoverBox = {
    x: 0,
    y: hoverBox.y - 30,
    width: 390,
    height: hoverBox.height + 30 + 38 + 6,
  };
  await page.screenshot({ path: path.join(TMP, 'ruler-hover.png'), clip: hoverBox });

  // ── ⑤ 填内容后：chip 有值 + 保存按钮可点 ──
  await page.type('textarea[placeholder="这段时间做什么？"]', 'Q3 需求评审');
  await sleep(300);
  await page.screenshot({ path: path.join(TMP, 'chips-filled.png'), clip: chipBox });
  saveBox = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '保存',
    );
    const r = btn.getBoundingClientRect();
    return { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20 };
  });
  await page.screenshot({ path: path.join(TMP, 'save-ready.png'), clip: saveBox });

  // ── ⑥ 拖动后（分钟尺偏移） ──
  const dragBox = await page.evaluate(() => {
    const r = document.querySelector('div[role="group"][aria-label*="分钟"]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(dragBox.x, dragBox.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(dragBox.x - i * 18, dragBox.y);
    await sleep(15);
  }
  await page.mouse.up();
  await sleep(300);
  const minuteBox = await boxOf(page, 'div[role="group"][aria-label*="分钟"]', 4);
  await page.screenshot({
    path: path.join(TMP, 'ruler-dragged.png'),
    clip: { x: 0, y: minuteBox.y, width: 390, height: minuteBox.height },
  });

  await browser.close();

  // ── 拼版 ──
  const img = (name) => `data:image/png;base64,${fs.readFileSync(path.join(TMP, name)).toString('base64')}`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;padding:38px 44px 34px;width:1180px;background:#fbf8f2;color:#2d2a24;
      font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased}
    h1{font-size:27px;margin:0}
    .sub{margin-top:8px;font-size:14px;color:#6b6455;line-height:1.7}
    .sub code{background:#f4efe4;padding:1px 6px;border-radius:5px;font-size:13px;color:#9c6b3f}
    h2{font-size:16px;margin:30px 0 12px;display:flex;align-items:center;gap:9px}
    h2::before{content:'';width:8px;height:8px;border-radius:50%;background:#9c6b3f}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
    .card{background:#fffefa;border:1px solid #eae3d5;border-radius:14px;padding:14px 16px 16px;
      box-shadow:0 1px 2px rgba(45,42,36,.05)}
    .card h3{margin:0 0 10px;font-size:13px;color:#6b6455;font-weight:600}
    .card p{margin:10px 0 0;font-size:12px;color:#a39b8b;line-height:1.7}
    .card img{display:block;border-radius:8px}
    .wide{grid-column:span 2}
    .pair{display:flex;gap:22px;align-items:flex-start}
    .pair>div{flex:1}
    .pair img{display:block;width:100%;border-radius:8px}
    .tag{display:inline-block;font-size:11px;color:#9c6b3f;background:#f4efe4;border-radius:999px;
      padding:2px 9px;margin-bottom:7px}
    .foot{margin-top:26px;font-size:12px;color:#a39b8b;line-height:1.8}
    .center{display:flex;justify-content:center}
  </style></head><body>
    <h1>时间选择器 · 状态规格</h1>
    <div class="sub">
      替换原生 <code>&lt;input type="time"&gt;</code> —— 那个控件在桌面端弹系统面板、手机端盖住半屏，
      是全应用唯一不跟主题的地方。<br />
      现在：四个时间字段 chip 排成 2×2，下面一条 <b>可滑动刻度尺</b>编辑当前选中的字段。
      每个状态都是从真实界面裁下来的实际像素。
    </div>

    <h2>刻度尺 · 悬停放大 + 加深</h2>
    <div class="grid">
      <div class="card"><span class="tag">默认</span>
        <img src="${img('ruler-idle.png')}" style="width:390px" />
        <p>未选中刻度 <code>faint</code> 灰；选中的实心重音填充 + 白色数字，是这一行唯一的「重物」。</p>
      </div>
      <div class="card"><span class="tag">悬停「3 点」</span>
        <img src="${img('ruler-hover.png')}" style="width:390px" />
        <p>悬停时 <b>放大到 1.14×</b>、文字由 faint 加深到 ink、并浮起一层纸面底与极淡投影 ——
          鼠标划过就知道「按下去的是这一格」。</p>
      </div>
      <div class="card wide"><span class="tag">拖动中（跟手）· 分钟尺</span>
        <div class="center"><img src="${img('ruler-dragged.png')}" style="width:390px" /></div>
        <p>按住横向拖动即浏览：起手点落在刻度上，拖动超过 6px 后松手不会误选到手指停下的那一格。
          手机上直接用原生横滑（带惯性），滚轮则限定 <b>Shift + 滚轮 / 横向滚轮</b> ——
          普通纵向滚轮不劫持，否则鼠标停在尺子上抽屉就滚不动了。</p>
      </div>
    </div>

    <h2>字段 chip 与保存按钮</h2>
    <div class="grid">
      <div class="card"><span class="tag">未设置 / 未激活</span>
        <img src="${img('chips-empty.png')}" style="width:${chipW}px" />
        <p>「结束 / 实际开始 / 实际结束」可以为空，显示 <code>--:--</code>。此时刻度尺读数是
          <b>预览</b>（读数前缀「设为」），不动刻度就不会写进数据。</p>
      </div>
      <div class="card"><span class="tag">已设置 / 激活</span>
        <img src="${img('chips-filled.png')}" style="width:${chipW}px" />
        <p>激活字段 = 重音描边 + 浅重音底，刻度尺此刻改的就是它。切字段时刻度尺自动滚回选中项。</p>
      </div>
      <div class="card"><span class="tag">保存 · 不可用</span>
        <img src="${img('save-disabled.png')}" style="width:${saveW}px" />
        <p>内容为空时是真 <code>disabled</code>：下沉底 + 弱文字，配「必填」角标。
          以前是个裸文字按钮，点下去什么都不发生也没有解释。</p>
      </div>
      <div class="card"><span class="tag">保存 · 可用</span>
        <img src="${img('save-ready.png')}" style="width:${saveW}px" />
        <p>内容一填上就变成重音实色胶囊，带按压回缩，保存后给一次轻提示收尾。</p>
      </div>
    </div>

    <div class="foot">
      另外：结束时间早于开始时间时，拖动一端会把另一端顶走（两端互相让位），
      永远不会存出「09:00–08:00」这种负区间 —— 旧的原生输入框就是这样静默产生的。
    </div>
  </body></html>`;

  const specHtml = path.join(TMP, 'timepicker-spec.html');
  fs.writeFileSync(specHtml, html, 'utf8');

  const b2 = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const p2 = await b2.newPage();
  await p2.setViewport({ width: 1180, height: 900, deviceScaleFactor: 2 });
  await p2.goto(`file:///${specHtml.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
  await sleep(700);
  await p2.screenshot({
    path: path.join(OUT, 'impl-15-时间选择器-状态规格.png'),
    fullPage: true,
  });
  await b2.close();
  console.log('saved impl-15-时间选择器-状态规格.png');
})();
