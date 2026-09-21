import http from 'node:http';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(process.env.AOO_PREVIEW_SNAPSHOT_ROOT ?? join(process.cwd(), 'work/preview-snapshots'));
const upstream = new URL(process.env.AOO_CREATOR_PREVIEW_URL ?? 'http://127.0.0.1:7456/');
const slots = (process.env.AOO_PREVIEW_SLOTS ?? 'A:7458,B:7459,C:5188,D:7461').split(',').map((pair) => {
  const [name, port] = pair.split(':');
  return { name, port: Number(port) };
});
const chrome = process.env.AOO_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const command = process.argv[2] ?? 'capture';
const captureMs = Number(process.env.AOO_PREVIEW_CAPTURE_MS ?? 30000);
const requestMap = new Map();
const projectBundleNames = new Set();
let captureServer;
const captureBuildId = '00000000000000000000';
const snapshotValidationRevision = 'fw008-v2';
const assetUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@[0-9a-f]+)?$/i;

function pinCaptureHtml(html) {
  const pin = (raw) => `/__aoo/build/${captureBuildId}/r2${raw}`;
  return html
    // The sealed candidate is served from an ephemeral loopback port that is
    // intentionally outside the product's fixed preview-port allowlist. Give
    // this validation page the same explicit test gateway as A/B/C/D without
    // relaxing production endpoint policy or persisting the injection.
    .replace('<head>', '<head><script>globalThis.__aoo_RUNTIME_CONFIG__={environment:"test",apiBaseUrl:location.origin+"/"};</script>')
    .replace(/\b(src|href)=(['"])(\/(?!\/)[^'"]+)\2/g, (_match, attribute, quote, value) => `${attribute}=${quote}${pin(value)}${quote}`)
    .replace("'/scripting/x/resolution-detail-map.json'", `'${pin('/scripting/x/resolution-detail-map.json')}'`)
    .replace('"/scripting/x/resolution-detail-map.json"', `"${pin('/scripting/x/resolution-detail-map.json')}"`)
    .replace('System.import("/preview-app/index.js")', `System.import("${pin('/preview-app/index.js')}")`);
}

function pinCaptureImportMap(source) {
  const pin = (value) => `/__aoo/build/${captureBuildId}/r2${value}`;
  const visit = (value) => {
    if (typeof value === 'string') return value.startsWith('/') ? pin(value) : value;
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) value[key] = visit(child);
    return value;
  };
  return JSON.stringify(visit(JSON.parse(source)));
}

function log(event, detail = {}) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), module: 'PreviewSnapshotManager', event, ...detail })}\n`);
}

function requestUpstream(url) {
  return new Promise((done, reject) => {
    const target = new URL(url, upstream);
    const request = http.request(target, { headers: { accept: '*/*', 'user-agent': 'AooPreviewSnapshot/1' } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => done({ status: response.statusCode ?? 502, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.setTimeout(10000, () => request.destroy(new Error(`upstream timeout: ${target.pathname}`)));
    request.on('error', reject);
    request.end();
  });
}

function record(key, result) {
  if (result.status >= 200 && result.status < 400) requestMap.set(key, result);
}

async function crawlKey(key, required = true) {
  if (requestMap.has(key)) return;
  const result = await requestUpstream(key);
  record(key, result);
  if (result.status < 200 || result.status >= 400) {
    if (required) throw new Error(`snapshot seed ${key} returned HTTP ${result.status}`);
    return;
  }
  const type = String(result.headers['content-type'] ?? '');
  const text = result.body.toString('utf8');
  const discovered = new Set();
  if (type.includes('html')) {
    for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) discovered.add(match[1]);
  }
  if (type.includes('json')) {
    try {
      const parsed = JSON.parse(text);
      const visit = (value) => {
        if (typeof value === 'string' && (value.startsWith('/') || value.startsWith('./') || value.startsWith('../'))) discovered.add(value);
        else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
      };
      visit(parsed);
      const assetMatch = new URL(key, upstream).pathname.match(/^\/assets\/([^/]+)\/import\/[^/]+\/([^/]+)\.json$/);
      if (assetMatch) {
        const dependencies = new Set();
        const findDependencies = (value) => {
          if (typeof value === 'string') {
            if (assetUuidPattern.test(value)) dependencies.add(value);
          }
          else if (Array.isArray(value)) value.forEach(findDependencies);
          else if (value && typeof value === 'object') {
            if (typeof value.__uuid__ === 'string') dependencies.add(value.__uuid__);
            Object.values(value).forEach(findDependencies);
          }
        };
        findDependencies(parsed);
        for (const uuid of dependencies) await crawlAsset(assetMatch[1], uuid);
      }
    } catch { /* JavaScript-shaped JSON is captured by the browser pass. */ }
  }
  if (type.includes('javascript') || new URL(key, upstream).pathname.endsWith('.js')) {
    for (const match of text.matchAll(/System\.register\((\[[^\]]*\])/g)) {
      try {
        for (const dependency of JSON.parse(match[1])) {
          if (typeof dependency === 'string' && (dependency.startsWith('/') || dependency.startsWith('./') || dependency.startsWith('../'))) discovered.add(dependency);
        }
      } catch { /* A malformed module is rejected later by browser validation. */ }
    }
    for (const match of text.matchAll(/(?:System|\be)\.import\((['"])([^'"]+)\1\)/g)) {
      if (match[2].startsWith('/') || match[2].startsWith('./') || match[2].startsWith('../')) discovered.add(match[2]);
    }
  }
  for (const candidate of discovered) {
    const resolved = new URL(candidate, new URL(key, upstream));
    if (resolved.origin === upstream.origin) await crawlKey(`${resolved.pathname}${resolved.search}`, false);
  }
}

async function crawlAsset(preferredBundle, uuid) {
  await crawlKey(`/query-extname/${uuid}`);
  const bundles = [preferredBundle, ...projectBundleNames].filter((bundle, index, all) => all.indexOf(bundle) === index);
  for (const bundle of bundles) {
    const key = `/assets/${encodeURIComponent(bundle)}/import/${uuid.slice(0, 2)}/${uuid}.json`;
    if (requestMap.has(key)) return;
    const result = await requestUpstream(key);
    if (result.status >= 200 && result.status < 400) {
      await crawlKey(key);
      // Creator preview keeps native files bundle-local even when the same
      // ImageAsset UUID is exposed by several bundles. Import JSON describes
      // the texture graph but does not contain the native URL, so relying on a
      // browser visit can capture support-ui's copy while omitting common's
      // equally valid URL. Seal the ImageAsset in its preferred bundle here.
      let imported;
      try { imported = JSON.parse(result.body.toString('utf8')); } catch { /* non-JSON imports have no native image */ }
      if (imported?.__type__ === 'cc.ImageAsset') {
        for (const extension of ['png', 'jpg', 'jpeg', 'webp']) {
          const nativeKey = `/assets/${encodeURIComponent(bundle)}/native/${uuid.slice(0, 2)}/${uuid}.${extension}`;
          const native = await requestUpstream(nativeKey);
          if (native.status >= 200 && native.status < 400) {
            record(nativeKey, native);
            break;
          }
        }
      }
      // A UUID can be exposed through several Creator bundles. Preserve the
      // owning/preferred bundle and only use the remaining bundles as ordered
      // fallbacks; copying every UUID into every bundle creates a false,
      // combinatorial snapshot instead of the runtime dependency graph.
      return;
    }
  }
}

async function closeCapturedAssetDependencies() {
  for (const [key, result] of [...requestMap]) {
    const assetMatch = new URL(key, upstream).pathname.match(/^\/assets\/([^/]+)\/import\/[^/]+\/([^/]+)\.json$/);
    if (!assetMatch) continue;
    let parsed;
    try { parsed = JSON.parse(result.body.toString('utf8')); }
    catch { continue; }
    const dependencies = new Set();
    const visit = (value) => {
      if (typeof value === 'string') {
        if (assetUuidPattern.test(value)) dependencies.add(value);
      } else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(parsed);
    for (const uuid of dependencies) await crawlAsset(assetMatch[1], uuid);
  }
}

async function startCaptureProxy(allowMisses) {
  captureServer = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://capture.invalid');
      if (requestUrl.pathname.startsWith('/api/v2/')) {
        const backend = http.request({
          hostname: '127.0.0.1', port: 8080, method: request.method, path: request.url,
          headers: { ...request.headers, host: '127.0.0.1:8080', origin: 'http://127.0.0.1:7458' },
        }, (backendResponse) => {
          response.writeHead(backendResponse.statusCode ?? 502, backendResponse.headers);
          backendResponse.pipe(response);
        });
        backend.on('error', (error) => {
          if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
          response.end(error.message);
        });
        request.pipe(backend);
        return;
      }
      const versioned = requestUrl.pathname.match(/^\/__aoo\/build\/[a-f0-9]{20}(?:\/r\d+)?(\/.*)$/);
      if (versioned) requestUrl.pathname = versioned[1];
      const key = `${requestUrl.pathname}${requestUrl.search}`;
      let result = requestMap.get(key);
      if (!result && allowMisses && !key.startsWith('/socket.io/?')) {
        result = await requestUpstream(key);
        record(key, result);
      }
      if (!result) {
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ code: 'CAPTURE_RESOURCE_MISS', path: key }));
        return;
      }
      const isHtml = requestUrl.pathname === '/' || requestUrl.pathname.endsWith('.html');
      const isImportMap = requestUrl.pathname.includes('import-map');
      const body = isHtml ? Buffer.from(pinCaptureHtml(result.body.toString('utf8')))
        : isImportMap ? Buffer.from(pinCaptureImportMap(result.body.toString('utf8')))
          : result.body;
      response.writeHead(result.status, { ...result.headers, 'content-length': body.length, 'cache-control': 'no-store' });
      response.end(body);
    } catch (error) {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error.message);
    }
  });
  captureServer.on('upgrade', (request, socket, head) => {
    if (!String(request.url ?? '').startsWith('/api/v2/')) return socket.destroy();
    const backend = net.connect(8080, '127.0.0.1', () => {
      const headers = [];
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index];
        const lower = name.toLowerCase();
        const value = lower === 'host' ? '127.0.0.1:8080'
          : lower === 'origin' ? 'http://127.0.0.1:7458'
            : request.rawHeaders[index + 1];
        headers.push(`${name}: ${value}`);
      }
      backend.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`);
      if (head.length) backend.write(head);
      socket.pipe(backend).pipe(socket);
    });
    backend.on('error', () => socket.destroy());
  });
  await new Promise((done, reject) => {
    captureServer.once('error', reject);
    captureServer.listen(0, '127.0.0.1', done);
  });
  return captureServer.address().port;
}

function reserveDebugPort() {
  return new Promise((done, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : done(port));
    });
  });
}

async function browserCapture(port, exerciseGuestLobby = false) {
  if (!existsSync(chrome)) throw new Error(`Chrome not found: ${chrome}`);
  const profile = join(root, `.chrome-${process.pid}`);
  const debugPort = await reserveDebugPort();
  await mkdir(profile, { recursive: true });
  const child = spawn(chrome, [
    '--headless=new', '--use-angle=swiftshader', '--enable-webgl', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  let exited = false;
  child.once('exit', () => { exited = true; });
  let socket;
  try {
    let page;
    for (let attempt = 0; attempt < 80 && !page; attempt += 1) {
      if (exited) throw new Error(`capture Chrome exited before DevTools became ready: ${stderr.slice(-1000)}`);
      try {
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
        page = targets.find((target) => target.type === 'page');
      } catch { /* Chrome has not opened its debugging endpoint yet. */ }
      if (!page) await new Promise((done) => setTimeout(done, 100));
    }
    if (!page) throw new Error('capture Chrome DevTools page did not become ready');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    const failures = [];
    const requestUrls = new Map();
    let lobbyMounted = false;
    const lifecycleMessages = [];
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.done(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const description = message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text;
        if (/SystemJS|Error#3/.test(description)) failures.push(`exception: ${description}`);
      }
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = message.params.args.map((argument) => argument.value ?? argument.description ?? '').join(' ');
        if (/\[(?:AuthNavigation|BootstrapOwner|BootstrapStage)\]|登录|大厅|游客/.test(text)) lifecycleMessages.push(text);
        if (message.params.args[0]?.value === '[AuthNavigation]'
          && message.params.args.some((argument) => String(argument.value ?? '').includes('"stage":"LOBBY_MOUNT_START"'))) {
          lobbyMounted = true;
        }
        if (/SystemJS|Error#3|Unable to resolve/.test(text)) failures.push(`console: ${text}`);
      }
      if (message.method === 'Network.requestWillBeSent') requestUrls.set(message.params.requestId, message.params.request.url);
      if (message.method === 'Network.loadingFailed') {
        const url = requestUrls.get(message.params.requestId) ?? '';
        if (/(?:\/chunks\/|\.js(?:\?|$))/.test(url)) failures.push(`network: ${url} ${message.params.errorText}`);
      }
      if (message.method === 'Network.responseReceived') {
        const { response } = message.params;
        if (response.status >= 400 && !response.url.includes('/socket.io/') && /(?:\/chunks\/|\.js(?:\?|$))/.test(response.url)) {
          failures.push(`HTTP ${response.status}: ${response.url}`);
        }
      }
    };
    const send = (method, params = {}) => new Promise((done, reject) => {
      const id = ++sequence;
      pending.set(id, { done, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await Promise.all([send('Runtime.enable'), send('Network.enable'), send('Page.enable')]);
    if (exerciseGuestLobby) {
      await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 410, deviceScaleFactor: 1, mobile: false });
    }
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    if (exerciseGuestLobby) {
      await new Promise((done) => setTimeout(done, 8000));
      // LoginScene authors consent as selected. Exercise the real Cocos button
      // through CDP so every lazy scene/bundle dependency needed to reach the
      // hall becomes part of the candidate snapshot before it can be sealed.
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x: 224, y: 244, button: 'left', clickCount: 1 });
      }
      await new Promise((done) => setTimeout(done, Math.max(12000, captureMs - 8000)));
    } else {
      await new Promise((done) => setTimeout(done, captureMs));
    }
    const visual = await send('Runtime.evaluate', {
      expression: `(() => { const error = document.querySelector('#error'); return { visible: !!error && getComputedStyle(error).display !== 'none', text: document.querySelector('#error .error-main')?.innerText ?? '' }; })()`,
      returnByValue: true,
    });
    if (visual.result.value.visible) failures.push(`visible error: ${visual.result.value.text}`);
    if (exerciseGuestLobby) {
      if (!lobbyMounted) failures.push(`guest login did not mount lobby UI; lifecycle=${lifecycleMessages.slice(-12).join(' | ') || 'none'}`);
    }
    if (failures.length) throw new Error(`capture browser validation failed:\n${[...new Set(failures)].join('\n')}`);
  } finally {
    if (socket && socket.readyState < WebSocket.CLOSING) {
      await new Promise((done) => {
        const timeout = setTimeout(done, 1000);
        socket.addEventListener('close', () => { clearTimeout(timeout); done(); }, { once: true });
        socket.close();
      });
    }
    if (!exited) child.kill('SIGTERM');
    if (!exited) await new Promise((done) => child.once('exit', done));
    await rm(profile, { recursive: true, force: true });
  }
}

async function publish() {
  await mkdir(root, { recursive: true });
  await crawlKey('/');
  for (const key of ['/scripting/engine/bin/.cache/dev/preview/import-map.json', '/scripting/x/import-map.json', '/scripting/import-map-global', '/scripting/x/resolution-detail-map.json', '/settings.js?scene=current_scene']) await crawlKey(key);
  for (const key of [
    '/engine_external/?url=external:emscripten/meshopt/meshopt_decoder.wasm.wasm',
    '/engine_external/?url=external:emscripten/bullet/bullet.release.wasm.wasm',
    '/engine_external/?url=external:emscripten/spine/3.8/spine.wasm',
    '/src/effect.bin',
  ]) await crawlKey(key);
  const settings = requestMap.get('/settings.js?scene=current_scene')?.body.toString('utf8');
  if (!settings) throw new Error('Creator settings.js was not captured');
  const settingsMatch = settings.match(/window\._CCSettings\s*=\s*(\{.*\});?\s*$/s);
  if (!settingsMatch) throw new Error('Creator settings.js format is not recognized');
  const projectBundles = JSON.parse(settingsMatch[1]).assets?.projectBundles ?? [];
  projectBundles.forEach((bundle) => projectBundleNames.add(bundle));
  for (const bundle of projectBundles) {
    await crawlKey(`/assets/${encodeURIComponent(bundle)}/index.js`);
    await crawlKey(`/assets/${encodeURIComponent(bundle)}/config.json`);
  }
  // Browser-path capture cannot prove stability for pages and game bundles the
  // capture account did not open. Creator's bundle config is the authoritative
  // publication inventory, so seal every declared import UUID in its owning
  // bundle before runtime validation. This remains bounded by real config
  // entries and avoids the false UUID x bundle cross-product.
  for (const bundle of projectBundles) {
    const config = JSON.parse(requestMap.get(`/assets/${encodeURIComponent(bundle)}/config.json`)?.body.toString('utf8') ?? '{}');
    for (const uuid of config.uuids ?? []) {
      if (typeof uuid === 'string' && assetUuidPattern.test(uuid)) await crawlAsset(bundle, uuid);
    }
  }
  // LoginScene is loaded by project bootstrap code after the initial Creator
  // scene. Seed it explicitly so a slow login/API response cannot leave a
  // published snapshot without the first user-visible scene.
  const mainConfig = JSON.parse(requestMap.get('/assets/main/config.json')?.body.toString('utf8') ?? '{}');
  const mainSceneEntries = Object.entries(mainConfig.scenes ?? {})
    .filter(([path]) => path.startsWith('db://assets/'));
  const loginSceneUuid = mainSceneEntries.find(([path]) => path.endsWith('/LoginScene.scene'))?.[1];
  const bootstrapSceneUuid = mainSceneEntries.find(([path]) => path.endsWith('/BootStrap.scene'))?.[1];
  if (!loginSceneUuid || !bootstrapSceneUuid) throw new Error('main bundle does not declare BootStrap and LoginScene');
  // Creator's current_scene alias does not expose the actual scene UUID in
  // settings.js. Seed both product entry scenes from main/config.json so a
  // fixed client never starts with a missing current scene before the runtime
  // owner can redirect BootStrap -> LoginScene.
  for (const [, sceneUuid] of mainSceneEntries) await crawlAsset('main', sceneUuid);
  const proxyPort = await startCaptureProxy(true);
  try {
    const beforeBrowser = requestMap.size;
    const beforeKeys = new Set(requestMap.keys());
    await browserCapture(proxyPort, true);
    // Browser misses are recorded immediately so the page can keep loading,
    // but those responses do not pass through crawlKey. Close their UUID graph
    // before sealing; otherwise a runtime-loaded atlas can publish its root
    // JSON while omitting bundle-local SpriteFrame aliases.
    await closeCapturedAssetDependencies();
    log('browser-capture-finished', { beforeBrowser, afterBrowser: requestMap.size, newKeys: [...requestMap.keys()].filter((key) => !beforeKeys.has(key)) });
  }
  finally { await new Promise((done) => captureServer.close(done)); }
  const sealedCount = requestMap.size;
  const validationPort = await startCaptureProxy(false);
  try { await browserCapture(validationPort, true); }
  finally { await new Promise((done) => captureServer.close(done)); }
  if (requestMap.size !== sealedCount) throw new Error(`sealed validation discovered ${requestMap.size - sealedCount} unexpected resources`);
  // Creator may replace import maps and project chunks while hot compilation is
  // running. Re-read every generation-defining resource before publishing; a
  // mismatch rejects this candidate and leaves all slot symlinks untouched.
  const generationKeys = [...requestMap.keys()].filter((key) =>
    key.includes('import-map') || key.includes('/scripting/x/chunks/') || key === '/settings.js?scene=current_scene');
  for (const key of generationKeys) {
    const latest = await requestUpstream(key);
    const captured = requestMap.get(key);
    if (latest.status !== captured.status || !latest.body.equals(captured.body)) {
      throw new Error(`Creator generation changed during capture: ${key}`);
    }
  }
  const digest = createHash('sha256');
  digest.update(snapshotValidationRevision).update('\0');
  for (const [key, value] of [...requestMap].sort(([left], [right]) => left.localeCompare(right))) digest.update(key).update('\0').update(value.body);
  const buildId = digest.digest('hex').slice(0, 20);
  const staging = join(root, `.staging-${buildId}-${process.pid}`);
  const finalDir = join(root, 'snapshots', buildId);
  await rm(staging, { recursive: true, force: true });
  await mkdir(join(staging, 'objects'), { recursive: true });
  const entries = [];
  let bytes = 0;
  for (const [key, value] of [...requestMap].sort(([left], [right]) => left.localeCompare(right))) {
    const object = createHash('sha256').update(key).digest('hex');
    await writeFile(join(staging, 'objects', object), value.body);
    bytes += value.body.length;
    entries.push({ key, object, status: value.status, bytes: value.body.length, contentType: value.headers['content-type'] ?? 'application/octet-stream', sha256: createHash('sha256').update(value.body).digest('hex') });
  }
  if (!entries.some((entry) => entry.key === '/') || entries.length < 10) throw new Error(`snapshot validation failed: only ${entries.length} entries`);
  const manifest = { schemaVersion: 1, buildId, createdAt: new Date().toISOString(), upstream: upstream.toString(), entries, bytes };
  await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(dirname(finalDir), { recursive: true });
  if (existsSync(finalDir)) await rm(staging, { recursive: true, force: true });
  else await rename(staging, finalDir);
  for (const slot of slots) {
    const slotDir = join(root, 'slots', slot.name);
    await mkdir(slotDir, { recursive: true });
    const temporary = join(slotDir, `.current-${process.pid}`);
    await rm(temporary, { force: true });
    await symlink(finalDir, temporary);
    await rename(temporary, join(slotDir, 'current'));
  }
  await writeFile(join(root, 'last-success.json'), `${JSON.stringify({ buildId, createdAt: manifest.createdAt, entries: entries.length, bytes }, null, 2)}\n`);
  log('published', { buildId, entries: entries.length, bytes, slots });
}

async function status() {
  const result = JSON.parse(await readFile(join(root, 'last-success.json'), 'utf8'));
  process.stdout.write(`${JSON.stringify({ root, slots, ...result }, null, 2)}\n`);
}

try {
  if (command === 'capture') await publish();
  else if (command === 'status') await status();
  else throw new Error(`unknown command: ${command}`);
} catch (error) {
  log('failed', { command, error: error.stack ?? error.message, retainedPreviousSnapshot: true });
  process.exitCode = 1;
}
// Node's built-in WebSocket can retain an idle undici handle after the CDP
// peer has exited. This command is a one-shot publisher, so terminate only
// after all capture, validation, atomic publication, and logging have ended.
process.exit(process.exitCode ?? 0);
