import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

test('Windows double-click launcher starts the bundled server', {skip:process.platform!=='win32'}, async()=>{
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','호스트-실행.cmd'],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,
    env:{...process.env,PVP_PORT:String(port)}
  });
  let output='';child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>output+=b.toString());
  try {
    let page;
    for(let i=0;i<30;i++) {
      try {const response=await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(300)});if(response.ok){page=await response.text();break;}}catch{}
      await delay(100);
    }
    assert.ok(page?.includes('1대1 대전'),`Bundled launcher did not serve the game: ${output}`);
  } finally {
    await new Promise(resolve=>spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('exit',resolve));
  }
});
