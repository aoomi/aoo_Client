import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(clientRoot, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');

test('lobby room entries stay on the standard Cocos capture chain', () => {
    assert.match(source, /const supportedEntryNames = new Set\(\['CreateRoom', 'JoinRoom'/);
    assert.match(source, /root\.on\(Node\.EventType\.TOUCH_END, captureTouch, this, true\)/);
    assert.match(source, /root\.on\(Node\.EventType\.MOUSE_UP, captureMouse, this, true\)/);
    assert.match(source, /bounds\?\.contains\(location\)/);
    assert.doesNotMatch(source, /captureDomPointer|window\.addEventListener\('mouseup'/);
});

test('join-room entry emits bounded lifecycle diagnostics and opens the public Numpad', () => {
    assert.match(source, /case 'JoinRoom':[\s\S]*\[LobbyJoinRoomEntry\][\s\S]*forms\?\.show\('common\/Numpad'\)/);
    assert.match(source, /action: form\?\.isShown\(\) \? 'NUMPAD_SHOWN' : 'NUMPAD_UNAVAILABLE'/);
});
