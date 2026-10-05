// Exercise the same gameplay assertions through the unchanged link transport.
// DIRECT_GAMEPLAY=1 uses automatic invitation/answer links, not a room server.
const assert = require('node:assert/strict');
const {newPlayer} = require('./browser.cjs');
const {assertStunOnly} = require('./rtc-config.cjs');
const direct = process.env.DIRECT_GAMEPLAY === '1';
const audits = new WeakMap();

async function newGamePlayer(browser, origin) {
  if (!direct) return newPlayer(browser, origin);
  const url = process.env.DIRECT_URL || `${origin}/direct.html`;
  const page = await newPlayer(browser, 'about:blank');
  const audit = {errors: [], requests: []};
  audits.set(page, audit);
  await page.addInitScript(() => {
    window.__rtcConfigs = [];
    const NativePeer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends NativePeer {
      constructor(config) { super(config); window.__rtcConfigs.push(config); }
    };
    window.WebSocket = class {
      constructor() { throw Error('Link gameplay must not use a WebSocket server'); }
    };
  });
  await page.route('**/app.mjs', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const marker = 'export function handle(event) {';
    assert.ok(body.includes(marker), 'Network-event observation hook exists');
    await route.fulfill({response, body: body.replace(marker,
      marker + ' window.__networkEvents.push(structuredClone(event));')});
  });
  page.on('pageerror', error => audit.errors.push(error.message));
  page.on('request', request => {
    const requested = new URL(request.url());
    if (requested.origin !== new URL(url).origin || /\/api\/|\/pvp$/.test(requested.pathname)) {
      audit.requests.push(request.url());
    }
  });
  await page.goto(url);
  return page;
}

async function joinGame(host, guest) {
  if (!direct) {
    await guest.locator('#roomCode').fill(await host.locator('#code').innerText());
    await guest.locator('#joinForm button').click();
    return;
  }
  await host.waitForFunction(() => document.querySelector('#outputLink').value.includes('#invite='));
  await guest.goto(await host.locator('#outputLink').inputValue());
  await guest.waitForFunction(() => document.querySelector('#outputLink').value.includes('#answer='));
  const receipt = await host.context().newPage();
  try {
    await receipt.goto(await guest.locator('#outputLink').inputValue());
    await receipt.waitForFunction(() => document.querySelector('#relayPanel').dataset.state === 'sent');
    await host.waitForFunction(() => document.querySelector('#player1').textContent.includes('캐릭터 선택 중'));
  } finally {
    await receipt.close();
  }
  await host.bringToFront();
}

async function assertTransport(pages) {
  if (!direct) return;
  for (const page of pages) {
    const audit = audits.get(page);
    assert.deepEqual(audit.errors, [], 'No browser exceptions');
    assert.deepEqual(audit.requests, [], 'No external signaling, API, or WebSocket requests');
    const configs = await page.evaluate(() => window.__rtcConfigs);
    assert.ok(configs.length > 0, 'Gameplay used an actual WebRTC peer');
    assertStunOnly(configs);
  }
  console.log('PASS unchanged invitation/answer-link connection; no external signaling or WebSocket.');
}

async function closeGameIntro(pages) {
  // As in direct-links.cjs, allow the native intro/help animation to finish.
  // The room's picking message can precede the SWF's clickable close button.
  await pages[0].waitForTimeout(1000);
  const {gameClick} = require('./browser.cjs');
  for (const page of pages) await gameClick(page, 358, 82);
  for (const page of pages) {
    await page.waitForFunction(() => {
      const state = document.querySelector('ruffle-player').ruffle().callExternalInterface('pvpTestState');
      return state.slots.filter(slot => slot.visible).every(slot => slot.press);
    }, {}, {timeout: 5000});
  }
}

module.exports = {newGamePlayer, joinGame, assertTransport, closeGameIntro};
