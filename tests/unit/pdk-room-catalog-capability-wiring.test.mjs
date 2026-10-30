import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (relative) => readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const [coordinator, play] = await Promise.all([
  read('../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts'),
  read('../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts'),
]);

test('PDK room resolves all public feature gates from the authoritative catalog', () => {
  assert.match(coordinator, /this\.roomCapabilities = getGameCapabilities\(gameCode\)/);
  assert.doesNotMatch(coordinator, /(?:CD201|LS201).*(?:supportsSettings|supportsChat|supportsVoice|supportsDissolve)/);
  for (const capability of ['supportsSettings', 'supportsDissolve']) {
    assert.match(coordinator + play, new RegExp(`roomCapabilities\\.${capability}|capabilities\\?\\.${capability}|capabilities\\.${capability}`));
  }
});

test('disabled capabilities neither create controllers nor bind visible room entries', () => {
  assert.match(coordinator, /commonRoomPorts\(\): CommonRoomFeaturePorts \| null/);
  assert.match(coordinator, /this\.roomCapabilities\.supportsSettings\s*\? new CommonSettingsController/);
  assert.match(coordinator, /this\.roomCapabilities\.supportsDissolve\s*\?\s*this\.commonDissolvePort\(\)/);
  assert.match(coordinator, /new PdkDissolveAdapter/);
});

test('chat and voice action chains reject disabled capabilities before requests', () => {
  assert.match(coordinator, /commonRoomRuntimeDependencies\(\)/);
  assert.doesNotMatch(coordinator, /common\.room\.dispatch/);
});

test('dissolve requests keep the existing room and permission flow behind the gate', () => {
  assert.match(coordinator, /this\.roomCapabilities\.supportsDissolve\s*\?\s*this\.commonDissolvePort\(\)/);
  assert.match(coordinator, /CommonPdk_StartVoteDissolve/);
  assert.match(coordinator, /dissolveAdapter\?\.notifyStartVote\(\)/);
  assert.doesNotMatch(coordinator, /openDissolveRoom|openDissolveForm/);
  assert.doesNotMatch(coordinator, /common\.room\.dissolve_(?:req|agree_req|refuse_req)/);
});
