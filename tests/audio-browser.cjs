const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {newPlayer,boot,gameClick,hand,finishRound}=require('./browser.cjs');
const path=require('node:path');
const audioState=p=>p.evaluate(()=>document.querySelector('ruffle-player').ruffle().callExternalInterface('pvpAudioState'));
(async()=>{
  const {createApp}=await import('../server/main.mjs');
  const app=createApp();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const pages=[];
  try {
    for(let i=0;i<2;i++){
      const page=await newPlayer(browser,origin);pages.push(page);
      await page.route('**/game/pvp-bridge.swf',route=>route.fulfill({path:process.env.AUDIO_PROBE_PATH||path.resolve(__dirname,'../scratch/audio/pvp-audio-probe.swf'),contentType:'application/x-shockwave-flash'}));
    }
    const [host,guest]=pages;await host.locator('#create').click();await boot(host);
    await guest.locator('#roomCode').fill(await host.locator('#code').innerText());await guest.locator('#joinForm button').click();await boot(guest);
    const title=await Promise.all(pages.map(audioState));
    assert.ok(title.every(t=>t.titlePlaying),'Original title music must actually be playing before the match');
    await gameClick(host,100,140);await gameClick(guest,170,140);await host.locator('#ready').click();await guest.locator('#ready').click();
    await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
    const stopped=await Promise.all(pages.map(audioState));
    assert.ok(stopped.every(t=>!t.titlePlaying&&t.titleStops===1&&t.defeatStops===1),`Title track must stop in both PvP runtimes: ${JSON.stringify(stopped)}`);
    await host.waitForTimeout(400);
    const silent=await Promise.all(pages.map(audioState));
    assert.deepEqual(silent.map(t=>t.titlePosition),stopped.map(t=>t.titlePosition),'Actual original title Sound playback position stops advancing');
    for(const p of pages){await gameClick(p,358,82);await hand(p,[[216,60],[341,60],[341,110]]);}
    await Promise.all(pages.map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'),{},{timeout:10000})));
    assert.ok((await audioState(host)).roundStarts>0,'Original battle sound effects still start');
    await finishRound(pages,1);
    console.log('PASS both actual title audio sources stop at PvP start; battle sounds and next round remain working.');
  } catch(error) {
    for(const p of pages) console.log('AUDIO',JSON.stringify(await audioState(p)));
    throw error;
  } finally {await browser.close();await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
