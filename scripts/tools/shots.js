const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.resolve(__dirname);

async function shot(page, hash, name, full) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT, name), fullPage: !!full });
  console.log('saved', name);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // 1) 首页并录入演示数据（贴合概念稿 C1 的场景）
  await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));

  async function inlineAdd(sectionKey, text) {
    const sel = `[data-testid="diary-inline-add-${sectionKey}"]`;
    await page.click(sel);
    await page.type(sel, text);
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 350));
  }

  await inlineAdd('work', '完成 Q3 需求评审');
  await inlineAdd('work', '提交周报');
  await inlineAdd('study', '论文阅读');
  await inlineAdd('fitness', '晨跑 5 公里');
  await inlineAdd('life', '买菜做饭');
  await inlineAdd('inspiration', '想到一个点子：周报做成模板');

  // 心情 4 星 / 身体 4 星（展开自我状态条后点击）
  await page.click('button[aria-expanded]');
  await new Promise((r) => setTimeout(r, 400));
  const hearts = await page.$$('button[aria-label^="心情"]');
  if (hearts[3]) await hearts[3].click();
  const stars = await page.$$('button[aria-label^="身体"]');
  if (stars[3]) await stars[3].click();
  await new Promise((r) => setTimeout(r, 300));
  const textareas = await page.$$('textarea');
  if (textareas[0]) {
    await textareas[0].click();
    await textareas[0].type('今天状态不错');
  }
  await new Promise((r) => setTimeout(r, 500));
  await page.click('button[aria-expanded]'); // 收起
  await new Promise((r) => setTimeout(r, 500));

  await page.screenshot({ path: path.join(OUT, 'v-today.png'), fullPage: true });
  console.log('saved v-today.png');

  async function clickByText(text) {
    await page.evaluate((t) => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => (b.textContent || '').trim() === t,
      );
      if (btn) btn.click();
    }, text);
    await new Promise((r) => setTimeout(r, 350));
  }

  // 2) 任务页：录入几条任务，看纸卡列表形态
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1000));
  // 点一次「+ 添加任务」拿到焦点，之后靠 Enter 连续录入
  await clickByText('+ 添加任务');
  for (const text of ['回复客户邮件', '交房租', '预约体检', '买菜', '给爸妈打电话']) {
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 250));
  }
  // 收尾：末尾会多出一个空行，按 Backspace 删掉
  await page.keyboard.press('Backspace');
  await new Promise((r) => setTimeout(r, 300));
  // 勾掉前两条，露出「已完成」态
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[aria-label="标记为已完成"]'));
    btns.slice(0, 2).forEach((b) => b.click());
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, 'v-tasks.png'), fullPage: true });
  console.log('saved v-tasks.png');

  // 3) 时间轴页：录入三个时间段，看轴式布局
  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1000));
  const slots = [
    { time: '09:00', text: '晨跑 5 公里' },
    { time: '13:00', text: 'Q3 需求评审' },
    { time: '16:00', text: '论文阅读' },
  ];
  for (const slot of slots) {
    await clickByText('+ 添加时间段');
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate((t) => {
      const input = document.querySelector('input[type="time"]');
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, t);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, slot.time);
    await new Promise((r) => setTimeout(r, 200));
    await page.type('textarea[placeholder="这段时间做什么？"]', slot.text);
    await clickByText('保存');
    await new Promise((r) => setTimeout(r, 400));
  }
  await page.screenshot({ path: path.join(OUT, 'v-timeline.png'), fullPage: true });
  console.log('saved v-timeline.png');

  await shot(page, '/calendar', 'v-calendar.png', true);
  await shot(page, '/me', 'v-me.png', true);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  await shot(page, `/section/work?date=${todayKey}`, 'v-section.png', true);

  // 7) 深色主题（夜航微光）下再截一张今日，验证新样式在暗底上的对比度
  await page.goto(`${BASE}/#/me`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[aria-pressed]'));
    const target = btns.find((b) => (b.textContent || '').includes('夜航微光'));
    if (target) target.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT, 'v-today-dark.png'), fullPage: true });
  console.log('saved v-today-dark.png');

  await browser.close();
  console.log('done');
})();
