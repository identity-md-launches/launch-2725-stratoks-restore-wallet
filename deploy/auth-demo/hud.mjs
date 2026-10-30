// Owner-run isolated HUD demonstration. Serves the production export and a disposable Expanse.
// Does not use or accept a production world directory.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { startExpanse } from '../../server/src/expanse/server.js';

const root = path.resolve(fileURLToPath(new URL('../../dist/', import.meta.url)));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gz': 'application/gzip', '.woff2': 'font/woff2' };
export async function startHudDemo({ port = 8791, tickMs = 1000, auth = {}, authEnabled = true } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stratoks-hud-demo-'));
  const frontend = http.createServer();
  frontend.listen(port, '127.0.0.1'); await once(frontend, 'listening');
  const origin = `http://127.0.0.1:${frontend.address().port}`;
  const settings = { dataDir, seed: 9191, initialCount: 12, port: 0, tickMs,
    auth: authEnabled ? { ...auth, uri: origin + '/', localDemo: true } : null };
  let backend = startExpanse(settings); await once(backend.server, 'listening');
  frontend.on('request', (req, res) => {
    let url;
    try { url = new URL(req.url, origin); } catch { res.writeHead(400); res.end(); return; }
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
      const proxy = http.request({ host: '127.0.0.1', port: backend.server.address().port, path: req.url, method: req.method, headers: req.headers }, (reply) => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
      proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(proxy); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/') { res.writeHead(302, { location: '/preview/' }); res.end(); return; }
    res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    if (url.pathname === '/preview/expanse-config.json') {
      res.setHeader('content-type', 'application/json');
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ httpUrl: origin, legacyAvailable: false, startMode: 'live', isolatedAuthDemo: true })); return;
    }
    let file;
    try { file = path.resolve(root, decodeURIComponent(url.pathname.slice('/preview/'.length)) || 'index.html'); }
    catch { res.writeHead(400); res.end(); return; }
    if (!url.pathname.startsWith('/preview/') || !file.startsWith(root + path.sep)) { res.writeHead(404); res.end(); return; }
    try {
      const content = fs.readFileSync(file);
      res.setHeader('content-type', mime[path.extname(file)] ?? 'application/octet-stream');
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404); res.end(); }
  });
  return { origin, frontend, get backend() { return backend; },
    async restart() { await backend.stop(); backend = startExpanse(settings); await once(backend.server, 'listening'); },
    async stop() { await new Promise((r) => frontend.close(r)); await backend.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = await startHudDemo({ port: Number(process.argv[2] ?? 8791) });
  console.log(`Isolated STRATOKS HUD and real visitor-auth backend: ${demo.origin}/preview/`);
  console.log('Disposable world. No production data. Graceful shutdown removes demo data.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => demo.stop().then(() => process.exit(0)));
}
