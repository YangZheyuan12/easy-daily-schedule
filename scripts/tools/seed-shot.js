/* 播种演示数据 + 全屏截图（适配新版 TimeRuler 抽屉） */
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.resolve(__dirname, '..', '..', 'designs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text) {
  await page.evaluate((t) => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === t,
    );
    if (btn) btn.click();
  }, text);
  await sleep(350);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(1000);

  async function inlineAdd(key, text) {
    const sel = `[data-testid="diary-inline-add-${key}"]`;
    await page.click(sel);
    await page.type(sel, text);
    await page.keyboard.press('Enter');
    await sleep(300);
  }
  for (const [k, t] of [
    ['work', '完成 Q3 需求评审'],
    ['work', '提交周报'],
    ['study', '论文阅读'],
    ['fitness', '晨跑 5 公里'],
    ['life', '买菜做饭'],
    ['inspiration', '周报做成模板'],
  ]) {
    await inlineAdd(k, t);
  }

  await page.click('button[aria-expanded]');
  await sleep(400);
  const hearts = await page.$$('button[aria-label^="心情"]');
  if (hearts[3]) await hearts[3].click();
  const stars = await page.$$('button[aria-label^="身体"]');
  if (stars[3]) await stars[3].click();
  await sleep(300);
  const tas = await page.$$('textarea');
  if (tas[0]) {
    await tas[0].click();
    await tas[0].type('今天状态不错');
  }
  await sleep(400);
  await page.click('button[aria-expanded]');
  await sleep(500);

  await page.screenshot({ path: path.join(OUT, 'z-after-today.png'), fullPage: true });
  console.log('saved z-after-today.png');

  // 任务页
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await clickByText(page, '+ 添加任务');
  for (const t of ['回复客户邮件', '交房租', '预约体检', '买菜', '给爸妈打电话']) {
    await page.keyboard.type(t);
    await page.keyboard.press('Enter');
    await sleep(220);
  }
  await page.keyboard.press('Backspace');
  await sleep(300);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button[aria-label="标记为已完成"]'));
    b.slice(0, 2).forEach((x) => x.click());
  });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'z-after-tasks.png'), fullPage: true });
  console.log('saved z-after-tasks.png');

  // 时间轴：3 个时间段，用刻度尺点小时
  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle0' });
  await sleep(900);
  for (const [hour, text] of [
    ['9', '晨跑 5 公里'],
    ['13', 'Q3 需求评审'],
    ['16', '论文阅读'],
  ]) {
    await clickByText(page, '+ 添加时间段');
    await sleep(500);
    await page.evaluate((h) => {
      const btn = document.querySelector(`button[aria-label="${h} 点"]`);
      if (btn) btn.click();
    }, hour);
    await sleep(200);
    await page.click('textarea[placeholder="这段时间做什么？"]');
    await page.type('textarea[placeholder="这段时间做什么？"]', text);
    await clickByText(page, '保存');
    await sleep(400);
  }
  await page.screenshot({ path: path.join(OUT, 'z-after-timeline.png'), fullPage: true });
  console.log('saved z-after-timeline.png');

  // 抽屉打开态（带刻度尺）
  await clickByText(page, '+ 添加时间段');
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'z-after-sheet.png') });
  console.log('saved z-after-sheet.png');
  await page.keyboard.press('Escape');
  await sleep(400);

  await page.goto(`${BASE}/#/calendar`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'z-after-calendar.png'), fullPage: true });
  console.log('saved z-after-calendar.png');

  await page.goto(`${BASE}/#/me`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'z-after-me.png'), fullPage: true });
  console.log('saved z-after-me.png');

  const now = new Date();
  const dk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  await page.goto(`${BASE}/#/section/work?date=${dk}`, { waitUntil: 'networkidle0' });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'z-after-section.png'), fullPage: true });
  console.log('saved z-after-section.png');

  await browser.close();
  console.log('done');
})();
