const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {newPlayer}=require('./browser.cjs');
(async()=>{
  const {createApp}=await import('../server/main.mjs');const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try{
    const url=`http://127.0.0.1:${app.server.address().port}/direct.html`;
    const h=await newPlayer(browser,url),g=await newPlayer(browser,url);for(const p of [h,g])p.setDefaultTimeout(10000);
    async function pending(){
      await h.locator('#create').click();await h.waitForFunction(()=>document.getElementById('outputCode').value.startsWith('IY1-'));
      const offer=await h.locator('#outputCode').inputValue();await g.locator('#roomCode').fill(offer);await g.locator('#joinForm button').click();
      await g.waitForFunction(()=>document.getElementById('outputCode').value.startsWith('IY1-'));return {offer,answer:await g.locator('#outputCode').inputValue()};
    }
    let {offer,answer}=await pending();
    await g.locator('#roomCode').fill('ABC123');await g.locator('#joinForm button').click();
    await g.waitForFunction(()=>document.getElementById('message').classList.contains('error'));
    assert.equal(await g.locator('#outputCode').inputValue(),answer,'invalid input must preserve response code');
    const bad=await g.evaluate(async text=>{const {encodeCode,decodeCode}=await import('./net/manual-peer.mjs');return encodeCode({...decodeCode(text),sdp:'v=0\r\nthis is invalid'});},offer);
    await g.locator('#roomCode').fill(bad);await g.locator('#joinForm button').click();
    await g.waitForFunction(()=>document.getElementById('joinForm').querySelector('button').disabled===false);
    assert.equal(await g.locator('#outputCode').inputValue(),answer);
    await h.locator('#responseCode').fill(answer);await h.locator('#acceptAnswer').click();
    await g.locator('#roomPanel').waitFor();assert.equal(await g.locator('#seat').innerText(),'2P');
    console.log('PASS invalid input and malformed replacement preserve existing pending connection/code.');
    await Promise.all([h.reload(),g.reload()]);({offer,answer}=await pending());
    await g.locator('#original').click();await h.locator('#responseCode').fill(answer);await h.locator('#acceptAnswer').click();
    await g.waitForTimeout(700);assert.equal(await g.locator('#roomPanel').isVisible(),false,'original mode must not rejoin from pending peer');
    assert.equal(await g.locator('#connectionPanel').isVisible(),false);
    console.log('PASS Original Game cancels pending guest; late host answer cannot reopen PvP.');
    const race=await g.evaluate(async()=>{
      const {DirectRoom}=await import('./net/direct-room.mjs');
      const host=new DirectRoom(),guest=new DirectRoom();const offer=await host.create(0);
      const old=guest.join(offer).catch(()=>{});guest.close();const next=guest.create(0);await old;const code=await next;
      const result={role:guest.role,hasRoom:Boolean(guest.service?.rooms.size),code};host.close();guest.close();return result;
    });
    assert.equal(race.role,'host');assert.equal(race.hasRoom,true);assert.match(race.code,/^IY1-/);
    console.log('PASS canceled join failure cannot clear a newly created room.');
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
