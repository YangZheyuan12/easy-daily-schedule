/**
 * 复现「任务行上移/下移点了没反应」。
 *
 * 判据：点「下移」之后，DOM 里三个输入框的 value 顺序是否改变。
 * 只看内存 order 不够 —— 用户看到的是 DOM。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0' });
  await sleep(1500);

  // 造三条任务
  const values = ['第一件事', '第二件事', '第三件事'];
  for (const v of values) {
    await page.click('button.press.w-full.min-h-\\[46px\\]').catch(async () => {
      const btn = await page.$$('button');
      for (const b of btn) {
        const t = await page.evaluate((el) => el.textContent, b);
        if (t && t.includes('添加任务')) { await b.click(); break; }
      }
    });
    await sleep(350);
    await page.keyboard.type(v, { delay: 10 });
    await sleep(250);
  }

  const readOrder = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('input[placeholder="今天要做什么…"]')).map((i) => i.value),
    );

  console.log('初始 DOM 顺序：', await readOrder());

  // 聚焦第 2 条（点击它的输入框）
  const inputs = await page.$$('input[placeholder="今天要做什么…"]');
  await inputs[1].click();
  await sleep(300);

  const hasButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-label="上移"],button[aria-label="下移"]')).map((b) => ({
      label: b.getAttribute('aria-label'),
      visible: b.offsetParent !== null,
      disabled: b.disabled,
    })),
  );
  console.log('行内按钮：', JSON.stringify(hasButtons));

  const before = await readOrder();
  // 点「下移」
  const downBtn = await page.$$('button[aria-label="下移"]');
  const visibleDown = [];
  for (const b of downBtn) {
    const vis = await page.evaluate((el) => el.offsetParent !== null, b);
    if (vis) visibleDown.push(b);
  }
  console.log(`可见的「下移」按钮 ${visibleDown.length} 个，点第一个`);
  if (visibleDown[0]) await visibleDown[0].click();
  await sleep(500);
  const after = await readOrder();

  console.log('点击前：', before);
  console.log('点击后：', after);
  console.log(
    JSON.stringify(before) === JSON.stringify(after)
      ? '>>> 复现成功：DOM 顺序没变（按钮无效）'
      : '>>> DOM 顺序已改变（按钮有效）',
  );

  // 再验证「重新加载后是否生效」—— 证明 order 其实写进去了，只是没重排数组
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  console.log('重新加载后：', await readOrder());

  // 复现截图写在脚本同目录（原为写死的 .workbuddy/tmp，随脚本迁出）
  await page.screenshot({ path: path.resolve(__dirname, 'm-repro.png') });
  await browser.close();
})();
