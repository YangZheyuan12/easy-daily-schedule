const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) console.log('HTTP', status, res.url());
  });
  page.on('console', (msg) => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://localhost:5174/#/today', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('body length', html.length);
  await browser.close();
})();
