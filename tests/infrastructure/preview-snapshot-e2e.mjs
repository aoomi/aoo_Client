import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const chrome = process.env.AOO_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const defaultClients = [
  { slot: 'A', port: 7458, debugPort: 1241 }, { slot: 'B', port: 7459, debugPort: 1242 },
  { slot: 'C', port: 5188, debugPort: 1243 }, { slot: 'D', port: 7461, debugPort: 1244 },
];
const clients = process.env.AOO_PREVIEW_CLIENTS
  ? process.env.AOO_PREVIEW_CLIENTS.split(',').map((value, index) => {
      const [slot, port] = value.split(':');
      return { slot, port: Number(port), debugPort: 1241 + index };
    })
  : defaultClients;
const reportRoot = resolve(process.argv[2] ?? 'tests/reports/preview-snapshot-e2e');
const verifyGuestLobby = process.env.AOO_VERIFY_GUEST_LOBBY === 'true';
await mkdir(reportRoot, { recursive: true });

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

async function json(url, attempts = 40) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await fetch(url).then((response) => response.json()); }
    catch (error) { last = error; await delay(250); }
  }
  throw last;
}

async function openClient(client) {
  const profile = await mkdtemp(join(tmpdir(), `aoo-fw003-${client.slot}-`));
  const stderr = [];
  const child = spawn(chrome, [
    '--headless=new', '--use-angle=swiftshader', '--enable-webgl', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${client.debugPort}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
  const targets = await json(`http://127.0.0.1:${client.debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const events = { exceptions: [], console: [], failed: [], responses404: [], buildIds: new Set(), currentPageBuildIds: new Set(), pageBuildIds: [], responseBuilds: [] };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { done, reject } = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else done(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') events.exceptions.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled') events.console.push(message.params);
    if (message.method === 'Network.loadingFailed') events.failed.push(message.params);
    if (message.method === 'Network.responseReceived') {
      if (message.params.response.status === 404) events.responses404.push(message.params.response.url);
      const buildId = Object.entries(message.params.response.headers).find(([name]) => name.toLowerCase() === 'x-aoo-build-id')?.[1];
      if (buildId) {
        events.buildIds.add(buildId);
        events.responseBuilds.push({ url: message.params.response.url, buildId, type: message.params.type });
        const resource = new URL(message.params.response.url);
        const generationResource = message.params.type === 'Document'
          || /(?:\/scripting\/|\/preview-app\/|\/settings\.js|\.js(?:\?|$)|import-map)/.test(resource.pathname);
        if (generationResource) events.currentPageBuildIds.add(buildId);
      }
    }
  };
  const send = (method, params = {}) => new Promise((done, reject) => {
    const id = ++sequence; pending.set(id, { done, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  await Promise.all([send('Runtime.enable'), send('Network.enable'), send('Page.enable')]);
  if (verifyGuestLobby) {
    await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 410, deviceScaleFactor: 1, mobile: false });
  }
  for (let pass = 0; pass < 4; pass += 1) {
    events.currentPageBuildIds = new Set();
    await send('Page.navigate', { url: `http://127.0.0.1:${client.port}/?autoReload=false&e2e=${pass}` });
    await delay(5000);
    events.pageBuildIds.push([...events.currentPageBuildIds]);
  }
  let sceneNodes = null;
  if (verifyGuestLobby) {
    sceneNodes = await send('Runtime.evaluate', {
      expression: `System.import('cc').then(({ director, UITransform }) => { const rows = []; const visit = (node) => { const ui = node.getComponent(UITransform); if (/guest|visitor|agree|agreement|tourist|login/i.test(node.name)) rows.push({ name: node.name, active: node.activeInHierarchy, world: { x: node.worldPosition.x, y: node.worldPosition.y }, size: ui ? { width: ui.width, height: ui.height } : null }); node.children.forEach(visit); }; visit(director.getScene()); return rows; })`,
      awaitPromise: true,
      returnByValue: true,
    });
    const click = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };
    // Fixed 640x410 Creator preview: 50px toolbar + 640x360 Canvas.
    // The LoginScene agreement control and guest button are exercised through
    // real pointer events; no controller or handler is invoked directly.
    // LoginScene authors the agreement toggle as selected by default. Clicking
    // it here would turn consent off and make the guest action a no-op.
    await click(224, 244);
    await delay(10000);
  }
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const visual = await send('Runtime.evaluate', {
    expression: `(() => { const error = document.querySelector('#error'); return { errorVisible: !!error && getComputedStyle(error).display !== 'none', errorText: document.querySelector('#error .error-main')?.innerText ?? '', canvasWidth: document.querySelector('canvas')?.width ?? 0, canvasHeight: document.querySelector('canvas')?.height ?? 0 }; })()`,
    returnByValue: true,
  });
  await writeFile(join(reportRoot, `${client.slot}-${client.port}.png`), Buffer.from(screenshot.data, 'base64'));
  let health = null;
  try { health = await json(`http://127.0.0.1:${client.port}/__aoo/health`, 1); }
  catch { /* Direct Creator Preview has no snapshot health endpoint. */ }
  if (socket.readyState < WebSocket.CLOSING) {
    await new Promise((done) => {
      const timeout = setTimeout(done, 1000);
      socket.addEventListener('close', () => { clearTimeout(timeout); done(); }, { once: true });
      socket.close();
    });
  }
  child.kill('SIGTERM');
  await new Promise((done) => child.once('exit', done));
  await rm(profile, { recursive: true, force: true });
  return {
    ...client, health, visual: visual.result.value, sceneNodes: sceneNodes?.result?.value ?? [], buildIds: [...events.buildIds], pageBuildIds: events.pageBuildIds, responseBuilds: events.responseBuilds, responses404: events.responses404,
    exceptions: events.exceptions.map((item) => item.exception?.description ?? item.text),
    consoleMessages: events.console.map((event) => ({
      type: event.type,
      values: event.args.map((arg) => arg.value ?? arg.description ?? arg.type),
    })),
    systemJsError3: events.console.some((event) => JSON.stringify(event).includes('Error#3')),
    failedChunkRequests: events.failed.filter((event) => /(?:chunks\/|\.js(?:\?|$))/.test(event.url)),
    chromeErrors: stderr.join('').split('\n').filter((line) => /ERROR/.test(line)).slice(0, 20),
  };
}

const results = await Promise.all(clients.map(openClient));
await Promise.all(results.map(async (result) => {
  result.unexpected404 = [];
  for (const url of [...new Set(result.responses404.filter((value) => !value.includes('/socket.io/')))]) {
    const upstreamUrl = new URL(url);
    upstreamUrl.host = '127.0.0.1:7456';
    try {
      const upstreamResponse = await fetch(upstreamUrl);
      if (upstreamResponse.status !== 404) result.unexpected404.push({ url, upstreamStatus: upstreamResponse.status });
    } catch (error) {
      result.unexpected404.push({ url, upstreamError: error.message });
    }
  }
}));
const report = { createdAt: new Date().toISOString(), results };
await writeFile(join(reportRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const failures = results.flatMap((result) => [
  ...(!result.health && result.port !== 7456 ? [`${result.slot}: snapshot health endpoint unavailable`] : []),
  ...(result.health && (!result.health.ok || result.health.transformRevision !== 'r3')
    ? [`${result.slot}: unhealthy snapshot ${JSON.stringify(result.health)}`] : []),
  ...(result.visual.canvasWidth <= 0 || result.visual.canvasHeight <= 0
    ? [`${result.slot}: Cocos Canvas did not render (${result.visual.canvasWidth}x${result.visual.canvasHeight})`] : []),
  ...result.unexpected404.map(({ url, upstreamStatus, upstreamError }) =>
    `${result.slot}: fixed preview returned 404 while Creator returned ${upstreamStatus ?? upstreamError}: ${url}`),
  ...result.failedChunkRequests.map((failure) => `${result.slot}: failed ${failure.url} ${failure.errorText}`),
  ...result.exceptions.filter((message) => message.includes('SystemJS') || message.includes('Error#3')).map((message) => `${result.slot}: ${message}`),
  ...(result.systemJsError3 ? [`${result.slot}: SystemJS Error#3 console event`] : []),
  ...result.consoleMessages.filter((entry) => entry.type === 'error' && /SystemJS|Unable to resolve|Error#\d+/.test(entry.values.join(' '))).map((entry) => `${result.slot}: ${entry.values.join(' ')}`),
  ...result.consoleMessages.filter((entry) => entry.type === 'error' && /download failed|Failed to preload|login-scene:failure/i.test(entry.values.join(' '))).map((entry) => `${result.slot}: ${entry.values.join(' ')}`),
  ...(result.visual.errorVisible ? [`${result.slot}: visible error ${result.visual.errorText}`] : []),
  ...(verifyGuestLobby && !result.consoleMessages.some((entry) => entry.values[0] === '[AuthNavigation]'
    && entry.values.some((value) => String(value).includes('"stage":"LOBBY_PRESENTED"')))
    ? [`${result.slot}: real guest route did not present the lobby`] : []),
  ...(result.health ? result.pageBuildIds : []).filter((ids) => ids.length !== 1).map((ids, index) => `${result.slot}: page ${index} mixed build ids ${ids.join(',')}`),
]);
if (failures.length) throw new Error(failures.join('\n'));
process.stdout.write(`${JSON.stringify({ ok: true, reportRoot, clients: results.map(({ slot, port, buildIds }) => ({ slot, port, buildIds })) })}\n`);
process.exit(0);
