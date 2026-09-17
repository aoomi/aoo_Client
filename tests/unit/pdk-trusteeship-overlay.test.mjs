import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registry = readFileSync(new URL('../../assets/Common/Code/Runtime/ui/CommonPrefabRegistry.ts', import.meta.url), 'utf8');
const coordinator = readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts', import.meta.url), 'utf8');
const play = readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url), 'utf8');

test('PDK local trusteeship uses the one shared AutoPlay prefab', () => {
  assert.match(registry, /AutoPlay:\s*\{\s*bundle:\s*COMMON_PREFAB_BUNDLE,\s*asset:\s*'Prefab\/AutoPlay'/);
  assert.match(coordinator, /const AUTO_PLAY_FORM = 'room\/AutoPlay'/);
  assert.match(play, /this\.syncAutoPlay\(Boolean\(local\?\.trusteeship\)\)/);
});

test('cancel button submits an authoritative trusteeship false action', () => {
  assert.match(coordinator, /getChildByName\('btn_cancel'\)/);
  assert.match(coordinator, /'common\.room\.trusteeship_req',[\s\S]*trusteeship:\s*false/);
  assert.match(coordinator, /modal:\s*false/);
});
