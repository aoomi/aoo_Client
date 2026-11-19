import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const selector = readFileSync(new URL('../../assets/Modules/CreateRoom/Code/PlaySelectorController.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../../assets/Club/Code/Runtime/ClubRoomFeeController.ts', import.meta.url), 'utf8');

test('new club template room name uses play name and base score', () => {
    assert.match(selector, /gameDisplayName: this\.selectedGame\.displayName/);
    assert.match(selector, /classificationName: this\.selectedGame\.classificationName/);
    assert.match(controller, /String\(config\.roomName \?\? ''\)\.trim\(\) \|\| this\.defaultRoomName\(baseScore\)/);
    assert.match(controller, /displayName\.startsWith\(classificationName\)/);
    assert.match(controller, /displayName\.slice\(classificationName\.length\)\.trim\(\)/);
    assert.match(controller, /`\$\{playName\}\$\{baseScore\}分`/);
    assert.match(controller, /\[ClubRoomFee\] form-ready/);
});
