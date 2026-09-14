import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const controller = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyUnionManagerController.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../../Server/server/Club/src/main/java/com/aoo/bcg/club/ClubDispatchService.java', import.meta.url), 'utf8');

test('union setting toggles remain mutually exclusive without serialized Toggle groups', () => {
    assert.match(controller, /private bindExclusiveToggles\(toggles: Toggle\[\]\)/);
    assert.match(controller, /if \(selected\.isChecked\)[\s\S]*other\.isChecked = false/);
    assert.match(controller, /if \(!toggles\.some\(toggle => toggle\.isChecked\)\) selected\.isChecked = true/);
    assert.match(controller, /this\.bindExclusiveToggles\(toggles\)/);
});

test('visible desk limits and all saved radio fields round-trip through authority', () => {
    assert.match(controller, /tableNum: \[0, 5, 10, 20\]\[this\.checked\(root, 'tableToggle', 4\) - 1\] \?\? 0/);
    assert.match(server, /out\.put\("joinClubSameUnion", setting\(state, "unionJoinClubSameUnion", 0\)\)/);
    assert.match(server, /out\.put\("tableNum", setting\(state, "unionTableNum", 0\)\)/);
});
