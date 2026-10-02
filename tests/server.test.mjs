import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server/main.mjs';

test('real HTTP and WebSocket clients can create and join a room and start after both are ready', async t => {
  const app = createApp(); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close()); const origin = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await fetch(origin)).status, 200);
  assert.equal((await fetch(origin + '/game/characters/kikyo_figure.swf')).status, 200);
  assert.equal((await fetch(origin + '/ruffle/ruffle.js')).status, 200);
  assert.equal((await fetch(origin + '/api/addresses')).status, 200);
  assert.equal((await fetch(origin + '/%2e%2e/server/catalog.json')).status, 404);
  const connect = async () => {
    const socket = new WebSocket(origin.replace('http', 'ws') + '/pvp'); const events = [];
    socket.on('message', raw => events.push(JSON.parse(raw)));
    await once(socket, 'open'); t.after(() => socket.terminate());
    return { socket, events, send: event => socket.send(JSON.stringify(event)) };
  };
  const wait = async (c, type) => {
    for (let i = 0; i < 200; i++) { const event = c.events.find(e => e.type === type); if (event) return event; await new Promise(resolve => setTimeout(resolve, 5)); }
    throw Error(`Missing ${type}`);
  };
  const host = await connect(); host.send({ type: 'create', bonusCount: 3 }); const joined = await wait(host, 'joined');
  const guest = await connect(); guest.send({ type: 'join', code: joined.code }); assert.equal((await wait(guest, 'joined')).seat, 1);
  const third = await connect(); third.send({ type: 'join', code: joined.code }); assert.ok(await wait(third, 'error'));
  host.send({ type: 'character', character: 'i' }); host.send({ type: 'ready' });
  guest.send({ type: 'character', character: 'ke' }); guest.send({ type: 'ready' });
  const a = await wait(host, 'start'), b = await wait(guest, 'start'); assert.deepEqual(a, b); assert.equal(a.bonusCards.length, 3);
});
