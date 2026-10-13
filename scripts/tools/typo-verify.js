/**
 * 时间抽屉行为回归：
 * ① 每次打开都复位到「开始」字段（上次在改实际结束，下次打开不该还在那）；
 * ② 结束早于开始时两端互相顶走，绝不落下负区间；
 * ③ 时间列加宽后「09:00–21:30」不越界；
 * ④ 保存按钮的禁用 / 可点状态与配色。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.resolve(__dirname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readout = () =>
  document.querySelector('div[role="group"][aria-label*="小时"]')?.previousElementSibling
    ?.textContent;

const chips = () =>
  Array.from(document.querySelectorAll('button[aria-pressed]'))
    .slice(0, 4)
    .map((b) => (b.textContent || '').trim());

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
    await sleep(420);
  };

  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle0' });
  await sleep(1400);

  // ——— 第一个时间段：09:00–21:30（覆盖最宽的时间文本） ———
  await clickText('+ 添加时间段');
  await sleep(600);
  console.log('① 初次打开读数：', await page.evaluate(readout));
  await page.click('[aria-label="9 点"]');
  await sleep(200);
  await page.click('[aria-label="0 分"]');
  await sleep(200);
  // 切到「结束」再点 21:30
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-pressed]')).find((b) =>
      (b.textContent || '').trim().startsWith('结束'),
    );
    if (btn) btn.click();
  });
  await sleep(400);
  await page.click('[aria-label="21 点"]');
  await sleep(200);
  await page.click('[aria-label="30 分"]');
  await sleep(250);
  console.log('② 结束字段读数：', await page.evaluate(readout));
  console.log('   四个 chip：', JSON.stringify(await page.evaluate(chips)));
  await page.type('textarea[placeholder="这段时间做什么？"]', '论文阅读与笔记整理');
  await sleep(250);
  await clickText('保存');
  await sleep(600);

  // ——— 再开一次：必须复位到「开始」（上一次停在「结束」） ———
  await clickText('+ 添加时间段');
  await sleep(650);
  console.log('③ 二次打开读数（应为「开始时间」）：', await page.evaluate(readout));
  console.log('   四个 chip：', JSON.stringify(await page.evaluate(chips)));

  // ——— 负区间测试：结束先设 06:00，再把开始拖到 22:00 ———
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-pressed]')).find((b) =>
      (b.textContent || '').trim().startsWith('结束'),
    );
    if (btn) btn.click();
  });
  await sleep(400);
  await page.click('[aria-label="6 点"]');
  await sleep(250);
  await page.click('[aria-label="0 分"]');
  await sleep(250);
  console.log('④ 结束设 06:00：', JSON.stringify(await page.evaluate(chips)));

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-pressed]')).find((b) =>
      (b.textContent || '').trim().startsWith('开始') && !b.textContent.includes('实际'),
    );
    if (btn) btn.click();
  });
  await sleep(400);
  await page.click('[aria-label="22 点"]');
  await sleep(300);
  console.log('⑤ 开始拖到 22:00（结束应被顶到 22:00，不得出现 22:00–06:00）：');
  console.log('   ', JSON.stringify(await page.evaluate(chips)));

  // 反向：把结束拖回 07:00，开始应被顶回 07:00
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-pressed]')).find((b) =>
      (b.textContent || '').trim().startsWith('结束'),
    );
    if (btn) btn.click();
  });
  await sleep(400);
  await page.click('[aria-label="7 点"]');
  await sleep(300);
  console.log('⑥ 结束拖回 07:00（开始应跟着退到 07:00）：');
  console.log('   ', JSON.stringify(await page.evaluate(chips)));

  await page.type('textarea[placeholder="这段时间做什么？"]', 'Q3 需求评审');
  await sleep(250);
  await clickText('保存');
  await sleep(700);

  // ——— 时间列是否被文字撑破 ———
  const col = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('ul li > span:first-child'));
    return spans.map((el) => ({
      text: el.textContent,
      box: Math.round(el.getBoundingClientRect().width),
      need: Math.round(el.scrollWidth),
      font: getComputedStyle(el).fontSize,
    }));
  });
  console.log('⑦ 时间列：', JSON.stringify(col, null, 1));

  await page.screenshot({ path: path.join(OUT, 't-timeline-2.png'), fullPage: true });

  // ——— 撤销条位置：不再压住「+ 添加」 ———
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  await clickText('+ 添加任务');
  for (const t of ['回复客户邮件', '交房租']) {
    await page.keyboard.type(t);
    await page.keyboard.press('Enter');
    await sleep(200);
  }
  await page.keyboard.press('Backspace'); // 触发撤销条
  await sleep(500);
  const layers = await page.evaluate(() => {
    const bar = document.querySelector('.m-rise.bg-accent, [class*="rounded-full"][class*="bg-accent"]');
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const undo = Array.from(document.querySelectorAll('span')).find((s) =>
      s.textContent.includes('已删除'),
    );
    const undoBox = rect(undo?.closest('div.relative'));
    const addBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '+ 添加任务',
    );
    const addBox = rect(addBtn);
    return {
      undo: undoBox && { top: Math.round(undoBox.top), bottom: Math.round(undoBox.bottom) },
      add: addBox && { top: Math.round(addBox.top), bottom: Math.round(addBox.bottom) },
      overlap:
        undoBox && addBox
          ? Math.max(0, Math.min(undoBox.bottom, addBox.bottom) - Math.max(undoBox.top, addBox.top))
          : null,
    };
  });
  console.log('⑧ 撤销条 vs「+添加任务」：', JSON.stringify(layers));
  await page.screenshot({ path: path.join(OUT, 't-tasks-undo.png') });

  await browser.close();
  console.log('done');
})();
