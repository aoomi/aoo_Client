import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('lobby normal loading uses the one Creator WaitForm without a competing DOM cover', () => {
  const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
  const manager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
  const commonRegistry = read('assets/Common/Code/Runtime/ui/CommonPrefabRegistry.ts');
  const moduleRegistry = read('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');
  const prefab = JSON.parse(read('assets/Common/Prefab/WaitNet.prefab'));

  assert.match(moduleRegistry, /UILobbyMain:\s*\{ bundle: 'lobby', asset: 'Prefab\/LobbyMain' \}/);
  assert.match(commonRegistry, /UIWaitForm:\s*\{ bundle: COMMON_ASSET_BUNDLE, asset: 'WaitNet' \}/);
  assert.doesNotMatch(moduleRegistry, /UIWaitForm/);
  assert.match(lobby, /new LegacyFormManager\(parent,[\s\S]{0,100}true\)/);
  assert.match(lobby, /forms\.show\('UIWaitForm'\)[\s\S]{0,120}}, 120\)/);
  assert.match(manager, /externalLoadingPresentation \? 60_000 : defaultDelay/);
  assert.equal(prefab[0].__type__, 'cc.Prefab');
  assert.equal(prefab[prefab[0].data.__id__]._name, 'WaitNet');
});

test('login and game-entry managers retain the explicit transition exception', () => {
  const login = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');
  const game = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts');
  assert.match(login, /new LegacyFormManager\(this\.node\)/);
  assert.match(game, /new LegacyFormManager\(uiLayer\)/);
});

test('retired message variants resolve through the retained Message prefab', () => {
  const registry = read('assets/Common/Code/Runtime/ui/CommonPrefabRegistry.ts');
  const manager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
  for (const form of ['UIMessageGps', 'UIMessageJoin', 'UIMessageLostConnect', 'UIMessageTip', 'UIMessageUpdate']) {
    assert.match(registry, new RegExp(`${form}: \\{ bundle: COMMON_ASSET_BUNDLE, asset: 'Message' \\}`));
  }
  assert.doesNotMatch(registry, /asset: '(?:MessageGps|MessageJoin|MessageLostConnect|MessageTip|MessageUpdate)'/);
  assert.doesNotMatch(manager, /selectMessageTemplate|MessageTemplates/);
});

test('shared dissolve form resolves to its real games-common address', () => {
  const registry = read('assets/Common/Code/Runtime/ui/CommonPrefabRegistry.ts');
  assert.match(registry, /DissolveRoom:\s*\{ bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab\/DissolveRoom' \}/);
  assert.doesNotMatch(registry, /asset: 'Common\/DissolveRoom'/);
});
