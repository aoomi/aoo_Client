import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const service = read('assets/Common/Code/Runtime/ui/NumpadService.ts');
const consumers = [
    'assets/Lobby/Code/JoinRoomController.ts',
    'assets/Club/Code/Runtime/LegacyJoinClubController.ts',
    'assets/Club/Code/Runtime/LegacyJoinUnionController.ts',
    'assets/Modules/Records/Code/ReplayCodeController.ts',
    'assets/Modules/GiftRoomCard/Code/GiftRoomCardController.ts',
    'assets/Club/Code/Runtime/ClubRoomFeeController.ts',
    'assets/Club/Code/Runtime/LegacyClubMainController.ts',
    'assets/Common/Code/Runtime/ui/LegacyFormManager.ts',
    'assets/Modules/CreateRoom/Code/PlaySelectorController.ts',
    'assets/Club/Code/Runtime/LegacyClubPromotionController.ts',
].map(read).join('\n');

test('public Numpad owns every key-editing operation', () => {
    assert.match(service, /setValue\(value: string\): void/);
    assert.match(service, /private appendDigit\(/);
    assert.match(service, /private appendDecimal\(/);
    assert.match(service, /display\.setValue\(display\.value\(\)\.slice\(0, -1\)\)/);
    assert.doesNotMatch(service, /interface NumpadCallbacks[\s\S]*?digit\(|interface NumpadCallbacks[\s\S]*?backspace\(|interface NumpadCallbacks[\s\S]*?decimal\(/);
    assert.doesNotMatch(consumers, /digit:\s*\(|backspace:|clear:|decimal:\s*\(/);
});

test('decimal policy is declarative and integer identifiers ignore dot', () => {
    assert.match(service, /\(display\.decimalPlaces \?\? 0\) <= 0/);
    assert.match(service, /return current \? `\$\{current\}\.` : '0\.'/);
    assert.match(consumers, /decimalPlaces: 2/);
    for (const relative of [
        'assets/Lobby/Code/JoinRoomController.ts',
        'assets/Club/Code/Runtime/LegacyJoinClubController.ts',
        'assets/Club/Code/Runtime/LegacyJoinUnionController.ts',
        'assets/Modules/Records/Code/ReplayCodeController.ts',
        'assets/Modules/GiftRoomCard/Code/GiftRoomCardController.ts',
    ]) assert.doesNotMatch(read(relative), /decimalPlaces:\s*[1-9]/, `${relative} must remain integer-only`);
});

test('legacy numeric EditBoxes are routed globally, not only inside club forms', () => {
    const manager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    assert.match(manager, /private bindNumericNumpads\(/);
    assert.match(manager, /nativeNumericMode \|\| numericName\.test\(node\.name\)/);
    assert.doesNotMatch(manager, /isClubForm|bindClubNumericNumpads|openClubNumericNumpad|clubNumericOpeners/);
});

test('public Numpad displays and closes directly without any transition', () => {
    const manager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    assert.match(service, /if \(!disposed && node\.isValid\) callbacks\.confirm\(\)/);
    assert.doesNotMatch(service, /tween\(|Tween|ENTER_SECONDS|EXIT_SECONDS|travel|PARENT_CHANGED/);
    assert.match(manager, /showFromCenter && this\.name !== 'Numpad'/);
});

test('cached join-room Numpad transfers lifecycle and button ownership after returning from a game', () => {
    const manager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    const join = read('assets/Lobby/Code/JoinRoomController.ts');
    assert.match(manager, /this\.loaded\.get\(path\)\?\.updateOptions\(options\)/);
    assert.match(join, /const cached = this\.forms\.get\(FORM_PATH\)/);
    assert.match(join, /if \(cached\?\.node\.isValid\) this\.bind\(cached\)/);
    assert.match(join, /if \(this\.form !== form \|\| !this\.numpad\) this\.bind\(form\)/);
});
