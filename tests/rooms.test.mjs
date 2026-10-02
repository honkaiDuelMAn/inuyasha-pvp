import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService, drawBonus, validateMoves } from '../server/rooms.mjs';

const client = id => ({ id, events: [], send(event) { this.events.push(structuredClone(event)); } });
const last = (c, type) => c.events.filter(e => e.type === type).at(-1);
function setup(count = 0, characters = ['i', 'ke']) {
  const service = new RoomService({ randomInt: () => 0 });
  const host = client('host'), guest = client('guest');
  service.handle(host, { type: 'create', bonusCount: count });
  service.handle(guest, { type: 'join', code: last(host, 'joined').code });
  service.handle(host, { type: 'character', character: characters[0] });
  service.handle(guest, { type: 'character', character: characters[1] });
  service.handle(host, { type: 'ready' });
  service.handle(guest, { type: 'ready' });
  const match = last(host, 'start').match;
  for (const c of [host, guest]) service.handle(c, { type: 'loaded', match });
  return { service, host, guest, match, round: 1 };
}
function play(ctx) {
  for (const c of [ctx.host, ctx.guest]) ctx.service.handle(c, { type: 'moves', match: ctx.match, round: ctx.round, moves: ['guard', 'moveRight', 'energyUp'] });
}
const report = { players: [{ life: 100, energy: 75, loc: [1, 1] }, { life: 100, energy: 75, loc: [1, 2] }], result: 'none', winner: null };
function reportRound(ctx, result = report) {
  for (const c of [ctx.host, ctx.guest]) ctx.service.handle(c, { type: 'resolved', match: ctx.match, round: ctx.round, ...result });
  for (const c of [ctx.host, ctx.guest]) ctx.service.handle(c, { type: 'finished', match: ctx.match, round: ctx.round });
}

test('0 bonus cards never call the random source', () => {
  assert.deepEqual(drawBonus(['i', 'ke'], 0, () => { throw Error('RNG called'); }), []);
});
test('every one of 64 character pairings can draw exactly 1–3 distinct compatible cards', () => {
  const chars = ['i', 'ke', 'm', 'ka', 'n', 's', 'sa', 'ko'];
  const common = ['perfectGuard', 'heal', 'kikyosRevenge', 'doubleRight', 'doubleLeft'];
  for (const a of chars) for (const b of chars) for (const count of [1, 2, 3]) {
    const cards = drawBonus([a, b], count, () => 0);
    assert.equal(cards.length, count); assert.equal(new Set(cards).size, count);
    for (const id of cards) assert.ok(common.includes(id) || a === b || ['i', 'm', 'ke'].includes(a) && ['i', 'm', 'ke'].includes(b) || ['ka', 'n'].includes(a) && ['ka', 'n'].includes(b));
  }
});
test('the host and guest receive exactly the same shared bonus list', () => {
  for (const count of [0, 1, 2, 3]) {
    const { host, guest } = setup(count);
    assert.deepEqual(last(host, 'start').bonusCards, last(guest, 'start').bonusCards);
    assert.equal(last(host, 'start').bonusCards.length, count);
  }
});
test('0-card room startup never enters a bonus randomization path', () => {
  const s = new RoomService({ randomInt: () => { throw Error('No bonus randomization'); } });
  const h = client('h'), g = client('g'); s.handle(h, { type: 'create', bonusCount: 0 });
  s.handle(g, { type: 'join', code: last(h, 'joined').code });
  for (const c of [h, g]) { s.handle(c, { type: 'character', character: 'i' }); s.handle(c, { type: 'ready' }); }
  assert.deepEqual(last(h, 'start').bonusCards, []);
});
test('only the host may configure cards, and settings are locked during a match', () => {
  const { service, host, guest } = setup(1);
  service.handle(guest, { type: 'configure', bonusCount: 3 });
  assert.ok(last(guest, 'error')); assert.equal(last(host, 'room').bonusCount, 1);
  service.handle(host, { type: 'configure', bonusCount: 2 });
  assert.ok(last(host, 'error')); assert.equal(last(host, 'room').bonusCount, 1);
});
test('a third player cannot join an occupied room', () => {
  const { service, host } = setup(); const third = client('third');
  service.handle(third, { type: 'join', code: last(host, 'joined').code });
  assert.ok(last(third, 'error')); assert.equal(last(third, 'joined'), undefined);
});
test('a submitted hand stays secret until the other hand is submitted', () => {
  const ctx = setup(); const { service, host, guest, match } = ctx;
  service.handle(host, { type: 'moves', match, round: 1, moves: ['guard', 'moveRight', 'energyUp'] });
  assert.equal(last(guest, 'play'), undefined); assert.equal(last(guest, 'room').submitted[0], true);
  assert.equal(JSON.stringify(last(guest, 'room')).includes('moveRight'), false);
  service.handle(guest, { type: 'moves', match, round: 1, moves: ['moveLeft', 'guard', 'energyUp'] });
  assert.deepEqual(last(guest, 'play').moves, [['guard', 'moveRight', 'energyUp'], ['moveLeft', 'guard', 'energyUp']]);
});
test('both runtimes must load before input starts', () => {
  const ctx = setup(); assert.equal(last(ctx.host, 'next').round, 1);
  assert.equal(last(ctx.host, 'room').phase, 'picking');
});
test('next round waits for both equal reports and both completed animations', () => {
  const ctx = setup(); play(ctx);
  for (const c of [ctx.host, ctx.guest]) ctx.service.handle(c, { type: 'resolved', match: ctx.match, round: 1, ...report });
  ctx.service.handle(ctx.host, { type: 'finished', match: ctx.match, round: 1 });
  assert.equal(last(ctx.host, 'next').round, 1);
  ctx.service.handle(ctx.guest, { type: 'finished', match: ctx.match, round: 1 });
  assert.equal(last(ctx.host, 'next').round, 2);
});
test('old and repeated messages cannot resubmit or restart a round', () => {
  const ctx = setup(); play(ctx); reportRound(ctx);
  const before = ctx.host.events.filter(e => e.type === 'play').length;
  ctx.service.handle(ctx.host, { type: 'moves', match: ctx.match, round: 1, moves: ['guard', 'moveLeft', 'energyUp'] });
  assert.equal(ctx.host.events.filter(e => e.type === 'play').length, before);
  assert.ok(last(ctx.host, 'error'));
});
test('different engine states end the match instead of continuing out of sync', () => {
  const ctx = setup(); play(ctx);
  ctx.service.handle(ctx.host, { type: 'resolved', match: ctx.match, round: 1, ...report });
  ctx.service.handle(ctx.guest, { type: 'resolved', match: ctx.match, round: 1, ...report, players: [{ life: 90, energy: 75, loc: [1, 1] }, report.players[1]] });
  assert.ok(last(ctx.host, 'closed')); assert.ok(last(ctx.guest, 'closed'));
});
test('a completed same-character match returns both players to fresh character selection', () => {
  const ctx = setup(3, ['i', 'i']); play(ctx);
  reportRound(ctx, { players: [{ life: 100, energy: 75, loc: [1, 1] }, { life: 0, energy: 75, loc: [1, 2] }], result: 'win', winner: 0 });
  assert.equal(last(ctx.host, 'result').winner, 0);
  for (const c of [ctx.host, ctx.guest]) ctx.service.handle(c, { type: 'rematch' });
  const room = last(ctx.host, 'room'); assert.equal(room.phase, 'selecting'); assert.equal(room.bonusCount, 3);
  assert.deepEqual(room.players.map(p => p.character), [null, null]);
  assert.deepEqual(room.players.map(p => p.ready), [false, false]);
  assert.deepEqual(room.submitted, [false, false]); assert.ok(last(ctx.guest, 'reset'));
});
test('guest disconnect ends an active game and leaves host able to invite a replacement', () => {
  const ctx = setup(2); ctx.service.disconnect(ctx.guest);
  assert.ok(last(ctx.host, 'opponentLeft')); assert.equal(last(ctx.host, 'room').phase, 'selecting');
  const replacement = client('new'); ctx.service.handle(replacement, { type: 'join', code: last(ctx.host, 'joined').code });
  assert.equal(last(replacement, 'joined').seat, 1);
});
test('host disconnect closes the room for the guest', () => {
  const ctx = setup(); ctx.service.disconnect(ctx.host); assert.ok(last(ctx.guest, 'closed'));
});
test('malformed and invalid messages do not crash room processing', () => {
  const ctx = setup();
  for (const payload of [null, [], {}, { type: 'moves', match: ctx.match, round: 1 }, { type: 'moves', match: ctx.match, round: 1, moves: ['bad', 'guard', 'energyUp'] }, { type: 'resolved', players: [] }]) {
    assert.doesNotThrow(() => ctx.service.handle(ctx.host, payload));
  }
  assert.equal(last(ctx.guest, 'play'), undefined);
});
test('move validation rejects duplicates, unavailable moves and over-budget energy', () => {
  assert.equal(validateMoves(['guard', 'guard', 'energyUp'], ['guard', 'energyUp'], 100), false);
  assert.equal(validateMoves(['guard', 'miasma', 'energyUp'], ['guard', 'energyUp'], 100), false);
  assert.equal(validateMoves(['demonStrike', 'miasma', 'energyUp'], ['demonStrike', 'miasma', 'energyUp'], 100), false);
  assert.equal(validateMoves(['energyUp', 'spiritPower', 'guard'], ['energyUp', 'spiritPower', 'guard'], 0), true);
  assert.equal(validateMoves(['spiritPower', 'energyUp', 'guard'], ['energyUp', 'spiritPower', 'guard'], 0), false);
});
