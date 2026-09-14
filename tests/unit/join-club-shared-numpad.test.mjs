import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const controller = fs.readFileSync(
    new URL('../../assets/Club/Code/Runtime/LegacyJoinClubController.ts', import.meta.url),
    'utf8',
);
const registry = fs.readFileSync(
    new URL('../../assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts', import.meta.url),
    'utf8',
);

test('join-club form resolves directly to the shared Numpad prefab', () => {
    assert.match(registry, /UIJoinClub:\s*\{ bundle: 'common', asset: 'Prefab\/Numpad' \}/);
});

test('join-club controller binds the form root instead of nesting another numpad', () => {
    assert.match(controller, /this\.numpadService\.attach\(form\.node/);
    assert.doesNotMatch(controller, /this\.numpadService\.open\(/);
    assert.doesNotMatch(controller, /form\.find\('btn_Join'\)/);
    assert.doesNotMatch(controller, /form\.find\('btn_close'\)/);
});
