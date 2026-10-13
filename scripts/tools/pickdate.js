const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:5173';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await page.screenshot({ path: name, fullPage: false });
}

/** 顶部日期按钮上的文字（今日页）/ 任务页副标题里的日期 */
async function headerDate(page) {
  return page.evaluate(() => {
    const el = document.querySelector('header') || document.body;
    return el.innerText.replace(/\n/g, ' | ').slice(0, 80);
  });
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
  const hash = () => page.evaluate(() => location.hash);

  // ---------- 今日页：点顶部日期 → 日历 ----------
  const todayText0 = await headerDate(page);
  await page.click('button[aria-label="点击选择日期"]');
  await sleep(1200);
  log.push(['今日页点日期 → hash', await hash()]);

  // 日历应处于「选日子」模式：有返回按钮 + 提示语
  const hint = await page.$eval('header', (el) => el.innerText.replace(/\n/g, ' | '));
  const hasBack = (await page.$('button[aria-label="返回"]')) !== null;
  log.push(['日历头部', hint]);
  log.push(['有返回按钮', hasBack]);
  await shot(page, 'v-pick-1-calendar.png');

  // 选一个 8 号（或本月 1 号，保证不是今天）
  const target = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('button[aria-label]')]
      .map((b) => b.getAttribute('aria-label'))
      .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
    const inMonth = cells.filter((v) => v.slice(0, 7) === v.slice(0, 7));
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-08`;
    return cells.includes(key) ? key : inMonth[1];
  });
  log.push(['选中日期', target]);
  await page.click(`button[aria-label="${target}"]`);
  await sleep(900);
  log.push(['选完后 hash', await hash()]);
  const todayText1 = await headerDate(page);
  log.push(['今日页头部 前', todayText0]);
  log.push(['今日页头部 后', todayText1]);
  await shot(page, 'v-pick-2-back-today.png');

  // ---------- 任务页：点副标题日期 → 日历 → 回任务页 ----------
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const tasksText0 = await headerDate(page);
  const hasDateBtn = (await page.$('button[aria-label="选择日期"]')) !== null;
  log.push(['任务页有日期按钮', hasDateBtn]);
  await page.click('button[aria-label="选择日期"]');
  await sleep(1100);
  log.push(['任务页点日期 → hash', await hash()]);
  const target2 = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('button[aria-label]')]
      .map((b) => b.getAttribute('aria-label'))
      .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    return cells.includes(key) ? key : cells[10];
  });
  await page.click(`button[aria-label="${target2}"]`);
  await sleep(900);
  log.push(['选完后 hash', await hash()]);
  const tasksText1 = await headerDate(page);
  log.push(['任务页头部 前', tasksText0]);
  log.push(['任务页头部 后', tasksText1]);
  await shot(page, 'v-pick-3-back-tasks.png');

  for (const [k, v] of log) console.log(k, '=>', v);

  // ---------- 时间轴：点日期 → 日历 → 回时间轴 ----------
  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.click('button[aria-label="点击选择日期"]');
  await sleep(1100);
  console.log('时间轴点日期 → hash =>', await hash());
  await page.click('button[aria-label="2026-10-05"]');
  await sleep(900);
  console.log('选完后 hash =>', await hash());
  console.log('时间轴头部 =>', await headerDate(page));

  await browser.close();
})();
