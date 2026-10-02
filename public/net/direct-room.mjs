import {RoomService} from './room-rules.mjs';
import {ManualPeer,decodeCode} from './manual-peer.mjs';

export class DirectRoom {
  constructor({onEvent=()=>{},onStatus=()=>{}}={}) {this.onEvent=onEvent;this.onStatus=onStatus;this.generation=0;this.role=null;}
  emit(event) {
    const generation=this.generation,copy=structuredClone(event);
    queueMicrotask(()=>{if(this.generation===generation)this.onEvent(copy);});
  }
  clear() {this.generation++;this.peer?.close(false);this.peer=null;this.role=null;this.service=null;this.host=null;this.guest=null;this.roomCode=null;}
  close() {this.clear();this.onEvent({type:'left'});this.onStatus('idle');}
  newPeer(role) {
    const generation=this.generation,peerGeneration=(this.peerGeneration||0)+1;this.peerGeneration=peerGeneration;
    const peer=new ManualPeer({onMessage:message=>{
      if(generation!==this.generation||peerGeneration!==this.peerGeneration)return;
      if(role==='host') {
        if(!this.guest||message.type==='create'||message.type==='join'&&message.code!==this.roomCode){peer.send({type:'error',message:'현재 초대받은 방에만 참가할 수 있습니다.'});return;}
        this.service.handle(this.guest,message);
      } else {
        this.emit(message);
        if(['closed','left'].includes(message.type)) {peer.close(false);this.role=null;this.onStatus('idle');}
      }
    },onState:(state,detail)=>{
      if(generation!==this.generation||peerGeneration!==this.peerGeneration)return;
      if(state==='connected') {
        if(role==='host')this.guest={id:'guest',send:event=>{try{peer.send(event);}catch{peer.fail();}}};
        else peer.send({type:'join',code:this.roomCode});
      }
      if(['closed','failed'].includes(state)) {
        if(role==='host') {if(this.guest)this.service.disconnect(this.guest);this.guest=null;}
        else {this.emit({type:'closed',reason:detail||'호스트가 연결을 종료했습니다.'});this.role=null;}
      }
      this.onStatus(state,detail);
    }});
    this.peer=peer;return peer;
  }
  async create(count) {
    this.clear();this.role='host';this.service=new RoomService();
    this.host={id:'host',send:event=>{if(event.type==='joined')this.roomCode=event.code;this.emit(event);}};
    this.service.handle(this.host,{type:'create',bonusCount:count});
    if(!this.roomCode)throw Error('방을 만들지 못했습니다.');
    return this.newInvite();
  }
  async newInvite() {
    if(this.role!=='host'||!this.service)throw Error('먼저 방을 만드세요.');
    if(this.guest)throw Error('상대와 이미 연결되어 있습니다.');
    this.peer?.close(false);this.onStatus('gathering');return this.newPeer('host').offer(this.roomCode);
  }
  async join(text) {
    const offer=decodeCode(text);
    if(offer.kind!=='offer')throw Error('호스트의 전체 초대 코드를 입력하세요.');
    if(this.role)throw Error('이미 연결 중입니다. 다른 초대에 참가하려면 먼저 연결 취소를 누르세요.');
    this.clear();this.role='guest';this.roomCode=offer.room;this.onStatus('gathering');
    const generation=this.generation;
    try{return await this.newPeer('guest').answer(text);}catch(error){if(generation===this.generation)this.clear();throw error;}
  }
  async accept(text) {if(this.role!=='host'||!this.peer)throw Error('먼저 초대 코드를 만드세요.');await this.peer.accept(text);}
  send(event) {
    if(event.type==='leave'){this.close();return;}
    if(this.role==='host')this.service.handle(this.host,event);
    else if(this.role==='guest')this.peer.send(event);
    else throw Error('먼저 방을 만들거나 초대 코드로 참가하세요.');
  }
}
