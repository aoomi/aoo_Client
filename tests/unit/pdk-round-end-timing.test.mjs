import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const play = readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url), 'utf8');
const coordinator = readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts', import.meta.url), 'utf8');

test('SetEnd no longer clears before the terminal physical hand lands', () => {
  const setEnd = play.slice(play.indexOf("event === 'CommonPdkSetEnd'"), play.indexOf("event === 'ChatMessage'"));
  assert.doesNotMatch(setEnd, /truncateRoundEndPresentation/);
  assert.match(play, /rememberLatestPublicCardLanding\(landing: Promise<void>\)[\s\S]*this\.latestPublicCardLanding = landing/);
});

test('ordinary and retained-table play share the same physical landing boundary', () => {
  const retained = play.slice(play.indexOf('private async presentPublicOperation'),
    play.indexOf('private clearPublicCards'));
  const ordinary = play.slice(play.indexOf('private reconcileAuthorityPublicCards'),
    play.indexOf('private async restoreSeatPlayStates'));
  assert.match(retained, /rememberLatestPublicCardLanding\(this\.renderPublicOperation\(packet\)\)/);
  assert.match(ordinary, /rememberLatestPublicCardLanding\(this\.renderPublicOperation\(\{/);
});

test('FLOATING holds from landing for 1.5 seconds without clearing before the next deal', () => {
  const method = play.slice(play.indexOf('public async waitForTerminalCardHold'), play.indexOf('public async waitForInitialPresentation'));
  assert.match(method, /await landing\.catch/);
  assert.match(method, /setTimeout\(resolve, Math\.max\(0, holdMs\)\)/);
  assert.doesNotMatch(method, /truncateRoundEndPresentation/);
  assert.doesNotMatch(method, /roomAudio|animations|retainedPlayedCardFlow/);
  assert.match(coordinator, /waitForTerminalCardHold\(1500\)/);
  assert.doesNotMatch(coordinator, /settlementPresentation === 'FLOATING'[\s\S]{0,180}2000/);
  const floating = coordinator.slice(coordinator.indexOf("settlementPresentation === 'FLOATING'"),
    coordinator.indexOf('const terminalRoundStillCurrent'));
  assert.doesNotMatch(floating, /truncateRoundEndPresentation/);
});

test('an early next-deal push is buffered until the physical landing hold completes', () => {
  assert.match(play, /if \(this\.deferNextRoundEventUntilTerminalHold\(event, body\)\) return/);
  const hold = play.slice(play.indexOf('public async waitForTerminalCardHold'),
    play.indexOf('private deferNextRoundEventUntilTerminalHold'));
  assert.match(hold, /await landing\.catch[\s\S]*setTimeout\(resolve, Math\.max\(0, holdMs\)\)/);
  assert.match(hold, /this\.terminalCardHoldBarrier = null[\s\S]*for \(const pending of deferred\) this\.onEvent/);
  const defer = play.slice(play.indexOf('private deferNextRoundEventUntilTerminalHold'),
    play.indexOf('/** 房间首帧'));
  assert.match(defer, /CommonPdk_AuthoritativeState/);
  assert.match(defer, /CommonPdkSetStart/);
  assert.match(defer, /CommonPdk_AuthoritativePhaseChanged/);
  assert.match(defer, /this\.deferredNextRoundEvents\.push/);
});

test('POPUP clears in the same task that opens SmallSettlement', () => {
  const boundaryAt = coordinator.indexOf('await terminalHold;');
  const clearAt = coordinator.indexOf('truncateRoundEndPresentation()', boundaryAt);
  const showAt = coordinator.indexOf('await this.forms.show(this.smallSettlementForm, payload);', boundaryAt);
  assert.ok(boundaryAt >= 0 && clearAt > boundaryAt && showAt > clearAt);
  assert.doesNotMatch(coordinator.slice(boundaryAt, showAt), /setTimeout|await new Promise/);
});

test('the final round opens settlement after the shared terminal hold without a stale second barrier', () => {
  assert.match(coordinator, /const terminalRoundStillCurrent = await terminalHold/);
  assert.match(coordinator, /await this\.forms\.show\(this\.smallSettlementForm, payload\)/);
  assert.doesNotMatch(coordinator, /terminalBoundary/);
});
