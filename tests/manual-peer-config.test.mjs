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
