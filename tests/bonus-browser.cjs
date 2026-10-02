const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {gameClick,newPlayer,boot,hand,finishRound}=require('./browser.cjs');
(async()=>{
  const {createApp}=await import('../server/main.mjs');
  const app=createApp();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,headless:true});
  try {
    for(const bonusCount of [1,2]) {
      // Determinism belongs to this test fixture, never to production configuration.
      app.rooms.randomInt=max=>bonusCount===1?2:max-1;
      const host=await newPlayer(browser,origin),guest=await newPlayer(browser,origin),pages=[host,guest];
      await host.locator('#create').click();await boot(host);await host.locator('#bonusCount').selectOption(String(bonusCount));
      await guest.locator('#roomCode').fill(await host.locator('#code').innerText());await guest.locator('#joinForm button').click();await boot(guest);
      await gameClick(host,bonusCount===1?170:329,140);await gameClick(guest,bonusCount===1?100:329,140);
      await host.locator('#ready').click();await guest.locator('#ready').click();
      await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
      const start=await host.evaluate(()=>__networkEvents.find(e=>e.type==='start'));
      assert.equal(start.bonusCards.length,bonusCount);
      for(const p of pages) await gameClick(p,358,82);
      if(bonusCount===1) {
        assert.deepEqual(start.bonusCards,['kikyosRevenge']);
        await hand(host,[[341,110],[92,200],[216,110]]);await hand(guest,[[341,60],[216,60],[341,110]]);
      } else {
        assert.deepEqual(start.bonusCards,['doubleLeft','doubleRight']);
        for(const p of pages) await hand(p,[[92,200],[341,110],[341,60]]);
      }
      await Promise.all(pages.map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'),{},{timeout:10000})));
      const reports=await Promise.all(pages.map(p=>p.evaluate(()=>__gameEvents.find(e=>e[0]==='resolved')[1])));
      assert.deepEqual(reports[0],reports[1]);
      if(bonusCount===1) {
        const played=await host.evaluate(()=>__networkEvents.find(e=>e.type==='play'));
        assert.deepEqual(played.moves[0],['energyUp','kikyosRevenge','spiritPower']);
        assert.equal(reports[0].players[0].energy,0);
      }
      await finishRound(pages,1);
      console.log(`PASS ${bonusCount} shared bonus cards: original bonus-card UI, effects and animations.`,JSON.stringify(reports[0]));
      for(const p of pages) await p.context().close();
    }
  } finally {await browser.close();await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
