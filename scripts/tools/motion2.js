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
  const log = [];

  // ---------- A) 自我状态卡片：真读 grid-template-rows ----------
  await page.goto(`${BASE}/#/today`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  const readRows = () =>
    page.evaluate(() => {
      const btn = document.querySelector('button[aria-expanded]');
      const grid = btn?.nextElementSibling;
      if (!grid) return null;
      const cs = getComputedStyle(grid);
      return {
        rows: cs.gridTemplateRows,
        transition: cs.transitionProperty,
        duration: cs.transitionDuration,
        inert: grid.firstElementChild?.hasAttribute('inert') ?? null,
        height: Math.round(grid.getBoundingClientRect().height),
      };
    });

  log.push(`折叠时 => ${JSON.stringify(await readRows())}`);
  await page.click('button[aria-expanded]');
  await sleep(110);
  log.push(`展开 110ms => ${JSON.stringify(await readRows())}`);
  await page.screenshot({ path: 'n1-self-expand-mid.png' });
  await sleep(700);
  log.push(`展开完成 => ${JSON.stringify(await readRows())}`);
  await page.click('button[aria-expanded]');
  await sleep(110);
  log.push(`收起 110ms => ${JSON.stringify(await readRows())}`);
  await page.screenshot({ path: 'n2-self-collapse-mid.png' });
  await sleep(700);
  log.push(`收起完成 => ${JSON.stringify(await readRows())}`);

  // ---------- B) 日历：换月滑动 + 选中圆回弹 ----------
  await page.goto(`${BASE}/#/calendar`, { waitUntil: 'domcontentloaded' });
  await sleep(1800);

  const readGrid = () =>
    page.evaluate(() => {
      // 42 格的才是月历网格
      const grid = [...document.querySelectorAll('.grid')].find((g) => g.children.length === 42);
      if (!grid) return null;
      return {
        transform: getComputedStyle(grid).transform,
        opacity: getComputedStyle(grid).opacity,
        anim: getComputedStyle(grid).animationName,
      };
    });

  await page.evaluate(() => document.querySelector('button[aria-label="下一个月"]')?.click());
  await sleep(90);
  log.push(`换月 90ms => ${JSON.stringify(await readGrid())}`);
  await page.screenshot({ path: 'n3-month-slide-mid.png' });
  await sleep(700);
  log.push(`换月完成 => ${JSON.stringify(await readGrid())}`);

  // 回到当月，再点月中某天看选中圆的回弹
  await page.evaluate(() => document.querySelector('button[aria-label="上一个月"]')?.click());
  await sleep(800);
  const target = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('button[aria-pressed]')]
      .map((b) => b.getAttribute('aria-label'))
      .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
    const mid = cells[Math.floor(cells.length / 2)];
    document.querySelector(`button[aria-label="${mid}"]`)?.click();
    return mid;
  });
  await sleep(70);
  const dayPop = await page.evaluate((key) => {
    const el = document.querySelector(`button[aria-label="${key}"] span`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { anim: cs.animationName, duration: cs.animationDuration, transform: cs.transform };
  }, target);
  log.push(`选中 ${target} 70ms => ${JSON.stringify(dayPop)}`);
  await page.screenshot({ path: 'n4-day-pop-mid.png' });

  console.log(log.join('\n'));
  await browser.close();
})();
