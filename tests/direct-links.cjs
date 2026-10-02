// Breaks caught: missing automatic invitation, wrong reply tab/room, invalid input
// replacing an active peer, or a QR that displays something other than its link.
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {newPlayer,boot,gameClick,hand,finishRound}=require('./browser.cjs');
(async()=>{
  let app;
  if(!process.env.DIRECT_URL){const {createApp}=await import('../server/main.mjs');app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));}
  const url=process.env.DIRECT_URL||`http://127.0.0.1:${app.server.address().port}/direct.html`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const badRequests=[],errors=[],pages=[];
  fs.mkdirSync('scratch/links',{recursive:true});
  try{
    async function player(href,options){
      const p=await newPlayer(browser,'about:blank',options);pages.push(p);p.setDefaultTimeout(15000);
      await p.addInitScript(()=>{window.__rtcConfigs=[];const RTC=RTCPeerConnection;window.RTCPeerConnection=class extends RTC{constructor(c){__rtcConfigs.push(c);super(c);}};window.WebSocket=class{constructor(){throw Error('No connection server allowed');}};});
      await p.route('**/app.mjs',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('export function handle(event) {','export function handle(event) { window.__networkEvents.push(structuredClone(event));')});});
      p.on('request',r=>{if(new URL(r.url()).origin!==new URL(url).origin||r.url().includes('IY2-')||/\/api\/|\/pvp$/.test(r.url()))badRequests.push(r.url());});
      p.on('pageerror',e=>errors.push(e.message));await p.goto(href);return p;
    }
    function decodeQR(file){return execFileSync('python',['-c',"import cv2,sys\nimage=cv2.imread(sys.argv[1]); text=''\nfor scale in [1,2,3]:\n text,_,_=cv2.QRCodeDetector().detectAndDecode(cv2.resize(image,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST))\n if text:break\nassert text,'QR cannot be decoded'\nprint(text,end='')",file],{encoding:'utf8'});}
    const host=await player(url);await host.locator('#create').click();
    await host.waitForFunction(()=>document.querySelector('#outputCode').value.startsWith('IY2-'));
    const offer=await host.locator('#outputCode').inputValue();
    const invite=`${url}#invite=${encodeURIComponent(offer)}`;
    const guest=await player(invite,{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    await guest.waitForFunction(()=>!document.querySelector('#create').disabled);
    await guest.waitForTimeout(2500);
    assert.match(await guest.locator('#outputCode').inputValue(),/^IY2-/,'opening an invitation link must create the guest response automatically');
    assert.equal(await host.locator('#outputLink').inputValue(),invite);
    assert.equal(await guest.evaluate(()=>location.hash),'','consumed invitation must not run again on reload');
    await host.locator('#qrCanvas').screenshot({path:'scratch/links/invite-qr.png'});
    assert.equal(decodeQR('scratch/links/invite-qr.png'),invite);
    const answer=await guest.locator('#outputCode').inputValue(),reply=await guest.locator('#outputLink').inputValue();
    assert.equal(reply,`${url}#answer=${encodeURIComponent(answer)}`);
    await guest.locator('#qrCanvas').screenshot({path:'scratch/links/answer-qr.png'});
    assert.equal(decodeQR('scratch/links/answer-qr.png'),reply);
    assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile sharing UI must not overflow');
    console.log('PASS invitation auto-joins; invitation and response QR independently decode to their exact private links.');
    // A reply opened without the host tab must offer a usable copy/paste fallback.
    const other=await player(reply);
    await other.locator('#relayFallback').waitFor({timeout:12000});
    assert.equal(await other.locator('#returnLink').inputValue(),reply);
    assert.equal(await other.evaluate(()=>__rtcConfigs.length),0,'reply page must not create another game peer');
    // The host context has another room: only the matching waiting room may accept.
    const unrelated=await host.context().newPage();pages.push(unrelated);await unrelated.goto(url);await unrelated.locator('#create').click();
    await unrelated.waitForFunction(()=>document.querySelector('#outputCode').value.startsWith('IY2-'));
    const unrelatedInvite=await unrelated.locator('#outputCode').inputValue();
    const receipt=await host.context().newPage();pages.push(receipt);await receipt.goto(reply);
    await receipt.waitForFunction(()=>document.querySelector('#relayPanel').dataset.state==='sent');
    await host.waitForFunction(()=>document.getElementById('player1').textContent.includes('캐릭터 선택 중'));
    assert.equal(await unrelated.locator('#outputCode').inputValue(),unrelatedInvite);
    assert.equal(await unrelated.locator('#connectionPanel').getAttribute('data-state'),'waiting-answer');
    console.log('PASS reply automatically reaches only its original host tab; other browsers have a fallback.');
    await receipt.close();await unrelated.close();await host.bringToFront();
    await Promise.all([boot(host),boot(guest)]);
    await gameClick(host,100,140);
    const touch=async(x,y)=>{await guest.locator('ruffle-player').scrollIntoViewIfNeeded();const box=await guest.locator('ruffle-player').boundingBox();await guest.touchscreen.tap(box.x+x*box.width/432,box.y+y*box.height/330);};
    await touch(170,140);await host.locator('#bonusCount').selectOption('3');await host.locator('#ready').click();await guest.locator('#ready').tap();
    await Promise.all([host,guest].map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
    await host.waitForTimeout(1000); // original intro/help animation must finish before its close button exists
    await gameClick(host,358,82);await touch(358,82);
    await hand(host,[[216,60],[341,60],[92,110]]);
    for(const [x,y] of [[216,60],[341,60],[92,110]]){await touch(x,y);await guest.waitForTimeout(100);}
    await touch(245,295);
    await Promise.all([host,guest].map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'),{},{timeout:15000})));
    const reports=await Promise.all([host,guest].map(p=>p.evaluate(()=>__gameEvents.find(e=>e[0]==='resolved')[1])));assert.deepEqual(reports[0],reports[1]);
    await finishRound([host,guest],1);
    await guest.screenshot({path:'scratch/links/mobile-game.png',fullPage:true});
    console.log('PASS mobile touch character/card selection and real original-engine round agree with desktop.');
    // A stale/wrong room reply never destroys the newer pending invitation.
    await guest.locator('#leave').tap();await host.locator('#newInvite').click();
    await host.waitForFunction(old=>document.querySelector('#outputCode').value!==old,offer);
    const fresh=await host.locator('#outputCode').inputValue();await host.locator('#responseCode').fill(reply);await host.locator('#acceptAnswer').click();
    await host.waitForFunction(()=>document.getElementById('message').classList.contains('error'));assert.equal(await host.locator('#outputCode').inputValue(),fresh);
    await guest.locator('#roomCode').fill(await host.locator('#outputLink').inputValue());await guest.locator('#joinForm button').tap();
    await guest.waitForFunction(old=>document.querySelector('#outputCode').value!==old,answer);
    await host.locator('#responseCode').fill(await guest.locator('#outputLink').inputValue());await host.locator('#acceptAnswer').click();
    await host.waitForFunction(()=>document.getElementById('player1').textContent.includes('캐릭터 선택 중'));
    assert.deepEqual(badRequests,[]);assert.deepEqual(errors,[]);
    for(const p of [host,guest])assert.ok((await p.evaluate(()=>__rtcConfigs)).every(c=>JSON.stringify(c.iceServers)==='[]'));
    console.log('PASS stale reply recovery, pasted-link fallback, empty ICE servers and no external requests.');
  }catch(error){for(let i=0;i<pages.length;i++){if(pages[i].isClosed())continue;await pages[i].screenshot({path:`scratch/links/failure-${i}.png`,fullPage:true});console.log('DIAGNOSTIC',i,JSON.stringify(await pages[i].evaluate(()=>({events:window.__gameEvents,network:window.__networkEvents,message:document.getElementById('message')?.textContent,phase:document.getElementById('roomPanel')?.dataset}))));}throw error;}
  finally{await browser.close();if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
