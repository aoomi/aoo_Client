import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(clientRoot, relative), 'utf8');

test('PDK delegates chat, voice and magic to the shared CommonRoom ports', () => {
    const coordinator = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts');
    const runtimeEntry = read('assets/Games/Common/Code/Runtime/GameRuntimeEntry.ts');
    assert.match(coordinator, /commonRoomPorts\(\): CommonRoomFeaturePorts \| null/);
    assert.match(coordinator, /socialRenderer:/);
    assert.match(coordinator, /sendCommonSocial/);
    assert.match(coordinator, /command: 'quick_text'/);
    assert.match(coordinator, /command: 'voice'/);
    assert.match(coordinator, /sendMagicExpression/);
    assert.match(runtimeEntry, /interface CommonRoomFeaturePorts/);
    assert.match(runtimeEntry, /socialRenderer\?:/);
    assert.match(runtimeEntry, /chatWindow\?:/);
    assert.match(runtimeEntry, /voiceCapture\?:/);
});

test('shared social transport owns canonical dispatch and lifecycle', () => {
    const social = read('assets/Games/Common/Code/Room/CommonRoomSocialController.ts');
    const chat = read('assets/Games/Common/Code/Room/CommonRoomChatController.ts');
    const voice = read('assets/Games/Common/Code/Room/CommonRoomVoiceController.ts');
    assert.match(social, /this\.transport\.send\(normalizedCommand/);
    assert.match(social, /this\.disposers\.push/);
    assert.match(chat, /chat\.text/);
    assert.match(chat, /chat\.quick/);
    assert.match(voice, /voice/);
    assert.match(voice, /this\.capture/);
});

test('PDK production source no longer references the removed private social controller', () => {
    const runtimeRoot = path.join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime');
    const files = fs.readdirSync(runtimeRoot, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
        .map(entry => path.join(entry.parentPath, entry.name));
    for (const file of files) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /PdkSocialController/);
    }
});
