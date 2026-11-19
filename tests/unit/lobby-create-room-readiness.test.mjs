import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(path.join(clientRoot, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');

test('CreateRoom entry has an explicit readiness gate before selector.open', () => {
    assert.match(source, /private createRoomControllerReady = false;/);
    assert.match(source, /private createRoomOpenPending = false;/);
    assert.match(source, /private createRoomReadyPromise: Promise<void> \| null = null;/);
    assert.match(source, /this\.createRoomReadyPromise = new Promise<void>\(\(resolve, reject\) =>/);
    assert.match(source, /await this\.playSelector\.install\(\);/);
    assert.match(source, /this\.createRoomControllerReady = true;/);
    assert.match(source, /if \(this\.createRoomOpenPending\) \{[\s\S]*this\.createRoomOpenPending = false;[\s\S]*this\.openCreateRoomSelector\(\);/);
    assert.match(source, /if \(!this\.createRoomControllerReady\) \{[\s\S]*this\.createRoomOpenPending = true;/);
    assert.match(source, /if \(this\.createRoomOpenPending\) return;/);
    assert.match(source, /void this\.createRoomReadyPromise\.catch\(\(error: unknown\) =>/);
    assert.match(source, /void selector\.open\(\)\.catch/);
});

test('CreateRoom readiness failures are machine-readable, visible, and cancellation-safe', () => {
    assert.match(source, /this\.createRoomReadinessError\('LOBBY_CREATE_ROOM_INIT_FAILED', cause\)/);
    assert.match(source, /this\.showProductionError\(failure\);[\s\S]*throw failure;/);
    assert.match(source, /this\.createRoomReadinessError\('LOBBY_CREATE_ROOM_INIT_CANCELLED'\)/);
    assert.match(source, /this\.createRoomReadinessError\('LOBBY_CREATE_ROOM_NOT_MOUNTED'\)/);
    assert.match(source, /this\.createRoomReadinessError\('LOBBY_CREATE_ROOM_SELECTOR_UNAVAILABLE'\)/);
    assert.match(source, /Object\.defineProperty\(error, 'code'/);
    assert.doesNotMatch(source, /setTimeout\([^)]*createRoomControllerReady/);
});
