const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {boot,gameClick,finishRound}=require('./browser.cjs');
const {newGamePlayer,joinGame,assertTransport,closeGameIntro}=require('./game-session.cjs');
const root=path.resolve(__dirname,'..');
const state=page=>page.evaluate(()=>document.querySelector('ruffle-player').ruffle().callExternalInterface('pvpTestState'));
async function hand(page,ids){
  const snapshot=await state(page);
  for(const id of ids){const slot=[...snapshot.regularSlots,...snapshot.slots].find(s=>s.id===id);assert.ok(slot,id);await gameClick(page,slot.x,slot.y);}
  await gameClick(page,245,295);
}
function probeMovie(){
  const folder=path.join(root,'scratch/sango-browser');fs.mkdirSync(folder,{recursive:true});
  const source=path.join(folder,'probe.as'),output=path.join(folder,'probe.swf');
  fs.writeFileSync(source,fs.readFileSync(path.join(root,'flash/pvp.as'),'utf8')+'\n'+fs.readFileSync(path.join(root,'tests/fixtures/card-settings-probe.as'),'utf8'));
  const result=spawnSync(process.env.JAVA_PATH||'C:/Program Files (x86)/NS-USBloader/jdk/bin/java.exe',['-Djava.awt.headless=true','-jar',process.env.FFDEC_PATH||path.join(root,'../ffdec/ffdec.jar'),'-replace',path.join(root,'public/game/pvp-bridge.swf'),output,'\\frame_1\\DoAction',source],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stdout+result.stderr);return output;
}
(async()=>{
 const {createApp}=await import('../server/main.mjs');const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
  const origin=`http://127.0.0.1:${app.server.address().port}`,probe=probeMovie();
  const host=await newGamePlayer(browser,origin),guest=await newGamePlayer(browser,origin),pages=[host,guest];
  for(const p of pages)await p.route('**/game/pvp-bridge.swf',route=>route.fulfill({path:probe,contentType:'application/x-shockwave-flash'}));
  await host.locator('#create').click();await boot(host);
  await joinGame(host,guest);await boot(guest);
  await gameClick(host,100,220);await gameClick(guest,100,140);
  await host.locator('#ready').click();await guest.locator('#ready').click();
  await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
  await closeGameIntro(pages);
  const runtime=await state(host),sword=runtime.players[0].moves.find(m=>m.id==='secretSword'),powder=runtime.players[0].moves.find(m=>m.id==='poisonPowder');
  assert.equal(sword.energy,-15);assert.equal(sword.damage,-25);assert.equal(powder.energy,-20);
  await host.locator('ruffle-player').screenshot({path:path.join(root,'scratch/sango-browser/sango-cards.png')});
  // The original positions are columns 0 and 3; move adjacent before attacking.
  await hand(host,['moveRight','secretSword','guard']);await hand(guest,['moveLeft','energyUp','guard']);
  await Promise.all(pages.map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'),{},{timeout:10000})));
  const reports=await Promise.all(pages.map(p=>p.evaluate(()=>__gameEvents.find(e=>e[0]==='resolved')[1])));
  assert.deepEqual(reports[0],reports[1]);assert.equal(reports[0].players[0].energy,85);assert.equal(reports[0].players[1].life,75);
  await finishRound(pages,1);
  await hand(host,['poisonPowder','guard','moveDown']);await hand(guest,['energyUp','moveUp','moveDown']);
  await Promise.all(pages.map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'&&e[1].round===2),{},{timeout:10000})));
  const powderReports=await Promise.all(pages.map(p=>p.evaluate(()=>__gameEvents.find(e=>e[0]==='resolved'&&e[1].round===2)[1])));
  assert.deepEqual(powderReports[0],powderReports[1]);assert.equal(powderReports[0].players[0].energy,80);
  await assertTransport(pages);
  console.log('PASS real original-engine battle: Secret Sword removes25HP and15EN, Poison Powder uses20EN; both reports match.');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
