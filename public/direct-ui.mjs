import {DirectRoom} from './net/direct-room.mjs';
const $=id=>document.getElementById(id);
let app,sequence=0;
const session=new DirectRoom({onEvent:event=>app.handle(event),onStatus:(state,detail)=>{
  $('connectionPanel').hidden=['idle','connected'].includes(state);
  $('connectionPanel').dataset.state=state;
  $('newInvite').hidden=session.role!=='host'||!['closed','failed'].includes(state);
  $('answerForm').hidden=session.role!=='host'||['closed','failed','gathering'].includes(state);
  $('outputGroup').hidden=['gathering','closed','failed'].includes(state);
  const messages={gathering:'연결 코드를 만드는 중입니다.', 'waiting-answer':'① 전체 초대 코드를 상대에게 보내세요. ② 상대의 응답 코드를 아래에 붙여 넣으세요.',connecting:session.role==='guest'?'응답 코드를 호스트에게 보내세요. 호스트가 적용하면 연결됩니다. 응답은 3분 안에 전달하세요.':'상대와 직접 연결하는 중입니다.',closed:'상대의 연결이 종료되었습니다. 새 초대 코드로 다른 참가자를 초대할 수 있습니다.',failed:detail};
  $('connectionStatus').textContent=messages[state]||'';
  if(detail)app?.message(detail,true);
}});
function busy(value){$('create').disabled=value;$('joinForm').querySelector('button').disabled=value;$('acceptAnswer').disabled=value;$('newInvite').disabled=value;}
async function codeAction(action,label){
  const operation=++sequence;busy(true);
  try{const code=await action();if(operation!==sequence)return;$('outputLabel').textContent=`${label} (${code.length}자)`;$('outputCode').value=code;$('responseCode').value='';}
  catch(error){if(operation===sequence)throw error;}
  finally{if(operation===sequence)busy(false);}
}
window.inuyashaDirect={
  create:count=>codeAction(()=>session.create(count),'호스트 초대 코드 · 전체를 상대에게 보내세요'),
  join:code=>codeAction(()=>session.join(code),'참가자 응답 코드 · 전체를 호스트에게 보내세요'),
  send:event=>{if(event.type==='leave'){sequence++;busy(false);}session.send(event);},
};
app=await import('./app.mjs');
busy(false);$('original').disabled=false;
app.message('방을 만들거나 전체 초대 코드로 참가하세요. 원본 게임도 실행할 수 있습니다.');
$('answerForm').addEventListener('submit',async event=>{
  event.preventDefault();$('acceptAnswer').disabled=true;
  try{await session.accept($('responseCode').value);}catch(error){app.message(error.message,true);}finally{$('acceptAnswer').disabled=false;}
});
$('newInvite').addEventListener('click',()=>codeAction(()=>session.newInvite(),'호스트 초대 코드 · 전체를 상대에게 보내세요').catch(error=>app.message(error.message,true)));
$('cancelConnection').addEventListener('click',()=>{sequence++;busy(false);session.close();});
$('copyCode').addEventListener('click',async()=>{
  if(!$('outputCode').value)return;
  try{await navigator.clipboard.writeText($('outputCode').value);app.message('전체 연결 코드를 복사했습니다. 상대에게 개인적으로 보내세요.');}
  catch{$('outputCode').focus();$('outputCode').select();app.message('코드가 선택되었습니다. 복사해서 상대에게 보내세요.');}
});
window.addEventListener('pagehide',()=>session.close());
