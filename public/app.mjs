const $ = id => document.getElementById(id);
const names = { i: '이누야샤', ke: '가영', m: '미륵', ka: '카구라', n: '나락', s: '셋쇼마루', sa: '산고', ko: '코우가' };
const cardNames = { perfectGuard: '완전방어', heal: '회복', kikyosRevenge: '금강', doubleRight: '두 칸 이동 →', doubleLeft: '두 칸 이동 ←', summonKirara: '키라라', summonDemons: '요괴 소환', summonJaken: '쟈켄', summonShippo: '싯포', summonWolves: '늑대 소환' };
let socket, player, mode, gameReady = false, room = null, seat = null, code = null, changing = false, match = null;
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function bridge(name, ...args) { return gameReady ? player.ruffle().callExternalInterface(name, ...args) : false; }
function send(event) {
  if (socket?.readyState !== WebSocket.OPEN) { message('서버 연결이 끊겼습니다. 페이지를 새로 열어 접속하세요.', true); return; }
  socket.send(JSON.stringify(event));
}
async function connect() {
  if (socket?.readyState === WebSocket.OPEN) return;
  const ws = socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/pvp`);
  ws.addEventListener('message', event => handle(JSON.parse(event.data)));
  ws.addEventListener('close', () => { if (socket === ws) { clearRoom(); message('서버 연결이 종료되었습니다. 새로고침하여 다시 접속하세요.', true); } });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', () => reject(Error('서버에 연결하지 못했습니다.')), { once: true }); });
}
async function loadGame(nextMode) {
  gameReady = false; mode = nextMode;
  player?.remove(); $('placeholder')?.remove();
  const instance = player = window.RufflePlayer.newest().createPlayer(); $('gameContainer').append(instance);
  await instance.ruffle().load({ url: `/game/game-${nextMode === 'pvp' ? 'pvp' : 'original'}.swf`, base: '/game/', parameters: nextMode === 'pvp' ? { pvp: 'true' } : {}, allowScriptAccess: nextMode === 'pvp', autoplay: 'on', unmuteOverlay: 'hidden', splashScreen: false, logLevel: 'error' });
  instance.ruffle().volume = Number($('volume').value) / 100;
  render();
}
window.pvpEvent = (kind, data) => {
  if (mode !== 'pvp') return;
  if (kind === 'ready') { gameReady = true; if (seat !== null) bridge('pvpConfigure', seat); render(); return; }
  if (!room) return;
  if (kind === 'character') { changing = false; send({ type: 'character', character: data.character }); return; }
  if (kind === 'fault') { send({ type: 'leave' }); message(data.message, true); return; }
  if (['moves', 'loaded', 'resolved', 'finished', 'rematch'].includes(kind)) send({ type: kind, ...data });
};
function clearRoom() {
  bridge('pvpReset'); room = null; seat = null; code = null; match = null; changing = false;
  $('bonusList').textContent = ''; render();
}
function handle(event) {
  if (event.type === 'error') {
    if (event.retryMoves) bridge('pvpRetry', event.match, event.round);
    message(event.message, true); return;
  }
  if (event.type === 'selectCharacter') { if (bridge('pvpSelect')) { changing = true; render(); } return; }
  if (event.type === 'joined') {
    code = event.code; seat = event.seat;
    $('code').textContent = code; $('seat').textContent = `${seat + 1}P${seat === 0 ? ' · 호스트' : ''}`;
    if (mode !== 'pvp' || !gameReady) loadGame('pvp').catch(error => message(error.message, true));
    else { bridge('pvpConfigure', seat); bridge('pvpReset'); }
    return;
  }
  if (event.type === 'room') { room = event; render(); return; }
  if (event.type === 'start') {
    match = event;
    $('bonusList').textContent = event.bonusCards.length ? `공동 추가카드: ${event.bonusCards.map(id => cardNames[id]).join(' · ')}` : '추가카드 0장';
    if (!bridge('pvpStart', event.match, event.characters.join(','), event.bonusCards.join(','))) { send({ type: 'leave' }); message('게임이 아직 준비되지 않았습니다. PLAY와 난이도를 먼저 선택하세요.', true); }
    return;
  }
  if (event.type === 'next') {
    if (!bridge('pvpNext', event.match, event.round)) { send({ type: 'leave' }); message('게임 입력 상태를 연결하지 못했습니다. 다시 방에 참가하세요.', true); }
    return;
  }
  if (event.type === 'play') {
    if (!bridge('pvpPlay', event.match, event.round, event.moves[0].join(','), event.moves[1].join(','))) { send({ type: 'leave' }); message('대전 입력을 실행하지 못했습니다.', true); }
    return;
  }
  if (event.type === 'result') { message(event.result === 'tie' ? '무승부입니다. 양쪽이 캐릭터 다시 선택을 누르면 다음 경기를 준비합니다.' : `${event.winner + 1}P · ${names[match.characters[event.winner]]} 승리! 캐릭터를 다시 선택할 수 있습니다.`); return; }
  if (event.type === 'reset') { changing = false; match = null; $('bonusList').textContent = ''; bridge('pvpReset'); return; }
  if (event.type === 'opponentLeft') { message(event.reason); return; }
  if (event.type === 'closed') { clearRoom(); message(event.reason, true); return; }
  if (event.type === 'left') { clearRoom(); if (mode !== 'original') message('방을 나갔습니다. 다시 방을 만들거나 참가하세요.'); }
}
function render() {
  const inRoom = seat !== null && room !== null;
  $('entry').hidden = inRoom; $('roomPanel').hidden = !inRoom;
  $('roomPanel').dataset.phase = room?.phase || '';
  $('roomPanel').dataset.round = String(room?.round || 0);
  $('roomPanel').dataset.match = String(room?.match || 0);
  if (!inRoom) return;
  const selecting = room.phase === 'selecting';
  $('bonusCount').value = String(room.bonusCount); $('bonusCount').disabled = seat !== 0 || !selecting;
  $('invitePanel').hidden = seat !== 0;
  for (let i = 0; i < 2; i++) {
    const p = room.players[i]; $('player' + i).textContent = `${i + 1}P${i === seat ? ' (나)' : ''} · ${p ? (p.character ? names[p.character] : '캐릭터 선택 중') + (p.ready ? ' · 준비 완료' : '') : '참가 대기'}`;
  }
  $('ready').hidden = !selecting; $('change').hidden = !selecting;
  $('ready').disabled = !gameReady || changing || !room.players[seat]?.character || room.players[seat]?.ready;
  $('change').disabled = !gameReady;
  $('rematch').hidden = room.phase !== 'result'; $('rematch').disabled = room.rematch[seat];
  if (selecting) message(!gameReady ? '게임 화면의 PLAY를 누르고 NORMAL 또는 HARD를 선택하세요.' : !room.players[1] ? '캐릭터를 선택하고 초대 링크를 상대에게 공유하세요.' : room.players[seat]?.ready ? '상대가 준비를 마칠 때까지 기다립니다.' : changing || !room.players[seat]?.character ? '원본 게임 화면에서 원하는 캐릭터를 선택하세요.' : '캐릭터 선택이 끝났습니다. 준비 완료를 누르세요.');
  else if (room.phase === 'loading') message('양쪽 캐릭터를 불러오는 중입니다.');
  else if (room.phase === 'picking') message(room.submitted[seat] ? '카드를 제출했습니다. 상대의 선택을 기다립니다.' : `라운드 ${room.round} · 게임 화면에서 행동 카드 3장을 선택하세요.`);
  else if (room.phase === 'animating') message(room.finished[seat] ? '상대가 전투 화면을 끝낼 때까지 기다립니다.' : `라운드 ${room.round} · 원본 전투가 진행됩니다. NEXT TURN / CONTINUE로 진행하세요.`);
  else if (room.phase === 'result' && room.rematch[seat]) message('상대가 캐릭터 다시 선택을 누르기를 기다립니다.');
}
$('create').addEventListener('click', async () => { try { await connect(); send({ type: 'create', bonusCount: Number($('bonusCount').value) }); } catch (error) { message(error.message, true); } });
$('joinForm').addEventListener('submit', async event => { event.preventDefault(); try { await connect(); send({ type: 'join', code: $('roomCode').value }); } catch (error) { message(error.message, true); } });
$('bonusCount').addEventListener('change', () => send({ type: 'configure', bonusCount: Number($('bonusCount').value) }));
$('ready').addEventListener('click', () => send({ type: 'ready' }));
$('change').addEventListener('click', () => send({type:'selectCharacter'}));
$('rematch').addEventListener('click', () => send({ type: 'rematch' }));
$('leave').addEventListener('click', () => send({ type: 'leave' }));
$('original').addEventListener('click', async () => { if (room) send({ type: 'leave' }); mode = 'original'; await loadGame('original'); message('원본 모드입니다. 원래 방식대로 플레이하세요.'); });
$('volume').addEventListener('input', () => { if (player) player.ruffle().volume = Number($('volume').value) / 100; });
$('fullscreen').addEventListener('click', () => { if (player) player.ruffle().requestFullscreen(); });
$('copy').addEventListener('click', async () => {
  try { const url = new URL($('shareAddress').value); url.searchParams.set('room', code); await navigator.clipboard.writeText(url.toString()); message('초대 링크를 복사했습니다. 상대에게 공유하세요.'); }
  catch { $('shareAddress').select(); message(`주소와 방 코드를 함께 공유하세요. 방 코드: ${code}`); }
});
$('roomCode').value = new URLSearchParams(location.search).get('room') || '';
$('shareAddress').value = location.origin;
fetch('/api/addresses').then(r => r.json()).then(addresses => {
  for (const address of addresses) { const option = document.createElement('option'); option.value = address.url; option.label = address.name; $('addresses').append(option); }
  if (['localhost', '127.0.0.1'].includes(location.hostname) && addresses.length) $('shareAddress').value = addresses[0].url;
}).catch(() => {});
