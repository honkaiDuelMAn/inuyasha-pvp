const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {boot,gameClick,finishRound}=require('./browser.cjs');
const {newGamePlayer,joinGame,assertTransport,closeGameIntro}=require('./game-session.cjs');
const root=path.resolve(__dirname,'..');
function compileProbe(){
  const folder=path.join(root,'scratch/card-settings');fs.mkdirSync(folder,{recursive:true});
  const source=path.join(folder,'probe.as'),output=path.join(folder,'probe.swf');
  fs.writeFileSync(source,fs.readFileSync(path.join(root,'flash/pvp.as'),'utf8')+'\n'+fs.readFileSync(path.join(root,'tests/fixtures/card-settings-probe.as'),'utf8'));
  const result=spawnSync(process.env.JAVA_PATH||'C:/Program Files (x86)/NS-USBloader/jdk/bin/java.exe',['-Djava.awt.headless=true','-jar',process.env.FFDEC_PATH||path.join(root,'../ffdec/ffdec.jar'),'-replace',path.join(root,'public/game/pvp-bridge.swf'),output,'\\frame_1\\DoAction',source],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stdout+result.stderr);return output;
}
const state=page=>page.evaluate(()=>document.querySelector('ruffle-player').ruffle().callExternalInterface('pvpTestState'));
async function choose(page,id){const slot=(await state(page)).slots.find(s=>s.id===id&&s.visible);assert.ok(slot,`Missing selectable card ${id}`);await gameClick(page,slot.x,slot.y);}
(async()=>{
  const {createApp}=await import('../server/main.mjs');const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try{
    const host=await newGamePlayer(browser,origin),guest=await newGamePlayer(browser,origin),pages=[host,guest];
    const probe=compileProbe();for(const p of pages)await p.route('**/game/pvp-bridge.swf',route=>route.fulfill({path:probe,contentType:'application/x-shockwave-flash'}));
    await host.locator('#create').click();await host.locator('#roomPanel:not([hidden])').waitFor();
    assert.ok((await host.locator('#bonusCount option').evaluateAll(options=>options.map(o=>o.value))).includes('5'),'the host can select five common cards');
    await boot(host);await host.locator('#bonusCount').selectOption('5');
    await joinGame(host,guest);await boot(guest);
    await host.locator('[data-ban-card="heal"]').check();
    await host.waitForFunction(()=>document.querySelector('#bonusCount').value==='4');
    await host.locator('[data-ban-card="kikyosRevenge"]').check();
    await host.waitForFunction(()=>document.querySelector('#bonusCount').value==='3');
    assert.deepEqual(await host.locator('#bonusCount option').evaluateAll(o=>o.map(e=>e.value)),['0','1','2','3']);
    await guest.waitForFunction(()=>document.querySelector('[data-ban-card="heal"]').checked&&document.querySelector('[data-ban-card="kikyosRevenge"]').checked);
    assert.equal(await guest.locator('#cardBans input').first().isDisabled(),true);assert.equal(await guest.locator('#dedicatedEnabled').isDisabled(),true);
    for(const id of ['heal','kikyosRevenge']){await host.locator(`[data-ban-card="${id}"]`).uncheck();await host.waitForFunction(id=>!document.querySelector(`[data-ban-card="${id}"]`).checked,id);}
    await host.waitForFunction(()=>document.querySelector('#bonusCount option[value="5"]'));
    await host.locator('#bonusCount').selectOption('5');await host.locator('#dedicatedEnabled').selectOption('on');
    await gameClick(host,100,140);await gameClick(guest,261,220); // InuYasha / Sesshomaru.
    await host.waitForFunction(()=>document.querySelector('#player0').textContent.includes('이누야샤'),{},{timeout:3000});
    await host.locator('#ready').click();await guest.locator('#ready').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
    const initial=await state(host);
    assert.ok(initial.slots[5].depth < initial.helpDepth,'the sixth card remains underneath the original help overlay');
    await closeGameIntro(pages);
    const event=await host.evaluate(()=>__networkEvents.find(e=>e.type==='start'));
    assert.deepEqual(event.characters,['i','s']);assert.deepEqual(event.dedicatedCards,[['summonShippo'],['summonJaken']]);
    const h=await state(host),g=await state(guest);
    const common=['doubleLeft','doubleRight','heal','kikyosRevenge','perfectGuard'];
    for(const [page,s,exclusive] of [[host,h,'summonShippo'],[guest,g,'summonJaken']]){
      assert.deepEqual(s.slots.filter(c=>c.visible).map(c=>c.id).sort(),[...common,exclusive].sort());
      if(!s.slots.filter(c=>c.visible).every(c=>c.press)) {
        await page.screenshot({path:path.join(root,'scratch/card-settings/input-not-ready.png'),fullPage:true});
        console.log('INPUT DIAGNOSTIC',JSON.stringify({state:s,events:await page.evaluate(()=>({game:__gameEvents,network:__networkEvents}))}));
      }
      assert.ok(s.slots.filter(c=>c.visible).every(c=>c.press),'all six native slots accept input');
      const ordered=s.slots.filter(c=>c.visible).sort((a,b)=>a.x-b.x);
      for(let i=1;i<ordered.length;i++)assert.ok(ordered[i].x-ordered[i-1].x>=(ordered[i].width+ordered[i-1].width)/2-1,'card artwork does not overlap');
      assert.equal(await page.locator('#bonusCount').isDisabled(),true);assert.equal(await page.locator('#cardBans input').first().isDisabled(),true);
      await choose(page,exclusive);await choose(page,'doubleLeft');
      await gameClick(page,341,110);await gameClick(page,245,295); // Energy Up and Continue.
    }
    await Promise.all(pages.map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'),{},{timeout:10000})));
    const reports=await Promise.all(pages.map(p=>p.evaluate(()=>__gameEvents.find(e=>e[0]==='resolved')[1])));assert.deepEqual(reports[0],reports[1]);
    await finishRound(pages,1);
    await host.screenshot({path:path.join(root,'scratch/card-settings/six-cards.png'),fullPage:true});
    await assertTransport(pages);
    console.log('PASS native browser: ban cap and guest locking, all six selectable cards, different summons, original combat reports agree.');
  }finally{await browser.close();await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
