const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const origin = process.env.PVP_ORIGIN || 'http://127.0.0.1:8787';
async function gameClick(page, x, y) {
  const game = page.locator('ruffle-player'), box = await game.boundingBox();
  await game.click({position:{x:x*box.width/432, y:y*box.height/330}});
}
async function newPlayer(browser) {
  const context = await browser.newContext({viewport:{width:1280,height:1100}});
  await context.addInitScript(() => {
    window.__gameEvents=[]; window.__networkEvents=[];
    let handler;
    Object.defineProperty(window,'pvpEvent',{configurable:true,set(fn){handler=fn;},get(){return (...args)=>{window.__gameEvents.push(JSON.parse(JSON.stringify(args)));return handler?.(...args);};}});
    const NativeSocket=window.WebSocket;
    window.WebSocket=class extends NativeSocket {constructor(...args){super(...args);this.addEventListener('message', e=>window.__networkEvents.push(JSON.parse(e.data)));}};
  });
  const page=await context.newPage();page.on('pageerror',e=>console.log('JS ERROR',e.message));
  await page.goto(origin);return page;
}
async function boot(page) {
  await page.locator('ruffle-player').waitFor();
  for(let i=0;i<30;i++){
    if(await page.evaluate(()=>__gameEvents.some(e=>e[0]==='ready'))) return;
    await page.waitForTimeout(250);await gameClick(page,217,302);await gameClick(page,175,315);
  }
  throw Error('Original PLAY/difficulty did not reach PvP readiness');
}
async function finishRound(pages, round) {
  for(let i=0;i<100;i++) {
    if(await pages[0].evaluate(r=>document.querySelector('#roomPanel').dataset.phase==='result'||Number(document.querySelector('#roomPanel').dataset.round)>r,round)) return;
    await Promise.all(pages.map(p=>gameClick(p,215,251)));
    await pages[0].waitForTimeout(500);
  }
  throw Error(`Round ${round} did not finish`);
}
async function hand(page, points) {
  for(const [x,y] of points) await gameClick(page,x,y);
  await gameClick(page,245,295);
}
(async()=>{
  fs.mkdirSync('scratch/browser',{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const pages=[];
  try {
    const host=await newPlayer(browser);pages.push(host);await host.getByRole('button',{name:'방 만들기'}).click();await boot(host);
    const code=await host.locator('#code').innerText();await host.locator('#bonusCount').selectOption('3');
    const guest=await newPlayer(browser);pages.push(guest);await guest.getByRole('textbox',{name:'방 코드',exact:true}).fill(code);await guest.getByRole('button',{name:'참가',exact:true}).click();await boot(guest);
    await gameClick(host,100,140);await gameClick(guest,170,140);
    await host.waitForFunction(()=>__gameEvents.some(e=>e[0]==='character'),{},{timeout:4000});
    await host.locator('#ready').click();await guest.locator('#ready').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
    const a=await host.evaluate(()=>__networkEvents.find(e=>e.type==='start')), b=await guest.evaluate(()=>__networkEvents.find(e=>e.type==='start'));
    assert.deepEqual(a.characters,['i','ke']);assert.deepEqual(a.bonusCards,b.bonusCards);assert.equal(a.bonusCards.length,3);
    await host.screenshot({path:'scratch/browser/picking-host.png',fullPage:true});await guest.screenshot({path:'scratch/browser/picking-guest.png',fullPage:true});
    console.log('PASS actual two-browser start, separate characters, three shared bonus cards.');
    for (const p of pages) await gameClick(p,358,82);
    for (const p of pages) {for (const [x,y] of [[216,60],[341,60],[92,110]]) await gameClick(p,x,y);await gameClick(p,245,295);}
    await Promise.all(pages.map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'),{},{timeout:10000})));
    const reports=await Promise.all(pages.map(p=>p.evaluate(()=>__gameEvents.find(e=>e[0]==='resolved')[1])));
    assert.deepEqual(reports[0],reports[1]);console.log('PASS actual original-engine combat reports agree.',JSON.stringify(reports[0]));
    console.log('HANDS',JSON.stringify(await host.evaluate(()=>__networkEvents.find(e=>e.type==='play'))));
    await finishRound(pages,1);
    for(let round=2;round<10;round++) {
      await hand(host,[[216,60],[92,110],[341,110]]);
      await hand(guest,[[341,60],[341,110],[216,60]]);
      await Promise.all(pages.map(p=>p.waitForFunction(r=>__gameEvents.some(e=>e[0]==='resolved'&&e[1].round===r),round,{timeout:5000})));
      const reports=await Promise.all(pages.map(p=>p.evaluate(r=>__gameEvents.find(e=>e[0]==='resolved'&&e[1].round===r)[1],round)));
      assert.deepEqual(reports[0],reports[1]);console.log('ROUND',round,JSON.stringify(reports[0]));
      await finishRound(pages,round);
      if(reports[0].result!=='none') break;
    }
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="result"]').waitFor({timeout:1000})));
    console.log('PASS actual combat reaches victory with equal states.');
    await host.screenshot({path:'scratch/browser/combat-host.png',fullPage:true});
    await host.locator('#rematch').click();await guest.locator('#rematch').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="selecting"]').waitFor()));
    await host.locator('#bonusCount').selectOption('0');
    for(const p of pages) await gameClick(p,100,140);
    await host.locator('#ready').click();await guest.locator('#ready').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"][data-match="2"]').waitFor({timeout:20000})));
    const restarted=await host.evaluate(()=>__networkEvents.filter(e=>e.type==='start').at(-1));
    assert.deepEqual(restarted.characters,['i','i']);assert.deepEqual(restarted.bonusCards,[]);
    await host.screenshot({path:'scratch/browser/rematch-zero.png',fullPage:true});
    console.log('PASS reselect after victory, same character on both seats, zero bonus cards.');
    for (const p of pages) await hand(p,[[216,60],[341,60],[341,110]]);
    await Promise.all(pages.map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'&&e[1].match===2),{},{timeout:5000})));
    const same=await Promise.all(pages.map(p=>p.evaluate(()=>__gameEvents.find(e=>e[0]==='resolved'&&e[1].match===2)[1])));
    assert.deepEqual(same[0],same[1]);assert.deepEqual(same[0].players.map(p=>p.life),[100,100]);assert.deepEqual(same[0].players.map(p=>p.energy),[100,100]);
    await finishRound(pages,1);
    console.log('PASS same-character rematch combat, clean life/energy, next-round barrier.');
  } catch(error) {
    for(let i=0;i<pages.length;i++) {await pages[i].screenshot({path:`scratch/browser/failure-${i}.png`,fullPage:true}); console.log('DIAGNOSTIC',i,JSON.stringify(await pages[i].evaluate(()=>({game:__gameEvents,network:__networkEvents,message:document.getElementById('message').textContent}))));}
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
