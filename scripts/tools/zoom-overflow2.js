/**
 * 重测：每一帧**重新查询**面板节点（key 变化会换节点，旧引用是已卸载的，rect 全 0）。
 * 顺带定位日历页那 2px 横向溢出到底来自哪个元素。
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

  // ── A. 逐帧测缩放期间的横向溢出（每帧重新查询节点）──
  await page.goto(`${BASE}/#/calendar`, { waitUntil: 'networkidle0' });
  await sleep(1600);

  const res = await page.evaluate(async () => {
    const pick = () => document.querySelector('[class*="m-zoom"]');
    const before = pick();
    const baseSW = document.documentElement.scrollWidth;
    const baseCW = document.documentElement.clientWidth;

    const yearBtn = Array.from(document.querySelectorAll('button[aria-pressed]')).find(
      (el) => el.textContent === '年',
    );
    yearBtn.click();

    const out = [];
    for (let i = 0; i < 16; i += 1) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 16)));
      const panel = pick();
      const cs = getComputedStyle(panel);
      const r = panel.getBoundingClientRect();
      const m = cs.transform === 'none' ? 1 : Number(cs.transform.slice(7).split(',')[0]);
      out.push({
        anim: cs.animationName,
        scale: m.toFixed(3),
        left: Math.round(r.left),
        right: Math.round(r.right),
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      });
    }
    return { before: { baseSW, baseCW, cls: before.className }, out };
  });

  console.log('切换前面板 class：', res.before.cls);
  console.log(`切换前 scrollWidth=${res.before.baseSW} clientWidth=${res.before.baseCW}`);
  console.log('\n进年视图逐帧：');
  for (const f of res.out) {
    const over = f.sw > f.cw ? ` ★横向超 ${f.sw - f.cw}px` : '';
    console.log(
      `  ${f.anim.padEnd(11)} scale=${f.scale} left=${f.left} right=${f.right} sw=${f.sw}${over}`,
    );
  }
  const worstLeft = Math.min(...res.out.map((f) => f.left));
  const worstRight = Math.max(...res.out.map((f) => f.right));
  console.log(`\n面板可视边界最宽：left=${worstLeft} right=${worstRight}（视口 390）`);

  // ── B. 定位既有的 2px 溢出元素 ──
  await sleep(1400);
  const culprits = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > cw + 0.5 || r.left < -0.5) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 90),
          left: Math.round(r.left),
          right: Math.round(r.right),
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
        });
      }
    }
    return out.slice(0, 12);
  });
  console.log('\n溢出视口的元素：');
  for (const c of culprits) console.log('  ', JSON.stringify(c));

  // 各页面的基线 scrollWidth
  console.log('\n各页 scrollWidth / clientWidth（390）：');
  for (const [hash, name] of [
    ['/today', '今日'],
    ['/tasks', '任务'],
    ['/calendar', '日历-月'],
    ['/timeline', '时间轴'],
    ['/me', '我的'],
  ]) {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0' });
    await sleep(1300);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    console.log(`  ${name}：${m.sw} / ${m.cw}${m.sw > m.cw ? '  ★超 ' + (m.sw - m.cw) + 'px' : '  ✓'}`);
  }

  await browser.close();
})();
