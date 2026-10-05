import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualPeer, decodeCode } from '../public/net/manual-peer.mjs';

test('manual peer configures public STUN discovery without TURN relay', () => {
  const original = globalThis.RTCPeerConnection;
  let capturedConfig;

  globalThis.RTCPeerConnection = class {
    constructor(config) { capturedConfig = config; }
    addEventListener() {}
    close() {}
  };

  try {
    new ManualPeer().setup();

    const urls = capturedConfig.iceServers.flatMap(server =>
      Array.isArray(server.urls) ? server.urls : [server.urls]);

    assert.ok(urls.includes('stun:stun.cloudflare.com:3478'));
    assert.ok(urls.every(url => url.startsWith('stun:')),
      'the static PvP build must not configure TURN relay traffic');
  } finally {
    if (original === undefined) delete globalThis.RTCPeerConnection;
    else globalThis.RTCPeerConnection = original;
  }
});

test('slow mobile ICE gathering may finish after the old ten-second limit', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});

  const listeners = new Map();
  const pc = {
    iceGatheringState: 'gathering',
    localDescription: {type: 'offer', sdp: 'v=0\r\n'},
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const peer = new ManualPeer();
  peer.pc = pc;
  peer.session = '0'.repeat(32);
  peer.room = 'ABC123';

  let outcome;
  const observed = peer.gather().then(
    value => { outcome = {status: 'resolved', value}; },
    error => { outcome = {status: 'rejected', error}; },
  );

  t.mock.timers.tick(10_000);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(outcome, undefined,
    'mobile ICE gathering must not be rejected at the former ten-second cutoff');

  t.mock.timers.tick(10_000);
  pc.iceGatheringState = 'complete';
  listeners.get('icegatheringstatechange')();

  await observed;
  assert.equal(outcome.status, 'resolved');
});


test('mobile ICE gathering finishes after a quiet srflx candidate even without complete', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});

  const listeners = new Map();
  const pc = {
    iceGatheringState: 'gathering',
    localDescription: {
      type: 'offer',
      sdp: 'v=0\r\na=candidate:1 1 udp 2122260223 10.0.0.2 50000 typ host\r\n',
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const peer = new ManualPeer({gatherTimeout: 30_000});
  peer.pc = pc;
  peer.session = '1'.repeat(32);
  peer.room = 'ABC123';

  let outcome;
  const observed = peer.gather().then(
    value => { outcome = {status: 'resolved', value}; },
    error => { outcome = {status: 'rejected', error}; },
  );

  assert.equal(typeof listeners.get('icecandidate'), 'function',
    'gather must observe candidates instead of waiting only for complete');
  listeners.get('icecandidate')({candidate: {
    type: 'host',
    candidate: 'candidate:1 1 udp 2122260223 10.0.0.2 50000 typ host',
  }});
  t.mock.timers.tick(500);
  pc.localDescription.sdp += 'a=candidate:2 1 udp 1686052607 203.0.113.9 62000 typ srflx raddr 0.0.0.0 rport 0\r\n';
  listeners.get('icecandidate')({candidate: {
    type: 'srflx',
    candidate: 'candidate:2 1 udp 1686052607 203.0.113.9 62000 typ srflx raddr 0.0.0.0 rport 0',
  }});

  t.mock.timers.tick(1_499);
  await Promise.resolve();
  assert.equal(outcome, undefined,
    'the quiet window must allow a final candidate to arrive');

  t.mock.timers.tick(1);
  await observed;
  assert.equal(outcome.status, 'resolved');
  const decoded = await decodeCode(outcome.value);
  assert.match(decoded.sdp, / typ srflx /);
  assert.equal(pc.iceGatheringState, 'gathering',
    'the regression requires a browser that never reports complete');
});


test('gather recognizes an srflx candidate already present in localDescription', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});

  const listeners = new Map();
  const pc = {
    iceGatheringState: 'gathering',
    localDescription: {
      type: 'offer',
      sdp: 'v=0\r\na=candidate:1 1 udp 2122260223 10.0.0.2 50000 typ host\r\na=candidate:2 1 udp 1686052607 203.0.113.9 62000 typ srflx raddr 0.0.0.0 rport 0\r\n',
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const peer = new ManualPeer({gatherTimeout: 30_000, candidateQuietTimeout: 1_000});
  peer.pc = pc;
  peer.session = '2'.repeat(32);
  peer.room = 'ABC123';

  let outcome;
  const observed = peer.gather().then(
    value => { outcome = {status: 'resolved', value}; },
    error => { outcome = {status: 'rejected', error}; },
  );

  t.mock.timers.tick(1_000);
  await observed;
  assert.equal(outcome.status, 'resolved');
  const decoded = await decodeCode(outcome.value);
  assert.match(decoded.sdp, / typ srflx /);
});
