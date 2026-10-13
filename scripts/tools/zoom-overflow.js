/**
 * 精确测：月↔年切换的缩放动画会不会撑出横向滚动 / 被裁掉。
 * 上一条脚本里面板选择器没命中（宽度采样全是 0），所以那次「无溢出」不算数。
 * 这次直接找 className 含 m-zoom 的元素，并在动画期间逐帧记录。
 */
const puppeteer = require('puppeteer-core');

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
  await page.goto(`${BASE}/#/calendar`, { waitUntil: 'networkidle0' });
  await sleep(1600);

  const frames = await page.evaluate(async () => {
    const panel = document.querySelector('[class*="m-zoom"]');
    if (!panel) return { error: '找不到面板' };

    const yearBtn = Array.from(document.querySelectorAll('button[aria-pressed]')).find(
      (el) => el.textContent === '年',
    );
    const base = {
      layoutW: Math.round(panel.getBoundingClientRect().width),
      deScrollW: document.documentElement.scrollWidth,
      deClientW: document.documentElement.clientWidth,
      bodyScrollW: document.body.scrollWidth,
      rootOverflowX: getComputedStyle(document.documentElement).overflowX,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      appOverflowX: getComputedStyle(document.getElementById('root') || document.body).overflowX,
    };

    yearBtn.click();
    const out = [];
    for (let i = 0; i < 14; i += 1) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
      const r = panel.getBoundingClientRect();
      out.push({
        scale: Number(getComputedStyle(panel).transform.split('(')[1]?.split(',')[0] ?? 1).toFixed(3),
        left: Math.round(r.left * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        deScrollW: document.documentElement.scrollWidth,
        deClientW: document.documentElement.clientWidth,
      });
    }
    return { base, out };
  });

  console.log('面板基准：', JSON.stringify(frames.base, null, 2));
  console.log('\n逐帧（scale / left / right / scrollWidth / clientWidth）：');
  for (const f of frames.out) {
    const over = f.deScrollW > f.deClientW ? `  ★超 ${f.deScrollW - f.deClientW}px` : '';
    console.log(
      `  scale=${f.scale}  left=${f.left}  right=${f.right}  sw=${f.deScrollW}  cw=${f.deClientW}${over}`,
    );
  }
  const worst = frames.out.reduce(
    (m, f) => ({ left: Math.min(m.left, f.left), right: Math.max(m.right, f.right) }),
    { left: Infinity, right: -Infinity },
  );
  console.log(`\n动画期间面板可视边界：left=${worst.left} right=${worst.right}（视口宽 390）`);

  await browser.close();
})();
