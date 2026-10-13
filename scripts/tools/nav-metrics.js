/* 量底部导航的实际尺寸 + 悬浮元素有没有压住导航 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.resolve(__dirname, '..', '..', 'designs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  ['/today', '今日'],
  ['/tasks', '任务'],
  ['/timeline', '时间轴'],
  ['/calendar', '日历'],
  ['/me', '我的'],
];

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
  await p.goto(`${BASE}/#/today`, { waitUntil: 'networkidle0' });
  await sleep(1200);

  // 造一条数据，好让「主操作按钮」在任务/时间轴页都出现
  await p.click('[data-testid="diary-inline-add-work"]');
  await p.type('[data-testid="diary-inline-add-work"]', '完成 Q3 需求评审');
  await p.keyboard.press('Enter');
  await sleep(400);

  const nav = await p.evaluate(() => {
    const nav = document.querySelector('nav');
    const capsule = nav.querySelector('div');
    const cs = getComputedStyle(capsule);
    const label = capsule.querySelector('span.flex-1 span, a span');
    const svg = capsule.querySelector('svg');
    const indicator = capsule.querySelector('span[aria-hidden]');
    const capsuleBox = capsule.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    return {
      capsuleH: Math.round(capsuleBox.height),
      capsuleW: Math.round(capsuleBox.width),
      capsulesBottomGap: Math.round(window.innerHeight - capsuleBox.bottom),
      navPaddingBottom: cs.paddingBottom,
      indicatorH: indicator ? Math.round(indicator.getBoundingClientRect().height) : null,
      iconSize: svg ? Math.round(svg.getBoundingClientRect().height) : null,
      labelFont: label ? getComputedStyle(label).fontSize : null,
      labelText: label ? label.textContent : null,
      navBottom: Math.round(navBox.bottom),
    };
  });
  console.log('导航尺寸：', JSON.stringify(nav, null, 2));

  await p.screenshot({
    path: path.join(OUT, 'z-after-tabbar.png'),
    clip: { x: 0, y: 844 - 130, width: 390, height: 130 },
  });
  console.log('saved z-after-tabbar.png');

  // 各页悬浮元素与导航胶囊的间距（负数 = 被压住）
  for (const [hash, name] of ROUTES) {
    await p.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0' });
    await sleep(1000);
    const gaps = await p.evaluate(() => {
      const nav = document.querySelector('nav');
      const capsule = nav.querySelector('div');
      const capTop = capsule.getBoundingClientRect().top;
      const out = [];
      document.querySelectorAll('div.fixed, button.fixed').forEach((el) => {
        if (el.closest('nav')) return;
        const r = el.getBoundingClientRect();
        if (r.height < 30) return;
        const label = (el.textContent || '').trim().slice(0, 14);
        out.push({ label, gap: Math.round(capTop - r.bottom) });
      });
      return out;
    });
    console.log(`\n—— ${name} ——`, JSON.stringify(gaps));
  }

  await b.close();
})();
