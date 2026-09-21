import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { extname, resolve, sep } from 'node:path';

const port = Number(process.env.AOO_STATIC_PORT);
const slot = process.env.AOO_STATIC_SLOT ?? 'unknown';
const root = resolve(process.env.AOO_STATIC_BUILD_ROOT ?? 'work/fw004-static-build-final4/web-mobile');
const apiUrl = new URL(process.env.AOO_STATIC_API_URL ?? 'http://127.0.0.1:8080/');
const hallWsUrl = new URL(process.env.AOO_STATIC_HALL_WS_URL ?? 'ws://127.0.0.1:8080/api/v2/gateway/ws');
const gameWsUrl = new URL(process.env.AOO_STATIC_GAME_WS_URL ?? hallWsUrl.toString());
const startedAt = new Date().toISOString();

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AOO_STATIC_PORT is invalid');
for (const file of ['index.html', 'src/settings.json']) {
  if (!existsSync(resolve(root, file))) throw new Error(`[StaticBuildServer] missing ${file} in ${root}`);
}

// The identifier is a content fingerprint, so every business bundle whose
// behavior is under fixed-port verification must participate. Omitting the PDK
// bundle made final4 and final5 collide even though gameplay code had changed.
const BUILD_ID_FILES = [
  'index.html',
  'src/settings.json',
  'bundle-script-bootstrap.js',
  'assets/common/index.js',
  'assets/paodekuai-common/index.js',
  'assets/main/config.json',
  'assets/main/import/8d/8d2a710a-63f6-4186-a17f-81339a64ef2c.json',
];
const buildDigest = createHash('sha256');
for (const file of BUILD_ID_FILES) buildDigest.update(readFileSync(resolve(root, file)));
const buildId = buildDigest.digest('hex').slice(0, 20);

const mime = new Map([
  ['.bin', 'application/octet-stream'], ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'], ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp3', 'audio/mpeg'], ['.ogg', 'audio/ogg'], ['.png', 'image/png'],
  ['.ttf', 'font/ttf'], ['.wasm', 'application/wasm'], ['.webp', 'image/webp'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'],
]);

function probe(url, timeoutMs = 800) {
  return new Promise((done) => {
    const targetPort = Number(url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80));
    const socket = net.connect(targetPort, url.hostname);
    const started = Date.now();
    let settled = false;
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      done({ ok, target: `${url.hostname}:${targetPort}`, latencyMs: Date.now() - started, ...(error ? { error } : {}) });
    };
    socket.setTimeout(timeoutMs, () => finish(false, 'timeout'));
    socket.once('connect', () => finish(true));
    socket.once('error', (error) => finish(false, error.code ?? error.message));
  });
}

function json(response, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': encoded.length,
    'cache-control': 'no-store',
    'access-control-allow-origin': 'http://127.0.0.1:7460',
  });
  response.end(encoded);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://static.invalid');
  if (url.pathname === '/__aoo/health') {
    const [api, hallWs, gameWs] = await Promise.all([probe(apiUrl), probe(hallWsUrl), probe(gameWsUrl)]);
    json(response, 200, {
      ok: api.ok && hallWs.ok && gameWs.ok,
      mode: 'static-build', slot, port, pid: process.pid, startedAt, buildId, root,
      staticResources: { ok: true }, api, hallWs, gameWs,
    });
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { json(response, 400, { code: 'INVALID_PATH' }); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = resolve(root, relative);
  if (!(file === root || file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) {
    json(response, 404, { code: 'STATIC_RESOURCE_NOT_FOUND', path: pathname, buildId });
    return;
  }
  const extension = extname(file).toLowerCase();
  response.writeHead(200, {
    'content-type': mime.get(extension) ?? 'application/octet-stream',
    'content-length': statSync(file).size,
    // Build output reuses stable file names, so long-lived browser caching can mix
    // assets from different builds on the fixed FW-003 origins.
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    'x-aoo-build-id': buildId,
    'x-aoo-preview-slot': slot,
    'x-content-type-options': 'nosniff',
  });
  if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ module: 'StaticBuildServer', event: 'started', slot, port, pid: process.pid, buildId, root }));
});
server.on('error', (error) => {
  console.error(JSON.stringify({ module: 'StaticBuildServer', event: 'listen-failed', slot, port, error: error.message }));
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
