const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/whdhk/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
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
(async()=>{
  fs.mkdirSync('scratch/browser',{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const pages=[];
  try {
    const host=await newPlayer(browser);pages.push(host);await host.getByRole('button',{name:'방 만들기'}).click();await boot(host);
    const code=await host.locator('#code').innerText();await host.locator('#bonusCount').selectOption('3');
    const guest=await newPlayer(browser);pages.push(guest);await guest.getByRole('textbox',{name:'방 코드',exact:true}).fill(code);await guest.getByRole('button',{name:'참가',exact:true}).click();await boot(guest);
    await gameClick(host,100,140);await gameClick(guest,170,140);
    await host.locator('#ready').click();await guest.locator('#ready').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
    const a=await host.evaluate(()=>__networkEvents.find(e=>e.type==='start')), b=await guest.evaluate(()=>__networkEvents.find(e=>e.type==='start'));
    assert.deepEqual(a.characters,['i','ke']);assert.deepEqual(a.bonusCards,b.bonusCards);assert.equal(a.bonusCards.length,3);
    await host.screenshot({path:'scratch/browser/picking-host.png',fullPage:true});await guest.screenshot({path:'scratch/browser/picking-guest.png',fullPage:true});
    console.log('PASS actual two-browser start, separate characters, three shared bonus cards.');
    console.log('STATE',JSON.stringify(await host.evaluate(()=>__gameEvents)));
  } catch(error) {
    for(let i=0;i<pages.length;i++) {await pages[i].screenshot({path:`scratch/browser/failure-${i}.png`,fullPage:true}); console.log('DIAGNOSTIC',i,await pages[i].evaluate(()=>({game:__gameEvents,network:__networkEvents,message:document.getElementById('message').textContent})));}
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
