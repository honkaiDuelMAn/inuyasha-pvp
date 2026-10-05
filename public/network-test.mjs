import {DIAGNOSTIC_CASES, buildTextReport, runIceTest} from './net/network-diagnostics.mjs';

const $ = id => document.getElementById(id);
const statusLabels = {
  waiting: '대기',
  running: '검사 중',
  reachable: 'srflx 생성',
  'host-only': 'host만 생성',
  blocked: '오류 발생',
  timeout: '시간 초과',
  'no-candidate': '후보 없음',
  relay: 'relay 감지',
};
let running = false;
let latestReport = '';

function connectionMetadata() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const parts = [];
  if (connection?.type) parts.push(connection.type);
  if (connection?.effectiveType) parts.push(connection.effectiveType);
  if (Number.isFinite(connection?.rtt)) parts.push(`RTT ${connection.rtt}ms`);
  if (Number.isFinite(connection?.downlink)) parts.push(`다운링크 ${connection.downlink}Mbps`);
  return {
    timestamp: new Date().toISOString(),
    browser: navigator.userAgent,
    network: parts.join(' · ') || '브라우저가 네트워크 종류를 제공하지 않음',
  };
}

function makeMetric(label, value) {
  const box = document.createElement('div');
  box.className = 'metric';
  const name = document.createElement('span');
  name.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  box.append(name, strong);
  return box;
}

function createCard(testCase) {
  const card = document.createElement('article');
  card.className = 'test-card';
  card.dataset.id = testCase.id;
  card.dataset.state = 'waiting';

  const head = document.createElement('div');
  head.className = 'card-head';
  const title = document.createElement('h2');
  title.textContent = testCase.label;
  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = statusLabels.waiting;
  head.append(title, status);

  const description = document.createElement('p');
  description.className = 'description';
  description.textContent = testCase.description;

  const metrics = document.createElement('div');
  metrics.className = 'metrics';
  metrics.append(
    makeMetric('후보', '-'),
    makeMetric('수집 시간', '-'),
    makeMetric('완료 신호', '-'),
    makeMetric('오류', '-'),
  );
  card.append(head, description, metrics);
  return card;
}

function resetCards() {
  const container = $('results');
  container.replaceChildren(...DIAGNOSTIC_CASES.map(createCard));
}

function cardFor(id) {
  return [...document.querySelectorAll('.test-card')].find(card => card.dataset.id === id);
}

function setRunning(testCase) {
  const card = cardFor(testCase.id);
  card.dataset.state = 'running';
  card.querySelector('.status').textContent = statusLabels.running;
  const values = card.querySelectorAll('.metric strong');
  values[0].textContent = '수집 중';
  values[1].textContent = '최대 12초';
  values[2].textContent = '대기 중';
  values[3].textContent = '대기 중';
}

function renderResult(result) {
  const card = cardFor(result.id);
  card.dataset.state = result.status;
  card.querySelector('.status').textContent = statusLabels[result.status] || result.status;
  const values = card.querySelectorAll('.metric strong');
  values[0].textContent = `host ${result.counts.host || 0} · srflx ${result.counts.srflx || 0} · relay ${result.counts.relay || 0}`;
  values[1].textContent = `${result.elapsedMs}ms`;
  values[2].textContent = result.completed ? 'complete' : result.timedOut ? '미도착' : '종료';
  values[3].textContent = result.errors.length ? `${result.errors.length}건` : '없음';

  card.querySelector('.error-list')?.remove();
  if (result.errors.length) {
    const list = document.createElement('ul');
    list.className = 'error-list';
    for (const error of result.errors) {
      const item = document.createElement('li');
      item.textContent = `${error.url || 'ICE'} · ${error.code ?? '-'} · ${error.text}`;
      list.append(item);
    }
    card.append(list);
  }
}

function failedResult(testCase, error) {
  return {
    id: testCase.id,
    label: testCase.label,
    counts: {host: 0, srflx: 0, prflx: 0, relay: 0, unknown: 0},
    protocols: [],
    errors: [{url: '', code: null, text: String(error?.message || error)}],
    states: [],
    timedOut: false,
    completed: false,
    elapsedMs: 0,
    status: 'blocked',
  };
}

function summarize(results) {
  const byId = new Map(results.map(result => [result.id, result]));
  const current = byId.get('cloudflare-3478');
  const alternate = byId.get('cloudflare-53');
  const google = byId.get('google-19302');
  const baseline = byId.get('no-stun');
  const hasSrflx = result => (result?.counts?.srflx || 0) > 0;

  if (hasSrflx(current) && !current.completed) return {
    tone: 'warn',
    text: '현재 게임의 Cloudflare STUN에서 외부 후보(srflx)는 만들어졌지만 ICE complete 신호가 12초 안에 오지 않았습니다. 링크 생성이 complete만 기다리는 방식이 모바일 실패의 핵심 원인일 가능성이 높습니다.',
  };
  if (hasSrflx(current)) return {
    tone: 'good',
    text: '현재 게임의 Cloudflare UDP 3478 경로에서 외부 후보(srflx)가 정상 생성됐습니다. 이 검사 결과를 복사해 보내 주세요. 게임에서만 30초 시간 초과가 난 원인을 다음 단계에서 비교할 수 있습니다.',
  };
  if (hasSrflx(alternate)) return {
    tone: 'warn',
    text: 'Cloudflare UDP 3478은 실패했지만 UDP 53에서는 외부 후보가 생성됐습니다. 현재 5G 회선이 3478 포트를 제한하는 정황입니다.',
  };
  if (hasSrflx(google)) return {
    tone: 'warn',
    text: 'Cloudflare 경로에서는 외부 후보가 없지만 Google STUN에서는 srflx가 생성됐습니다. 현재 게임에 보조 STUN을 추가하면 모바일 방 만들기가 개선될 가능성이 높습니다.',
  };
  if ((baseline?.counts?.host || 0) > 0) return {
    tone: 'bad',
    text: '브라우저의 기본 host 후보는 생성됐지만 시험한 모든 STUN에서 외부 후보(srflx)를 만들지 못했습니다. 5G 회선 또는 브라우저가 STUN UDP 경로를 제한하는 상태일 수 있습니다.',
  };
  return {
    tone: 'bad',
    text: '기본 host 후보까지 생성되지 않았습니다. 브라우저의 WebRTC 권한·보안 설정 또는 네트워크 기능 자체를 추가로 확인해야 합니다.',
  };
}

async function runDiagnostic() {
  if (running) return;
  running = true;
  latestReport = '';
  $('start').disabled = true;
  $('copy').disabled = true;
  $('start').textContent = '진단 중…';
  $('summary').hidden = true;
  $('reportPanel').hidden = true;
  resetCards();

  const metadata = connectionMetadata();
  $('connectionInfo').textContent = `감지된 네트워크: ${metadata.network}`;

  const results = await Promise.all(DIAGNOSTIC_CASES.map(async testCase => {
    setRunning(testCase);
    try {
      const result = await runIceTest(testCase, {timeoutMs: 12_000});
      renderResult(result);
      return result;
    } catch (error) {
      const result = failedResult(testCase, error);
      renderResult(result);
      return result;
    }
  }));

  const summary = summarize(results);
  $('summary').className = `panel summary-${summary.tone}`;
  $('summaryText').textContent = summary.text;
  $('summary').hidden = false;

  latestReport = buildTextReport(results, metadata);
  $('report').value = latestReport;
  $('reportPanel').hidden = false;
  $('copy').disabled = false;
  $('start').disabled = false;
  $('start').textContent = '다시 검사';
  running = false;
}

async function copyReport() {
  if (!latestReport) return;
  try {
    await navigator.clipboard.writeText(latestReport);
    $('copy').textContent = '복사 완료';
  } catch {
    const report = $('report');
    report.focus();
    report.select();
    document.execCommand('copy');
    $('copy').textContent = '선택됨 · 복사하세요';
  }
  setTimeout(() => { $('copy').textContent = '결과 복사'; }, 1800);
}

$('start').addEventListener('click', runDiagnostic);
$('copy').addEventListener('click', copyReport);
resetCards();
$('connectionInfo').textContent = '진단 시작을 누르면 네 가지 경로를 동시에 검사합니다.';
