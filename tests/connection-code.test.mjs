import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeCode,decodeCode} from '../public/net/manual-peer.mjs';

const sdp='v=0\r\no=- 6750650787423425408 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate:3943847132 1 udp 2113937151 55043027-cba0-49dd-ba6f-a026ce5d80c9.local 58807 typ host generation 0 network-cost 999\r\na=ice-ufrag:8FC9\r\na=ice-pwd:13VmEk/r70BSC4c1+J9bxiDI\r\na=ice-options:trickle\r\na=fingerprint:sha-256 0C:19:F9:4B:39:2D:A8:D9:FC:81:75:31:25:45:47:33:F2:26:9F:97:AB:C5:D2:1F:05:13:0F:1A:F8:8A:CD:6D\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n';
const description={version:1,kind:'offer',session:'fa13f5b0039b76edb2b667d7f4ead5b8',room:'7825E3',sdp};
const legacy=value=>'IY1-'+Buffer.from(JSON.stringify(value)).toString('base64url');
test('compressed invitation and answer preserve every SDP character and reduce length by at least 45%',async()=>{
  for(const kind of ['offer','answer']){
    const value={...description,kind,sdp:kind==='answer'?sdp.replace('setup:actpass','setup:active'):sdp};
    const code=await encodeCode(value);assert.match(code,/^IY2-/);assert.deepEqual(await decodeCode(code),value);
    assert.ok(code.length<=legacy(value).length*0.55,`new ${code.length}, old ${legacy(value).length}`);
    console.log(`${kind}: ${legacy(value).length} → ${code.length} characters`);
  }
});
test('a frozen IY2 code remains readable even if the current encoder changes',async()=>{
  // Created once for the IY2 format; do not regenerate when editing the encoder.
  const code='IY2-H4sIAAAAAAAACgXBuy5FURAG4OG403mB06hkx8yaNXut-bt9sRJaiX5fEBGNQs67eAlRiBcRD6CT6GhUvo_-Dn-fF0-P3y-vNx8_X-9vq6NPWquTcW2ccopBY7DIeRlonRa0QZvqUXNMooG2goi6JjFZmnFUDqmaxoGr6PNcjUN9XQ0c6unK5syT047lzIm23Z12c-mc9kQv70_vTh4StxddnOT43MfVbX9G-9xBHMURW6gj9GgyekfpkAXJoIJgiIaYoIoSEGp4gSc0LTpDHyAFbBAFF0iDkpEbdD3qng7-ATOS1PX9AAAA';
  assert.deepEqual(await decodeCode(code),description);
});
test('old codes and copied whitespace remain accepted',async()=>{
  assert.deepEqual(await decodeCode(' \n'+legacy(description)+'\n '),description);
  assert.deepEqual(await decodeCode(' \n'+await encodeCode(description)+'\n '),description);
  assert.equal(await encodeCode(description,{legacy:true}),legacy(description));
});
test('unknown SDP attributes, Unicode and zero-byte escapes survive without alteration',async()=>{
  const value={...description,sdp:sdp+'a=unknown:한글 💫\x00\x01\xff\r\n'};
  assert.deepEqual(await decodeCode(await encodeCode(value)),value);
});
test('malformed, truncated and corrupted compressed codes reject',async()=>{
  const code=await encodeCode(description);
  const corrupted=Buffer.from(code.slice(4),'base64url');corrupted[Math.floor(corrupted.length/2)]^=0x80;
  for(const text of ['ABC123','IY2-@@@','IY2-AAAA',code.slice(0,-9),'IY2-'+corrupted.toString('base64url'),'IY2-'+'A'.repeat(40000)])await assert.rejects(()=>decodeCode(text));
  await assert.rejects(()=>encodeCode({...description,room:'bad'}));
});
test('compressed expansion is bounded before a pasted payload can grow without limit',async()=>{
  const input=new TextEncoder().encode('A'.repeat(1000000));
  const compressed=new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const code='IY2-'+Buffer.from(compressed).toString('base64url');
  await assert.rejects(()=>decodeCode(code));
});
