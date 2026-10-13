/* 放大刻度尺的两行，确认数字没有被裁 / 错位 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.resolve(__dirname, '..', '..', 'designs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
  await p.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  await p.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (x) => (x.textContent || '').trim() === '+ 添加时间段',
    );
    if (btn) btn.click();
  });
  await sleep(800);

  // 两行刻度各自的可见内容（读出真实按钮文本与位置，别靠肉眼看截图）
  const info = await p.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('[role="group"]'));
    return groups.map((g) => {
      const box = g.getBoundingClientRect();
      const btns = Array.from(g.querySelectorAll('button')).map((btn) => {
        const r = btn.getBoundingClientRect();
        const visible = r.right > box.left + 1 && r.left < box.right - 1;
        return {
          label: btn.textContent.trim(),
          selected: btn.getAttribute('aria-pressed') === 'true',
          visible,
          clippedLeft: Math.round(Math.max(0, box.left - r.left)),
          clippedRight: Math.round(Math.max(0, r.right - box.right)),
          fontSize: getComputedStyle(btn).fontSize,
        };
      });
      return {
        label: g.getAttribute('aria-label'),
        width: Math.round(box.width),
        scrollLeft: Math.round(g.scrollLeft),
        visibleButtons: btns.filter((x) => x.visible).map((x) => x.label),
      };
    });
  });
  console.log(JSON.stringify(info, null, 2));

  const rulerBox = await p.evaluate(() => {
    const el = document.querySelector('[role="group"]')?.parentElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (rulerBox) {
    await p.screenshot({
      path: path.join(OUT, 'z-after-ruler.png'),
      clip: rulerBox,
    });
    console.log('saved z-after-ruler.png');
  }
  await b.close();
})();
