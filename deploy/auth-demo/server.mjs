// Isolated disposable world + same-origin static demo. Never points at live data.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { startExpanse } from '../../server/src/expanse/server.js';

export async function startDemo({ port = 8790, dataDir, tickMs = 1000 } = {}) {
  const dir = dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'stratoks-visitor-demo-'));
  // Binding frontend first lets automated tests use an OS-assigned port.
  const frontend = http.createServer(); frontend.listen(port, '127.0.0.1'); await once(frontend, 'listening');
  const origin = `http://127.0.0.1:${frontend.address().port}`;
  const backend = startExpanse({ dataDir: dir, seed: 9191, initialCount: 12, port: 0, tickMs,
    auth: { uri: origin + '/', localDemo: true } });
  await once(backend.server, 'listening');
  const staticFiles = new Map([
    ['/', [new URL('./index.html', import.meta.url), 'text/html']],
    ['/demo.js', [new URL('./demo.js', import.meta.url), 'text/javascript']],
    ['/shared/visitor-auth-client.js', [new URL('../../shared/visitor-auth-client.js', import.meta.url), 'text/javascript']],
    ['/shared/visitor-challenge.js', [new URL('../../shared/visitor-challenge.js', import.meta.url), 'text/javascript']],
  ]);
  frontend.on('request', (req, res) => {
    if (req.url.startsWith('/api/') || req.url === '/healthz') {
      const proxy = http.request({ host: '127.0.0.1', port: backend.server.address().port, path: req.url, method: req.method, headers: req.headers }, (reply) => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
      proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.pipe(proxy); return;
    }
    const file = staticFiles.get(req.url);
    if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': `${file[1]}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    let content = fs.readFileSync(file[0]);
    if (req.url === '/') content = content.toString().replace('name="stratoks-demo-backend" content=""', 'name="stratoks-demo-backend" content="same-origin-isolated"');
    res.end(req.method === 'HEAD' ? undefined : content);
  });
  return { origin, backend, frontend, dataDir: dir, async stop() { await new Promise((resolve) => frontend.close(resolve)); await backend.stop(); if (!dataDir) fs.rmSync(dir, { recursive: true, force: true }); } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = await startDemo({ port: Number(process.argv[2] ?? 8790), dataDir: process.argv[3] });
  console.log(`Isolated visitor authentication demo: ${demo.origin} (not the live world)`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => demo.stop().then(() => process.exit(0)));
}
