import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
    '../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url,
), 'utf8');
const router = readFileSync(new URL(
    '../../assets/Login/Code/Navigation/SceneRouter.ts', import.meta.url,
), 'utf8');
const gateway = readFileSync(new URL(
    '../../assets/Lobby/Code/HallRoomGateway.ts', import.meta.url,
), 'utf8');

test('room-number join keeps game-lobby origin independent of room ownership', () => {
    assert.match(source, /new JoinRoomController[\s\S]*entryOrigin: 'GAME_LOBBY'[\s\S]*fromClub: false/);
});

test('lobby startup reconciles authoritative membership without local recovery cache', () => {
    assert.match(source, /intent \? null : await hallRoomGateway\.activeRoom\(\)/);
    assert.match(source, /entryOrigin: intent\?\.entryOrigin \?\? 'GAME_LOBBY'/);
});

test('failed active-room recovery preserves authority and blocks lobby fallback', () => {
    assert.match(router, /ROOM_RECOVERY_FAILURE[\s\S]*membershipAction: 'PRESERVED'[\s\S]*throw error/);
    const failureStart = router.indexOf("stage: 'ROOM_RECOVERY_FAILURE'");
    const failureEnd = router.indexOf("if (presentation === 'MOUNT_CURRENT'", failureStart);
    const failureBranch = router.slice(failureStart, failureEnd);
    assert.doesNotMatch(failureBranch, /await gateway\.leave/);
});

test('recovered CD299 spectator exit commits authority before local teardown and lobby return', () => {
    assert.match(router, /onCD299ExitRequested: roomId => this\.exitRecoveredCD299Spectator/);
    const start = router.indexOf('private async exitRecoveredCD299Spectator');
    const end = router.indexOf('private createHallRoomGateway', start);
    const exit = router.slice(start, end);
    const leave = exit.indexOf('await gateway.leave(roomId)');
    const clear = exit.indexOf('this.roomRecovery.clear(String(account.accountId))');
    const destroy = exit.indexOf('this.destroyStartupGameRuntime()');
    const lobby = exit.indexOf('await this.returnFromRoom(account, role, handoff)');
    assert.ok(leave >= 0 && clear > leave && destroy > clear && lobby > destroy);
    const failure = exit.slice(exit.indexOf("stage: 'LEAVE_FAILED'"), exit.indexOf('throw error') + 11);
    assert.doesNotMatch(failure, /roomRecovery\.clear|destroyStartupGameRuntime|returnFromRoom/);
    assert.match(exit, /roomId, playerId: role\.playerId, accountId: account\.accountId/);
    assert.doesNotMatch(exit, /\.(?:accessToken|refreshToken|gameTicket|wsTicket)\b/);
});

test('lobby-side recovery keeps intent and reports the authoritative identity context', () => {
    assert.match(source, /\[RoomMembershipBoundary\] lobby-room-recovery-blocked/);
    assert.match(source, /playerId: this\.role\.playerId[\s\S]*membershipAction: 'PRESERVED'/);
    const start = source.indexOf("'[RoomMembershipBoundary] lobby-room-recovery-blocked'");
    const failureBranch = source.slice(start, source.indexOf('private rememberRoomRecoveryIntent', start));
    assert.doesNotMatch(failureBranch, /clearRoomRecoveryIntent\(\)/);
});

test('an in-progress club room is never downgraded to a lobby waiting desk', () => {
    assert.match(router, /waitingClubRoom = Number\(activeRoom\?\.clubId \?\? 0\) > 0[\s\S]*Number\(activeRoom\.roundNo \?\? 0\) <= 0/);
});

test('a personal Liangshan waiting room always follows authoritative room recovery', () => {
    assert.match(router, /waitingClubRoom = Number\(activeRoom\?\.clubId \?\? 0\) > 0/);
    assert.doesNotMatch(router, /waitingClubRoom = activeRoom\?\.gameName/);
});

test('terminal room leave completes only after an authoritative terminal probe', () => {
    const leave = gateway.slice(gateway.indexOf('public leave'), gateway.indexOf('public history'));
    assert.match(leave, /hall-room-leave-reconcile/);
    assert.match(leave, /const reconciledActive = await this\.api\.get<HallActiveRoom>\('\/api\/v2\/hall\/rooms\/active'\)/);
    assert.match(leave, /if \(reconciledActive\.active\) throw reconcileError/);
    assert.match(leave, /!terminalRoom && !this\.isAuthorityLeaveRejection\(reconcileError\)/);
    assert.match(leave, /terminal-leave-idempotent/);
    assert.match(leave, /return \{ left: true, alreadyTerminal: true \}/);
    assert.match(leave, /DISSOLVED\|EXPIRED\|CLOSED\|FINISHED/);
    assert.match(leave, /error\.code === '3001' \|\| error\.code === 'ROOM_NOT_FOUND'/);
    assert.match(leave, /error\.status !== 409/);
    assert.match(leave, /HALL_AUTHORITY_REJECTED/);
    assert.match(leave, /ROOM_LEAVE_REJECTED/);
    assert.doesNotMatch(leave, /error\.code === '3008'/);
});

test('successful room leave remains page-wide until a new membership lifecycle starts', () => {
    const leave = gateway.slice(gateway.indexOf('public leave'), gateway.indexOf('private async leaveOnce'));
    assert.match(gateway, /private static readonly leaves = new Map<string, Promise<unknown>>\(\)/);
    assert.match(gateway, /const leaveKey = `\$\{this\.playerId\}:\$\{roomId\}`/);
    assert.match(gateway, /const shared = HallRoomGateway\.leaves\.get\(leaveKey\)/);
    assert.match(gateway, /if \(shared\)[\s\S]*return shared/);
    assert.match(gateway, /HallRoomGateway\.leaves\.set\(leaveKey, leave\)/);
    assert.match(gateway, /HallRoomGateway\.leaves\.get\(leaveKey\) === leave/);
    assert.match(gateway, /void leave\.catch\(\(\) =>/);
    assert.match(gateway, /HallRoomGateway\.leaves\.delete\(joinKey\)/);
    assert.doesNotMatch(leave, /setTimeout/);
});
