const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
  const {createApp}=await import('../server/main.mjs');const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  try{
    const origin=`http://127.0.0.1:${app.server.address().port}`;
    const pages=await Promise.all([browser.newPage(),browser.newPage()]);
    for(const p of pages){await p.addInitScript(()=>{window.__configs=[];const Native=RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(c){__configs.push(c);super(c);}};window.WebSocket=class{constructor(){throw Error('No WebSocket allowed');}};});await p.goto(origin);await p.evaluate(async()=>{window.api=await import('./net/manual-peer.mjs');window.messages=[];window.states=[];});}
    const h=pages[0],g=pages[1];for(const p of pages)p.setDefaultTimeout(10000);
    const offer=await h.evaluate(async()=>{window.peer=new api.ManualPeer({onMessage:m=>messages.push(m),onState:s=>states.push(s)});return peer.offer('ABC123');});
    assert.match(offer,/^IY1-/);
    const answer=await g.evaluate(async o=>{window.peer=new api.ManualPeer({onMessage:m=>messages.push(m),onState:s=>states.push(s)});return peer.answer(o);},offer);
    console.log('Offer and answer gathered.');
    const errors=await h.evaluate(async a=>{const result=[];for(const c of ['ABC123','IY1-'+ 'A'.repeat(40000),api.encodeCode({...api.decodeCode(a),session:'0'.repeat(32)}),api.encodeCode({...api.decodeCode(a),kind:'offer'})]){try{await peer.accept(c);result.push(false);}catch{result.push(true);}}return result;},answer);
    assert.deepEqual(errors,[true,true,true,true]);
    await h.evaluate(a=>peer.accept(a),answer);
    console.log('Answer applied.');
    await Promise.all(pages.map(p=>p.waitForFunction(()=>states.includes('connected'))));
    await h.evaluate(()=>peer.send({hello:'원본 PvP'}));await g.waitForFunction(()=>messages.length===1);
    assert.deepEqual(await g.evaluate(()=>messages[0]),{hello:'원본 PvP'});
    assert.equal(await h.evaluate(async a=>{try{await peer.accept(a);return false;}catch{return true;}},answer),true);
    for(const p of pages)assert.ok((await p.evaluate(()=>__configs)).every(c=>JSON.stringify(c.iceServers)==='[]'));
    await h.evaluate(()=>peer.close());await g.waitForFunction(()=>states.includes('closed'));
    console.log('Data transfer and remote close passed.');
    const cancelled=await h.evaluate(async()=>{const p=new api.ManualPeer();const pending=p.offer('ABC123');p.close();try{await pending;return false;}catch{return true;}});assert.equal(cancelled,true);
    const timeout=await g.evaluate(async o=>{window.shortStates=[];const p=new api.ManualPeer({connectTimeout:100,onState:s=>shortStates.push(s)});await p.answer(o);await new Promise(r=>setTimeout(r,180));return shortStates;},offer);assert.ok(timeout.includes('failed'));
    console.log('PASS actual manual offer/answer data channel with zero ICE servers; invalid/stale codes, cancel and timeout.');
  }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
