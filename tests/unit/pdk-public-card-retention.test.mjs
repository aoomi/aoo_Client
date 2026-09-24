import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controller = readFileSync(new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url), 'utf8');

test('an answered play remains visible while another seat is deciding', () => {
  const reconcile = controller.slice(
    controller.indexOf('private reconcileAuthorityPublicCards('),
    controller.indexOf('private restoreSeatPlayStates('),
  );
  assert.match(reconcile, /if \(turnSeat >= 0 && turnSeat !== dataSeat\s*&& this\.publicSeatOperationIds\.has\(turnSeat\)\)/);
  assert.match(reconcile, /this\.clearPublicCardsForSeat\(turnSeat, 'ANSWERED_PLAY_TURN_RETURNED'\)/);
  assert.match(reconcile, /return this\.rememberLatestPublicCardLanding\(this\.renderPublicOperation\(/);
  assert.doesNotMatch(controller, /captureRapidPreviousPlay|clearRapidPreviousPlayAfterCommit|RAPID_PREVIOUS_COMMITTED/);
});

test('an unbeatable completed trick still clears all live seats after its landed two-second hold', () => {
  const reconcile = controller.slice(
    controller.indexOf('private reconcileAuthorityPublicCards('),
    controller.indexOf('private restoreSeatPlayStates('),
  );
  const clear = controller.slice(
    controller.indexOf('private clearCompletedTrickAfterHold('),
    controller.indexOf('private clearPublicCardsForSeat('),
  );
  assert.match(reconcile, /if \(trickReset\)[\s\S]*this\.clearCompletedTrickAfterHold\(winningSeat\)/);
  assert.match(clear, /COMPLETED_TRICK_HOLD_MS - \(Date\.now\(\) - shownAt\)/);
  assert.match(clear, /this\.clearLatestPublicCards\(\)/);
});
