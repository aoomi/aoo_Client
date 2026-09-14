import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (relative) => readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const [coordinator, play, social] = await Promise.all([
  read('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'),
  read('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'),
  read('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSocialController.ts'),
]);

test('PDK room resolves all public feature gates from the authoritative catalog', () => {
  assert.match(coordinator, /this\.roomCapabilities = getGameCapabilities\(gameCode\)/);
  assert.doesNotMatch(coordinator, /(?:CD201|LS201).*(?:supportsSettings|supportsChat|supportsVoice|supportsDissolve)/);
  for (const capability of ['supportsSettings', 'supportsChat', 'supportsVoice', 'supportsDissolve']) {
    assert.match(coordinator + play + social, new RegExp(`roomCapabilities\\.${capability}|capabilities\\?\\.${capability}|capabilities\\.${capability}`));
  }
});

test('disabled capabilities neither create controllers nor bind visible room entries', () => {
  assert.match(coordinator, /this\.roomCapabilities\.supportsChat\s*\? new CommonPdkChatController/);
  assert.match(coordinator, /this\.roomCapabilities\.supportsVoice\s*\? new CommonPdkVoiceController/);
  assert.match(coordinator, /this\.roomCapabilities\.supportsSettings\s*\? new CommonSettingsController/);
  assert.match(coordinator, /this\.roomCapabilities\.supportsDissolve \? new CommonPdkDissolveController/);
  assert.match(play, /entry\.active = enabled;\s*if \(enabled\) this\.bind\(path, listener\)/);
  assert.match(coordinator, /entry\.active = this\.roomCapabilities\.supportsDissolve;\s*if \(!this\.roomCapabilities\.supportsDissolve\) return;/);
});

test('chat and voice action chains reject disabled capabilities before requests', () => {
  assert.equal((social.match(/if \(!this\.capabilities\.supportsChat\) return Promise\.reject/g) || []).length, 3);
  assert.equal((social.match(/if \(!this\.capabilities\.supportsVoice\) return Promise\.reject/g) || []).length, 1);
  assert.match(social, /if \(capabilities\.supportsChat\) this\.disposers\.push\(runtime\.on\('room\.quick_text'/);
  assert.match(social, /if \(capabilities\.supportsVoice\) this\.disposers\.push\(runtime\.on\('room\.voice'/);
});

test('dissolve requests keep the existing room and permission flow behind the gate', () => {
  assert.match(coordinator, /private openDissolveRoom\(\): void \{\s*if \(!this\.roomCapabilities\.supportsDissolve\) return;/);
  assert.match(coordinator, /runtime\.action\('dissolve', 'common\.room\.dissolve_req', \{ roomID: roomId \}\)/);
});
