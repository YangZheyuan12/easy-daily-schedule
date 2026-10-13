/**
 * 本轮四项改动的运行时验收：
 *  ① 任务行上移 / 下移真的换位，且边界置灰
 *  ② 日历 月 ↔ 年 切换：滑块位移 + 面板进场动画（读 computed animationName）
 *  ③ 我的页「关于」只剩一句
 *  ④ 页头副标题放大后各屏不裁字、不横向溢出
 */
const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ══════════ ① 任务行换位 ══════════
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0' });
  await sleep(1500);

  const addTask = async (text) => {
    const clicked = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((el) =>
        (el.textContent || '').includes('添加任务'),
      );
      if (!b) return false;
      b.click();
      return true;
    });
    if (!clicked) throw new Error('找不到「+ 添加任务」');
    await sleep(320);
    await page.keyboard.type(text, { delay: 8 });
    await sleep(220);
  };

  for (const t of ['Alpha', 'Beta', 'Gamma']) await addTask(t);

  const readOrder = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('input[placeholder="今天要做什么…"]')).map((i) => i.value),
    );

  console.log('\n═══ ① 任务行换位 ═══');
  console.log('初始顺序：', (await readOrder()).join(' | '));

  // 点第一条的「下移」
  const clickMove = async (label, index) => {
    await page.evaluate(
      (l, i) => {
        const btns = Array.from(document.querySelectorAll(`button[aria-label="${l}"]`));
        btns[i]?.click();
      },
      label,
      index,
    );
    await sleep(420);
  };

  await clickMove('下移', 0);
  console.log('第一条下移后：', (await readOrder()).join(' | '));

  await clickMove('上移', 2);
  console.log('第三条上移后：', (await readOrder()).join(' | '));

  const disabledState = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-label="上移"],button[aria-label="下移"]'))
      .filter((b) => b.offsetParent !== null || true)
      .map((b) => `${b.getAttribute('aria-label')}:${b.disabled ? '灰' : '可'}`),
  );
  console.log('置灰状态（DOM 顺序）：', disabledState.join(' '));

  // 重新加载：换位必须已经落库（刷新后顺序一致才算真写进去）
  const beforeReload = await readOrder();
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);
  const afterReload = await readOrder();
  console.log('刷新前后一致：', JSON.stringify(beforeReload) === JSON.stringify(afterReload) ? '✓' : `✗ ${afterReload}`);

  // 聚焦某一行看工具栏的真实呈现（截图）
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[placeholder="今天要做什么…"]'));
    inputs[1]?.focus();
  });
  await sleep(400);
  await page.screenshot({ path: 'D:/myProjects/日程表软件/designs/v-task-row-actions.png' });
  console.log('已截图 v-task-row-actions.png');

  // ══════════ ② 日历视图切换 ══════════
  console.log('\n═══ ② 日历 月 ↔ 年 ═══');
  await page.goto(`${BASE}/#/calendar`, { waitUntil: 'networkidle0' });
  await sleep(1600);

  const probePanel = () =>
    page.evaluate(() => {
      const seg = document.querySelector('div.relative.inline-flex');
      const pill = seg?.querySelector('span[aria-hidden]');
      const panel = seg?.parentElement?.nextElementSibling;
      const cs = panel ? getComputedStyle(panel) : null;
      return {
        pillTransform: pill ? getComputedStyle(pill).transform : null,
        panelAnim: cs ? cs.animationName : null,
        panelDuration: cs ? cs.animationDuration : null,
        panelTransform: cs ? cs.transform : null,
        panelClass: panel ? panel.className : null,
        monthPressed: document.querySelectorAll('button[aria-pressed="true"]')[0]?.textContent ?? null,
      };
    });

  // 点「年」并立刻采样（多个时刻，看动画是否稳定不重播）
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button[aria-pressed]')).find(
      (el) => el.textContent === '年',
    );
    b?.click();
  });
  for (const t of [30, 90, 200, 400]) {
    await sleep(t === 30 ? 30 : 70);
    const m = await probePanel();
    console.log(`  进年视图 +${t}ms → anim=${m.panelAnim} dur=${m.panelDuration} transform=${m.panelTransform} 滑块=${m.pillTransform}`);
  }
  await sleep(1200);
  await page.screenshot({ path: 'D:/myProjects/日程表软件/designs/v-calendar-year.png' });

  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button[aria-pressed]')).find(
      (el) => el.textContent === '月',
    );
    b?.click();
  });
  for (const t of [30, 90, 400]) {
    await sleep(t === 30 ? 30 : 70);
    const m = await probePanel();
    console.log(`  进月视图 +${t}ms → anim=${m.panelAnim} transform=${m.panelTransform} 滑块=${m.pillTransform}`);
  }
  await sleep(1000);
  await page.screenshot({ path: 'D:/myProjects/日程表软件/designs/v-calendar-month.png' });

  // 横向溢出检查（缩放动画期间不得撑出横向滚动条）
  const scrollCheck = await page.evaluate(async () => {
    const out = [];
    const seg = document.querySelector('div.relative.inline-flex');
    const panel = seg?.parentElement?.nextElementSibling;
    const yearBtn = Array.from(document.querySelectorAll('button[aria-pressed]')).find(
      (el) => el.textContent === '年',
    );
    yearBtn?.click();
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 25)));
      out.push({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        panelW: panel ? Math.round(panel.getBoundingClientRect().width) : null,
      });
    }
    return out;
  });
  const overflowed = scrollCheck.filter((s) => s.sw > s.cw);
  console.log(
    `  动画期间横向溢出：${overflowed.length === 0 ? '无 ✓' : `${overflowed.length}/12 帧 超 ${overflowed[0].sw - overflowed[0].cw}px ✗`}`,
  );
  console.log('  面板宽度采样：', scrollCheck.map((s) => s.panelW).join(','));

  // ══════════ ③ 我的页「关于」 ══════════
  console.log('\n═══ ③ 我的页 ═══');
  await page.goto(`${BASE}/#/me`, { waitUntil: 'networkidle0' });
  await sleep(1300);
  const aboutText = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('div')).find(
      (d) => d.firstElementChild?.textContent === '关于',
    );
    return card ? card.innerText.replace(/\n/g, ' / ') : null;
  });
  console.log('  关于卡内容：', aboutText);
  await page.screenshot({ path: 'D:/myProjects/日程表软件/designs/v-me-about.png' });

  // ══════════ ④ 页头副标题裁字 & 溢出扫描 ══════════
  console.log('\n═══ ④ 页头副标题 / 裁字扫描 ═══');
  const PROBE = `(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (!t) continue;
      if (el.scrollWidth - el.clientWidth > 1 && el.clientWidth > 0) {
        out.push({
          text: t.slice(0, 26),
          font: getComputedStyle(el).fontSize,
          over: el.scrollWidth - el.clientWidth,
        });
      }
    }
    return out;
  })()`;

  const routes = [
    ['/tasks', '任务'],
    ['/calendar', '日历'],
    ['/me', '我的'],
    ['/timeline', '时间轴'],
    ['/today', '今日'],
  ];
  let total = 0;
  for (const [hash, name] of routes) {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle0' });
    await sleep(1200);
    const found = await page.evaluate(PROBE);
    total += found.length;
    console.log(`  ${name}：${found.length} 处裁字${found.length ? ' → ' + JSON.stringify(found) : ''}`);
  }
  // 副标题实测字号
  await page.goto(`${BASE}/#/tasks`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const subtitle = await page.evaluate(() => {
    const sub = document.querySelector('header > div > div > div:nth-child(2)');
    const btn = sub?.querySelector('button');
    return {
      text: sub?.textContent,
      font: sub ? getComputedStyle(sub).fontSize : null,
      btnFont: btn ? getComputedStyle(btn).fontSize : null,
    };
  });
  console.log('  任务页副标题：', JSON.stringify(subtitle));
  console.log('  裁字合计：', total);

  console.log('\n页面报错：', errors.length === 0 ? '无 ✓' : errors);

  await browser.close();
})();
