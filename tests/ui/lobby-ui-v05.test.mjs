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
  const known = new Set([...fixture.routedButtons, ...Object.keys(fixture.nonActions)]);
  return [...prefab.matchAll(/"_name": "([^"]+)"/g)]
    .map(match => match[1]).filter(name => known.has(name));
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
  for (const name of ['Avatar', 'Shop', 'Records', 'CheckIn', 'Support']) {
    assert.match(screen, new RegExp(`case '${name}':[\\s\\S]{0,180}runMainAction\\(normalized`), `${name} is not single-flight`);
  }
});

test('loading and first-load terminal states cannot leave a blocking overlay or stale timer', () => {
  assert.match(screen, /this\.formLoadingTimer = globalThis\.setTimeout\([\s\S]{0,420}forms\.show\('UIWaitForm'\)/);
  assert.match(screen, /forms\.close\('UIWaitForm'\)/);
  assert.match(screen, /forms\.close\('UILobbyDownload'\)/);
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
  for (const controller of ['RoomReconnectController', 'RoomVoiceController']) {
    assert.match(mount, new RegExp(`new ${controller}\\(`), `${controller} is not instantiated`);
  }
  assert.match(screen, /new RoomNetworkControllerMount\(/);
  assert.match(screen, /roomNetworkControllers\.install\(\)/);
  assert.match(screen, /roomNetworkControllers\?\.destroy\(\)/);
  for (const event of ['common-pdk-room-ready', 'aoo-room-network-mount']) {
    assert.ok(mount.includes(`'${event}'`), `${event} is not bound`);
  }
  for (const callback of ['aoo-room-network-state', 'aoo-room-authoritative-state', 'aoo-room-voice-state']) {
    assert.ok(mount.includes(`'${callback}'`), `${callback} has no UI callback`);
  }
  assert.match(mount, /VoiceMediaClient\(resolveRuntimeEndpoints\(\)\.apiBaseUrl/);
  assert.doesNotMatch(mount, /Mock|Fake|InMemory|SendPack|ClientPack/);
});

test('V5 lobby injects one live default social-media dependency bundle', () => {
  assert.match(screen, /const roomRuntimeDependencies = this\.createRoomRuntimeDependencies\(this\.forms\)/);
  assert.match(screen, /new RoomNetworkControllerMount\([\s\S]{0,240}roomRuntimeDependencies\.bearer,[\s\S]{0,80}roomRuntimeDependencies/);
  assert.match(screen, /if \(this\.shouldRefreshAccessToken\(\)\) await this\.refreshAccessToken\(\)/);
  assert.match(screen, /String\(this\.account\.accessToken \|\| this\.account\.token \|\| ''\)\.trim\(\)/);
  assert.ok(screen.indexOf('await this.refreshAccessToken()') < screen.indexOf("const current = String(this.account.accessToken"));
  assert.match(screen, /formHost: CommonRoomFormHost = Object\.freeze\(\{/);
  assert.match(screen, /await forms\.show\(normalized\)/);
  assert.match(screen, /forms\.close\(normalized\)/);
  assert.match(screen, /const browserRecorder = new BrowserVoiceRecorder\(\)/);
  assert.match(screen, /const selected = injected \?\? browserRecorder/);
  assert.match(screen, /apiBaseUrl,[\s\S]{0,120}context: \(\): VoiceClientContext => \(\{ deviceId, channel, clientVersion \}\)/);
});

test('V5 default social-media dependencies fail closed and do not expose credentials', () => {
  for (const code of [
    'COMMON_ROOM_MEDIA_ENDPOINT_INVALID', 'COMMON_ROOM_CLIENT_CONTEXT_REQUIRED',
    'COMMON_ROOM_SESSION_INVALID', 'COMMON_ROOM_FORM_HOST_DESTROYED',
    'COMMON_ROOM_ACCESS_TOKEN_REQUIRED', 'COMMON_ROOM_FORM_PATH_REQUIRED',
    'COMMON_ROOM_VOICE_RECORDER_INVALID',
  ]) assert.ok(screen.includes(code), `missing fail-closed code ${code}`);
  const factory = screen.slice(screen.indexOf('private createRoomRuntimeDependencies'),
    screen.indexOf('private tokenExpiry('));
  assert.doesNotMatch(factory, /console\.|Authorization|Cookie|headers|voice\.bytes|assetId/);
  assert.doesNotMatch(factory, /const\s+\w*(?:token|bearer)\w*\s*=\s*this\.account/i);
});
