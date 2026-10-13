const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await page.screenshot({ path: name });
}

/** 读某个元素的实时样式（证明「动」而不是「跳」） */
async function styleOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      transform: cs.transform,
      opacity: cs.opacity,
      bgSize: cs.backgroundSize,
      deco: cs.textDecorationColor,
      anim: cs.animationName,
      duration: cs.animationDuration,
    };
  }, selector);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/#/today`, { waitUntil: 'domcontentloaded' });
  await sleep(2200);

  const log = [];
  const say = (k, v) => log.push(`${k} => ${v}`);

  // ---------- 0) 造三条工作条目 ----------
  for (const text of ['写周报', '对齐需求方', '复盘上周']) {
    await page.click('input[data-testid="diary-inline-add-work"]');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await sleep(280);
  }
  await sleep(500);
  await shot(page, 'm0-list-settled.png');

  // ---------- 1) 勾选：盒子弹出 + 划掉线画出来 ----------
  const tick = 'li button[aria-label="标记为已完成"]';
  await page.click(tick);
  await sleep(100);
  const boxMid = await styleOf(page, 'li button[aria-label="标记为未完成"] > span');
  const strikeMid = await styleOf(page, 'li button[aria-label="标记为未完成"] + button span.m-strike');
  say('勾选中途 盒子动画', boxMid?.anim);
  say('勾选中途 盒子 transform', boxMid?.transform);
  say('勾选中途 划掉线 background-size', strikeMid?.bgSize);
  await shot(page, 'm1-tick-mid.png');
  await sleep(700);
  const strikeEnd = await styleOf(page, 'li button[aria-label="标记为未完成"] + button span.m-strike');
  say('勾选完成 划掉线 background-size', strikeEnd?.bgSize);
  await shot(page, 'm2-tick-done.png');

  // ---------- 2) 自我状态卡片「长出来」 ----------
  await page.click('button[aria-expanded]');
  await sleep(120);
  const editorMid = await styleOf(page, 'button[aria-expanded] + div');
  say('展开中途 grid-template-rows', editorMid?.transform ?? '(见 grid)');
  await shot(page, 'm3-selfstatus-mid.png');
  await sleep(600);
  await shot(page, 'm4-selfstatus-open.png');

  // ---------- 3) 日期方向感 ----------
  await page.click('button[aria-label="后一天"]');
  await sleep(70);
  const dateMid = await styleOf(page, 'button[aria-label="点击选择日期"] span');
  say('日期后翻中途 transform', dateMid?.transform);
  await shot(page, 'm5-date-next-mid.png');
  await sleep(600);

  // ---------- 4) Tab 指示器「滑过去」 ----------
  const before = await styleOf(page, 'nav span[aria-hidden]');
  say('指示器 起点', `${before?.transform} width=${before?.opacity} ${before?.anim}`);
  await page.click('a[href="#/tasks"]');
  await sleep(110);
  const mid = await styleOf(page, 'nav span[aria-hidden]');
  say('指示器 中途', mid?.transform);
  await shot(page, 'm6-tab-slide-mid.png');
  await sleep(600);
  const after = await styleOf(page, 'nav span[aria-hidden]');
  say('指示器 落位', after?.transform);
  await shot(page, 'm7-tab-slide-done.png');

  // ---------- 5) 抽屉：进场 / 下拉 / 关闭 ----------
  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.click('button:has(+ *)', { delay: 10 }).catch(() => {});
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('添加时间段'),
    );
    btn?.click();
  });
  await sleep(120);
  await shot(page, 'm8-sheet-enter-mid.png');
  await sleep(600);
  await shot(page, 'm9-sheet-open.png');

  // 从抓手往下拖 180px（松开前截图：面板应跟着手指走，遮罩变淡）
  const panel = await page.evaluate(() => {
    const el = document.querySelector('div[role="dialog"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + 18, top: r.top };
  });
  if (panel) {
    await page.mouse.move(panel.x, panel.y);
    await page.mouse.down();
    await page.mouse.move(panel.x, panel.y + 180, { steps: 12 });
    await sleep(80);
    const dragStyle = await styleOf(page, 'div[role="dialog"]');
    say('拖拽中 面板 transform', dragStyle?.transform);
    await shot(page, 'm10-sheet-drag.png');
    await page.mouse.up();
    await sleep(120);
    await shot(page, 'm11-sheet-closing.png');
    await sleep(600);
    const stillOpen = await page.$('div[role="dialog"]');
    say('拖过阈值后 抽屉是否还在', stillOpen ? '还在（异常）' : '已关闭');
  }

  // ---------- 6) 日历：换月方向 + 选中圆回弹 ----------
  await page.goto(`${BASE}/#/calendar`, { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  await page.evaluate(() => {
    document.querySelector('button[aria-label="下一个月"]')?.click();
  });
  await sleep(90);
  const monthMid = await styleOf(page, '.grid.grid-cols-7:not([class*="grid-cols-7"][class*="mt-"])');
  say('换月中途 网格 transform', monthMid?.transform);
  await shot(page, 'm12-month-slide-mid.png');
  await sleep(700);
  await page.evaluate(() => {
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    document.querySelector(`button[aria-label="${key}"]`)?.click();
  });
  await sleep(80);
  const dayMid = await styleOf(page, 'button[aria-selected="true"] span, button[aria-pressed="true"] span');
  say('选中圆中途 动画', dayMid?.anim);
  await shot(page, 'm13-day-pop-mid.png');
  await sleep(600);
  await shot(page, 'm14-calendar-settled.png');

  // ---------- 7) reduced-motion 退化 ----------
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${BASE}/#/today`, { waitUntil: 'domcontentloaded' });
  await sleep(1800);
  const reduced = await styleOf(page, 'li.m-rise');
  say('reduced-motion 下列表行动画时长', reduced?.duration);

  console.log(log.join('\n'));
  await browser.close();
})();
