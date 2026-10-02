import test from 'node:test';
import assert from 'node:assert/strict';
import {makeConnectionLink,readConnectionLink,connectionInput} from '../public/net/connection-link.mjs';
import {AnswerInbox,deliverAnswer} from '../public/net/reply-relay.mjs';
const base='https://example.com/inuyasha-pvp/';
test('private share links keep connection data in fragments and discard unrelated query data',()=>{
  assert.equal(makeConnectionLink('IY2-Abc_123-','invite',base+'?token=secret#old'),base+'#invite=IY2-Abc_123-');
  assert.equal(makeConnectionLink('IY1-Ab+c/==','answer',base),base+'#answer=IY1-Ab%2Bc%2F%3D%3D');
  assert.deepEqual(readConnectionLink(base+'#answer=IY1-Ab%2Bc%2F%3D%3D',base),{kind:'answer',code:'IY1-Ab+c/=='});
  const link=new URL(makeConnectionLink('IY2-private','invite',base));assert.equal(link.pathname+link.search,'/inuyasha-pvp/');
});
test('inputs accept existing codes and this game links, rejecting reply/invite mixups',()=>{
  assert.equal(connectionInput(' IY2-Abc_123- ','invite',base),'IY2-Abc_123-');
  assert.equal(connectionInput(base+'index.html#invite=IY2-Abc_123-','invite',base),'IY2-Abc_123-');
  assert.equal(connectionInput(base+'direct.html#answer=IY2-Abc_123-','answer',base),'IY2-Abc_123-');
  assert.throws(()=>connectionInput(base+'#answer=IY2-Abc_123-','invite',base),/초대/);
  assert.throws(()=>connectionInput(base+'#invite=IY2-Abc_123-','answer',base),/응답/);
});
test('untrusted, ambiguous and excessive links cannot route a connection',()=>{
  for(const value of [
    'https://other.example/inuyasha-pvp/#invite=IY2-x',
    'https://example.com/another-game/#invite=IY2-x',
    'https://user:pass@example.com/inuyasha-pvp/#invite=IY2-x',
    'javascript:alert(1)',base+'#invite=IY2-a&answer=IY2-b',
    base+'#invite=IY2-a&invite=IY2-b',base+'#invite=not-a-code',
    base+'#invite=IY2-'+ 'a'.repeat(32768),'x'.repeat(100001),
  ])assert.throws(()=>readConnectionLink(value,base));
});
test('reply delivery targets only the matching waiting room and confirms its acceptance',async()=>{
  const accepted=[],other=[];
  const first=new AnswerInbox('1'.repeat(32),async code=>accepted.push(code));
  const second=new AnswerInbox('2'.repeat(32),async code=>other.push(code));
  try{await deliverAnswer('IY2-answer','1'.repeat(32),{timeout:1000});assert.deepEqual(accepted,['IY2-answer']);assert.deepEqual(other,[]);}
  finally{first.close();second.close();}
});
test('missing host and rejected replies report failure rather than successful transfer',async()=>{
  await assert.rejects(deliverAnswer('IY2-answer','3'.repeat(32),{timeout:80}),/대기 중인 방/);
  const inbox=new AnswerInbox('4'.repeat(32),async()=>{throw Error('expired reply');});
  try{await assert.rejects(deliverAnswer('IY2-answer','4'.repeat(32),{timeout:1000}),/expired reply/);}
  finally{inbox.close();}
});
