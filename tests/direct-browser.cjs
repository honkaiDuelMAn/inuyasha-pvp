const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {newPlayer,boot,gameClick,hand,finishRound}=require('./browser.cjs');
(async()=>{
  const root=path.resolve(process.env.STATIC_ROOT||'public');
  const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.swf':'application/x-shockwave-flash'};
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');let relative;
    try{relative=decodeURIComponent(url.pathname.replace(/^\/inuyasha-pvp\//,''));}catch{res.writeHead(400);res.end();return;}
    if(!relative)relative=process.env.STATIC_ROOT?'index.html':'direct.html';
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
    try{const bytes=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}
  });
  if(!process.env.DIRECT_URL)await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=process.env.DIRECT_URL||`http://127.0.0.1:${server.address().port}/inuyasha-pvp/`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const pages=[],badRequests=[],errors=[];
  try{
    async function player(){
      const p=await newPlayer(browser,'about:blank');p.setDefaultTimeout(15000);
      await p.addInitScript(()=>{window.__rtcConfigs=[];const RTC=RTCPeerConnection;window.RTCPeerConnection=class extends RTC{constructor(c){__rtcConfigs.push(c);super(c);}};window.WebSocket=class{constructor(){throw Error('Static mode must not use WebSocket');}};});
      await p.route('**/app.mjs',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('export function handle(event) {','export function handle(event) { window.__networkEvents.push(structuredClone(event));')});});
      p.on('request',r=>{if(new URL(r.url()).origin!==new URL(url).origin||/\/api\/|\/pvp$/.test(r.url()))badRequests.push(r.url());});
      p.on('pageerror',e=>errors.push(e.message));await p.goto(url);pages.push(p);return p;
    }
    const host=await player();await host.locator('#create').click();await boot(host);
    await host.waitForFunction(()=>document.querySelector('#outputCode').value.startsWith('IY1-'));
    const invite=await host.locator('#outputCode').inputValue();await host.locator('#bonusCount').selectOption('3');
    const guest=await player();await guest.locator('#roomCode').fill('ABC123');await guest.locator('#joinForm button').click();
    await guest.waitForFunction(()=>document.getElementById('message').classList.contains('error'));assert.equal(await guest.evaluate(()=>__rtcConfigs.length),0);
    await guest.locator('#roomCode').fill(invite);await guest.locator('#joinForm button').click();
    await guest.waitForFunction(()=>document.querySelector('#outputCode').value.startsWith('IY1-'));
    const answer=await guest.locator('#outputCode').inputValue();
    await host.locator('#responseCode').fill(answer);await host.locator('#acceptAnswer').click();await boot(guest);
    await host.waitForFunction(()=>document.getElementById('player1').textContent.includes('캐릭터 선택 중'));
    await gameClick(host,100,140);await gameClick(guest,170,140);await host.locator('#ready').click();await guest.locator('#ready').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
    const starts=await Promise.all(pages.map(p=>p.evaluate(()=>__networkEvents.find(e=>e.type==='start'))));
    assert.deepEqual(starts[0],starts[1]);assert.equal(starts[0].bonusCards.length,3);assert.deepEqual(starts[0].characters,['i','ke']);
    console.log('PASS static nested-path browser host/guest connection and three shared bonus cards.');
    for(const p of pages)await gameClick(p,358,82);
    for(const p of pages)await hand(p,[[216,60],[341,60],[92,110]]);
    await finishRound(pages,1);
    for(let round=2;round<10;round++){
      await hand(host,[[216,60],[92,110],[341,110]]);await hand(guest,[[341,60],[341,110],[216,60]]);
      await Promise.all(pages.map(p=>p.waitForFunction(r=>__gameEvents.some(e=>e[0]==='resolved'&&e[1].round===r),round,{timeout:10000})));
      const reports=await Promise.all(pages.map(p=>p.evaluate(r=>__gameEvents.find(e=>e[0]==='resolved'&&e[1].round===r)[1],round)));
      assert.deepEqual(reports[0],reports[1]);await finishRound(pages,round);if(reports[0].result!=='none')break;
    }
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="result"]').waitFor()));
    await host.locator('#rematch').click();await guest.locator('#rematch').click();await host.locator('#bonusCount').selectOption('0');
    for(const p of pages)await gameClick(p,100,140);await host.locator('#ready').click();await guest.locator('#ready').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"][data-match="2"]').waitFor({timeout:20000})));
    const zero=await guest.evaluate(()=>__networkEvents.filter(e=>e.type==='start').at(-1));assert.deepEqual(zero.bonusCards,[]);assert.deepEqual(zero.characters,['i','i']);
    console.log('PASS original-engine victory and character reselection with zero bonus cards.');
    for(const p of pages)await hand(p,[[216,60],[341,60],[341,110]]);await finishRound(pages,1);
    await guest.locator('#leave').click();await host.locator('#roomPanel[data-phase="selecting"]').waitFor();
    await host.locator('#newInvite').click();await host.waitForFunction(old=>document.querySelector('#outputCode').value!==old&&document.querySelector('#outputCode').value.startsWith('IY1-'),invite);
    const nextInvite=await host.locator('#outputCode').inputValue();await host.locator('#responseCode').fill(answer);await host.locator('#acceptAnswer').click();
    await host.waitForFunction(()=>document.getElementById('message').classList.contains('error'));
    await guest.locator('#roomCode').fill(nextInvite);await guest.locator('#joinForm button').click();
    await guest.waitForFunction(old=>document.querySelector('#outputCode').value!==old&&document.querySelector('#outputCode').value.startsWith('IY1-'),answer);
    await host.locator('#responseCode').fill(await guest.locator('#outputCode').inputValue());await host.locator('#acceptAnswer').click();
    await host.waitForFunction(()=>document.getElementById('player1').textContent.includes('캐릭터 선택 중'));
    for(const p of pages)await gameClick(p,100,140);await host.locator('#ready').click();await guest.locator('#ready').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"][data-match="3"]').waitFor({timeout:20000})));
    assert.deepEqual(badRequests,[]);assert.deepEqual(errors,[]);for(const p of pages)assert.ok((await p.evaluate(()=>__rtcConfigs)).every(c=>JSON.stringify(c.iceServers)==='[]'));
    fs.mkdirSync('scratch/direct',{recursive:true});await host.screenshot({path:'scratch/direct/pvp.png',fullPage:true});
    console.log('PASS disconnect, fresh invitation, stale answer recovery, replacement; no API/WebSocket/external assets and empty ICE servers.');
  }catch(e){for(let i=0;i<pages.length;i++)console.log('DIAGNOSTIC',i,JSON.stringify(await pages[i].evaluate(()=>({game:__gameEvents,network:__networkEvents,message:document.querySelector('#message')?.textContent}))));throw e;}
  finally{await browser.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
