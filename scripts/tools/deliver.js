/**
 * 交付截图：字号放大 + 新版时间选择器。
 * 输出到 designs/，与概念稿同目录。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = 'D:/myProjects/日程表软件/designs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  const clickText = async (text) => {
    await page.evaluate((t) => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => (b.textContent || '').trim() === t,
      );
      if (btn) btn.click();
    }, text);
    await sleep(450);
  };

  // ——— 今日 ———
  await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  for (const [key, text] of [
    ['work', '完成 Q3 需求评审'],
    ['work', '提交周报并发给全组同步'],
    ['study', '论文阅读'],
    ['fitness', '晨跑 5 公里'],
    ['life', '买菜做饭'],
    ['inspiration', '想到一个点子：把周报做成模板'],
  ]) {
    const sel = `[data-testid="diary-inline-add-${key}"]`;
    await page.click(sel);
    await page.type(sel, text);
    await page.keyboard.press('Enter');
    await sleep(300);
  }
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="标记为已完成"]');
    if (btn) btn.click();
  });
  await sleep(400);
  await page.click('button[aria-expanded]');
  await sleep(450);
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
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'impl-10-今日-字号放大.png'), fullPage: true });
  console.log('saved impl-10');

  // ——— 任务 ———
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  await clickText('+ 添加任务');
  for (const t of ['回复客户邮件', '交房租', '预约体检', '给爸妈打电话']) {
    await page.keyboard.type(t);
    await page.keyboard.press('Enter');
    await sleep(220);
  }
  await page.keyboard.press('Backspace');
  await sleep(3200); // 等撤销条自己消失，别把交付图弄脏
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[aria-label="标记为已完成"]'));
    btns.slice(0, 2).forEach((b) => b.click());
  });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'impl-11-任务-字号放大.png'), fullPage: true });
  console.log('saved impl-11');

  // ——— 时间轴 + 抽屉 ———
  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle0' });
  await sleep(1300);

  async function addSlot(h, m, text, eh, em) {
    await clickText('+ 添加时间段');
    await sleep(600);
    await page.click(`[aria-label="${h} 点"]`);
    await sleep(180);
    await page.click(`[aria-label="${m} 分"]`);
    await sleep(180);
    if (eh !== undefined) {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button[aria-pressed]')).find((b) =>
          (b.textContent || '').trim().startsWith('结束'),
        );
        if (btn) btn.click();
      });
      await sleep(380);
      await page.click(`[aria-label="${eh} 点"]`);
      await sleep(180);
      await page.click(`[aria-label="${em} 分"]`);
      await sleep(180);
    }
    await page.type('textarea[placeholder="这段时间做什么？"]', text);
    await sleep(200);
    await clickText('保存');
    await sleep(450);
  }

  await addSlot(9, 0, '晨跑 5 公里', 10, 0);
  await addSlot(13, 30, 'Q3 需求评审', 15, 0);
  await addSlot(21, 30, '论文阅读');
  await page.screenshot({ path: path.join(OUT, 'impl-12-时间轴-字号放大.png'), fullPage: true });
  console.log('saved impl-12');

  // 抽屉：编辑第一个时间段（结束时间已设 → 读数不带「设为」）
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('晨跑 5 公里'),
    );
    if (btn) btn.click();
  });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'impl-13-时间选择器.png') });
  console.log('saved impl-13');

  // hover 放大 + 加深：把刻度尺单独裁出来
  const ruler = await page.evaluate(() => {
    const row = document.querySelector('div[role="group"][aria-label*="小时"]');
    const wrap = row.parentElement;
    const r = wrap.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.hover('[aria-label="3 点"]');
  await sleep(400);
  await page.screenshot({
    path: path.join(OUT, 'impl-14-刻度悬停放大.png'),
    clip: {
      x: Math.max(0, ruler.x - 8),
      y: Math.max(0, ruler.y - 8),
      width: ruler.width + 16,
      height: ruler.height + 16,
    },
  });
  console.log('saved impl-14');

  await browser.close();
  console.log('done');
})();
