/**
 * 复验：`m-zoom-in`（1.04 → 1 收拢）不再撑出横向溢出，且页头 sticky 不受影响。
 * 每一帧都重新查询面板节点（key 变化会换节点）。
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

  const run = async (label) => {
    const r = await page.evaluate(async (targetLabel) => {
      const pick = () => document.querySelector('[class*="m-zoom"]');
      const startSW = document.documentElement.scrollWidth;
      const startCW = document.documentElement.clientWidth;
      const btn = Array.from(document.querySelectorAll('button[aria-pressed]')).find(
        (el) => el.textContent === targetLabel,
      );
      btn.click();
      const frames = [];
      for (let i = 0; i < 16; i += 1) {
        await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 16)));
        const panel = pick();
        const cs = getComputedStyle(panel);
        const box = panel.getBoundingClientRect();
        frames.push({
          anim: cs.animationName,
          scale: (cs.transform === 'none' ? 1 : Number(cs.transform.slice(7).split(',')[0])).toFixed(3),
          left: Math.round(box.left),
          right: Math.round(box.right),
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        });
      }
      return { startSW, startCW, frames };
    }, label);

    console.log(`\n进「${label}」视图（切换前 sw=${r.startSW} cw=${r.startCW}）：`);
    for (const f of r.frames) {
      const over = f.sw > f.cw ? ` ★横向超 ${f.sw - f.cw}px` : '';
      console.log(`  ${f.anim.padEnd(11)} scale=${f.scale} left=${f.left} right=${f.right} sw=${f.sw}${over}`);
    }
    const maxSW = Math.max(...r.frames.map((f) => f.sw));
    const cw = r.frames[0].cw;
    console.log(`  最大 scrollWidth=${maxSW} / clientWidth=${cw} → ${maxSW > cw ? '✗ 仍溢出' : '✓ 不溢出'}`);
  };

  // 先从月切到年（当前是月），再切回月 —— 两次都要测
  await run('年');
  await sleep(1300);
  await run('月');
  await sleep(1300);

  // sticky 页头：滚动后是否仍贴在顶部
  await page.evaluate(() => window.scrollTo(0, 400));
  await sleep(600);
  const sticky = await page.evaluate(() => {
    const h = document.querySelector('header');
    const r = h.getBoundingClientRect();
    const cs = getComputedStyle(h);
    return { top: Math.round(r.top), position: cs.position, scrollY: Math.round(window.scrollY) };
  });
  console.log('\n滚动 400px 后页头：', JSON.stringify(sticky), sticky.position === 'sticky' && sticky.top === 0 ? '✓ 仍粘在顶部' : '⚠ 检查');
  console.log('页面可滚动高度：', await page.evaluate(() => document.documentElement.scrollHeight));
  await page.evaluate(() => window.scrollTo(0, 0));

  await browser.close();
})();
