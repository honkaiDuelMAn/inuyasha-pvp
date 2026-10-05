const assert = require('node:assert/strict');

const STUN_URL = 'stun:stun.cloudflare.com:3478';

function assertStunOnly(configs) {
  assert.ok(configs.length > 0, 'at least one WebRTC peer must be created');
  for (const config of configs) {
    const urls = (config.iceServers || []).flatMap(server =>
      Array.isArray(server.urls) ? server.urls : [server.urls]);
    assert.ok(urls.includes(STUN_URL), 'Cloudflare STUN must be configured');
    assert.ok(urls.every(url => typeof url === 'string' && url.startsWith('stun:')),
      'TURN relay servers must not be configured');
  }
}

module.exports = {assertStunOnly, STUN_URL};
