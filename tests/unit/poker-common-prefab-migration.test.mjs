import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const deletedPokerPacksRoot = join(clientRoot, 'assets/Games/Poker/Packs');
const commonRoot = join(clientRoot, 'assets/Games/Common/Prefab');
const pdkCommonRoom = join(clientRoot, 'assets/Games/Poker/PDK/Common/Prefab/PDK_CommonRoom.prefab');

const publicPrefabs = [
  'AutoPlay', 'ChatPanel', 'DissolveRoom', 'InviteOnlinePlayers',
  'MagicPanel', 'VoiceRecordingPanel', 'gps',
];

test('NJPDK game-neutral prefabs have one Common authority and no Poker copy', () => {
  for (const name of publicPrefabs) {
    assert.equal(existsSync(join(commonRoot, name + '.prefab')), true, name + ' missing from Common');
    assert.equal(existsSync(join(commonRoot, name + '.prefab.meta')), true, name + ' meta missing from Common');
  }
  assert.equal(existsSync(deletedPokerPacksRoot), false, 'deleted Poker/Packs must not be restored');
});

test('PDK room has one current public authority and deleted Pack01 stays absent', () => {
  assert.equal(existsSync(pdkCommonRoom), true);
  assert.equal(existsSync(deletedPokerPacksRoot), false);
});

test('runtime resolves migrated forms through the games-common bundle root', () => {
  const registry = readFileSync(join(clientRoot, 'assets/Common/Code/Runtime/ui/CommonPrefabRegistry.ts'), 'utf8');
  const gameRegistry = readFileSync(join(clientRoot, 'assets/Common/Code/Runtime/ui/GamePrefabRegistry.ts'), 'utf8');
  const nativeMap = readFileSync(join(clientRoot, 'assets/Common/Config/NativeMaps/prefab-path-map.json'), 'utf8');
  const manager = readFileSync(join(clientRoot, 'assets/Common/Code/Runtime/ui/LegacyFormManager.ts'), 'utf8');
  const launcher = readFileSync(join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts'), 'utf8');
  const play = readFileSync(join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const seats = readFileSync(join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/Room/SeatPresenter.ts'), 'utf8');
  assert.match(registry, /COMMON_PREFAB_BUNDLE\s*=\s*'games-common'/);
  assert.doesNotMatch(gameRegistry, /games-common-prefab|PaoDeKuaiSportPointDialog/);
  assert.doesNotMatch(nativeMap, /PaoDeKuaiSportPointDialog/);
  assert.match(manager, /resolveCommonPrefabAsset\(path\)/);
  assert.match(launcher, /loadBundle\(COMMON_PREFAB_BUNDLE\)/);
  assert.match(play, /RoomViewBindings/);
  assert.match(seats, /bundle\(COMMON_ASSET_BUNDLE\)/);
  assert.match(seats, /load\(COMMON_HEAD_ASSET, Prefab, bundle\)/);
  assert.doesNotMatch(play, /NjpdkGameNJPDKPublicHeadNJPDK/);
});
