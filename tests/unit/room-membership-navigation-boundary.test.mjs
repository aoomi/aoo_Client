import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
    '../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url,
), 'utf8');
const router = readFileSync(new URL(
    '../../assets/Login/Code/Navigation/SceneRouter.ts', import.meta.url,
), 'utf8');

test('room-number join keeps game-lobby origin independent of room ownership', () => {
    assert.match(source, /new JoinRoomController[\s\S]*entryOrigin: 'GAME_LOBBY'[\s\S]*fromClub: false/);
});

test('lobby startup reconciles authoritative membership without local recovery cache', () => {
    assert.match(source, /intent \? null : await hallRoomGateway\.activeRoom\(\)/);
    assert.match(source, /entryOrigin: intent\?\.entryOrigin \?\? 'GAME_LOBBY'/);
});

test('failed active-room recovery leaves authority before exposing the lobby', () => {
    assert.match(router, /ROOM_RECOVERY_FAILURE[\s\S]*await gateway\.leave\(Number\(activeRoom\.roomId\)\)/);
    assert.match(router, /if \(cleanupError\) throw cleanupError/);
});

test('an in-progress club room is never downgraded to a lobby waiting desk', () => {
    assert.match(router, /waitingClubRoom[\s\S]*Number\(activeRoom\.roundNo \?\? 0\) <= 0/);
});
