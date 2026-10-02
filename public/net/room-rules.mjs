import { catalog } from './catalog.mjs';
export { catalog };
function cryptoRandomInt(max) {
  if (!Number.isInteger(max) || max < 1) throw Error('Invalid random range');
  const values = new Uint32Array(1), ceiling = 0x100000000 - (0x100000000 % max);
  do { globalThis.crypto.getRandomValues(values); } while (values[0] >= ceiling);
  return values[0] % max;
}
function roomCode() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(3)), n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

const byId = new Map(catalog.map(move => [move.id, move]));
const characters = ['i', 'ke', 'm', 'ka', 'n', 's', 'sa', 'ko'];
const countValid = count => Number.isInteger(count) && count >= 0 && count <= 3;
export function drawBonus(ids, count, randomInt = cryptoRandomInt) {
  if (!countValid(count) || !Array.isArray(ids) || ids.length !== 2 || ids.some(id => !characters.includes(id))) throw Error('잘못된 카드 설정입니다.');
  if (count === 0) return [];
  const pool = catalog.filter(move => move.advanced && ids.every(id => move.characters.includes(id))).map(move => move.id);
  const drawn = [];
  for (let i = 0; i < count; i++) drawn.push(pool.splice(randomInt(pool.length), 1)[0]);
  return drawn;
}
export function validateMoves(ids, available, energy) {
  if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => !available.includes(id) || !byId.has(id))) return false;
  let remaining = energy;
  for (const id of ids) {
    // The original picker budgets the hand without the combat engine's 100 cap.
    // The original engine still decides whether each action can execute.
    remaining += byId.get(id).energy;
    if (remaining < 0) return false;
  }
  return true;
}
function normalizeReport(message) {
  if (!Array.isArray(message.players) || message.players.length !== 2 || !['none', 'win', 'tie'].includes(message.result)) return null;
  if (message.result === 'win' && ![0, 1].includes(message.winner) || message.result !== 'win' && message.winner !== null) return null;
  const players = [];
  for (const player of message.players) {
    if (!player || !Number.isInteger(player.life) || player.life < 0 || player.life > 100 || !Number.isInteger(player.energy) || player.energy < 0 || player.energy > 100 || !Array.isArray(player.loc) || player.loc.length !== 2 || !Number.isInteger(player.loc[0]) || !Number.isInteger(player.loc[1]) || player.loc[0] < 0 || player.loc[0] > 2 || player.loc[1] < 0 || player.loc[1] > 3) return null;
    players.push({ life: player.life, energy: player.energy, loc: [...player.loc] });
  }
  if (message.result === 'none' && players.some(p => p.life === 0)) return null;
  if (message.result === 'tie' && players.some(p => p.life !== 0)) return null;
  if (message.result === 'win' && (players[message.winner].life === 0 || players[1 - message.winner].life !== 0)) return null;
  return { players, result: message.result, winner: message.winner };
}

export class RoomService {
  constructor({ randomInt = cryptoRandomInt } = {}) { this.rooms = new Map(); this.members = new Map(); this.randomInt = randomInt; }
  send(client, event) { client.send(event); }
  broadcast(room, event) { for (const p of room.players) if (p) this.send(p.client, event); }
  view(room) {
    return { type: 'room', code: room.code, phase: room.phase, bonusCount: room.bonusCount, match: room.match, round: room.round,
      players: room.players.map((p, seat) => p ? { seat, character: p.character, ready: p.ready } : null),
      submitted: room.hands.map(Boolean), finished: [...room.finished], rematch: room.players.map(p => Boolean(p?.rematch)) };
  }
  notify(room) { this.broadcast(room, this.view(room)); }
  newPlayer(client) { return { client, character: null, ready: false, loaded: false, rematch: false }; }
  reset(room) {
    room.phase = 'selecting'; room.round = 0; room.hands = [null, null]; room.reports = [null, null]; room.finished = [false, false]; room.bonusCards = []; room.energies = [100, 100];
    for (const p of room.players) if (p) { p.character = null; p.ready = false; p.loaded = false; p.rematch = false; }
    this.broadcast(room, { type: 'reset' }); this.notify(room);
  }
  close(room, reason) {
    this.broadcast(room, { type: 'closed', reason });
    for (const p of room.players) if (p) this.members.delete(p.client.id);
    this.rooms.delete(room.code);
  }
  handle(client, message) {
    try { this.process(client, message); } catch (error) {
      const membership = this.members.get(client.id), room = membership?.room;
      const retryMoves = message?.type === 'moves' && room?.phase === 'picking' && !room.hands[membership.seat] && message.match === room.match && message.round === room.round;
      this.send(client, { type: 'error', message: error.message, ...(retryMoves ? { retryMoves: true, match: room.match, round: room.round } : {}) });
    }
  }
  process(client, m) {
    if (!m || Array.isArray(m) || typeof m !== 'object' || typeof m.type !== 'string') throw Error('잘못된 메시지입니다.');
    if (m.type === 'create' || m.type === 'join') {
      if (this.members.has(client.id)) throw Error('이미 방에 참가 중입니다.');
      let room, seat;
      if (m.type === 'create') {
        if (!countValid(m.bonusCount)) throw Error('추가카드는 0~3장으로 설정하세요.');
        if (this.rooms.size >= 100) throw Error('현재 만들 수 있는 방 수를 초과했습니다.');
        let code; do { code = roomCode(); } while (this.rooms.has(code));
        room = { code, players: [this.newPlayer(client), null], bonusCount: m.bonusCount, match: 0 };
        room.phase = 'selecting'; room.round = 0; room.hands = [null, null]; room.reports = [null, null]; room.finished = [false, false]; room.bonusCards = []; room.energies = [100, 100];
        this.rooms.set(code, room); seat = 0;
      } else {
        const code = typeof m.code === 'string' ? m.code.trim().toUpperCase() : '';
        room = this.rooms.get(code);
        if (!room) throw Error('방을 찾을 수 없습니다. 주소와 방 코드를 확인하세요.');
        if (room.players[1]) throw Error('이미 두 사람이 참가한 방입니다.');
        if (room.phase !== 'selecting') throw Error('대전 중인 방입니다.');
        room.players[1] = this.newPlayer(client); seat = 1;
      }
      this.members.set(client.id, { room, seat }); this.send(client, { type: 'joined', code: room.code, seat }); this.notify(room); return;
    }
    const membership = this.members.get(client.id);
    if (!membership) throw Error('먼저 방에 참가하세요.');
    const { room, seat } = membership, player = room.players[seat];
    if (m.type === 'leave') { this.disconnect(client); this.send(client, { type: 'left' }); return; }
    if (m.type === 'configure') {
      if (seat !== 0 || room.phase !== 'selecting' || !countValid(m.bonusCount)) throw Error('호스트가 경기 전에만 0~3장으로 설정할 수 있습니다.');
      room.bonusCount = m.bonusCount; for (const p of room.players) if (p) p.ready = false; this.notify(room); return;
    }
    if (m.type === 'character') {
      if (room.phase !== 'selecting' || !characters.includes(m.character)) throw Error('지금은 캐릭터를 선택할 수 없습니다.');
      player.character = m.character; player.ready = false; this.notify(room); return;
    }
    if (m.type === 'selectCharacter') {
      if (room.phase !== 'selecting') throw Error('이미 경기가 시작되어 캐릭터를 바꿀 수 없습니다.');
      player.character = null; player.ready = false;
      this.send(client, { type: 'selectCharacter' }); this.notify(room); return;
    }
    if (m.type === 'ready') {
      if (room.phase !== 'selecting' || !player.character) throw Error('먼저 캐릭터를 선택하세요.');
      player.ready = true;
      if (room.players.every(p => p?.ready)) {
        room.match++; room.round = 1; room.phase = 'loading';
        const ids = room.players.map(p => p.character); room.bonusCards = drawBonus(ids, room.bonusCount, this.randomInt);
        this.broadcast(room, { type: 'start', match: room.match, characters: ids, bonusCards: room.bonusCards });
      }
      this.notify(room); return;
    }
    if (m.type === 'rematch') {
      if (room.phase !== 'result') throw Error('경기가 끝나야 캐릭터를 다시 선택할 수 있습니다.');
      player.rematch = true; if (room.players.every(p => p?.rematch)) this.reset(room); else this.notify(room); return;
    }
    if (m.match !== room.match) throw Error('이전 경기의 입력입니다.');
    if (m.type === 'loaded') {
      if (room.phase !== 'loading') throw Error('현재 불러오는 경기가 없습니다.');
      player.loaded = true;
      if (room.players.every(p => p?.loaded)) { room.phase = 'picking'; this.broadcast(room, { type: 'next', match: room.match, round: room.round }); }
      this.notify(room); return;
    }
    if (m.round !== room.round) throw Error('이전 라운드의 입력입니다.');
    if (m.type === 'moves') {
      if (room.phase !== 'picking' || room.hands[seat]) throw Error('이미 제출했거나 지금은 카드 선택 차례가 아닙니다.');
      const available = catalog.filter(move => !move.advanced && move.characters.includes(player.character)).map(move => move.id).concat(room.bonusCards);
      if (!validateMoves(m.moves, available, room.energies[seat])) throw Error('선택한 카드 또는 기력이 유효하지 않습니다.');
      room.hands[seat] = [...m.moves];
      if (room.hands.every(Boolean)) { room.phase = 'animating'; this.broadcast(room, { type: 'play', match: room.match, round: room.round, moves: room.hands.map(hand => [...hand]) }); }
      this.notify(room); return;
    }
    if (m.type === 'resolved') {
      if (room.phase !== 'animating' || room.reports[seat]) throw Error('현재 판정 중인 라운드가 아닙니다.');
      const report = normalizeReport(m); if (!report) throw Error('잘못된 전투 상태입니다.');
      room.reports[seat] = report;
      if (room.reports.every(Boolean) && JSON.stringify(room.reports[0]) !== JSON.stringify(room.reports[1])) { this.close(room, '두 게임의 전투 상태가 일치하지 않아 대전을 종료했습니다.'); return; }
      this.advance(room); return;
    }
    if (m.type === 'finished') {
      if (room.phase !== 'animating' || room.finished[seat]) throw Error('현재 진행 중인 라운드가 아닙니다.');
      room.finished[seat] = true; this.advance(room); return;
    }
    throw Error('지원하지 않는 메시지입니다.');
  }
  advance(room) {
    if (!room.reports.every(Boolean) || !room.finished.every(Boolean)) { this.notify(room); return; }
    const report = room.reports[0];
    if (report.result === 'none') {
      room.energies = report.players.map(p => Math.min(100, p.energy + 15));
      room.round++; room.phase = 'picking'; room.hands = [null, null]; room.reports = [null, null]; room.finished = [false, false];
      this.broadcast(room, { type: 'next', match: room.match, round: room.round });
    } else { room.phase = 'result'; this.broadcast(room, { type: 'result', winner: report.winner, result: report.result, rounds: room.round }); }
    this.notify(room);
  }
  disconnect(client) {
    const membership = this.members.get(client.id); if (!membership) return;
    const { room, seat } = membership; this.members.delete(client.id);
    if (seat === 0) this.close(room, '호스트가 연결을 종료했습니다.');
    else { room.players[1] = null; this.broadcast(room, { type: 'opponentLeft', reason: '상대가 나갔습니다. 새 참가자를 기다립니다.' }); this.reset(room); }
  }
}
