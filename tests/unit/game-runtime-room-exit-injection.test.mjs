import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const entries = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
const router = read('assets/Login/Code/Navigation/SceneRouter.ts');

test('production runtime options expose one authoritative room-exit capability', () => {
  assert.match(entries,
    /readonly requestRoomExit: \(roomId: number\) => Promise<void>;/);
  assert.match(entries,
    /onExitRequested: options\.onCD299ExitRequested \?\? options\.requestRoomExit/);
  assert.match(entries,
    /readonly refreshRoomConnection:[\s\S]*readonly requestRoomExit:/,
    'room exit must extend, not replace, the protected reconnect dependency');
});

test('normal lobby exit commits Hall leave before clearing and navigating', () => {
  const block = lobby.match(/requestRoomExit: async roomId => \{([\s\S]*?)\n\s*\},\n\s*onCD299ExitRequested:/)?.[1];
  assert.ok(block, 'normal lobby requestRoomExit injection is missing');
  const leave = block.indexOf('await hallRoomGateway.leave(roomId)');
  const clear = block.indexOf('this.clearRoomNavigationContext()');
  const navigate = block.indexOf('await this.navigateToLobby()');
  assert.ok(leave >= 0 && clear > leave && navigate > clear,
    'local cleanup/navigation must happen only after authoritative Hall leave');
});

test('startup recovery and CD299 share the same authoritative exit implementation', () => {
  assert.match(router,
    /requestRoomExit: roomId => this\.exitRecoveredRoom\([\s\S]*?gateway, roomId\)/);
  assert.match(router,
    /exitRecoveredCD299Spectator\([\s\S]*?return this\.exitRecoveredRoom\(account, role, handoff, gateway, roomId\);/);
  const block = router.match(/private async exitRecoveredRoom\([\s\S]*?\n\s*}\n\n\s*private createHallRoomGateway/)?.[0];
  assert.ok(block, 'shared startup recovery exit implementation is missing');
  const leave = block.indexOf('await gateway.leave(roomId)');
  const clear = block.indexOf('this.roomRecovery.clear(String(account.accountId))');
  const destroy = block.indexOf('this.destroyStartupGameRuntime()');
  const navigate = block.indexOf('await this.returnFromRoom(account, role, handoff)');
  assert.ok(leave >= 0 && clear > leave && destroy > clear && navigate > destroy,
    'recovery state and runtime must survive until Hall leave commits');
});

test('shared exit injection does not invent a next-round or local reset path', () => {
  for (const source of [entries, lobby, router]) {
    assert.doesNotMatch(source, /requestRoomExit:[\s\S]{0,500}(?:nextRound|continueGame|resetRound|startRound)/);
  }
});
