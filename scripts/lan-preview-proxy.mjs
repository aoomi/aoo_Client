import http from 'node:http';
import net from 'node:net';
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const listenPort = Number(process.env.AOO_LAN_PREVIEW_PORT ?? 7462);
const slot = process.env.AOO_PREVIEW_SLOT ?? 'A';
const snapshotRoot = resolve(process.env.AOO_PREVIEW_SNAPSHOT_ROOT ?? join(process.cwd(), 'work/preview-snapshots'));
const currentLink = join(snapshotRoot, 'slots', slot, 'current');
const apiUrl = new URL(process.env.AOO_PREVIEW_API_URL ?? 'http://127.0.0.1:18660/');
const hallWsUrl = new URL(process.env.AOO_PREVIEW_HALL_WS_URL ?? 'ws://127.0.0.1:18660/api/v2/gateway/ws');
const gameWsUrl = new URL(process.env.AOO_PREVIEW_GAME_WS_URL ?? hallWsUrl.toString());
const localIssuer = new URL(process.env.AOO_PREVIEW_ISSUER_URL ?? 'http://127.0.0.1:18662/bootstrap.js');
const startedAt = new Date().toISOString();
// Bump whenever transformed entry URLs change so Chrome never reuses a failed
// immutable SystemJS request from an earlier preview-service implementation.
const transformRevision = 'r3';
const snapshotCache = new Map();
const stalePath = join(snapshotRoot, 'stale.json');
// The local Gateway allow-list predates the replacement A port (7462).  Keep
// the browser same-origin while forwarding its API/WS traffic through this
// proxy, and present one already-allowlisted local origin to the gateway.
// This is preview-only; production traffic never reaches this process.
const gatewayOrigin = process.env.AOO_PREVIEW_GATEWAY_ORIGIN ?? 'http://localhost:7456';
const gatewayUrl = new URL(process.env.AOO_PREVIEW_GATEWAY_URL ?? 'http://127.0.0.1:18660/');

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

function readStale() {
  if (!existsSync(stalePath)) return null;
  try { return JSON.parse(readFileSync(stalePath, 'utf8')); }
  catch { return { status: 'STALE', reason: 'STALE_STATE_CORRUPT' }; }
}

function requestBuildId(request) {
  const cookie = String(request.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('AOO_PREVIEW_BUILD='));
  return cookie?.slice('AOO_PREVIEW_BUILD='.length);
}

function pinHtml(html, buildId) {
  const pin = (raw) => `/__aoo/build/${buildId}/${transformRevision}${raw}`;
  return html
    // Snapshot ports are Creator preview origins. The client transport checks
    // this marker before allowing their same-host HTTP test gateway.
    .replace(/<head(\s[^>]*)?>/i, (tag) => `${tag}<script>Object.defineProperty(window, '__aoo_CREATOR_LAN_PREVIEW__', { value: true });globalThis.__aoo_RUNTIME_CONFIG__={environment:"test",apiBaseUrl:location.origin+"/"};</script>`)
    .replace(/location\.origin === ['"]http:\/\/localhost:7456['"]/g, 'true')
    .replace(/window\.__aoo_LOCAL_PREVIEW_OPT_IN__\s*=\s*true\s*&&\s*location\.hostname\s*===\s*['"]localhost['"]/g, 'window.__aoo_LOCAL_PREVIEW_OPT_IN__ = true')
    .replace('http://127.0.0.1:18662/bootstrap.js', '/__aoo/local-preview-bootstrap.js')
    .replace(/\b(src|href)=(['"])(\/(?!\/)[^'"]+)\2/g, (_match, attribute, quote, value) => `${attribute}=${quote}${pin(value)}${quote}`)
    .replace(`${pin('/__aoo/local-preview-bootstrap.js')}`, '/__aoo/local-preview-bootstrap.js')
    .replace("'/scripting/x/resolution-detail-map.json'", `'${pin('/scripting/x/resolution-detail-map.json')}'`)
    .replace('"/scripting/x/resolution-detail-map.json"', `"${pin('/scripting/x/resolution-detail-map.json')}"`)
    .replace('System.import("/preview-app/index.js")', `System.import("${pin('/preview-app/index.js')}")`);
}

function isGatewayPath(pathname) {
  // Fixed preview ports are an origin-preserving edge for the local Gateway.
  // Every authenticated client API must cross that edge; otherwise a newly
  // mounted lobby capability (for example gifts/social/support) is mistaken
  // for a static snapshot asset and returns STATIC_RESOURCE_NOT_IN_BUILD.
  return pathname.startsWith('/api/v2/');
}

function gatewayHeaders(request) {
  const headers = { ...request.headers };
  headers.host = gatewayUrl.host;
  headers.origin = gatewayOrigin;
  delete headers.connection;
  delete headers['content-length'];
  return headers;
}

async function forwardGatewayHttp(request, response, requestUrl) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const upstream = await fetch(new URL(`${requestUrl.pathname}${requestUrl.search}`, gatewayUrl), {
    method: request.method,
    headers: gatewayHeaders(request),
    body: ['GET', 'HEAD'].includes(request.method ?? 'GET') ? undefined : body,
    redirect: 'manual',
  });
  const payload = Buffer.from(await upstream.arrayBuffer());
  const headers = {};
  upstream.headers.forEach((value, key) => {
    if (!['connection', 'keep-alive', 'transfer-encoding'].includes(key.toLowerCase())) headers[key] = value;
  });
  headers['content-length'] = payload.length;
  response.writeHead(upstream.status, headers);
  response.end(payload);
}

function forwardGatewayUpgrade(request, socket, head) {
  const target = {
    hostname: gatewayUrl.hostname,
    port: Number(gatewayUrl.port || 80),
    path: request.url,
    method: 'GET',
    headers: { ...gatewayHeaders(request), connection: 'Upgrade', upgrade: 'websocket' },
  };
  const proxy = http.request(target);
  proxy.once('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    const statusLine = `HTTP/1.1 ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage ?? ''}`.trimEnd();
    const lines = [statusLine];
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (Array.isArray(value)) for (const item of value) lines.push(`${name}: ${item}`);
      else if (value !== undefined) lines.push(`${name}: ${value}`);
    }
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    socket.pipe(upstreamSocket);
    upstreamSocket.pipe(socket);
  });
  proxy.once('response', () => socket.destroy());
  proxy.once('error', () => socket.destroy());
  proxy.end();
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
  const stale = readStale();
  const [api, hallWs, gameWs] = await Promise.all([tcpProbe(apiUrl), tcpProbe(hallWsUrl), tcpProbe(gameWsUrl)]);
  return {
    ok: Boolean(active) && !stale && api.ok && hallWs.ok && gameWs.ok,
    status: stale ? 'STALE' : (active ? 'READY' : 'NO_SNAPSHOT'),
    slot, port: listenPort, pid: process.pid, startedAt,
    buildId: active?.manifest.buildId ?? null,
    sourceSignature: active?.manifest.sourceSignature ?? null,
    stale,
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
  if (url.pathname === '/__aoo/local-preview-bootstrap.js') {
    const issuer = http.request({
      hostname: localIssuer.hostname,
      port: Number(localIssuer.port || 80),
      method: 'GET',
      path: localIssuer.pathname,
      headers: { host: localIssuer.host, accept: request.headers.accept ?? '*/*', referer: 'http://localhost:7456/', origin: 'http://localhost:7456', 'sec-fetch-dest': 'script', 'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'cross-site' },
    }, (issuerResponse) => {
      const chunks = [];
      issuerResponse.on('data', (chunk) => chunks.push(chunk));
      issuerResponse.on('end', () => {
        let body = Buffer.concat(chunks);
        if ((issuerResponse.headers['content-type'] ?? '').includes('javascript')) body = Buffer.from(body.toString('utf8').replace('http://localhost:18660/', `http://${request.headers.host}/`));
        response.writeHead(issuerResponse.statusCode ?? 502, { ...issuerResponse.headers, 'content-length': body.length });
        response.end(body);
      });
    });
    issuer.on('error', (error) => { response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }); response.end(error.message); });
    issuer.end();
    return;
  }
  if (url.pathname === '/__aoo/health') {
    sendJson(response, 200, await health());
    return;
  }
  const stale = readStale();
  if (stale) {
    sendJson(response, 503, {
      code: 'PREVIEW_SNAPSHOT_STALE',
      message: '预览快照正在重新发布，旧快照已被禁止提供',
      slot, port: listenPort, stale,
    });
    return;
  }
  if (isGatewayPath(url.pathname)) {
    try {
      await forwardGatewayHttp(request, response, url);
    } catch (error) {
      sendJson(response, 502, { code: 'PREVIEW_GATEWAY_UNAVAILABLE', message: String(error?.message ?? error), slot, port: listenPort });
    }
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
  const currentBuildId = active.manifest.buildId;
  if (explicitBuildId && explicitBuildId !== currentBuildId) {
    sendJson(response, 410, {
      code: 'PREVIEW_BUILD_EXPIRED',
      message: '请求的预览构建已过期，请重新加载当前入口',
      slot, port: listenPort, requestedBuildId: explicitBuildId, currentBuildId,
    });
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

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://snapshot.invalid');
  if (readStale() || !isGatewayPath(url.pathname) || !url.pathname.startsWith('/api/v2/gateway/')) {
    socket.destroy();
    return;
  }
  forwardGatewayUpgrade(request, socket, head);
});

server.listen(listenPort, '0.0.0.0', () => {
  console.log(JSON.stringify({ module: 'PreviewSnapshotServer', event: 'started', slot, port: listenPort, pid: process.pid, snapshotRoot }));
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
