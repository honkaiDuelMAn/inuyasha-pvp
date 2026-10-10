const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
process.env.DIRECT_GAMEPLAY='1';
const {boot,gameClick,hand,finishRound}=require('./browser.cjs');
const {newGamePlayer,joinGame,assertTransport}=require('./game-session.cjs');
async function send(page,text,enter=true){await page.locator('#chatInput').fill(text);if(enter)await page.locator('#chatInput').press('Enter');else await page.locator('#chatSend').click();}
async function see(page,text){await page.waitForFunction(text=>Array.from(document.querySelectorAll('.chat-text')).some(e=>e.textContent===text),text,{timeout:5000});}
(async()=>{
 let app;
 if(!process.env.DIRECT_URL){const {createApp}=await import('../server/main.mjs');app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));}
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 const pages=[];
 try{
  const origin=process.env.DIRECT_URL||`http://127.0.0.1:${app.server.address().port}`,host=await newGamePlayer(browser,origin),guest=await newGamePlayer(browser,origin);pages.push(host,guest);
  assert.equal(await host.locator('#chatPanel').count(),1,'a chat panel is present next to the original game');
  assert.equal(await host.locator('#chatInput').isDisabled(),true);
  await host.setViewportSize({width:1920,height:1200});await guest.setViewportSize({width:1920,height:1200});
  await host.locator('#create').click();await boot(host);
  await joinGame(host,guest);await boot(guest);
  await send(host,'안녕하세요 Hello 123');await see(guest,'안녕하세요 Hello 123');await see(host,'안녕하세요 Hello 123');
  await send(guest,'READY 가나다 456',false);await see(host,'READY 가나다 456');
  assert.deepEqual(await host.locator('.chat-sender').allTextContents(),['1P · 나','2P']);
  assert.deepEqual(await guest.locator('.chat-sender').allTextContents(),['1P','2P · 나']);
  const input=host.locator('#chatInput');await input.fill('한글 조합 중');
  await input.evaluate(input=>{
    input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true}));
    input.form.requestSubmit();
  });
  await host.waitForTimeout(100);assert.equal(await host.locator('.chat-text').count(),2,'IME confirmation does not send an unfinished message');
  await input.evaluate(input=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한글 조합 중'})));
  await input.press('Enter');await see(guest,'한글 조합 중');
  const literal='<img src=x onerror="window.__chatInjected=true"> & 문자123';
  await send(guest,literal);await see(host,literal);assert.equal(await host.locator('#chatMessages img').count(),0);assert.equal(await host.evaluate(()=>!!window.__chatInjected),false);
  await guest.evaluate(()=>window.inuyashaDirect.send({type:'chat',text:'저는 실제 2P입니다',seat:0,code:'BADBAD'}));await see(host,'저는 실제 2P입니다');
  assert.equal(await host.locator('.chat-sender').last().textContent(),'2P','the host derives the sender from the connected player');
  const beforeError=await host.locator('#message').innerText();
  await host.evaluate(()=>window.inuyashaDirect.send({type:'chat',text:123}));
  await host.waitForFunction(()=>document.querySelector('#chatStatus').textContent.includes('다시 입력'));
  assert.equal(await host.locator('#message').innerText(),beforeError,'chat validation never overwrites game status');
  const game=await host.locator('#gameContainer').boundingBox(),panel=await host.locator('#chatPanel').boundingBox();
  assert.equal(Math.round(game.width),864,'the existing game size is preserved');assert.ok(panel.x>game.x+game.width,'chat is to the right of the game');
  fs.mkdirSync(path.join(__dirname,'../scratch/chat'),{recursive:true});
  const clip=await host.locator('.play-area').evaluate(area=>{
    const r=area.getBoundingClientRect(),chat=document.querySelector('#chatPanel').getBoundingClientRect();
    return {x:r.x+scrollX,y:r.y+scrollY,width:chat.right-r.left,height:r.height};
  });
  await host.screenshot({path:path.join(__dirname,'../scratch/chat/right-chat.png'),fullPage:true,clip});
  for(const width of [1280,390]){
    await host.setViewportSize({width,height:1100});
    assert.ok(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+width);
    const stage=await host.locator('.stage').boundingBox(),chat=await host.locator('#chatPanel').boundingBox();assert.ok(chat.y>=stage.y+stage.height,'chat moves below the game on narrower screens');
  }
  await host.setViewportSize({width:1920,height:1200});
  await gameClick(host,100,140);await gameClick(guest,170,140);await host.locator('#ready').click();await guest.locator('#ready').click();
  await Promise.all(pages.map(p=>p.locator('#roomPanel[data-phase="picking"]').waitFor({timeout:20000})));
  await host.waitForTimeout(1000);
  for(const p of pages)await gameClick(p,358,82);
  await hand(host,[[216,60],[341,60],[341,110]]);
  await send(host,'카드 선택 완료 go 789');await see(guest,'카드 선택 완료 go 789');
  assert.equal(await guest.evaluate(()=>__networkEvents.some(e=>e.type==='play')),false,'chat never reveals the first submitted hand');
  await hand(guest,[[216,60],[341,60],[341,110]]);
  await Promise.all(pages.map(p=>p.waitForFunction(()=>__gameEvents.some(e=>e[0]==='resolved'),{},{timeout:10000})));
  const reports=await Promise.all(pages.map(p=>p.evaluate(()=>__gameEvents.find(e=>e[0]==='resolved')[1])));assert.deepEqual(reports[0],reports[1]);
  await send(guest,'전투 중에도 채팅 Battle 123');await see(host,'전투 중에도 채팅 Battle 123');
  await finishRound(pages,1);await see(host,'안녕하세요 Hello 123');
  await guest.locator('#leave').click();await guest.locator('#chatInput:disabled').waitFor();assert.equal(await guest.locator('.chat-text').count(),0);
  assert.equal(await host.locator('#chatInput').isDisabled(),false,'host can still chat in the surviving room');
  await assertTransport(pages);
  console.log('PASS direct invitation/answer-link games: bilingual live chat, owned seats, separate errors, IME, safe text, cleanup, layout and matching original combat without changing peer setup.');
 }finally{await browser.close();if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
