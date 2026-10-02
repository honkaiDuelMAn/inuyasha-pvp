const CODE_LIMIT=32768,SDP_LIMIT=20000,BYTE_LIMIT=80000;
// IY2's fixed lossless dictionary. Changing its order requires a new code version.
const dictionary=[
  'v=0\r\no=- ',
  ' IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n',
  'a=extmap-allow-mixed\r\na=msid-semantic: WMS\r\n',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\n',
  'a=candidate:',
  ' 1 udp ',
  ' typ host generation 0 network-cost ',
  '.local ',
  '\r\na=ice-ufrag:',
  '\r\na=ice-pwd:',
  '\r\na=ice-options:trickle\r\na=fingerprint:sha-256 ',
  '\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n',
  '\r\na=setup:active\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n',
];
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const dictionaryBytes=dictionary.map(text=>encoder.encode(text));
const invalid=()=>Error('연결 코드를 읽을 수 없습니다. 전체 코드를 다시 복사하세요.');
const base64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function validate(value) {
  if(!value||value.version!==1||!['offer','answer'].includes(value.kind)||!/^[a-f0-9]{32}$/.test(value.session)||!/^[A-F0-9]{6}$/.test(value.room)||typeof value.sdp!=='string'||value.sdp.length>SDP_LIMIT||!value.sdp.startsWith('v=0\r\n'))throw Error('올바른 연결 코드가 아닙니다.');
  return value;
}
async function transform(bytes,stream,limit) {
  const reader=new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks=[];let total=0;
  try {
    while(true){
      const {value,done}=await reader.read();if(done)break;
      total+=value.length;if(total>limit){await reader.cancel().catch(()=>{});throw invalid();}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const result=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
function pack(value) {
  let text=value.sdp.replaceAll('\0','\0\0');
  for(let i=0;i<dictionary.length;i++)text=text.replaceAll(dictionary[i],'\0'+String.fromCharCode(i+1));
  const body=encoder.encode(text),bytes=new Uint8Array(20+body.length);bytes[0]=value.kind==='offer'?0:1;
  const metadata=value.session+value.room;
  for(let i=0;i<19;i++)bytes[i+1]=Number.parseInt(metadata.slice(i*2,i*2+2),16);
  bytes.set(body,20);return bytes;
}
function unpack(bytes) {
  if(bytes.length<20||bytes[0]>1)throw invalid();
  const body=[];
  for(let i=20;i<bytes.length;i++){
    if(bytes[i]!==0)body.push(bytes[i]);
    else {
      const token=bytes[++i];if(token===undefined||token>dictionary.length)throw invalid();
      if(token===0)body.push(0);else for(const byte of dictionaryBytes[token-1])body.push(byte);
    }
    if(body.length>BYTE_LIMIT)throw invalid();
  }
  return validate({version:1,kind:bytes[0]===0?'offer':'answer',session:hex(bytes.subarray(1,17)),room:hex(bytes.subarray(17,20)).toUpperCase(),sdp:decoder.decode(Uint8Array.from(body))});
}
export async function encodeCode(value,{legacy=false}={}) {
  validate(value);
  let code;
  if(legacy||typeof CompressionStream!=='function'||typeof DecompressionStream!=='function')code='IY1-'+base64(encoder.encode(JSON.stringify(value)));
  else {
    if(decoder.decode(encoder.encode(value.sdp))!==value.sdp)throw invalid();
    code='IY2-'+base64(await transform(pack(value),new CompressionStream('gzip'),CODE_LIMIT));
  }
  if(code.length>CODE_LIMIT)throw Error('연결 코드가 너무 깁니다.');return code;
}
export async function decodeCode(text) {
  if(typeof text!=='string'||text.length>CODE_LIMIT)throw Error('연결 코드가 너무 깁니다.');
  const code=text.replace(/\s/g,'');
  if(!/^IY[12]-[A-Za-z0-9_-]+$/.test(code))throw Error('6자리 방 번호 대신 전체 초대 또는 응답 코드를 붙여 넣으세요.');
  if(code.startsWith('IY2-')&&typeof DecompressionStream!=='function')throw Error('이 압축 코드를 사용하려면 Chrome 또는 Edge를 최신 버전으로 업데이트하세요.');
  try {
    const raw=atob(code.slice(4).replaceAll('-','+').replaceAll('_','/')),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    return code.startsWith('IY1-')?validate(JSON.parse(decoder.decode(bytes))):unpack(await transform(bytes,new DecompressionStream('gzip'),BYTE_LIMIT+20));
  } catch {throw invalid();}
}
