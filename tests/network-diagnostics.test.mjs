import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DIAGNOSTIC_CASES,
  candidateType,
  classifyResult,
  sanitizeIceError,
} from '../public/net/network-diagnostics.mjs';

test('diagnostic cases compare no STUN, Cloudflare ports, and another provider without TURN', () => {
  assert.deepEqual(DIAGNOSTIC_CASES.map(item => item.id), [
    'no-stun',
    'cloudflare-3478',
    'cloudflare-53',
    'google-19302',
  ]);

  const urls = DIAGNOSTIC_CASES.flatMap(item =>
    item.iceServers.flatMap(server => Array.isArray(server.urls) ? server.urls : [server.urls]));

  assert.ok(urls.includes('stun:stun.cloudflare.com:3478'));
  assert.ok(urls.includes('stun:stun.cloudflare.com:53'));
  assert.ok(urls.includes('stun:stun.l.google.com:19302'));
  assert.ok(urls.every(url => url.startsWith('stun:')),
    'the diagnostic page must never configure TURN relay traffic');
});

test('candidate parsing records only the candidate type, not its address', () => {
  assert.equal(candidateType({type: 'srflx'}), 'srflx');
  assert.equal(candidateType({candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host'}), 'host');
  assert.equal(candidateType({candidate: 'candidate:2 1 udp 1686052607 203.0.113.5 62000 typ srflx raddr 0.0.0.0 rport 0'}), 'srflx');
  assert.equal(candidateType({candidate: 'not a candidate'}), 'unknown');
});

test('ICE errors retain a useful server label and code without credentials or query data', () => {
  assert.deepEqual(sanitizeIceError({
    url: 'stun:user:secret@stun.example.test:3478?transport=udp',
    errorCode: 701,
    errorText: 'STUN host lookup received error.',
  }), {
    url: 'stun:stun.example.test:3478',
    code: 701,
    text: 'STUN host lookup received error.',
  });
});

test('results distinguish public STUN reachability from host-only and blocked cases', () => {
  assert.equal(classifyResult({counts: {host: 1, srflx: 1}, errors: [], timedOut: false}), 'reachable');
  assert.equal(classifyResult({counts: {host: 2, srflx: 0}, errors: [], timedOut: true}), 'host-only');
  assert.equal(classifyResult({counts: {host: 0, srflx: 0}, errors: [{code: 701}], timedOut: true}), 'blocked');
  assert.equal(classifyResult({counts: {host: 0, srflx: 0}, errors: [], timedOut: true}), 'timeout');
});
