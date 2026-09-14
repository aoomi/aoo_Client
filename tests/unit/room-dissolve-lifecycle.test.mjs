import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const runtime = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts');
const coordinator = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts');
const dissolve = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkDissolveController.ts');
const launcher = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts');
const play = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');

test('approved dissolve has one authoritative terminal projection and one navigation owner', () => {
  assert.match(runtime, /terminalStateVersion/);
  assert.match(runtime, /view\.stateVersion <= this\.terminalStateVersion/);
  assert.match(coordinator, /if \(this\.leavePending\) return this\.leavePending/);
  assert.match(launcher, /if \(this\.returnPending\) return this\.returnPending/);
  assert.doesNotMatch(play, /requestLeave\('pdk-room-dissolved'\)/);
});

test('room overlays close before the sole lobby navigation callback', () => {
  assert.match(coordinator, /this\.forms\.onBeforeExitScene\(true\);[\s\S]*this\.lobbyNode\.emit\('subgame-returned'/);
  assert.match(launcher, /Promise\.resolve\(\)\.then\(\(\) => this\.returnToLobby\(target\)\)/);
});

test('dissolve applicant has no agree or reject actions', () => {
  assert.match(dissolve, /const canVote = createPos !== clientPos && clientVote === 0/);
  assert.match(dissolve, /this\.active\('Btn_Reject', canVote\)/);
  assert.match(dissolve, /this\.active\('Btn_Agree', canVote\)/);
});

test('dissolve follows the 2.2.2 authoritative terminal event instead of guessing from votes', () => {
  assert.doesNotMatch(dissolve, /allOccupiedSeatsAgreed|terminalHandled|onDissolved/);
  assert.match(dissolve, /if \(agree\) this\.runtime\.reconcileAuthority\(\)/);
  assert.doesNotMatch(dissolve, /applyActionAuthority\(result\)/);
    assert.match(runtime, /player is not seated\|room not found\|room route not found\|request_not_found\|\\b1002\\b\|\\b3001\\b/);
  assert.match(coordinator, /event === 'CommonPdk_DissolveRoom'[\s\S]*requestLeave\('pdk-room-dissolved'\)/);
});

test('successful dissolve reports once from the destination after room cleanup', () => {
  assert.match(coordinator, /startupMessage: reason === 'pdk-room-dissolved' \? '房间已解散' : undefined/);
});

test('dissolve return retains the live room frame before teardown and has no one-second wait', () => {
  assert.match(coordinator, /await transition\.retainCurrentPresentation\(\);[\s\S]*await this\.performLeave/);
  assert.match(launcher, /coordinator has already confirmed its retained source frame[\s\S]*this\.cleanup\(\)/);
  assert.doesNotMatch(launcher, /afterCurrentSceneDraw|setTimeout\(finish, 1_000\)/);
});

test('user exit uses the single Hall lifecycle and cannot be blocked by a closing game socket', () => {
  const leave = coordinator.slice(coordinator.indexOf('private async performLeave'), coordinator.indexOf('public destroy'));
  assert.match(leave, /if \(!authorityAlreadyExited\) await this\.leaveRoom\(roomId\)/);
  assert.doesNotMatch(leave, /CNJPDKExitRoom|runtime\.action\('leave-room'/);
});

test('refuse and timeout close dissolve without navigation', () => {
  assert.match(dissolve, /refused >= 0[\s\S]*this\.close\(\)[\s\S]*拒绝解散房间/);
  assert.match(dissolve, /remaining === 0[\s\S]*this\.hide\(\)/);
  assert.match(runtime, /const rejected = String\(view\.dissolveReason/);
  assert.match(runtime, /if \(rejected\)[\s\S]*CommonPdk_DissolveVoteRejected[\s\S]*this\.activeDissolveApplicant = 0[\s\S]*return/);
  assert.match(coordinator, /CommonPdk_DissolveVoteRejected[\s\S]*dissolveController\?\.onRejected/);
  assert.match(dissolve, /public onRejected\([\s\S]*ClearDissolve\(\)[\s\S]*this\.close\(\)/);
  assert.match(runtime, /if \(!Boolean\(approved\)\) continue/);
});

test('late vote roomEnd snapshot and reconnect callbacks cannot touch destroyed UI', () => {
  assert.match(dissolve, /requestGeneration/);
  assert.match(dissolve, /this\.disposed \|\| generation !== this\.requestGeneration/);
  assert.match(runtime, /if \(this\.disposed\) return;[\s\S]*restoreRoomAfterReconnect/);
  assert.match(runtime, /private applyAuthoritativePacket[\s\S]*if \(this\.disposed\) return/);
  assert.match(coordinator, /if \(this\.disposed\) return;[\s\S]*event === 'CommonPdk_DissolveRoom'/);
});

test('destroy cancels subscriptions and pending async ownership without recreating a form manager', () => {
  assert.match(runtime, /for \(const dispose of this\.disposers\.splice\(0\)\) dispose\(\)/);
  assert.match(runtime, /this\.pendingActions\.clear\(\)/);
  assert.doesNotMatch(coordinator, /new LegacyFormManager/);
  assert.doesNotMatch(dissolve, /setTimeout/);
});

test('a late dissolve form load is invalidated before it can issue or report through a destroyed manager', () => {
  assert.match(coordinator, /const generation = this\.roomUiGeneration/);
  assert.match(coordinator, /generation !== this\.roomUiGeneration \|\| !this\.forms\.isAlive\(\)/);
  assert.match(coordinator, /!this\.forms\.isAlive\(\)/);
  assert.match(coordinator, /private async performLeave[\s\S]*this\.roomUiGeneration \+= 1/);
  assert.match(coordinator, /public destroy[\s\S]*this\.roomUiGeneration \+= 1/);
});
