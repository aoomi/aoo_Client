import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('refresh queues every registered and module-routed form after the current surface is visible', () => {
    const manager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    const registry = read('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');
    const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
    assert.match(registry, /export function listModulePrefabForms/);
    assert.match(manager, /\.\.\.this\.options\.keys\(\)/);
    assert.match(manager, /\.\.\.listCommonPrefabForms\(\)/);
    assert.match(manager, /\.\.\.listGamePrefabForms\(\)/);
    assert.ok(manager.indexOf('...listGamePrefabForms()') < manager.indexOf('...listCommonPrefabForms()'),
        'game-room forms must lead the background preload queue');
    assert.ok(manager.indexOf('...listCommonPrefabForms()') < manager.indexOf('...this.options.keys()'),
        'shared room forms must load before optional registered pages');
    assert.match(manager, /includeModules \? listModulePrefabForms\(\) : \[\]/);
    assert.match(manager, /preloadRefreshSurface\(includeModules = true, concurrency = 1\)/);
    assert.doesNotMatch(lobby, /await refreshSurfaceWarmup/);
    assert.match(lobby, /setTimeout\(\(\) => \{ void this\.forms\?\.preloadRefreshSurface\(true, 1\); \}, 0\)/);
});

test('login uses public warmup while an active room warms only room-reachable panels', () => {
    const login = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');
    const room = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts');
    assert.match(login, /forms\.preloadRefreshSurface\(false, 1\)/);
    assert.doesNotMatch(room, /forms\.preloadRefreshSurface/);
    assert.match(room, /Room-reachable panels are preloaded by CommonPdkSwitchCoordinator/);
});

test('button and background warmup share prefab and bundle single-flight caches', () => {
    const manager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    assert.match(manager, /prefabLoading = new Map<string, Promise<Prefab \| null>>/);
    assert.match(manager, /const pending = this\.prefabLoading\.get\(normalizedPath\)/);
    assert.match(manager, /if \(pending\) return pending/);
    assert.match(manager, /bundleLoading = new Map<string, Promise<AssetManager\.Bundle \| null>>/);
});

test('lobby form loading never opens a second per-button loading presentation', () => {
    const manager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    assert.match(manager, /loading: !this\.externalLoadingPresentation/);
    assert.match(manager, /if \(!this\.externalLoadingPresentation\) this\.changeLoading\(1\)/);
});
