import assert from 'node:assert/strict';
import test from 'node:test';

import { ManualPeer } from '../public/net/manual-peer.mjs';

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
