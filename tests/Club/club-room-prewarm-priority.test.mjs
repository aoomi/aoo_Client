import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lobbySource = readFileSync(new URL('../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url), 'utf8');
const clubSource = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url), 'utf8');
const gatewaySource = readFileSync(new URL('../../assets/Lobby/Code/HallRoomGateway.ts', import.meta.url), 'utf8');

test('club desk rendering warms at most one shared room family per club', () => {
    assert.match(clubSource, /this\.prewarmedClubId !== activeClubId/);
    assert.match(clubSource, /this\.prewarmedClubId = activeClubId/);
    assert.match(clubSource, /emit\(['"]legacy-club-prewarm-room['"]/);
    assert.match(lobbySource, /onNode\([^\n]+['"]legacy-club-prewarm-room['"]/);
});

test('the shared PDK room shell is still warmed once before club restoration', () => {
    const warmup = lobbySource.indexOf("legacy-club-prewarm-room");
    const clubInstall = lobbySource.indexOf('this.clubEntry.install()');
    assert.ok(warmup >= 0, 'shared PDK room warmup bridge is missing');
    assert.ok(clubInstall >= 0, 'club entry installation is missing');
    assert.ok(warmup < clubInstall, 'shared room warmup must start before the club becomes interactive');
});

test('a committed club-template seat reads room metadata and ticket in parallel', () => {
    assert.match(gatewaySource,
        /resumeCommittedRoom[\s\S]*?Promise\.all\(\[[\s\S]*?this\.prepare\(roomId\)[\s\S]*?this\.issueRoomTicket\(/);
    assert.match(gatewaySource, /POST', '\/api\/v2\/hall\/club-template-rooms'/);
    assert.match(lobbySource,
        /existingRoomId <= 0 && clubId > 0[\s\S]{0,220}enterClubTemplateRoom\(roomKey, clubId/);
});
