/**
 * 字号放大后的「文字被裁」扫描。
 *
 * 只靠肉眼看截图会漏 —— 放大 9% 后很多地方正好差 2~10px 被 ellipsis 吃掉，
 * 缩略图上几乎看不出来。这里逐屏把所有「会裁字」的元素量一遍，
 * 报出 clientWidth 与 scrollWidth 的差值（含文案，便于判断该改文案还是改宽度）。
 */
const puppeteer = require('puppeteer-core');

// 端口可用 BASE_URL 覆盖（默认沿用原地址，不改默认行为）
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = () => {
  const out = [];
  document.querySelectorAll('*').forEach((el) => {
    const s = getComputedStyle(el);
    const clips =
      s.overflow !== 'visible' ||
      s.overflowX !== 'visible' ||
      s.textOverflow === 'ellipsis' ||
      el.classList.contains('truncate');
    if (!clips) return;
    const diff = el.scrollWidth - el.clientWidth;
    if (diff <= 1) return;
    // 只看真正装了文字的元素，跳过纯容器
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('');
    const text = own || (el.children.length === 0 ? el.textContent.trim() : '');
    if (!text) return;
    out.push({
      text: text.slice(0, 28),
      over: diff,
      client: el.clientWidth,
      scroll: el.scrollWidth,
      font: s.fontSize,
      cls: el.className.toString().slice(0, 70),
    });
  });
  return out;
};

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    // 浏览器路径可用 CHROME_PATH 覆盖（默认沿用原路径，不改默认行为）
    executablePath:
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // 先在今日页造数据（同时给任务/时间轴/日历准备内容）
  await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle0' });
  await sleep(1400);
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

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;

  const routes = [
    ['/today', '今日'],
    ['/tasks', '任务'],
    ['/timeline', '时间轴'],
    ['/calendar', '日历'],
    ['/me', '我的'],
    [`/section/work?date=${today}`, '板块详情'],
  ];

  let total = 0;
  for (const [hash, name] of routes) {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0' });
    await sleep(1300);
    const found = await page.evaluate(PROBE);
    total += found.length;
    console.log(`\n—— ${name} —— ${found.length} 处裁字`);
    for (const f of found) {
      console.log(`  [${f.font}] 溢出 ${f.over}px (${f.client}→${f.scroll}) 「${f.text}」`);
    }
  }

  /*
    自我状态条的文案分两种（看今天 / 看别的日期）。上面那轮只覆盖了前者，
    而后者多一个字 —— 恰恰是更容易被吃掉的那一版。这里翻到前一天单独量。
  */
  await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  for (const [step, label] of [
    [0, '今日（记录今天的状态）'],
    [-1, '前一天（记录这一天的状态）'],
  ]) {
    if (step !== 0) {
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="前一天"]');
        if (btn) btn.click();
      });
      await sleep(900);
    }
    const m = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-expanded]');
      if (!btn) return null;
      const spans = Array.from(btn.querySelectorAll('span'));
      const preview = spans[spans.length - 1];
      return {
        text: preview.textContent.trim(),
        client: preview.clientWidth,
        scroll: preview.scrollWidth,
        font: getComputedStyle(preview).fontSize,
      };
    });
    if (!m) {
      console.log(`\n—— 自我状态条 / ${label} —— 未找到`);
      continue;
    }
    const over = m.scroll - m.client;
    if (over > 1) total += 1;
    console.log(
      `\n—— 自我状态条 / ${label} —— ${over > 1 ? `裁字 ${over}px` : '放得下'}` +
        ` [${m.font}] (${m.client}→${m.scroll}) 「${m.text}」`,
    );
  }

  // 抽屉也要扫
  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '+ 添加时间段',
    );
    if (btn) btn.click();
  });
  await sleep(700);
  const sheet = await page.evaluate(PROBE);
  total += sheet.length;
  console.log(`\n—— 时间段抽屉 —— ${sheet.length} 处裁字`);
  for (const f of sheet) {
    console.log(`  [${f.font}] 溢出 ${f.over}px (${f.client}→${f.scroll}) 「${f.text}」`);
  }

  console.log(`\n合计 ${total} 处`);
  await browser.close();
})();
