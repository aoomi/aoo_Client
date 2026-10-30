import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const chrome = process.env.AOO_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const defaultClients = [
  { slot: 'A', port: 7462, debugPort: 1241 }, { slot: 'B', port: 7459, debugPort: 1242 },
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
const verifyClubMain = process.env.AOO_VERIFY_CLUB_MAIN === 'true';
const verifyAccountLogin = process.env.AOO_VERIFY_ACCOUNT_LOGIN === 'true';
const verifyClubCreate2001 = process.env.AOO_VERIFY_CLUB_CREATE_2001 === 'true';
const accountLogin = (verifyAccountLogin || verifyClubCreate2001) ? process.env.AOO_TEST_ACCOUNT_98 : null;
const accountPassword = (verifyAccountLogin || verifyClubCreate2001) ? process.env.AOO_TEST_PASSWORD_98 : null;
const accountNumber = accountLogin && /^\d+$/.test(accountLogin) ? Number(accountLogin) : null;
await mkdir(reportRoot, { recursive: true });

const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const classifyLocalPreviewVersionAccess = (status, bodyPresent = false) => ({
  allowed: status >= 200 && status < 300 && bodyPresent,
  reason: status >= 200 && status < 300 ? (bodyPresent ? 'ALLOWED' : 'EMPTY_RESPONSE')
    : status === 401 || status === 403 ? 'AUTH_REJECTED'
      : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'UPSTREAM_ERROR' : 'HTTP_REJECTED',
});


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
  const events = { exceptions: [], console: [], failed: [], responses404: [], buildIds: new Set(), currentPageBuildIds: new Set(), pageBuildIds: [], responseBuilds: [], versionChecks: [], bridgeTokenBoolean: [] };
const classifyAdmissionPredicates = (value = {}) => {
  const keys = ['origin','peer','forwarded','deviceId','generation','lease','tokenHash','expiry','useLimit','body','profile','service','revoke'];
  const present = keys.filter((key) => typeof value[key] === 'boolean');
  if (present.length === 0) return { status: 'UNKNOWN', reason: 'UNAVAILABLE' };
  return { status: 'OBSERVED', ...Object.fromEntries(present.map((key) => [key, value[key]])) };
};
const diagnosticSelfTest = () => {
  const p = classifyAdmissionPredicates(Object.fromEntries(['origin','peer','forwarded','deviceId','generation','lease','tokenHash','expiry','useLimit','body','profile','service','revoke'].map((k) => [k, true])));
  return Object.values(p).every(Boolean);
};

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
    if (message.method === 'Network.requestWillBeSent') {
      const url = message.params.request.url;
      if (/bridge|issuer|token|local-preview-bootstrap\.js/i.test(url)) {
        const headers = Object.keys(message.params.request.headers ?? {}).map((name) => name.toLowerCase());
        events.bridgeTokenBoolean.push({ urlClass: /bridge/i.test(url) ? 'bridge' : /local-preview-bootstrap\.js/i.test(url) ? 'local-preview-bootstrap' : 'issuer', hasTokenHeader: headers.some((name) => /authorization|token|cookie/.test(name)) });
      }
    }
    if (message.method === 'Network.responseReceived') {
      const response = message.params.response;
      if (/\/api\/v2\/version\/check(?:[?]|$)/.test(response.url)) {
        events.versionChecks.push({ status: response.status, classification: classifyLocalPreviewVersionAccess(response.status, true).reason, allowed: classifyLocalPreviewVersionAccess(response.status, true).allowed });
      }
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
  if (verifyGuestLobby || verifyAccountLogin) {
    await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 410, deviceScaleFactor: 1, mobile: false });
  }
  // One navigation per isolated generation. Repeating Page.navigate here can
  // consume a one-shot version-check/bridge state and produce a false drift.
  events.currentPageBuildIds = new Set();
  await send('Page.navigate', { url: `http://127.0.0.1:${client.port}/?autoReload=false&e2e=single` });
  await delay(5000);
  events.pageBuildIds.push([...events.currentPageBuildIds]);
  let sceneNodes = null;
  const clubActions = [];
  let clubButtonInventory = [];
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
  if (verifyAccountLogin) {
    if (!accountLogin || !accountPassword) throw new Error('AOO_VERIFY_ACCOUNT_LOGIN requires AOO_TEST_ACCOUNT_98 and AOO_TEST_PASSWORD_98');
    const resolveUiNode = async (names) => {
      const result = await send('Runtime.evaluate', {
      expression: `(async () => { const { Button, director, UITransform, view } = await System.import('cc'); const scene = director.getScene(); const canvas = document.querySelector('canvas'); if (!scene || !canvas) return { candidates: [], reason: !scene ? 'scene-unavailable' : 'canvas-unavailable' }; const wanted = new Set(${JSON.stringify(names)}); const rect = canvas.getBoundingClientRect(); const viewport = view.getViewportRect(); const out = []; const visit = (node, path) => { const isButton = !!node.getComponent(Button); if ((wanted.size === 0 ? isButton : wanted.has(node.name))) { const ui = node.getComponent(UITransform); const world = node.worldPosition; out.push({ name: node.name, path, active: node.activeInHierarchy, x: rect.left + viewport.x + world.x * view.getScaleX(), y: rect.top + rect.height - viewport.y - world.y * view.getScaleY(), width: ui?.width ?? null, height: ui?.height ?? null }); } node.children.forEach((child) => visit(child, path + '/' + child.name)); }; visit(scene, scene.name); return { candidates: out, scene: scene.name, canvas: { width: rect.width, height: rect.height } }; })()`,
        awaitPromise: true, returnByValue: true,
      });
      return result.result.value ?? { candidates: [], reason: 'evaluation-empty' };
    };
    const chooseUi = (rows, names) => (rows.candidates ?? []).find((row) => names.includes(row.name) && row.active);
    const accountInventory = await resolveUiNode([]);
    const accountInput = chooseUi(await resolveUiNode(['AccountInput']), ['AccountInput']);
    const passwordInput = chooseUi(await resolveUiNode(['PasswordInput']), ['PasswordInput']);
    const loginButton = chooseUi(await resolveUiNode(['Btn_Login', 'Btn_AccountLogin']), ['Btn_Login', 'Btn_AccountLogin']);
    const clickUi = async (target) => {
      if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) throw new Error(`account login target unavailable: ${JSON.stringify(target ?? null)}; inventory=${JSON.stringify(accountInventory)}`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
    };
    const typeUi = async (target, value) => {
      await clickUi(target);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace' });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace' });
      await send('Input.insertText', { text: value });
    };
    await typeUi(accountInput, accountLogin);
    await typeUi(passwordInput, accountPassword);
    await clickUi(loginButton);
    await delay(10000);
    const accountLobbyPresented = events.console.some((event) => event.args?.[0]?.value === '[AuthNavigation]'
      && event.args.some((arg) => String(arg.value ?? '').includes('"stage":"LOBBY_PRESENTED"')));
    if (!accountLobbyPresented) throw new Error('account login did not present lobby');
  }
  if (verifyClubCreate2001) {
    if (!accountNumber || accountNumber < 10 || accountNumber > 100) throw new Error('AOO_TEST_ACCOUNT_98 must be an existing local account in range 10-100');
    const createProbe = await send('Runtime.evaluate', {
      expression: `(() => { const { Button, director } = globalThis.cc ?? {}; const scene = director?.getScene?.(); if (!scene) return { ready: false, reason: 'scene-unavailable' }; const rows = []; const visit = (node, path) => { if (/create|room|club/i.test(node.name) && node.activeInHierarchy) rows.push({ name: node.name, path }); node.children.forEach(child => visit(child, path + '/' + child.name)); }; visit(scene, scene.name); return { ready: rows.length > 0, candidates: rows.slice(0, 20), gameId: 2001, persistenceAttempted: false }; })()`,
      returnByValue: true,
    });
    // Probe only the real UI entry. Never click a final create/submit control: this
    // stage must stop before persistence and report the redacted entry inventory.
    clubActions.push({ action: 'create-2001-entry-probe', status: 'stopped-before-persistence', result: createProbe.result?.value ?? null });
  }
  if (verifyClubMain) {
    const resolveTargets = async (names) => {
      const result = await send('Runtime.evaluate', {
        expression: `(async () => { const { Button, director, UITransform, view } = await System.import('cc'); const scene = director.getScene(); const canvas = document.querySelector('canvas'); if (!scene || !canvas) return { candidates: [], reason: 'scene-or-canvas-unavailable' }; const wanted = new Set(${JSON.stringify(names)}); const out = []; const visit = (node, path) => { if (wanted.has(node.name)) { const ui = node.getComponent(UITransform); const world = node.worldPosition; const rect = canvas.getBoundingClientRect(); const viewport = view.getViewportRect(); const x = rect.left + viewport.x + world.x * view.getScaleX(); const y = rect.top + rect.height - viewport.y - world.y * view.getScaleY(); out.push({ name: node.name, path, active: node.activeInHierarchy, interactable: node.getComponent(Button)?.interactable ?? null, x, y, width: ui?.width ?? null, height: ui?.height ?? null }); } node.children.forEach((child) => visit(child, path + '/' + child.name)); }; visit(scene, scene.name); return { candidates: out }; })()`,
        awaitPromise: true, returnByValue: true,
      });
      return result.result.value ?? { candidates: [] };
    };
    const enumerateButtons = async () => {
      const result = await send('Runtime.evaluate', {
        expression: `(async () => { const { Button, director, UITransform, view } = await System.import('cc'); const scene = director.getScene(); const canvas = document.querySelector('canvas'); if (!scene || !canvas) return []; const rect = canvas.getBoundingClientRect(); const viewport = view.getViewportRect(); const out = []; const visit = (node, path) => { const button = node.getComponent(Button); if (button) { const ui = node.getComponent(UITransform); const world = node.worldPosition; out.push({ name: node.name, path, active: node.activeInHierarchy, interactable: button.interactable, x: rect.left + viewport.x + world.x * view.getScaleX(), y: rect.top + rect.height - viewport.y - world.y * view.getScaleY(), width: ui?.width ?? null, height: ui?.height ?? null }); } node.children.forEach((child) => visit(child, path + '/' + child.name)); }; visit(scene, scene.name); return out; })()`,
        awaitPromise: true, returnByValue: true,
      });
      return result.result.value ?? [];
    };
    clubButtonInventory = await enumerateButtons();
    const clickAt = async (target, action) => {
      if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) { clubActions.push({ action, status: 'unavailable', target: target ?? null }); return false; }
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
      clubActions.push({ action, status: 'clicked', target });
      await delay(900);
      return true;
    };
    const choose = (rows, names) => rows.candidates.find((row) => names.includes(row.name) && row.active && row.interactable !== false);
    const closeNames = ['Btn_Close', 'Close', 'Btn_Back'];
    const invite = choose(await resolveTargets(['Btn_Invite', 'Btn_Wechat']), ['Btn_Invite', 'Btn_Wechat']);
    await clickAt(invite, 'invite-open');
    await clickAt(choose(await resolveTargets(closeNames), closeNames), 'invite-close');
    const more = choose(await resolveTargets(['Btn_More']), ['Btn_More']);
    await clickAt(more, 'more-open-1');
    const menu = await enumerateButtons();
    const safeMenu = menu.find((row) => row.active && row.interactable !== false
      && /moremenu|more-menu|menu/i.test(row.path)
      && !/invite|wechat|create|join|room|logout|delete|confirm/i.test(row.name));
    await clickAt(safeMenu ?? choose(await resolveTargets(['Btn_RoomRule', 'Btn_Settings', 'Btn_Close', 'Close', 'Btn_Back']), ['Btn_RoomRule', 'Btn_Settings', 'Btn_Close', 'Close', 'Btn_Back']), 'more-safe-action');
    await clickAt(choose(await resolveTargets(closeNames), closeNames), 'more-close-1');
    await clickAt(choose(await resolveTargets(['Btn_More']), ['Btn_More']), 'more-open-2');
    await clickAt(choose(await resolveTargets(closeNames), closeNames), 'more-close-2');
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
    ...client, health, visual: visual.result.value, sceneNodes: sceneNodes?.result?.value ?? [], clubButtonInventory, clubActions, buildIds: [...events.buildIds], pageBuildIds: events.pageBuildIds, responseBuilds: events.responseBuilds, responses404: events.responses404, versionChecks: events.versionChecks, bridgeTokenBoolean: events.bridgeTokenBoolean, admissionPredicateFlags: classifyAdmissionPredicates({}), diagnosticSelfTest: process.env.AOO_PREVIEW_DIAGNOSTIC_SELF_TEST === 'true' ? diagnosticSelfTest() : false,
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

const safeOpenClient = async (client) => {
  try { return await openClient(client); }
  catch (error) {
    return {
      ...client,
      health: null,
      visual: { errorVisible: false, errorText: '', canvasWidth: 0, canvasHeight: 0 },
      sceneNodes: [],
      clubActions: [],
      clubButtonInventory: [],
      captureStage: 'client-error',
      firstError: String(error?.stack ?? error),
      requestUrls: [],
      responseUrls: [],
      buildIds: [], pageBuildIds: [], responseBuilds: [], responses404: [], versionChecks: [], bridgeTokenBoolean: [],
      exceptions: [], consoleMessages: [], systemJsError3: false, failedChunkRequests: [], chromeErrors: [],
    };
  }
};
const results = await Promise.all(clients.map(safeOpenClient));
await Promise.all(results.map(async (result) => {
  result.unexpected404 = [];
  if (result.firstError) result.unexpected404.push({ error: result.firstError, stage: result.captureStage ?? 'unknown' });
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
const reportPath = join(reportRoot, 'report.json');
const reportTempPath = `${reportPath}.tmp-${process.pid}`;
await writeFile(reportTempPath, `${JSON.stringify(report, null, 2)}\n`);
await rename(reportTempPath, reportPath);
const failures = results.flatMap((result) => [
  ...(!result.health && result.port !== 7456 ? [`${result.slot}: snapshot health endpoint unavailable`] : []),
  ...(result.health && (!result.health.ok || result.health.transformRevision !== 'r3')
    ? [`${result.slot}: unhealthy snapshot ${JSON.stringify(result.health)}`] : []),
  ...(result.visual.canvasWidth <= 0 || result.visual.canvasHeight <= 0
    ? [`${result.slot}: Cocos Canvas did not render (${result.visual.canvasWidth}x${result.visual.canvasHeight})`] : []),
  ...result.unexpected404.map(({ url, upstreamStatus, upstreamError, error, stage }) =>
    error ? `${result.slot}: capture ${stage ?? 'unknown'} failed: ${error}`
      : `${result.slot}: fixed preview returned 404 while Creator returned ${upstreamStatus ?? upstreamError}: ${url}`),
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
