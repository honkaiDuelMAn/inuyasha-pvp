import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomService } from './rooms.mjs';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash', '.png': 'image/png' };
export function createApp() {
  const rooms = new RoomService();
  const server = http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
    if (pathname === '/api/addresses') {
      const port = server.address()?.port;
      const addresses = Object.entries(networkInterfaces()).flatMap(([name, entries]) => entries.filter(e => e.family === 'IPv4' && !e.internal).map(e => ({ name, url: `http://${e.address}:${port}` })));
      addresses.sort((a, b) => Number(/zerotier/i.test(b.name)) - Number(/zerotier/i.test(a.name)));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(addresses)); return;
    }
    const path = resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(resolve(publicRoot) + sep)) { res.writeHead(404); res.end(); return; }
    let stat; try { stat = statSync(path); } catch { res.writeHead(404); res.end(); return; }
    if (!stat.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': pathname.startsWith('/ruffle/') ? 'public, max-age=86400' : 'no-cache' });
    if (req.method === 'HEAD') res.end(); else createReadStream(path).on('error', () => res.destroy()).pipe(res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/pvp' || wss.clients.size >= 250) { socket.destroy(); return; }
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) { socket.destroy(); return; } } catch { socket.destroy(); return; }
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', ws => {
    ws.alive = true;
    const client = { id: randomUUID(), send(event) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event)); } };
    let windowStart = Date.now(), count = 0;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', raw => {
      if (Date.now() - windowStart > 10000) { windowStart = Date.now(); count = 0; }
      if (++count > 120) { ws.close(1008, 'Too many messages'); return; }
      let message; try { message = JSON.parse(raw.toString()); } catch { client.send({ type: 'error', message: '메시지를 읽을 수 없습니다.' }); return; }
      rooms.handle(client, message);
    });
    ws.on('close', () => rooms.disconnect(client)); ws.on('error', () => {});
  });
  const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } } }, 30000);
  heartbeat.unref();
  return { server, rooms, close() { clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate(); wss.close(); server.closeAllConnections(); return new Promise(resolveClose => server.close(resolveClose)); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp(); const port = Number(process.env.PVP_PORT || 8787);
  app.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `${port} 포트를 이미 사용 중입니다. 기존 실행 창을 닫거나 다른 포트로 실행하세요.` : error.message); process.exitCode = 1; app.close(); });
  app.server.listen(port, '0.0.0.0', () => {
    console.log(`이누야샤 PvP 실행 중: http://localhost:${port}`);
    for (const [name, entries] of Object.entries(networkInterfaces())) for (const e of entries) if (e.family === 'IPv4' && !e.internal) console.log(`상대 접속 주소 (${name}): http://${e.address}:${port}`);
    console.log('이 창을 닫으면 대전 서버가 종료됩니다.');
  });
}
