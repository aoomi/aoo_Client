import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
    new URL('../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url),
    'utf8',
);
const prefab = JSON.parse(fs.readFileSync(
    new URL('../../assets/Lobby/Prefab/LobbyMain.prefab', import.meta.url),
    'utf8',
));
const bootstrapSource = fs.readFileSync(
    new URL('../../assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts', import.meta.url),
    'utf8',
);

// Saved-hierarchy resolution and actual onCreate/binding regressions live in
// lobby-main-saved-hierarchy.test.mjs. Recursive name independence is obsolete.

test('JoinRoom remains an enabled standard Button entry', () => {
    const joinRoom = prefab.find(entry => entry?.__type__ === 'cc.Node' && entry._name === 'JoinRoom');
    assert.ok(joinRoom, 'LobbyMain must contain JoinRoom');
    const button = (joinRoom._components ?? [])
        .map(reference => prefab[reference.__id__])
        .find(entry => entry?.__type__ === 'cc.Button');
    assert.ok(button, 'JoinRoom must use the standard Button binding contract');
    assert.equal(button._enabled, true);
    assert.equal(button._interactable, true);
    // Authored transition is user-owned; source must not overwrite it.
});

test('directional lobby layout is owned by prefab widgets instead of runtime coordinate overrides', () => {
    const visibilityStart = source.indexOf('private applyLegacyRuntimeVisibility');
    const visibilityEnd = source.indexOf('private findDescendant', visibilityStart);
    const visibilitySource = source.slice(visibilityStart, visibilityEnd);
    assert.doesNotMatch(visibilitySource, /installLobbyViewportAdaptation/);
    assert.doesNotMatch(source, /alignLobbyRegionContent|alignLobbySemanticGroup|setWidgetAlignment/);
    assert.doesNotMatch(source, /const inset = 80|addEventListener\('resize'/);


});

test('landscape viewport expands horizontally instead of letterboxing the lobby', () => {
    assert.match(
        bootstrapSource,
        /view\.setDesignResolutionSize\(1280, 720, ResolutionPolicy\.FIXED_HEIGHT\)/,
    );
    assert.doesNotMatch(
        bootstrapSource,
        /view\.setDesignResolutionSize\(1280, 720, ResolutionPolicy\.SHOW_ALL\)/,
    );
});
