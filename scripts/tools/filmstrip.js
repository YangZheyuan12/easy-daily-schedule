const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.resolve(__dirname, 'frames');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const clipOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }, selector);

/** 触发一次动作，然后在给定时间点各截一帧 */
async function frames(page, clip, times, prefix, action) {
  const names = [];
  let elapsed = 0;
  await action();
  for (const t of times) {
    await sleep(t - elapsed);
    elapsed = t;
    const name = `${prefix}-${String(t).padStart(3, '0')}.png`;
    await page.screenshot({ path: path.join(OUT, name), clip });
    names.push({ t, name });
  }
  return names;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  const rows = [];

  // ---------- 1) 勾选：盒子弹出 + 划掉线画出来 ----------
  await page.goto(`${BASE}/#/today`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  for (const text of ['写周报', '对齐需求方']) {
    await page.click('input[data-testid="diary-inline-add-work"]');
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await sleep(280);
  }
  await sleep(600);
  const rowClip = await clipOf(page, 'li.m-rise');
  rows.push({
    title: '勾选 · 盒子弹出 + 划线从左画出来',
    note: '盒子 0.76 → 1.14 → 1（280ms），对勾 70ms 后开始画，划线同步画出',
    frames: await frames(page, rowClip, [0, 90, 180, 300], 'tick', () =>
      page.click('li button[aria-label="标记为已完成"]'),
    ),
  });
  await sleep(500);

  // ---------- 2) 底部 Tab 指示器：滑过去 ----------
  await sleep(600);
  const navClip = await clipOf(page, 'nav > div');
  rows.push({
    title: '底部导航 · 指示器滑过去（不是跳过去）',
    note: 'transform 280ms / --m-ease-out；起点 4px → 中途 65px → 落位 73px',
    frames: await frames(page, navClip, [0, 100, 200, 340], 'tab', () =>
      page.click('a[href="#/tasks"]'),
    ),
  });

  // ---------- 3) 抽屉：升起 / 下拉 / 关闭 ----------
  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  const sheetClip = { x: 0, y: 430, width: 390, height: 414 };
  rows.push({
    title: '底部抽屉 · 升起（280ms）与下拉关闭',
    note: '从抓手往下拖：面板跟手、遮罩同步变淡；松手超过 28% 高度或甩速 > 0.55px/ms 即关闭，否则弹回',
    frames: await frames(page, sheetClip, [0, 100, 200, 340], 'sheet', () =>
      page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) =>
          b.textContent?.includes('添加时间段'),
        );
        btn?.click();
      }),
    ),
  });
  await sleep(600);

  // 拖拽过程单独抓（松手前）
  const panel = await page.evaluate(() => {
    const r = document.querySelector('div[role="dialog"]')?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + 18 } : null;
  });
  if (panel) {
    await page.mouse.move(panel.x, panel.y);
    await page.mouse.down();
    const dragFrames = [];
    for (const [i, dy] of [0, 60, 120, 180].entries()) {
      await page.mouse.move(panel.x, panel.y + dy, { steps: 4 });
      await sleep(60);
      const name = `drag-${String(i).padStart(3, '0')}.png`;
      await page.screenshot({ path: path.join(OUT, name), clip: sheetClip });
      dragFrames.push({ t: `下拉 ${dy}px`, name });
    }
    rows.push({
      title: '底部抽屉 · 下拉关闭（跟手 + 遮罩变淡）',
      note: '拖到 180px 松手 → 关闭；拖 60px 松手 → 按原缓动弹回',
      frames: dragFrames,
    });
    await page.mouse.up();
    await sleep(500);
  }

  // ---------- 4) 今日卡「长出来」 ----------
  await page.goto(`${BASE}/#/today`, { waitUntil: 'domcontentloaded' });
  await sleep(1800);
  const cardClip = await clipOf(page, 'button[aria-expanded]');
  const cardBox = await page.evaluate(() => {
    const r = document.querySelector('button[aria-expanded]')?.parentElement?.getBoundingClientRect();
    return r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: 300 } : cardClip;
  });
  rows.push({
    title: '自我状态卡 · 高度过渡（grid-template-rows 0fr → 1fr）',
    note: '不再「啪一下出现」；折叠时内容置 inert，键盘不会跳进看不见的输入框',
    frames: await frames(page, cardBox, [0, 100, 200, 340], 'card', () =>
      page.click('button[aria-expanded]'),
    ),
  });

  // ---------- 拼成一张拉片图 ----------
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:28px 32px;background:#FBF8F2;font-family:'PingFang SC','Microsoft YaHei',sans-serif;color:#2D2A24">
  <div style="font-size:22px;font-weight:600;letter-spacing:-.01em">动效拉片 · 纸感（Motion spec v1）</div>
  <div style="margin-top:6px;font-size:13px;color:#6B6455">四个关键动效的逐帧。缓动与时长取自 token：微反馈 120ms / 元素 200ms / 容器 280ms / 面板 340ms</div>
  ${rows
    .map(
      (row) => `
  <div style="margin-top:26px">
    <div style="font-size:15px;font-weight:600">${row.title}</div>
    <div style="margin-top:3px;font-size:12px;color:#8A8272">${row.note}</div>
    <div style="display:flex;gap:14px;margin-top:10px;align-items:flex-start">
      ${row.frames
        .map(
          (f) => `<div><img src="frames/${f.name}" style="display:block;width:${
            f.name.startsWith('sheet') || f.name.startsWith('drag') ? 240 : 300
          }px;border:1px solid #EAE3D5;border-radius:8px;background:#fff">
          <div style="margin-top:5px;font-size:11px;color:#A39B8B">${
            typeof f.t === 'number' ? `+${f.t}ms` : f.t
          }</div></div>`,
        )
        .join('')}
    </div>
  </div>`,
    )
    .join('')}
  </body>`;

  const htmlPath = path.join(__dirname, 'filmstrip.html');
  fs.writeFileSync(htmlPath, html);

  const viewer = await browser.newPage();
  await viewer.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1.6 });
  await viewer.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'load' });
  await sleep(700);
  const outPath = path.resolve(__dirname, '../../designs/motion-00-拉片.png');
  await viewer.screenshot({ path: outPath, fullPage: true });
  console.log('filmstrip =>', outPath);
  await browser.close();
})();
