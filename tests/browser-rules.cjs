const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const {createApp} = await import('../server/main.mjs');
  const app = createApp();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${app.server.address().port}`);
    const actual = await page.evaluate(async () => {
      const {RoomService,drawBonus,catalog} = await import('./net/room-rules.mjs');
      const s = new RoomService({randomInt:()=>{throw Error('Bonus RNG called');}});
      const h = {id:'h',events:[],send(e){this.events.push(e);}}, g = {id:'g',events:[],send(e){this.events.push(e);}};
      s.handle(h,{type:'create',bonusCount:0});
      const code = h.events.find(e=>e.type==='joined').code;
      s.handle(g,{type:'join',code});
      for (const c of [h,g]) {s.handle(c,{type:'character',character:'i'});s.handle(c,{type:'ready'});}
      return {code,catalog:catalog.length,zero:drawBonus(['i','ke'],0),host:h.events.find(e=>e.type==='start'),guest:g.events.find(e=>e.type==='start')};
    });
    assert.match(actual.code,/^[A-F0-9]{6}$/);assert.equal(actual.catalog,48);assert.deepEqual(actual.zero,[]);
    assert.deepEqual(actual.host,actual.guest);assert.deepEqual(actual.host.bonusCards,[]);
    console.log('PASS original room rules execute in the browser, same bonus list, zero bonus RNG.');
  } finally {await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
