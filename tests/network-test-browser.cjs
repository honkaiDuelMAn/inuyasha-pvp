const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const root = path.resolve('public');
  const types = {'.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css'};
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'network-test.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(404); response.end(); return;
    }
    try {
      const bytes = fs.readFileSync(file);
      response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, headless: true});
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: {width: 384, height: 854},
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-G996N) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/network-test.html`);
    await page.locator('#start').click();
    await page.waitForFunction(() => document.querySelector('#start').textContent === '다시 검사', null, {timeout: 20000});

    const report = await page.locator('#report').inputValue();
    assert.match(report, /Cloudflare STUN · UDP 3478/);
    assert.match(report, /Google STUN · UDP 19302/);
    assert.match(report, /IP 주소와 포트는 수집·표시하지 않음/);
    assert.doesNotMatch(report, /candidate:|\braddr\b|\brport\b/i);
    assert.equal(await page.locator('#summary').isVisible(), true);
    assert.deepEqual(errors, []);

    fs.mkdirSync('scratch/network-test', {recursive: true});
    await page.screenshot({path: 'scratch/network-test/mobile.png', fullPage: true});
    console.log('PASS mobile diagnostic runs four probes, renders a privacy-safe report, and has no browser errors.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
