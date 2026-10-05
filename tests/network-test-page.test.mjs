import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const htmlPath = new URL('../public/network-test.html', import.meta.url);
const scriptPath = new URL('../public/network-test.mjs', import.meta.url);

test('mobile network diagnostic page is self-hosted and does not configure TURN', async () => {
  const [html, script] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readFile(scriptPath, 'utf8'),
  ]);

  assert.match(html, /모바일 WebRTC 진단/);
  assert.match(html, /network-test\.mjs/);
  assert.match(html, /IP 주소와 포트는 수집하거나 표시하지 않습니다/);
  assert.doesNotMatch(html + script, /https?:\/\//i,
    'the temporary diagnostic page must not load external web assets');
  assert.doesNotMatch(html + script, /turns?:/i,
    'the diagnostic page must not configure TURN relay traffic');
  assert.match(script, /Promise\.all/,
    'all reachability probes should run together so mobile users do not wait a minute');
});
