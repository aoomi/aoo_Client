import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const registry = JSON.parse(await readFile(new URL('../../config/preview-clients.json', import.meta.url), 'utf8'));
const worker = await readFile(new URL('../../scripts/lan-preview-proxy.mjs', import.meta.url), 'utf8');
const manager = await readFile(new URL('../../scripts/preview-snapshot-manager.mjs', import.meta.url), 'utf8');
const supervisor = await readFile(new URL('../../scripts/preview-snapshot-supervisor.mjs', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../../tools/dual-client-preview.mjs', import.meta.url), 'utf8');

test('A/B/C/D use unique fixed snapshot ports and never expose Creator 7456', () => {
  assert.deepEqual(registry.clients, [
    { slot: 'A', port: 7458 }, { slot: 'B', port: 7459 },
    { slot: 'C', port: 5188 }, { slot: 'D', port: 7461 },
  ]);
  assert.equal(new Set(registry.clients.map(({ port }) => port)).size, 4);
  assert.match(dashboard, /\[7458, 7459, 5188, 7461\]/);
});

test('worker serves only current immutable snapshot with layered health', () => {
  assert.match(worker, /realpathSync\(source\)/);
  assert.match(worker, /AOO_PREVIEW_BUILD/);
  assert.doesNotMatch(worker, /http\.request\(\{\s*hostname: creatorHost/);
  assert.match(worker, /max-age=31536000, immutable/);
  assert.match(worker, /STATIC_SNAPSHOT_UNAVAILABLE/);
  for (const field of ['staticResources', 'api', 'hallWs', 'gameWs', 'lastSuccess']) assert.match(worker, new RegExp(field));
  assert.match(worker, /Object\.defineProperty\(window, '__aoo_CREATOR_LAN_PREVIEW__', \{ value: true \}\)/);
});

test('publisher validates generation then atomically renames slot symlinks', () => {
  assert.match(manager, /generation changed during capture/);
  assert.match(manager, /Runtime\.exceptionThrown/);
  assert.match(manager, /Network\.responseReceived/);
  assert.match(manager, /visible error/);
  assert.match(manager, /snapshotValidationRevision/);
  assert.match(manager, /await rename\(temporary, join\(slotDir, 'current'\)\)/);
  assert.match(manager, /retainedPreviousSnapshot: true/);
});

test('publisher closes every Creator import-map chunk despite its JavaScript MIME type', () => {
  assert.match(manager, /type\.includes\('json'\) \|\| pathname\.includes\('import-map'\)/);
  assert.match(manager, /Import maps are authoritative JSON regardless/);
});

test('publisher closes scene asset UUIDs and proves the real guest route reaches the lobby', () => {
  assert.match(manager, /assetUuidPattern\.test\(value\)/);
  assert.match(manager, /endsWith\('\/BootStrap\.scene'\)/);
  assert.match(manager, /for \(const \[, sceneUuid\] of mainSceneEntries\) await crawlAsset\('main', sceneUuid\)/);
  assert.match(manager, /if \(requestMap\.has\(key\)\) return/);
  assert.match(manager, /await closeCapturedAssetDependencies\(\)/);
  assert.match(manager, /for \(const uuid of config\.uuids \?\? \[\]\)/);
  assert.match(manager, /imported\?\.__type__ === 'cc\.ImageAsset'/);
  assert.match(manager, /\/native\/\$\{uuid\.slice\(0, 2\)\}\/\$\{uuid\}\.\$\{extension\}/);
  assert.match(manager, /pinCaptureHtml[\s\S]*__aoo_RUNTIME_CONFIG__[\s\S]*environment:"test"/);
  assert.doesNotMatch(worker, /__aoo_RUNTIME_CONFIG__/);
  assert.match(manager, /Input\.dispatchMouseEvent/);
  assert.match(manager, /guestLoginNodeName = 'Btn_GuestLogin'/);
  assert.match(manager, /document\.readyState !== 'complete'/);
  assert.match(manager, /reason: 'document-loading'/);
  assert.match(manager, /System\.import\('cc'\)/);
  assert.match(manager, /node\.worldPosition/);
  assert.match(manager, /view\.getViewportRect\(\)/);
  assert.match(manager, /view\.getScaleX\(\)/);
  assert.match(manager, /view\.getScaleY\(\)/);
  assert.match(manager, /canvas\.getBoundingClientRect\(\)/);
  assert.match(manager, /awaitPromise: true/);
  assert.match(manager, /request\.method/);
  assert.match(manager, /for \(let attempt = 0; attempt < 80 && !loginPoint/);
  assert.match(manager, /node-readiness-timeout/);
  assert.match(manager, /node\.hasEventListener\(Node\.EventType\.MOUSE_UP\)/);
  assert.match(manager, /node\.hasEventListener\(Node\.EventType\.TOUCH_END\)/);
  assert.match(manager, /login-event-binding-unavailable/);
  assert.match(manager, /point-outside-viewport/);
  assert.match(manager, /never became clickable/);
  assert.match(manager, /guest-login-target/);
  assert.match(manager, /x: loginPoint\.x, y: loginPoint\.y/);
  assert.doesNotMatch(manager, /x: 224, y: 244/);
  assert.doesNotMatch(manager, /guestLoginCanvasPoint/);
  assert.match(manager, /LOBBY_MOUNT_START/);
  assert.match(manager, /guest login did not mount lobby UI/);
});

test('supervisor automatically retries failed generations and publishes only successful signatures', () => {
  assert.match(supervisor, /setInterval\(watch, 5000\)/);
  assert.match(supervisor, /next !== current && !captureRunning/);
  assert.match(supervisor, /if \(succeeded && existsSync/);
  assert.match(supervisor, /source-signature\.json/);
  assert.doesNotMatch(supervisor, /if \(!succeeded\)[\s\S]*source-signature\.json/);
});

test('supervisor fingerprints compiled chunk contents instead of stable import-map URLs alone', () => {
  assert.match(supervisor, /targets\/preview\/chunks/);
  assert.match(supervisor, /entry\.name\.endsWith\('\.js'\)/);
  assert.match(supervisor, /createHash\('sha256'\)\.update\(await readFile\(path\)\)/);
  assert.match(supervisor, /compiledDigests\.join\('\\n'\)/);
});

test('supervisor protects occupied ports and caps crash restarts', () => {
  assert.match(supervisor, /action: 'not-terminated'/);
  assert.match(supervisor, /history\.length > 3/);
  assert.match(supervisor, /slot-restart-suppressed/);
});
