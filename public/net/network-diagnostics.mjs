export const DIAGNOSTIC_CASES = Object.freeze([
  Object.freeze({
    id: 'no-stun',
    label: '기본 후보 · STUN 없음',
    description: '휴대폰 브라우저가 로컬 후보를 만들 수 있는지 확인합니다.',
    iceServers: Object.freeze([]),
  }),
  Object.freeze({
    id: 'cloudflare-3478',
    label: 'Cloudflare STUN · UDP 3478',
    description: '현재 게임에서 사용하는 STUN 경로입니다.',
    iceServers: Object.freeze([{urls: 'stun:stun.cloudflare.com:3478'}]),
  }),
  Object.freeze({
    id: 'cloudflare-53',
    label: 'Cloudflare STUN · UDP 53',
    description: 'Cloudflare의 대체 STUN 포트가 브라우저에서 동작하는지 확인합니다.',
    iceServers: Object.freeze([{urls: 'stun:stun.cloudflare.com:53'}]),
  }),
  Object.freeze({
    id: 'google-19302',
    label: 'Google STUN · UDP 19302',
    description: '다른 STUN 공급자에서는 외부 후보가 생성되는지 비교합니다.',
    iceServers: Object.freeze([{urls: 'stun:stun.l.google.com:19302'}]),
  }),
]);

const CANDIDATE_TYPES = new Set(['host', 'srflx', 'prflx', 'relay']);
const cleanText = (value, limit = 180) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);

export function candidateType(candidate) {
  const direct = cleanText(candidate?.type).toLowerCase();
  if (CANDIDATE_TYPES.has(direct)) return direct;
  const match = cleanText(candidate?.candidate, 2048).match(/\btyp\s+(host|srflx|prflx|relay)\b/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

function candidateProtocol(candidate) {
  const direct = cleanText(candidate?.protocol).toLowerCase();
  if (direct === 'udp' || direct === 'tcp') return direct;
  const fields = cleanText(candidate?.candidate, 2048).split(/\s+/);
  const parsed = (fields[2] || '').toLowerCase();
  return parsed === 'udp' || parsed === 'tcp' ? parsed : 'unknown';
}

export function sanitizeIceError(event) {
  const raw = cleanText(event?.url, 512);
  const match = raw.match(/^(stuns?):(.+)$/i);
  let url = '';
  if (match) {
    let target = match[2].replace(/^\/\//, '').split('?')[0];
    const at = target.lastIndexOf('@');
    if (at >= 0) target = target.slice(at + 1);
    url = `${match[1].toLowerCase()}:${cleanText(target, 160)}`;
  }
  const parsedCode = Number(event?.errorCode);
  return {
    url,
    code: Number.isFinite(parsedCode) ? parsedCode : null,
    text: cleanText(event?.errorText || event?.message || '알 수 없는 ICE 오류'),
  };
}

export function classifyResult({counts = {}, errors = [], timedOut = false} = {}) {
  if ((counts.srflx || 0) > 0) return 'reachable';
  if ((counts.relay || 0) > 0) return 'relay';
  if ((counts.host || 0) > 0) return 'host-only';
  if (errors.length > 0) return 'blocked';
  if (timedOut) return 'timeout';
  return 'no-candidate';
}

const clock = () => globalThis.performance?.now?.() ?? Date.now();

export async function runIceTest(testCase, {
  timeoutMs = 12_000,
  PeerConnection = globalThis.RTCPeerConnection,
} = {}) {
  if (typeof PeerConnection !== 'function') throw Error('이 브라우저는 WebRTC 연결 검사를 지원하지 않습니다.');

  const startedAt = clock();
  const counts = {host: 0, srflx: 0, prflx: 0, relay: 0, unknown: 0};
  const protocols = new Set();
  const errors = [];
  const states = [];
  let timedOut = false;
  let completed = false;
  let timer;
  const pc = new PeerConnection({iceServers: testCase.iceServers, iceTransportPolicy: 'all'});

  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      completed = pc.iceGatheringState === 'complete';
      const elapsedMs = Math.max(0, Math.round(clock() - startedAt));
      try { pc.close(); } catch {}
      const result = {
        id: testCase.id,
        label: testCase.label,
        counts,
        protocols: [...protocols].sort(),
        errors,
        states,
        timedOut,
        completed,
        elapsedMs,
      };
      result.status = classifyResult(result);
      resolve(result);
    };

    pc.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        if (pc.iceGatheringState === 'complete') finish();
        return;
      }
      const type = candidateType(event.candidate);
      counts[type] = (counts[type] || 0) + 1;
      protocols.add(candidateProtocol(event.candidate));
    });
    pc.addEventListener('icecandidateerror', event => errors.push(sanitizeIceError(event)));
    pc.addEventListener('icegatheringstatechange', () => {
      const state = cleanText(pc.iceGatheringState, 30) || 'unknown';
      if (states.at(-1) !== state) states.push(state);
      if (state === 'complete') finish();
    });

    timer = setTimeout(() => {
      timedOut = true;
      finish();
    }, timeoutMs);

    (async () => {
      try {
        pc.createDataChannel('network-diagnostic', {ordered: true});
        await pc.setLocalDescription(await pc.createOffer());
        const state = cleanText(pc.iceGatheringState, 30) || 'unknown';
        if (states.at(-1) !== state) states.push(state);
        if (state === 'complete') finish();
      } catch (error) {
        errors.push({url: '', code: null, text: cleanText(error?.message || error)});
        finish();
      }
    })();
  });
}

export function buildTextReport(results, metadata = {}) {
  const lines = [
    '이누야샤 PvP 모바일 WebRTC 진단',
    `시각: ${metadata.timestamp || new Date().toISOString()}`,
    `브라우저: ${cleanText(metadata.browser || '알 수 없음', 240)}`,
    `네트워크: ${cleanText(metadata.network || '알 수 없음', 80)}`,
    '',
  ];
  for (const result of results) {
    lines.push(`[${result.label}]`);
    lines.push(`판정: ${result.status}`);
    lines.push(`시간: ${result.elapsedMs}ms · 완료: ${result.completed ? '예' : '아니오'} · 시간초과: ${result.timedOut ? '예' : '아니오'}`);
    lines.push(`후보: host ${result.counts.host || 0}, srflx ${result.counts.srflx || 0}, prflx ${result.counts.prflx || 0}, relay ${result.counts.relay || 0}, unknown ${result.counts.unknown || 0}`);
    lines.push(`프로토콜: ${result.protocols.length ? result.protocols.join(', ') : '없음'}`);
    if (result.errors.length) {
      for (const error of result.errors) lines.push(`오류: ${error.url || 'ICE'} · ${error.code ?? '-'} · ${error.text}`);
    } else lines.push('오류: 없음');
    lines.push('');
  }
  lines.push('IP 주소와 포트는 수집·표시하지 않음');
  return lines.join('\n');
}
