const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
  const {createApp}=await import('../server/main.mjs');const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${app.server.address().port}/direct.html`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try{
    const host=await browser.newPage(),guest=await browser.newPage();
    await host.addInitScript(()=>{const original=RTCPeerConnection.prototype.createOffer;RTCPeerConnection.prototype.createOffer=async function(...args){await new Promise(r=>setTimeout(r,800));return original.apply(this,args);};});
    await host.goto(url);await host.locator('#create').click();
    await host.evaluate(()=>{location.hash='invite=IY2-invalid';});
    await host.waitForFunction(()=>document.querySelector('#connectionPanel').dataset.state==='waiting-answer');
    await host.waitForTimeout(100);
    assert.match(await host.locator('#outputCode').inputValue(),/^IY2-/,'another hash must not discard the pending host invitation');
    const invite=await host.locator('#outputLink').inputValue();assert.ok(invite.includes('#invite=IY2-'));
    await guest.addInitScript(()=>{const original=RTCPeerConnection.prototype.createAnswer;RTCPeerConnection.prototype.createAnswer=async function(...args){await new Promise(r=>setTimeout(r,800));return original.apply(this,args);};});
    await guest.goto(invite,{waitUntil:'commit'});await guest.waitForFunction(()=>document.querySelector('#connectionPanel')?.dataset.state==='gathering');
    // Same invitation during answer generation must not discard that answer.
    await guest.evaluate(href=>{location.hash=new URL(href).hash;},invite);
    await guest.waitForFunction(()=>document.querySelector('#connectionPanel').dataset.state==='connecting');await guest.waitForTimeout(100);
    assert.match(await guest.locator('#outputCode').inputValue(),/^IY2-/,'duplicate invitation must preserve pending guest answer');
    // Arrival in the existing waiting tab is also supported, without reloading.
    await host.evaluate(href=>{location.hash=new URL(href).hash;},await guest.locator('#outputLink').inputValue());
    await host.waitForFunction(()=>document.getElementById('player1').textContent.includes('캐릭터 선택 중'));
    assert.equal(await host.evaluate(()=>location.hash),'');assert.equal(await guest.locator('#seat').innerText(),'2P');
    console.log('PASS malformed/duplicate hashes preserve pending invitation/answer; same-tab response connects without reloading.');
  }finally{await browser.close();await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
