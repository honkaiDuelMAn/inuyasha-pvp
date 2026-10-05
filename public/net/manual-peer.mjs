import {encodeCode,decodeCode} from './connection-code.mjs';
export {encodeCode,decodeCode};
const failure = '직접 연결하지 못했습니다. 코드 교환을 다시 시도하세요. 서로 다른 인터넷 회선에서는 공유기가 연결을 막을 수 있습니다.';
const iceServers = [{urls:'stun:stun.cloudflare.com:3478'}];
const gatherTimeout=30000;
export class ManualPeer {
  constructor({onMessage=()=>{},onState=()=>{},connectTimeout=180000}={}) {
    this.onMessage=onMessage;this.onState=onState;this.connectTimeout=connectTimeout;
    this.abort=new AbortController();this.closed=false;this.accepted=false;
  }
  setup() {
    if (this.closed || this.pc) throw Error('새 초대 코드를 만들어 다시 연결하세요.');
    const pc=this.pc=new RTCPeerConnection({iceServers});
    pc.addEventListener('connectionstatechange',()=>{
      if(this.closed)return;
      if(pc.connectionState==='failed')this.fail();
      else if(pc.connectionState==='closed')this.close();
    });
    pc.addEventListener('datachannel',e=>this.attach(e.channel));
    return pc;
  }
  attach(channel) {
    if (this.closed || this.channel) {channel.close();return;}
    this.channel=channel;
    channel.addEventListener('open',()=>{
      if(this.closed)return;
      clearTimeout(this.timer);this.lastSeen=Date.now();
      this.heartbeat=setInterval(()=>{
        if(Date.now()-this.lastSeen>12000){this.fail();return;}
        try{channel.send(JSON.stringify({peerControl:'ping'}));}catch{this.fail();}
      },2000);
      this.onState('connected');
    });
    channel.addEventListener('message',e=>{
      if(this.closed)return;
      if(typeof e.data!=='string'||e.data.length>4096){this.fail();return;}
      let message;try{message=JSON.parse(e.data);}catch{this.fail();return;}
      if(!message||typeof message!=='object'||Array.isArray(message)){this.fail();return;}
      this.lastSeen=Date.now();
      if(message.peerControl==='close'){this.close();return;}
      if(message.peerControl==='ping'){channel.send(JSON.stringify({peerControl:'pong'}));return;}
      if(message.peerControl==='pong')return;
      this.onMessage(message);
    });
    channel.addEventListener('close',()=>this.close());
    channel.addEventListener('error',()=>this.fail());
  }
  async gather() {
    const pc=this.pc,signal=this.abort.signal;
    if(signal.aborted)throw Error('연결을 취소했습니다.');
    if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',changed);signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
      const changed=()=>{if(pc.iceGatheringState==='complete')finish();};
      const cancel=()=>finish(Error('연결을 취소했습니다.'));
      const timer=setTimeout(()=>finish(Error('연결 코드 생성 시간이 초과되었습니다. 다시 시도하세요.')),gatherTimeout);
      pc.addEventListener('icegatheringstatechange',changed);signal.addEventListener('abort',cancel,{once:true});changed();
    });
    if(this.closed)throw Error('연결을 취소했습니다.');
    return this.operation(encodeCode({version:1,kind:pc.localDescription.type,session:this.session,room:this.room,sdp:pc.localDescription.sdp},{legacy:this.legacyCode}));
  }
  startTimer() {clearTimeout(this.timer);this.timer=setTimeout(()=>this.fail(),this.connectTimeout);}
  operation(promise) {
    const signal=this.abort.signal;
    if(signal.aborted)return Promise.reject(Error('연결을 취소했습니다.'));
    return new Promise((resolve,reject)=>{
      const done=(error,value)=>{signal.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
      const cancel=()=>done(Error('연결을 취소했습니다.'));
      signal.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(value=>done(null,value),done);
    });
  }
  async offer(room) {
    if(!/^[A-F0-9]{6}$/.test(room))throw Error('올바른 방 번호가 아닙니다.');
    this.room=room;this.session=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
    const pc=this.setup();this.attach(pc.createDataChannel('inuyasha-pvp',{ordered:true}));
    await this.operation(pc.setLocalDescription(await this.operation(pc.createOffer())));
    const code=await this.gather();this.onState('waiting-answer');return code;
  }
  async answer(text) {
    const offer=await decodeCode(text);if(offer.kind!=='offer')throw Error('방을 만든 사람의 초대 코드를 입력하세요.');
    this.legacyCode=text.replace(/\s/g,'').startsWith('IY1-');
    this.session=offer.session;this.room=offer.room;const pc=this.setup();
    await this.operation(pc.setRemoteDescription({type:'offer',sdp:offer.sdp}));
    await this.operation(pc.setLocalDescription(await this.operation(pc.createAnswer())));
    const code=await this.gather();this.startTimer();this.onState('connecting');return code;
  }
  async accept(text) {
    const answer=await decodeCode(text);
    if(answer.kind!=='answer')throw Error('참가자가 보낸 응답 코드를 입력하세요.');
    if(answer.session!==this.session||answer.room!==this.room)throw Error('현재 초대에 대한 응답이 아닙니다. 새 초대 코드를 상대에게 보내세요.');
    if(this.closed||!this.pc||this.accepted)throw Error('이미 적용했거나 만료된 응답입니다.');
    await this.operation(this.pc.setRemoteDescription({type:'answer',sdp:answer.sdp}));
    if(this.closed)throw Error('연결을 취소했습니다.');
    this.accepted=true;this.startTimer();this.onState('connecting');
  }
  send(value) {
    if(this.closed||this.channel?.readyState!=='open')throw Error('상대와 아직 연결되지 않았습니다.');
    this.channel.send(JSON.stringify(value));
  }
  fail() {if(this.closed)return;this.close(false);this.onState('failed',failure);}
  close(notify=true) {
    if(this.closed)return;
    if(this.channel?.readyState==='open')try{this.channel.send(JSON.stringify({peerControl:'close'}));}catch{}
    this.closed=true;clearTimeout(this.timer);clearInterval(this.heartbeat);this.abort.abort();
    this.channel?.close();const pc=this.pc;setTimeout(()=>pc?.close(),100);if(notify)this.onState('closed');
  }
}
