const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
  const {createApp}=await import('../server/main.mjs');const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(10000);
    await page.route('**/app.mjs',async route=>{await new Promise(r=>setTimeout(r,1500));await route.continue();});
    await page.goto(`http://127.0.0.1:${app.server.address().port}/direct.html`);
    assert.equal(await page.locator('#create').isDisabled(),true,'create must stay disabled until handlers finish loading');
    assert.equal(await page.locator('#joinForm button').isDisabled(),true);
    assert.equal(await page.locator('#original').isDisabled(),true);
    await page.locator('#create').click();await page.locator('ruffle-player').waitFor();await page.locator('#roomPanel').waitFor();
    assert.equal(await page.locator('#seat').innerText(),'1P · 호스트');
    console.log('PASS delayed module first load: controls wait for readiness and first create click works.');
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
