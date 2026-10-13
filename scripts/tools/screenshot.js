const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const url = process.argv[2] || 'http://localhost:5174/#/today';
  const out = process.argv[3] || 'shot.png';

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 2500)); // 等 React 挂载 + IndexedDB 初始数据
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('body length', html.length);


  const fullPage = process.argv.includes('--full');
  await page.screenshot({ path: out, fullPage });
  await browser.close();
  console.log('saved', path.resolve(out));
})();
