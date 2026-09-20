import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
    '../../assets/Modules/CreateRoom/Code/PlaySelectorController.ts', import.meta.url,
), 'utf8');

test('create-room DOM pointer fallback is not installed for ordinary game buttons', () => {
    assert.match(source,
        /const canvas = captureRoot && typeof HTMLCanvasElement !== 'undefined'/,
        'global DOM capture must require an explicit capture root');
    assert.match(source,
        /this\.onClick\(item, \(\) => \{ void this\.selectGame\(game\); \}\)/,
        'game entries must use ordinary Cocos button binding without a capture root');
    assert.match(source,
        /this\.onClick\(this\.requireNode\(form, CREATE_BUTTON_PATH\),[\s\S]*form\.node\.scene \?\? form\.node\)/,
        'the submit button keeps its explicit Preview fallback');
});
