import {DirectRoom} from './net/direct-room.mjs';
import {decodeCode} from './net/connection-code.mjs';
import {makeConnectionLink,readConnectionLink,connectionInput} from './net/connection-link.mjs';
import {AnswerInbox,deliverAnswer} from './net/reply-relay.mjs';
import {drawQR} from './qr.mjs';
const $=id=>document.getElementById(id),initialURL=location.href;
// Fragments carry private connection data and are never sent to the web host.
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
let app,sequence=0,inbox,outputKind,returning=false,generating=false;
function closeInbox(){inbox?.close();inbox=null;}
const session=new DirectRoom({onEvent:event=>app.handle(event),onStatus:(state,detail)=>{
  if(['idle','gathering','closed','failed'].includes(state))closeInbox();
  $('connectionPanel').hidden=['idle','connected'].includes(state);
  $('connectionPanel').dataset.state=state;
  $('newInvite').hidden=session.role!=='host'||!['closed','failed'].includes(state);
  $('answerForm').hidden=session.role!=='host'||['closed','failed','gathering'].includes(state);
  $('outputGroup').hidden=['gathering','closed','failed'].includes(state);
  const messages={gathering:'공유할 링크를 만드는 중입니다. 모바일 데이터에서는 최대 30초 정도 걸릴 수 있습니다.', 'waiting-answer':'① 초대 링크 또는 QR을 친구에게 보내세요. ② 친구의 응답 링크를 방을 만든 브라우저에서 여세요. 이 방 탭을 닫거나 새로고침하지 마세요.',connecting:session.role==='guest'?'응답 링크를 호스트에게 보내세요. 호스트가 열면 연결됩니다. 3분 안에 전달하고, 이 참가 탭을 계속 열어 두세요.':'상대와 직접 연결하는 중입니다.',closed:'상대의 연결이 종료되었습니다. 새 초대 링크로 다른 참가자를 초대할 수 있습니다.',failed:detail};
  $('connectionStatus').textContent=messages[state]||'';
  if(detail)app?.message(detail,true);
}});
function busy(value){$('create').disabled=value;$('joinForm').querySelector('button').disabled=value;$('acceptAnswer').disabled=value;$('newInvite').disabled=value;}
async function applyAnswer(text){
  $('acceptAnswer').disabled=true;
  try{await session.accept(connectionInput(text,'answer',location.href));}
  finally{$('acceptAnswer').disabled=false;}
}
function showLink(code,kind){
  outputKind=kind;
  const label=kind==='invite'?'초대 링크 · 친구에게 보내세요':'응답 링크 · 호스트에게 보내세요';
  const link=makeConnectionLink(code,kind,location.href);
  $('shareLabel').textContent=label;$('outputLink').value=link;
  $('outputLabel').textContent=`기존 연결 코드 (${code.length}자)`;$('outputCode').value=code;$('responseCode').value='';
  $('copyLink').textContent=kind==='invite'?'초대 링크 복사':'응답 링크 복사';
  $('qrHint').textContent=kind==='invite'?'휴대폰 카메라로 스캔하면 참가 절차가 시작됩니다.':'호스트가 스캔하거나 링크를 열면 응답이 전달됩니다.';
  $('qrGroup').hidden=false;
  try{drawQR($('qrCanvas'),link);$('downloadQR').href=$('qrCanvas').toDataURL('image/png');$('downloadQR').download=`inuyasha-${kind}.png`;}
  catch{$('qrGroup').hidden=true;app.message('QR에 담기에는 링크가 깁니다. 링크 복사를 이용하세요.');}
  $('shareLink').hidden=typeof navigator.share!=='function';
  if(kind==='invite'){
    closeInbox();
    try{inbox=new AnswerInbox(session.peer.session,applyAnswer);}
    catch{app.message('응답 링크를 이 방 화면에 붙여 넣으면 연결할 수 있습니다.');}
  }
}
async function codeAction(action,kind){
  if(generating)throw Error('링크를 만드는 중입니다. 완료될 때까지 기다리거나 연결 취소를 누르세요.');
  const operation=++sequence;generating=true;busy(true);
  try{const code=await action();if(operation===sequence)showLink(code,kind);}
  catch(error){if(operation===sequence)throw error;}
  finally{if(operation===sequence){generating=false;busy(false);}}
}
window.inuyashaDirect={
  create:count=>codeAction(()=>session.create(count),'invite'),
  join:text=>codeAction(()=>session.join(connectionInput(text,'invite',location.href)),'answer'),
  send:event=>{if(event.type==='leave'){sequence++;generating=false;busy(false);}session.send(event);},
};
app=await import('./app.mjs');
busy(false);$('original').disabled=false;
app.message('방을 만들고 초대 링크 또는 QR을 친구에게 보내세요.');
async function copy(id,label){
  const input=$(id);if(!input.value)return;
  try{await navigator.clipboard.writeText(input.value);app.message(`${label}를 복사했습니다. 상대에게 개인적으로 보내세요.`);}
  catch{input.closest('details')?.setAttribute('open','');input.focus();input.select();app.message(`${label}가 선택되었습니다. 복사해서 보내세요.`);}
}
$('answerForm').addEventListener('submit',async event=>{
  event.preventDefault();try{await applyAnswer($('responseCode').value);}catch(error){app.message(error.message,true);}
});
$('newInvite').addEventListener('click',()=>codeAction(()=>session.newInvite(),'invite').catch(error=>app.message(error.message,true)));
$('cancelConnection').addEventListener('click',()=>{sequence++;generating=false;busy(false);session.close();});
$('copyCode').addEventListener('click',()=>copy('outputCode','연결 코드'));
$('copyLink').addEventListener('click',()=>copy('outputLink','링크'));
$('copyReturnLink').addEventListener('click',()=>copy('returnLink','응답 링크'));
$('shareLink').addEventListener('click',async()=>{
  try{await navigator.share({title:outputKind==='invite'?'이누야샤 PvP 초대':'이누야샤 PvP 응답',url:$('outputLink').value});}
  catch(error){if(error.name!=='AbortError')await copy('outputLink','링크');}
});
async function relayReply(code,link){
  if(returning)return;returning=true;
  $('relayPanel').hidden=false;$('relayPanel').dataset.state='sending';$('relayFallback').hidden=true;
  $('entry').hidden=true;$('original').hidden=true;document.querySelector('.stage').hidden=true;document.querySelector('.game-footer').hidden=true;
  $('returnLink').value=link;$('retryReturn').disabled=true;$('relayStatus').textContent='원래 대기 중인 호스트 방에 응답을 전달하는 중입니다.';
  try{
    const answer=await decodeCode(code);if(answer.kind!=='answer')throw Error('참가자의 응답 링크가 아닙니다.');
    await deliverAnswer(code,answer.session);
    $('relayPanel').dataset.state='sent';$('relayStatus').textContent='원래 방에 응답을 전달했습니다. 방을 만든 탭으로 돌아가세요. 이 응답 탭은 닫아도 됩니다.';app.message('응답 전달 완료 · 원래 방에서 연결을 진행합니다.');
  }catch(error){$('relayPanel').dataset.state='failed';$('relayStatus').textContent=error.message;$('relayFallback').hidden=false;app.message(error.message,true);}
  finally{returning=false;$('retryReturn').disabled=false;}
}
$('retryReturn').addEventListener('click',()=>{
  const link=$('returnLink').value;try{const parsed=readConnectionLink(link,location.href);relayReply(parsed.code,link);}catch(error){app.message(error.message,true);}
});
async function followLink(href){
  if(!new URL(href).hash)return;
  try{
    const link=readConnectionLink(href,location.href);
    if(link.kind==='invite')await window.inuyashaDirect.join(link.code);
    else if(session.role==='host')await applyAnswer(link.code);
    else if(session.role)throw Error('응답 링크는 호스트의 방을 만든 브라우저에서 여세요.');
    else await relayReply(link.code,makeConnectionLink(link.code,'answer',location.href));
  }catch(error){app.message(error.message,true);}
}
window.addEventListener('hashchange',()=>{
  const href=location.href;history.replaceState(null,'',location.pathname+location.search);followLink(href);
});
window.addEventListener('pagehide',()=>{closeInbox();session.close();});
await followLink(initialURL);
