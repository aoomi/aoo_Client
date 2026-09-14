import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const clientRoot = new URL('../..', import.meta.url).pathname;
const helperPath = join(clientRoot, 'assets/Games/Poker/PDK/Common/Code/Runtime/logic/PdkCleanHintRanker.ts');

function loadHelper() {
  const source = readFileSync(helperPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  return module.exports;
}

test('a single-card hint raises one physical slot even when hand values repeat', () => {
  const { pdkSelectionMask } = loadHelper();
  const responseRank = 12;
  const repeatedCardValue = 100 + responseRank;
  const hand = [repeatedCardValue, repeatedCardValue];

  assert.deepEqual(pdkSelectionMask(hand, [repeatedCardValue]), [true, false]);
  assert.equal(pdkSelectionMask(hand, [repeatedCardValue]).filter(Boolean).length, 1);
  assert.deepEqual(pdkSelectionMask(hand, hand), [true, true]);
});

test('same-rank cards of different suits keep exact physical selection', () => {
  const { pdkSelectionMask } = loadHelper();
  const responseRank = 9;
  const suitedPair = [100 + responseRank, 200 + responseRank];

  assert.deepEqual(pdkSelectionMask(suitedPair, [suitedPair[0]]), [true, false]);
  assert.deepEqual(pdkSelectionMask(suitedPair, [suitedPair[1]]), [false, true]);
});

test('one swipe adds its largest shape without replacing an earlier tap selection', () => {
  const { unionPdkSelection } = loadHelper();
  const hand = [113, 112, 111, 110, 109, 309, 108, 208, 107, 207, 307, 106, 105, 205];

  assert.deepEqual(
    unionPdkSelection([105], [107, 207, 307], hand),
    [107, 207, 307, 105],
  );
  assert.deepEqual(
    unionPdkSelection([105], [105, 107, 207, 307], hand),
    [107, 207, 307, 105],
    'including the required card in the swipe must not duplicate it',
  );
});

test('outside-hand release is captured for touch and mouse while card hits are preserved', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /form\.node\.on\(Node\.EventType\.TOUCH_END, this\.onRoomTouchEnd, this, true\)/);
  assert.match(controller, /form\.node\.on\(Node\.EventType\.MOUSE_UP, this\.onRoomMouseUp, this, true\)/);
  assert.match(controller, /if \(this\.cardIndexAtScreen\(screenX, screenY, windowId\) >= 0\) return/);
});

test('unchanged selection refresh cannot cancel a running hand compaction tween', () => {
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const selectMethod = presenter.slice(presenter.indexOf('public select('), presenter.indexOf('public preview('));
  assert.match(selectMethod, /const changed =/);
  assert.match(selectMethod, /if \(!changed\) return;[\s\S]*Tween\.stopAllByTarget\(card\)/);
});

test('authoritative deselection does not stop compaction tweens on surviving cards', () => {
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const clear = presenter.slice(presenter.indexOf('public clearSelectionImmediately'),
    presenter.indexOf('public preview'));
  const selectedGuard = clear.indexOf('this.selectedStates.get(card) !== true');
  const stopTween = clear.indexOf('Tween.stopAllByTarget(card)');
  assert.ok(selectedGuard >= 0 && selectedGuard < stopTween);
});

test('a response single must be strictly higher than the table single', () => {
  const { isStrictlyHigherPdkSingle } = loadHelper();

  assert.equal(isStrictlyHigherPdkSingle(209, 409), false, 'same-rank 9s of different suits cannot beat each other');
  assert.equal(isStrictlyHigherPdkSingle(111, 409), true, 'J can beat 9');
  assert.equal(isStrictlyHigherPdkSingle(108, 409), false, '8 cannot beat 9');
});

test('single-response prompt source enumerates every higher hand card', () => {
  const { rankCleanPdkHints } = loadHelper();
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const method = controller.slice(controller.indexOf('private responseTipCandidates'),
    controller.indexOf('private sortedLegalTipCandidates'));

  assert.match(method, /GetLastCardType\(\)\) !== 2/);
  assert.match(method, /filter\(\(card\) => isStrictlyHigherPdkSingle\(card, target\)\)/);
  assert.match(controller, /leading \? this\.leadTipCandidates\(\) : this\.responseTipCandidates\(\)/);

  const hand = [113, 213, 313, 112, 111, 211, 311, 110, 210, 109, 108, 107, 106, 206, 105];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [113], order: 0 }, { cards: [213], order: 1 },
    { cards: [313], order: 2 }, { cards: [112], order: 3 },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false });
  assert.deepEqual([...new Set(ranked.map((cards) => cards[0] % 100))], [12, 13]);
});

test('compound response hints enumerate exact-size hand subsets before regional validation', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const response = controller.slice(
    controller.indexOf('private responseTipCandidates'),
    controller.indexOf('private sortedLegalTipCandidates'),
  );
  assert.match(response, /this\.logic\.GetTipCard\(\)/);
  assert.match(response, /exactSizeResponseSubsets\(targetCards\.length\)/);
  assert.match(response, /if \(cards\.length === size\)[\s\S]*result\.push\(\[\.\.\.cards\]\)/);
  assert.match(response, /build\(index \+ 1, cards\)/);
});

test('single response conserves the maximum except for the final two-single exception', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const ranked = controller.slice(controller.indexOf('private sortedLegalTipCandidates'),
    controller.indexOf('private cardsInHandOrder'));
  assert.match(ranked, /targetType === 2 && targetCount === 1/);
  assert.match(ranked, /leftSingle \? -1 : 1/);
  assert.match(ranked, /handRanks\.length === 2/);
  assert.match(ranked, /handRanks\[0\] !== handRanks\[1\]/);
  assert.match(ranked, /handRanks\.includes\(15\)/);
  assert.match(ranked, /largestFirst[\s\S]*this\.cardRank\(right\[0\]\) - this\.cardRank\(left\[0\]\)[\s\S]*this\.cardRank\(left\[0\]\) - this\.cardRank\(right\[0\]\)/);
});

test('multi-card public play forces the authored Out_Card layout in the same frame', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /this\.updateActionCardLayout\(parent\)/);
  assert.match(controller, /private updateActionCardLayout\(parent: Node \| null\)[\s\S]*layout\.updateLayout\(\)/);
});

test('More opens by lifting only MoreItems above the PDK room', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const method = controller.slice(controller.indexOf('private toggleMoreMenu'),
    controller.indexOf('private hideMoreMenu'));
  assert.match(controller, /this\.commonMoreMenuParent = this\.commonMoreItems\?\.parent \?\? null/);
  assert.match(method, /node\.parent = this\.view\.root/);
  assert.match(method, /node\.setSiblingIndex\(this\.view\.root\.children\.length - 1\)/);
  assert.doesNotMatch(method, /const menu = node\.parent|menu\.parent = this\.view\.root/);
});

test('submitting a play keeps Hint and Play visible until Authority transfers the turn', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const out = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('/** Explain a rejected selection'));
  const auto = controller.slice(controller.indexOf('private maybeAutoPlay'),
    controller.indexOf('private autoPlayKey'));
  assert.doesNotMatch(out, /operations\?\.hide\(\)/);
  assert.doesNotMatch(auto, /operations\?\.hide\(\)/);
  assert.match(controller, /private refresh\(\): void \{[\s\S]*this\.operations\.render\(/);
});

test('winning own play remains for the two-second trick hold instead of clearing on turn return', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const state = controller.slice(controller.indexOf("event === 'CommonPdk_SetInfo'"),
    controller.indexOf("event === 'CommonPdkSetStart'"));
  assert.doesNotMatch(state, /activeOpPos === this\.clientSeat\(\)[\s\S]*clearOwnOutgoingSlot/);
  assert.match(controller, /const COMPLETED_TRICK_HOLD_MS = 2000/);
  assert.match(controller, /setTimeout\(\(\) => \{[\s\S]*animatePublicCardsClear\(\)[\s\S]*COMPLETED_TRICK_HOLD_MS/);
});

test('own play destination is hidden before waiting for the moving cards', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const render = controller.slice(controller.indexOf('private async renderPublicOperation'),
    controller.indexOf('private async presentPublicOperation'));
  const clearAt = render.indexOf('await this.clearActionSlot(parent)');
  const hideAt = render.indexOf('this.view.visible(outCardPath, false)');
  const flightAt = render.indexOf('await this.ownCardFlight');
  assert.ok(clearAt >= 0 && hideAt > clearAt && flightAt > hideAt);
  assert.match(render, /let destinationCleared = false/);
  assert.match(render, /if \(!destinationCleared\) await this\.clearActionSlot\(parent\)/);
});

test('landed own cards keep the authored Out_Card scale without growing again', () => {
  const play = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const render = play.slice(play.indexOf('private async renderPublicOperation'), play.indexOf('private async presentPublicOperation'));
  assert.match(render, /card\.parent = parent;[\s\S]*card\.setScale\(Vec3\.ONE\)/);
  assert.doesNotMatch(render, /card\.setWorldScale\(worldScale\)/);
});

test('remote moving cards stay hidden at the destination until their flight finishes', () => {
  const play = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = play.slice(play.indexOf('private async restoreLastActions'), play.indexOf('private updateActionCardLayout'));
  const hide = restore.indexOf('this.view.visible(path, false)');
  const fly = restore.indexOf('await this.flyRemoteCards(entry.physicalSlot, values)');
  const show = restore.indexOf('this.view.visible(path, values.length > 0)', fly);
  const create = restore.indexOf('this.cards.create(parent, value)', fly);
  assert.ok(hide >= 0 && hide < fly && fly < show && show < create);
});

test('completed trick cards fly to map centre and shrink before destruction', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const clear = controller.slice(
    controller.indexOf('private async animatePublicCardsClear'),
    controller.indexOf('private clearTableCards'),
  );
  const schedule = controller.slice(
    controller.indexOf('private schedulePublicCardsClear'),
    controller.indexOf('private clearOwnOutgoingSlot'),
  );
  assert.match(controller, /TABLE_CLEAR_FLIGHT_DURATION_SECONDS = 0\.5/);
  assert.match(controller, /TABLE_CLEAR_FINAL_SCALE = 0\.2/);
  assert.match(clear, /roomTransform\.convertToWorldSpaceAR\(Vec3\.ZERO\)/);
  assert.match(clear, /card\.parent = overlay/);
  assert.match(clear, /scale: finalScale/);
  assert.match(clear, /if \(card\.isValid\) card\.destroy\(\)/);
  assert.match(schedule, /void this\.animatePublicCardsClear\(\)/);
});

test('round end clears table cards and ready presentation after 2 seconds', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const seats = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/SeatPresenter.ts'), 'utf8');
  const setEnd = controller.slice(controller.indexOf("event === 'CommonPdkSetEnd'"),
    controller.indexOf("event === 'ChatMessage'"));
  const cleanup = controller.slice(controller.indexOf('private scheduleRoundEndCleanup'),
    controller.indexOf('private clearTableCards'));
  assert.match(controller, /const ROUND_END_CLEANUP_DELAY_MS = 2000/);
  assert.match(setEnd, /this\.scheduleRoundEndCleanup\(\)/);
  assert.match(cleanup, /this\.seats\?\.hideReadyStates\(\)/);
  assert.match(cleanup, /this\.animatePublicCardsClear\(true\)/);
  assert.match(seats, /public hideReadyStates\(\): void/);
  assert.match(seats, /showReady\(false\)/);
});

test('repeated response tips alternate Q and K after a table 10', () => {
  const { pdkSelectionMask } = loadHelper();
  const hand = [113, 213, 313, 112, 111, 211, 311, 110, 210, 109, 108, 107, 106, 206, 105];
  const tips = [[112], [113]];
  let tipIndex = 0;
  const next = () => tips[tipIndex++ % tips.length];

  assert.deepEqual(pdkSelectionMask(hand, next()), hand.map((card) => card === 112));
  assert.deepEqual(pdkSelectionMask(hand, next()), hand.map((_card, index) => index === 0));
  assert.deepEqual(pdkSelectionMask(hand, next()), hand.map((card) => card === 112));
});

test('automatic single hint preserves a straight by raising the spare 7', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [103, 104, 105, 106, 107, 207, 108, 109];
  const candidates = hand.map((card, order) => ({ cards: [card], order }));
  const ranked = rankCleanPdkHints(hand, candidates, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
  });

  assert.equal(ranked[0][0] % 100, 7);
});

test('leading hint chooses the legal candidate with the most cards first', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 214, 111, 211, 110, 210, 108, 208, 107, 207, 106];
  const candidates = [
    { cards: [108, 208, 107, 207], order: 0 },
    { cards: [107, 207], order: 1 },
    { cards: [106], order: 2 },
  ];
  const ranked = rankCleanPdkHints(hand, candidates, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
  }, true);

  assert.deepEqual(ranked[0], [108, 208, 107, 207]);
});

test('hints preserve a complete bomb before largest-card and remaining-turn priorities', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [108, 208, 308, 408, 109, 110, 111, 112, 113];
  const rules = { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false };

  const leading = rankCleanPdkHints(hand, [
    { cards: [108, 109, 110, 111, 112, 113], order: 0 },
    { cards: [109], order: 1 },
  ], rules, true);
  assert.deepEqual(leading[0], [109], 'lead hint must not split four 8s to make a longer straight');

  const responding = rankCleanPdkHints(hand, [
    { cards: [108], order: 0 },
    { cards: [109], order: 1 },
    { cards: [108, 208, 308, 408], order: 2 },
  ], rules);
  assert.deepEqual(responding[0], [109], 'response hint must use a spare single before splitting four 8s');
  assert.deepEqual(responding[1], [108, 208, 308, 408], 'the intact bomb remains available before a split-bomb candidate');
  assert.deepEqual(responding[2], [108]);
});

test('triple attachments preserve a complete pair run and consume lower loose singles first', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 112, 212, 111, 110, 210, 310, 109, 209, 108, 208, 107, 207, 106, 206, 105];
  const withAce = [110, 210, 310, 105, 114];
  const withJack = [110, 210, 310, 105, 111];
  const ranked = rankCleanPdkHints(hand, [
    { cards: withAce, order: 0 },
    { cards: withJack, order: 1 },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false });

  assert.deepEqual(ranked[0], withJack);
});

test('hint attachments consume an existing pair before splitting another complete triple', () => {
  const { rankCleanPdkHints } = loadHelper();
  // 10s are the responding body; 7s must remain intact because a pair of Qs is available.
  const hand = [0x0a, 0x1a, 0x2a, 0x07, 0x17, 0x27, 0x0c, 0x1c];
  const keepTriple = [0x0a, 0x1a, 0x2a, 0x0c, 0x1c];
  const splitTriple = [0x0a, 0x1a, 0x2a, 0x07, 0x17];
  const ranked = rankCleanPdkHints(hand, [
    { cards: splitTriple, order: 0 },
    { cards: keepTriple, order: 1 },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false });
  assert.deepEqual(ranked[0], keepTriple);
});

test('all hint families prefer the candidate leaving fewer loose singles', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [0x03, 0x13, 0x04, 0x14, 0x05, 0x06, 0x16];
  const leavesNoLooseRank = [0x05];
  const leavesLooseRank = [0x06];
  const ranked = rankCleanPdkHints(hand, [
    { cards: leavesLooseRank, order: 0 },
    { cards: leavesNoLooseRank, order: 1 },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false });
  assert.deepEqual(ranked[0], leavesNoLooseRank);
});

test('compound responses are ranked as same shape before bomb fallback', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const sorter = source.slice(source.indexOf('private sortedLegalTipCandidates'), source.indexOf('private cardsInHandOrder'));
  assert.match(sorter, /sameShape[\s\S]*fallbackBombs[\s\S]*rankCandidates\(sameShape\)[\s\S]*rankCandidates\(fallbackBombs\)/);
});

test('a local authoritative new trick clears the previous public cards before input', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const boundary = source.slice(source.indexOf('private applyAuthoritativeTurnBoundary'), source.indexOf('private restorePublicCards'));
  assert.match(boundary, /if \(trickReset\)[\s\S]*turnSeat === this\.clientSeat\(\)[\s\S]*this\.clearPublicCards\(\)/);
});

test('ChangeStatus does not clear a newly played hand unless local authority starts a new trick', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const branch = source.slice(source.indexOf("event === 'ChangeStatus'"), source.indexOf("event === 'CommonPdk_AuthoritativePhaseChanged'"));
  assert.doesNotMatch(branch, /this\.activeOpPos[^;]+;\s*this\.clearPublicCards\(\)/);
  assert.match(branch, /newTrick && this\.activeOpPos === this\.clientSeat\(\)/);
});
