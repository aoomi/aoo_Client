import http from 'node:http';
import net from 'node:net';
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const listenPort = Number(process.env.AOO_LAN_PREVIEW_PORT ?? 7458);
const slot = process.env.AOO_PREVIEW_SLOT ?? 'A';
const snapshotRoot = resolve(process.env.AOO_PREVIEW_SNAPSHOT_ROOT ?? join(process.cwd(), 'work/preview-snapshots'));
const currentLink = join(snapshotRoot, 'slots', slot, 'current');
const apiUrl = new URL(process.env.AOO_PREVIEW_API_URL ?? 'http://127.0.0.1:8080/');
const hallWsUrl = new URL(process.env.AOO_PREVIEW_HALL_WS_URL ?? 'ws://127.0.0.1:8080/api/v2/gateway/ws');
const gameWsUrl = new URL(process.env.AOO_PREVIEW_GAME_WS_URL ?? hallWsUrl.toString());
const startedAt = new Date().toISOString();
// Bump whenever transformed entry URLs change so Chrome never reuses a failed
// immutable SystemJS request from an earlier preview-service implementation.
const transformRevision = 'r3';
const snapshotCache = new Map();

const MIME = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'], ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.png', 'image/png'],
  ['.wasm', 'application/wasm'], ['.webp', 'image/webp'], ['.woff2', 'font/woff2'],
]);

function loadSnapshot(buildId) {
  const source = buildId && /^[a-f0-9]{20}$/.test(buildId) ? join(snapshotRoot, 'snapshots', buildId) : currentLink;
  if (!existsSync(source)) return undefined;
  const directory = realpathSync(source);
  const cached = snapshotCache.get(directory);
  if (cached) return cached;
  const manifestPath = join(directory, 'manifest.json');
  if (!existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const snapshot = {
    directory,
    manifest,
    entriesByKey: new Map(manifest.entries.map((entry) => [entry.key, entry])),
  };
  // Snapshot directories are immutable and addressed by buildId. Keeping the
  // parsed manifest and its key index in memory prevents four concurrent Cocos
  // clients from synchronously parsing thousands of entries for every asset.
  snapshotCache.set(directory, snapshot);
  return snapshot;
}

function activeSnapshot() { return loadSnapshot(); }

function requestBuildId(request) {
  const cookie = String(request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('AOO_PREVIEW_BUILD='));
  return cookie?.slice('AOO_PREVIEW_BUILD='.length);
}

function pinHtml(html, buildId) {
  const pin = (raw) => `/__aoo/build/${buildId}/${transformRevision}${raw}`;
  return html
    .replace(/\b(src|href)=(['"])(\/(?!\/)[^'"]+)\2/g, (_match, attribute, quote, value) => `${attribute}=${quote}${pin(value)}${quote}`)
    .replace("'/scripting/x/resolution-detail-map.json'", `'${pin('/scripting/x/resolution-detail-map.json')}'`)
    .replace('"/scripting/x/resolution-detail-map.json"', `"${pin('/scripting/x/resolution-detail-map.json')}"`)
    .replace('System.import("/preview-app/index.js")', `System.import("${pin('/preview-app/index.js')}")`);
}

function pinImportMap(source, buildId) {
  const pin = (value) => `/__aoo/build/${buildId}${value}`;
  const parsed = JSON.parse(source);
  const visit = (value) => {
    if (typeof value === 'string') return value.startsWith('/') ? pin(value) : value;
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) value[key] = visit(child);
    return value;
  };
  return JSON.stringify(visit(parsed));
}

function tcpProbe(url, timeoutMs = 800) {
  return new Promise((done) => {
    const started = Date.now();
    const targetPort = Number(url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80));
    const socket = net.connect(targetPort, url.hostname);
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

async function health() {
  const active = activeSnapshot();
  const [api, hallWs, gameWs] = await Promise.all([tcpProbe(apiUrl), tcpProbe(hallWsUrl), tcpProbe(gameWsUrl)]);
  return {
    ok: Boolean(active) && api.ok && hallWs.ok && gameWs.ok,
    slot, port: listenPort, pid: process.pid, startedAt,
    buildId: active?.manifest.buildId ?? null,
    transformRevision,
    snapshot: active?.directory ?? null,
    upstream: active?.manifest.upstream ?? null,
    staticResources: active ? { ok: true, entries: active.manifest.entries.length, bytes: active.manifest.bytes } : { ok: false, error: 'NO_ACTIVE_SNAPSHOT' },
    api, hallWs, gameWs,
    lastSuccess: active?.manifest.createdAt ?? null,
    error: active ? null : 'NO_ACTIVE_SNAPSHOT',
  };
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': 'http://127.0.0.1:7460',
    'vary': 'origin',
  });
  response.end(JSON.stringify(value));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://snapshot.invalid');
  if (url.pathname === '/__aoo/health') {
    sendJson(response, 200, await health());
    return;
  }
  // Root navigation advances this browser origin to current. Every subordinate
  // request remains pinned by cookie even if current changes mid-load.
  const versioned = url.pathname.match(/^\/__aoo\/build\/([a-f0-9]{20})(?:\/r\d+)?(\/.*)$/);
  const explicitBuildId = versioned?.[1] ?? url.searchParams.get('aooBuild');
  const active = url.pathname === '/' && !explicitBuildId
    ? activeSnapshot()
    : (loadSnapshot(explicitBuildId ?? requestBuildId(request)) ?? activeSnapshot());
  if (!active) {
    sendJson(response, 503, { code: 'STATIC_SNAPSHOT_UNAVAILABLE', message: '客户端静态快照尚未就绪，不是 API/Hall/Game 网络错误', slot, port: listenPort });
    return;
  }
  const resourceUrl = new URL(url);
  if (resourceUrl.searchParams.has('aooBuild')) resourceUrl.searchParams.delete('aooBuild');
  if (versioned) resourceUrl.pathname = versioned[2];
  const key = `${resourceUrl.pathname}${resourceUrl.search}`;
  const entry = active.entriesByKey.get(key) ?? active.entriesByKey.get(url.pathname);
  if (!entry) {
    sendJson(response, 404, { code: 'STATIC_RESOURCE_NOT_IN_BUILD', buildId: active.manifest.buildId, path: url.pathname });
    return;
  }
  const file = resolve(active.directory, 'objects', entry.object);
  const objectRoot = resolve(active.directory, 'objects') + sep;
  if (!file.startsWith(objectRoot) || !existsSync(file) || !statSync(file).isFile()) {
    sendJson(response, 500, { code: 'STATIC_SNAPSHOT_CORRUPT', buildId: active.manifest.buildId, path: url.pathname });
    return;
  }
  const resourceExtension = extname(url.pathname);
  const isHtml = url.pathname === '/' || resourceExtension === '.html';
  const isImportMap = url.pathname.includes('import-map');
  let transformedBody;
  if (isHtml) transformedBody = Buffer.from(pinHtml(readFileSync(file, 'utf8'), active.manifest.buildId));
  else if (isImportMap) transformedBody = Buffer.from(pinImportMap(readFileSync(file, 'utf8'), active.manifest.buildId));
  response.writeHead(entry.status ?? 200, {
    'content-type': isHtml ? 'text/html; charset=utf-8' : (MIME.get(resourceExtension) ?? entry.contentType ?? 'application/octet-stream'),
    'content-length': transformedBody?.length ?? entry.bytes,
    'cache-control': isHtml ? 'no-store, no-cache, must-revalidate, max-age=0' : 'public, max-age=31536000, immutable',
    'x-aoo-build-id': active.manifest.buildId,
    'x-aoo-preview-slot': slot,
    'x-content-type-options': 'nosniff',
    ...(isHtml ? { 'set-cookie': `AOO_PREVIEW_BUILD=${active.manifest.buildId}; Path=/; SameSite=Strict` } : {}),
  });
  if (request.method === 'HEAD') response.end();
  else if (transformedBody) response.end(transformedBody);
  else createReadStream(file).pipe(response);
});

server.on('error', (error) => {
  console.error(JSON.stringify({ module: 'PreviewSnapshotServer', event: 'listen-failed', slot, port: listenPort, error: error.message }));
  process.exitCode = 1;
});

server.listen(listenPort, '0.0.0.0', () => {
  console.log(JSON.stringify({ module: 'PreviewSnapshotServer', event: 'started', slot, port: listenPort, pid: process.pid, snapshotRoot }));
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
