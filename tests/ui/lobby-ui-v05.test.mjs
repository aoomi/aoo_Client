import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(clientRoot, relative), 'utf8');
const fixture = JSON.parse(read('tests/fixtures/lobby-ui-v05.json'));
const screen = read('assets/Lobby/Code/LobbyScreenController.ts');
const formManager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
const moduleRegistry = read('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');

function prefabButtonNames() {
  const prefab = read(fixture.mainPrefab);
  return [...prefab.matchAll(/"_name": "(btn_[^"]+|logo)"/g)].map(match => match[1]);
}

test('every serialized lobby control is routed or explicitly classified as non-action', () => {
  const covered = new Set([...fixture.routedButtons, ...Object.keys(fixture.nonActions)]);
  const missing = [...new Set(prefabButtonNames())].filter(name => !covered.has(name));
  assert.deepEqual(missing, []);
  for (const name of fixture.routedButtons) {
    assert.match(screen, new RegExp(`case '${name}':`), `${name} has no production route`);
  }
  assert.doesNotMatch(screen, /case 'btn_addQuanCard':\s*return;/);
});

test('main actions use click de-duplication and request-lifetime single-flight guards', () => {
  assert.match(screen, /mainButtonTapGuard/);
  assert.match(screen, /mainActionBusy\.has\(key\)/);
  assert.match(screen, /mainActionBusy\.add\(key\)/);
  assert.match(screen, /pending\.then\([\s\S]{0,180}mainActionBusy\.delete\(key\)/);
  for (const name of ['btn_head', 'btn_shop', 'btn_record', 'btn_qiandao', 'btn_service', 'btn_location']) {
    assert.match(screen, new RegExp(`case '${name}':[\\s\\S]{0,180}runMainAction\\(normalized`), `${name} is not single-flight`);
  }
});

test('loading and first-load terminal states cannot leave a blocking overlay or stale timer', () => {
  assert.match(screen, /globalThis\.setTimeout\([\s\S]{0,260}forms\.show\('UIWaitForm'\)/);
  assert.match(screen, /forms\.close\('UIWaitForm'\)/);
  assert.match(screen, /forms\.close\('UIDownLoadGame'\)/);
  assert.match(screen, /if \(this\.formLoadingTimer\) globalThis\.clearTimeout\(this\.formLoadingTimer\)/);
  assert.match(screen, /this\.applyLegacyRuntimeVisibility\(main\.node\)[\s\S]{0,500}this\.formLoading = false/);
  assert.match(screen, /new LegacyFormManager\(parent,[\s\S]{0,100}true\)/);
  assert.match(screen, /}, 120\)/);
  assert.doesNotMatch(moduleRegistry, /UIWaitForm/);
  assert.match(formManager, /externalLoadingPresentation \? 60_000 : defaultDelay/);
});

test('failure, empty/back paths and lifecycle cleanup are wired', () => {
  assert.match(screen, /showProductionError/);
  assert.match(screen, /UIMessage_Drift/);
  assert.match(screen, /legacy-lobby-back-empty/);
  assert.match(screen, /window\.removeEventListener\('keydown'/);
  assert.match(screen, /window\.removeEventListener\('popstate'/);
  assert.match(screen, /for \(const dispose of this\.nodeDisposers\.splice\(0\)\) dispose\(\)/);
  assert.match(screen, /this\.forms\?\.destroy\(\)/);
  assert.match(screen, /this\.mainActionBusy\.clear\(\)/);
  for (const state of ['loading', 'empty', 'failure', 'success', 'duplicate-click', 'back', 'destroy', 'first-load']) {
    assert.ok(fixture.states.includes(state));
  }
});

test('lobby production routes do not use fixture, memory-demo, or legacy transport bypasses', () => {
  const lobbyControllers = fs.readdirSync(path.join(clientRoot, 'assets/Lobby/Code'), { recursive: true })
    .filter(file => String(file).endsWith('.ts'))
    .map(file => read(path.join('assets/Lobby/Code', String(file))))
    .join('\n');
  assert.doesNotMatch(lobbyControllers, /MockGateway|FakeGateway|InMemory|memory fixture|api\/v1|account\.login_compat/);
  assert.doesNotMatch(lobbyControllers, /CLuckDrawCheck|GetLuckGoods|popup\.CPopupList/);
});

test('V02 common room network controllers are mounted by the production lobby and return UI state', () => {
  const mount = read('assets/Games/Common/Code/Room/RoomNetworkControllerMount.ts');
  for (const controller of ['RoomController', 'RoomReconnectController', 'RoomVoiceController']) {
    assert.match(mount, new RegExp(`new ${controller}\\(`), `${controller} is not instantiated`);
  }
  assert.match(screen, /new RoomNetworkControllerMount\(/);
  assert.match(screen, /roomNetworkControllers\.install\(\)/);
  assert.match(screen, /roomNetworkControllers\?\.destroy\(\)/);
  for (const event of ['legacy-njpdk-room-ready', 'aoo-room-network-mount', 'aoo-room-ready-change',
    'aoo-room-state-refresh', 'aoo-room-exit', 'aoo-room-reconnect', 'aoo-room-voice-record']) {
    assert.ok(mount.includes(`'${event}'`), `${event} is not bound`);
  }
  for (const callback of ['aoo-room-network-state', 'aoo-room-authoritative-state',
    'aoo-room-action-state', 'aoo-room-voice-state']) {
    assert.ok(mount.includes(`'${callback}'`), `${callback} has no UI callback`);
  }
  assert.match(mount, /VoiceMediaClient\(resolveRuntimeEndpoints\(\)\.apiBaseUrl/);
  assert.doesNotMatch(mount, /Mock|Fake|InMemory|SendPack|ClientPack/);
});
