/**
 * 字号放大 + 时间刻度尺 验收脚本。
 *
 * 读数优先：字号层级、hover 放大加深、拖动滚动量、保存按钮状态。
 * 这些都必须读 computed style —— 截图看不出一格刻度到底有没有被放大。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.resolve(__dirname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  await page.goto(`${BASE}/#/today`, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(1300);

  async function inlineAdd(sectionKey, text) {
    const sel = `[data-testid="diary-inline-add-${sectionKey}"]`;
    await page.click(sel);
    await page.type(sel, text);
    await page.keyboard.press('Enter');
    await sleep(320);
  }

  await inlineAdd('work', '完成 Q3 需求评审');
  await inlineAdd('work', '提交周报');
  await inlineAdd('study', '论文阅读');
  await inlineAdd('fitness', '晨跑 5 公里');
  await inlineAdd('life', '买菜做饭');
  await inlineAdd('inspiration', '想到一个点子：周报做成模板');

  // 勾掉一条，露出完成态
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="标记为已完成"]');
    if (btn) btn.click();
  });
  await sleep(500);

  // ——— ① 字号层级读数 ———
  const type = await page.evaluate(() => {
    const px = (el) => (el ? getComputedStyle(el).fontSize : null);
    const weight = (el) => (el ? getComputedStyle(el).fontWeight : null);
    const sec = document.querySelector('section');
    const groupName = sec?.querySelector('button span:nth-child(2)');
    const groupCount = sec?.querySelector('button span:last-child');
    const inlineInput = sec?.querySelector('input[data-testid^="diary-inline-add"]');
    const topTitle = document.querySelector('li button span.m-strike');
    const tabLabel = document.querySelector('nav a span');
    const pageTitle = document.querySelector('header div > div');
    const rows = {};
    document.querySelectorAll('p, span, input').forEach((el) => {
      const s = getComputedStyle(el).fontSize;
      rows[s] = (rows[s] || 0) + 1;
    });
    return {
      组头: { size: px(groupName), weight: weight(groupName), text: groupName?.textContent },
      组头计数: { size: px(groupCount) },
      内联添加输入: { size: px(inlineInput) },
      顶层条目: { size: px(topTitle) },
      Tab标签: { size: px(tabLabel) },
      页面标题: { size: px(pageTitle) },
      全站字号分布: rows,
    };
  });
  console.log('【字号层级】', JSON.stringify(type, null, 2));

  await page.screenshot({ path: path.join(OUT, 't-today.png'), fullPage: true });
  console.log('saved t-today.png');

  // ——— ② 时间轴：新时间刻度尺 ———
  await page.goto(`${BASE}/#/timeline`, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(1200);

  const clickText = async (text) => {
    await page.evaluate((t) => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => (b.textContent || '').trim() === t,
      );
      if (btn) btn.click();
    }, text);
    await sleep(450);
  };

  await clickText('+ 添加时间段');
  await sleep(600);

  // 保存按钮：内容为空时必须禁用
  const saveDisabled = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '保存',
    );
    if (!btn) return null;
    return {
      disabled: btn.disabled,
      bg: getComputedStyle(btn).backgroundColor,
      color: getComputedStyle(btn).color,
      size: getComputedStyle(btn).fontSize,
      radius: getComputedStyle(btn).borderRadius,
    };
  });
  console.log('【保存按钮 · 内容为空】', JSON.stringify(saveDisabled));
  await page.screenshot({ path: path.join(OUT, 't-sheet-empty.png') });

  // 刻度尺：起始值 09:00 是否居中 + 有多少个刻度
  const rulerInit = await page.evaluate(() => {
    const row = document.querySelector('div[role="group"][aria-label*="小时"]');
    const selected = row?.querySelector('[data-selected="true"]');
    return {
      刻度数: row?.querySelectorAll('button').length ?? 0,
      scrollLeft: Math.round(row?.scrollLeft ?? -1),
      选中刻度: selected?.getAttribute('aria-label'),
      readout: document.querySelector('div[role="group"]')?.parentElement?.textContent?.startsWith(
        '开始时间',
      )
        ? document.querySelector('div[role="group"]')?.previousElementSibling?.textContent
        : null,
    };
  });
  console.log('【刻度尺 · 初次展开】', JSON.stringify(rulerInit));

  // hover 放大 + 加深（和未悬停的刻度对比）
  const before = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="14 点"]');
    const s = getComputedStyle(el);
    return { transform: s.transform, color: s.color, bg: s.backgroundColor };
  });
  await page.hover('[aria-label="14 点"]');
  await sleep(350);
  const after = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="14 点"]');
    const s = getComputedStyle(el);
    return { transform: s.transform, color: s.color, bg: s.backgroundColor };
  });
  console.log('【hover 前】', JSON.stringify(before));
  console.log('【hover 后】', JSON.stringify(after));
  await page.screenshot({ path: path.join(OUT, 't-ruler-hover.png') });

  // 拖动：横向拖 200px，看容器 scrollLeft 有没有跟手
  const dragSel = 'div[role="group"][aria-label*="分钟"]';
  const box = await page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, dragSel);
  const scrollBefore = await page.evaluate(
    (sel) => Math.round(document.querySelector(sel).scrollLeft),
    dragSel,
  );
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(box.x - i * 20, box.y);
    await sleep(16);
  }
  await page.mouse.up();
  await sleep(200);
  const scrollAfter = await page.evaluate(
    (sel) => Math.round(document.querySelector(sel).scrollLeft),
    dragSel,
  );
  console.log(`【拖动分钟尺】scrollLeft ${scrollBefore} → ${scrollAfter}（拖了 -200px）`);

  // 点击刻度选中：小时点 13 点，分钟点 30 分
  await page.click('[aria-label="13 点"]');
  await sleep(250);
  await page.click('[aria-label="30 分"]');
  await sleep(250);
  const chosen = await page.evaluate(() => {
    const readout = document.querySelector('div[role="group"][aria-label*="小时"]')
      ?.previousElementSibling;
    const chips = Array.from(document.querySelectorAll('button[aria-pressed]'))
      .slice(0, 4)
      .map((b) => (b.textContent || '').trim());
    return { readout: readout?.textContent, chips };
  });
  console.log('【选 13:30】', JSON.stringify(chosen));

  // 再切到「结束」chip，验证刻度尺跟着换字段
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-pressed]')).find((b) =>
      (b.textContent || '').trim().startsWith('结束'),
    );
    if (btn) btn.click();
  });
  await sleep(400);
  const endState = await page.evaluate(() => {
    const readout = document.querySelector('div[role="group"][aria-label*="小时"]')
      ?.previousElementSibling;
    const row = document.querySelector('div[role="group"][aria-label*="小时"]');
    return {
      readout: readout?.textContent,
      选中: row?.querySelector('[data-selected="true"]')?.getAttribute('aria-label'),
      scrollLeft: Math.round(row?.scrollLeft ?? -1),
    };
  });
  console.log('【切到「结束」字段】', JSON.stringify(endState));
  await page.screenshot({ path: path.join(OUT, 't-sheet-end.png') });

  // 填内容 → 保存按钮应变成实心可点
  await page.type('textarea[placeholder="这段时间做什么？"]', 'Q3 需求评审');
  await sleep(300);
  const saveReady = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '保存',
    );
    return {
      disabled: btn.disabled,
      bg: getComputedStyle(btn).backgroundColor,
      color: getComputedStyle(btn).color,
    };
  });
  console.log('【保存按钮 · 内容已填】', JSON.stringify(saveReady));
  await page.screenshot({ path: path.join(OUT, 't-sheet-ready.png') });

  await clickText('保存');
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 't-timeline.png'), fullPage: true });
  console.log('saved t-timeline.png');

  // 再补两个时间段，让轴式布局有内容
  for (const [h, m, text] of [
    [8, 0, '晨跑 5 公里'],
    [21, 30, '论文阅读'],
  ]) {
    await clickText('+ 添加时间段');
    await sleep(500);
    await page.click(`[aria-label="${h} 点"]`);
    await sleep(200);
    await page.click(`[aria-label="${m} 分"]`);
    await sleep(200);
    await page.type('textarea[placeholder="这段时间做什么？"]', text);
    await sleep(200);
    await clickText('保存');
    await sleep(400);
  }
  await page.screenshot({ path: path.join(OUT, 't-timeline-full.png'), fullPage: true });
  console.log('saved t-timeline-full.png');

  // ——— ③ 其它屏 ———
  async function shot(hash, name, full = true) {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0', timeout: 20000 });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, name), fullPage: full });
    console.log('saved', name);
  }

  // 任务页（先造几条）
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0', timeout: 20000 });
  await sleep(1000);
  await clickText('+ 添加任务');
  for (const text of ['回复客户邮件', '交房租', '预约体检', '给爸妈打电话']) {
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await sleep(220);
  }
  await page.keyboard.press('Backspace');
  await sleep(300);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button[aria-label="标记为已完成"]'));
    btns.slice(0, 2).forEach((b) => b.click());
  });
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 't-tasks.png'), fullPage: true });
  console.log('saved t-tasks.png');

  await shot('/calendar', 't-calendar.png');
  await shot('/me', 't-me.png');
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  await shot(`/section/work?date=${key}`, 't-section.png');

  // 板块详情里的条目抽屉（保存按钮同款样式）
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="打开详情"]');
    if (btn) btn.click();
  });
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 't-item-sheet.png') });
  console.log('saved t-item-sheet.png');

  await browser.close();
  console.log('done');
})();
