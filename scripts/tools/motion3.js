const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const log=[]; const say=(v)=>{console.log(v);log.push(v)};

  // ---------- A) 日期方向在整个动画期间稳定（不会被后续重渲染改回淡入） ----------
  await page.goto(`${BASE}/#/today`, { waitUntil: 'domcontentloaded' });
  await sleep(2200);

  const dateState = () =>
    page.evaluate(() => {
      const el = document.querySelector('button[aria-label="点击选择日期"] span');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { anim: cs.animationName, tx: Math.round(parseFloat(cs.transform.split(',')[4] || '0') * 100) / 100 };
    });

  await page.click('button[aria-label="后一天"]');
  for (const t of [50, 120, 200]) {
    await sleep(t === 50 ? 50 : 70);
    say(`后翻 t≈${t}ms => ${JSON.stringify(await dateState())}`);
  }
  await sleep(400);
  await page.click('button[aria-label="前一天"]');
  await sleep(60);
  log.push(`前翻 t≈60ms => ${JSON.stringify(await dateState())}`);
  await sleep(600);

  // ---------- B) 已完成的条目在「重新打开页面」时必须静止 ----------
  await page.goto(`${BASE}/#/today`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  // 先造两条（新浏览器实例里 IndexedDB 是空的）
  for (const text of ['写周报', '对齐需求方']) {
    await page.click('input[data-testid="diary-inline-add-work"]');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await sleep(280);
  }
  await sleep(400);
  await page.click('li button[aria-label="标记为已完成"]');
  await sleep(700);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(260);
  const onLoad = await page.evaluate(() => {
    const box = document.querySelector('li button[aria-label="标记为未完成"] > span');
    const listRow = document.querySelector('li.m-rise');
    return {
      已完成勾选框动画: box ? getComputedStyle(box).animationName : '(找不到完成项)',
      列表行入场动画: listRow ? getComputedStyle(listRow).animationName : null,
    };
  });
  log.push(`重载 260ms 后 => ${JSON.stringify(onLoad)}`);
  await sleep(500);
  const settled = await page.evaluate(() => {
    const box = document.querySelector('li button[aria-label="标记为未完成"] > span');
    return box ? getComputedStyle(box).animationName : '(找不到完成项)';
  });
  log.push(`重载 760ms 后 已完成勾选框动画 => ${settled}`);

  // ---------- C) 撤销条倒计时条 ----------
  const undoProbe = await page.evaluate(async () => {
    const btns = [...document.querySelectorAll('li button')];
    // 删掉一条：点开详情不行，这里直接找行内的删除入口（桌面端任务行才有）
    return btns.length;
  });
  log.push(`今日页可点按钮数（参考）=> ${undoProbe}`);

  console.log(log.join('\n'));
  await browser.close();
})();
