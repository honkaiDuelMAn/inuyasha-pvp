// This channel only joins tabs in the SAME browser. The user still sends the
// response link privately; it cannot deliver anything to another computer.
const validSession=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
function channelFor(session){
  if(!validSession(session)||typeof BroadcastChannel!=='function')throw Error('응답 링크를 호스트의 원래 방 화면에 붙여 넣으세요.');
  return new BroadcastChannel('inuyasha-answer-'+session);
}
export class AnswerInbox {
  constructor(session,accept){
    this.channel=channelFor(session);this.closed=false;this.receipts=new Map();this.working=false;
    this.channel.addEventListener('message',async({data})=>{
      if(this.closed||!data||data.type!=='answer'||typeof data.code!=='string'||data.code.length>32768||
         typeof data.request!=='string'||!/^[a-f0-9-]{36}$/.test(data.request))return;
      if(this.receipts.has(data.request)){this.channel.postMessage(this.receipts.get(data.request));return;}
      if(this.working)return;
      this.working=true;let receipt;
      try{await accept(data.code);receipt={type:'receipt',request:data.request,ok:true};}
      catch(error){receipt={type:'receipt',request:data.request,ok:false,message:error.message};}
      finally{this.working=false;}
      if(this.closed)return;
      this.receipts.set(data.request,receipt);if(this.receipts.size>16)this.receipts.delete(this.receipts.keys().next().value);
      this.channel.postMessage(receipt);
    });
  }
  close(){this.closed=true;this.channel.close();}
}
export function deliverAnswer(code,session,{timeout=8000}={}){
  const channel=channelFor(session),request=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const finish=error=>{clearTimeout(timer);clearInterval(retry);channel.close();error?reject(error):resolve();};
    channel.addEventListener('message',({data})=>{
      if(data?.type!=='receipt'||data.request!==request)return;
      finish(data.ok?null:Error(data.message||'응답을 적용하지 못했습니다.'));
    });
    const send=()=>channel.postMessage({type:'answer',code,request});
    const retry=setInterval(send,500);
    const timer=setTimeout(()=>finish(Error('대기 중인 방 탭을 찾지 못했습니다. 방을 만든 브라우저에서 응답 링크를 열거나, 원래 방 화면에 붙여 넣으세요.')),timeout);
    send();
  });
}
