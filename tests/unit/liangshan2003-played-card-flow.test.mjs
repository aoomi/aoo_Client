import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../assets/Games/Poker/PDK/', import.meta.url);
const flow = readFileSync(new URL('LSPDK/Code/Liangshan2003PlayedCardFlow.ts', root), 'utf8');
const tableController = readFileSync(new URL('Common/Code/Runtime/PdkTablePresentationController.ts', root), 'utf8');
const coordinator = readFileSync(new URL('Common/Code/Runtime/PdkSwitchCoordinator.ts', root), 'utf8');

const first = (needle) => flow.indexOf(needle);

test('Liangshan2003 retains the complete physical Out_Card hand for 1.5 seconds before moving it', () => {
  assert.match(flow, /const OUT_CARD_HOLD_MS = 1500/);
  assert.match(flow, /const cards = request\.outCard\.children\.filter/);
  assert.match(flow, /child\.name !== 'PlayCount' && child\.isValid/);
  assert.match(flow, /for \(const card of cards\) card\.parent = hand/);
  assert.match(flow, /const timeout = globalThis\.setTimeout\(finish, OUT_CARD_HOLD_MS\)/);
  assert.match(flow, /hand\.parent = request\.tableCards/);
  assert.match(flow, /layoutPdkRetainedHand\(hand, cards, request\.outCard\.getComponent\(Layout\)\?\.spacingX \?\? 0\)/);
  assert.doesNotMatch(flow, /cards\.create/);

  const claim = first('for (const card of cards) card.parent = hand');
  const hold = first('await new Promise<void>((resolve)');
  const archive = first('hand.parent = request.tableCards');
  assert.ok(claim >= 0 && claim < hold && hold < archive);
});

test('a recovery copy cannot survive the hand transfer boundary', () => {
  assert.match(flow, /private removeRecoveredDestinationCopies\(tableCards: Node, nodeName: string\): void/);
  assert.match(flow, /for \(const child of \[\.\.\.tableCards\.children\]\) \{[\s\S]*child\.name !== nodeName[\s\S]*child\.removeFromParent\(\)[\s\S]*child\.destroy\(\)/);

  const cleanup = 'this.removeRecoveredDestinationCopies(request.tableCards, nodeName)';
  const firstCleanup = first(cleanup);
  const hold = first('await new Promise<void>((resolve)');
  const secondCleanup = flow.indexOf(cleanup, firstCleanup + cleanup.length);
  const archive = first('hand.parent = request.tableCards');
  assert.ok(firstCleanup >= 0 && firstCleanup < hold);
  assert.ok(secondCleanup > hold && secondCleanup < archive);
});

test('the common controller reports the same 1.5-second Liangshan timeline and mounts the actual flow', () => {
  assert.match(tableController, /liangshan-arrangement-hold-start[\s\S]*holdMs: 1500/);
  assert.match(tableController, /retainedPlayedCardFlow\?\.moveAfterLiveHold/);
  assert.match(coordinator, /runtime\.getGameCode\(\) === PDK_BUSINESS_CODES\.LIANGSHAN[\s\S]*new Liangshan2003PlayedCardFlow\(\)/);
  assert.doesNotMatch(coordinator, /LS201PlayedCardFlow/);
});
