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

test('one swipe replaces earlier selection with the largest legal subset inside touched cards', () => {
  const { largestLegalPdkSubsets } = loadHelper();
  const touched = [110, 210, 310, 106, 206, 109];
  const ranked = largestLegalPdkSubsets(touched, (subsets) => subsets.filter((cards) => {
    const ranks = cards.map((card) => card % 100);
    return cards.length === 5
      && ranks.filter((rank) => rank === 10).length === 3
      && ranks.filter((rank) => rank === 6).length === 2;
  }));

  assert.deepEqual(ranked, [[110, 210, 310, 106, 206]]);

  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const commit = controller.slice(controller.indexOf('private commitSmartDragSelection'),
    controller.indexOf('private largestLegalDragCandidates'));
  assert.match(commit, /largestLegalDragCandidates\(touched\)/);
  assert.doesNotMatch(commit, /GetSelectCard|unionPdkSelection/);
});

test('swiping exactly three cards keeps all three selected before attachments are added', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const select = controller.slice(controller.indexOf('private largestLegalDragCandidates'),
    controller.indexOf('private cancelDragSelection'));
  assert.match(select, /if \(touched\.length === 3/);
  assert.match(select, /return \[\[\.\.\.touched\]\]/);
  assert.ok(select.indexOf('touched.length === 3') < select.indexOf('largestLegalPdkSubsets'));
});

test('a required opening card missing from the swipe shows its exact card name', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const commit = controller.slice(controller.indexOf('private commitSmartDragSelection'),
    controller.indexOf('private largestLegalDragCandidates'));
  assert.match(commit, /const required = this\.isAuthoritativeLeadingTurn\(\) \? this\.activeRequiredFirstCard\(\) : 0/);
  assert.match(commit, /required > 0 && !touched\.includes\(required\)/);
  assert.match(commit, /this\.showMessage\(`必包含\$\{this\.cardDisplayName\(required\)\}`\)/);
  assert.match(commit, /this\.clearDragSelection\(\)/);
});

test('outside-hand release is captured for touch and mouse while card hits are preserved', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /form\.node\.on\(Node\.EventType\.TOUCH_END, this\.onRoomTouchEnd, this, true\)/);
  assert.match(controller, /form\.node\.on\(Node\.EventType\.MOUSE_UP, this\.onRoomMouseUp, this, true\)/);
  const outsideClear = controller.slice(controller.indexOf('private clearSelectionOutsideCards'),
    controller.indexOf('private hasInteractiveButtonAncestor'));
  assert.match(outsideClear, /capturedPointerId !== null \|\| Date\.now\(\) < this\.suppressClickUntil/);
  assert.match(outsideClear, /cardIndexAtUi\(uiX, uiY\) >= 0/);
  assert.match(outsideClear, /cardIndexAtScreen\(screenX, screenY, windowId\) >= 0/);
  assert.match(controller, /clearSelectionOutsideCards\(target, screen\.x, screen\.y, windowId, location\.x, location\.y\)/);
  assert.match(controller, /clearSelectionOutsideCards\(target, location\.x, location\.y, windowId, uiLocation\.x, uiLocation\.y\)/);
});

test('empty space in the bottom hand area never maps to a nearby card', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const hitTest = controller.slice(controller.indexOf('private cardIndexAtScreen'),
    controller.indexOf('private dragIndexAtUi'));
  assert.match(hitTest, /UITransform\.prototype\.hitTest\.call\(transform, screenPoint, windowId\)/);
  assert.match(hitTest, /return -1/);
  assert.doesNotMatch(hitTest, /gestureSurface|visibleWidth|Math\.floor\(screenX/);
});

test('a moving swipe projects every bottom-band position onto the nearest hand slot', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const dragHit = controller.slice(controller.indexOf('private dragIndexAtUi'),
    controller.indexOf('private previewDragSelection'));
  assert.match(dragHit, /gestureSurface\?\.getComponent\(UITransform\)/);
  assert.match(dragHit, /Math\.abs\(card\.worldPosition\.x - uiX\)/);
  assert.match(controller, /dragLastIndex = this\.dragIndexAtUi\(sample\.ui\.x, sample\.ui\.y\)/);
  assert.match(controller, /const index = this\.dragIndexAtUi\(sample\.ui\.x, sample\.ui\.y\)/);
  assert.match(controller, /this\.bindDomPointerBridge\(\)/);
  assert.match(controller, /document\.addEventListener\('pointerdown', this\.onDomPointerDown, true\)/);
  assert.match(controller, /this\.capturedPointerId = event\.pointerId;[\s\S]*this\.dragActive = true/);
  assert.doesNotMatch(dragHit, /exactIndex/);
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
  const { pdkSingleResponseCandidates, rankCleanPdkHints } = loadHelper();
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const method = controller.slice(controller.indexOf('private responseTipCandidates'),
    controller.indexOf('private sortedLegalTipCandidates'));

  assert.match(method, /GetLastCardType\(\)\) !== 2/);
  assert.match(method, /pdkSingleResponseCandidates\(/);
  assert.match(method, /this\.pushTipCandidates\(candidates, this\.logic\.GetZhaDanTip\(\)\)/);
  assert.match(controller, /leading \? this\.leadTipCandidates\(\) : this\.responseTipCandidates\(\)/);
  assert.match(controller, /protectedBombs: this\.protectedBombGroups\(\)/);

  const hand = [113, 213, 313, 112, 111, 211, 311, 110, 210, 109, 108, 107, 106, 206, 105];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [113], order: 0 }, { cards: [213], order: 1 },
    { cards: [313], order: 2 }, { cards: [112], order: 3 },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false });
  assert.deepEqual([...new Set(ranked.map((cards) => cards[0] % 100))], [12, 13]);

  const jackBomb = [111, 211, 311, 411];
  const queenBomb = [112, 212, 312, 412];
  assert.deepEqual(
    pdkSingleResponseCandidates([...queenBomb, ...jackBomb], 108, [queenBomb, jackBomb]),
    [],
    'QQQQ+JJJJ responding to a single 8 must not expose any split-bomb single',
  );
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

test('two-play maximum priority is derived from deck multiplicity instead of a hardcoded rank', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const ranked = controller.slice(controller.indexOf('private sortedLegalTipCandidates'),
    controller.indexOf('private cardsInHandOrder'));
  assert.match(ranked, /finishesInTwo: this\.leavesOneLegalPlay\(cards\)/);
  assert.match(ranked, /containsRuleMaximum: this\.containsRegionalMaximum\(cards\)/);
  assert.match(controller, /authoritativeRuleOptions\(\)\.deckCards/);
  assert.match(controller, /isRegionalMaximumPdkCombination\(cards, rawDeck/);
  assert.doesNotMatch(ranked, /handRanks\.includes\(15\)/);
});

test('regional deck multiplicity resolves Chengdu single 2, pair A and Liangshan A', () => {
  const { isRegionalMaximumPdkCombination } = loadHelper();
  const chengduDeck = [
    103, 203, 303, 403, 113, 213, 313, 413,
    114, 214, 314, 115,
  ];
  const liangshanDeck = [107, 207, 307, 407, 113, 213, 313, 413, 114, 214, 314, 414];

  assert.equal(isRegionalMaximumPdkCombination([115], chengduDeck), true);
  assert.equal(isRegionalMaximumPdkCombination([114, 214], chengduDeck), true);
  assert.equal(isRegionalMaximumPdkCombination([113, 213], chengduDeck), false);
  assert.equal(isRegionalMaximumPdkCombination([110, 210, 310, 114], liangshanDeck), true,
    'A attachment marks the full triple combination as maximum');
});

test('a non-maximum pair K cannot outrank the six-card lead hint', () => {
  const { rankCleanPdkHints } = loadHelper();
  const pairK = [113, 213];
  const pairRun = [106, 206, 107, 207, 108, 208];
  const ranked = rankCleanPdkHints([...pairRun, ...pairK], [
    { cards: pairK, order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: pairRun, order: 1, finishesInTwo: true, containsRuleMaximum: false },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false }, true, true);
  assert.deepEqual(ranked[0], pairRun);
});

test('a regional maximum combination ranks first when exactly two legal plays remain', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [115, 114, 214, 109];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [109], order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: [114, 214], order: 1, finishesInTwo: true, containsRuleMaximum: true },
    { cards: [115], order: 2, finishesInTwo: true, containsRuleMaximum: true },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false }, true);

  assert.deepEqual(ranked[0], [114, 214], 'largest maximum combination wins the two-play tie');
  assert.deepEqual(ranked[1], [115]);
});

test('two-play maximum priority overrides ordinary bomb preservation', () => {
  const { rankCleanPdkHints } = loadHelper();
  const threeAceBomb = [114, 214, 314];
  const hand = [...threeAceBomb, 109];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [109], order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: [114, 214], order: 1, finishesInTwo: true, containsRuleMaximum: true },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    protectedBombs: [threeAceBomb],
  });

  assert.deepEqual(ranked[0], [114, 214]);
});

test('maximum attachment marks the whole triple combination as a two-play priority', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [110, 210, 310, 114, 106, 113];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [113], order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: [110, 210, 310, 114, 106], order: 1, finishesInTwo: true, containsRuleMaximum: true },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false });

  assert.deepEqual(ranked[0], [110, 210, 310, 114, 106]);
});

test('rapid manual play clears only the pre-click public cards after authority accepts', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const outCard = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('/** Explain a rejected selection'));
  const rapid = controller.slice(controller.indexOf('private captureRapidPreviousPlay'),
    controller.indexOf('private cancelPublicCardClearTimers'));
  assert.match(outCard, /const rapidPreviousPlay = this\.captureRapidPreviousPlay\(\)/);
  assert.doesNotMatch(outCard, /automaticLastHand[\s\S]{0,120}new Map<number/);
  assert.match(outCard, /await this\.lifecycle\.play[\s\S]*!this\.runtime\.arrangementEnabled\(\)[\s\S]*this\.clearRapidPreviousPlayAfterCommit\(rapidPreviousPlay\)/);
  assert.doesNotMatch(outCard.slice(0, outCard.indexOf('await this.lifecycle.play')), /clearRapidPreviousPlayAfterCommit/);
  assert.match(rapid, /elapsedMs >= COMPLETED_TRICK_HOLD_MS/);
  assert.match(rapid, /this\.publicCardShownAt\.get\(seat\) !== previous\.shownAt/);
  assert.match(rapid, /this\.clearPublicCardsForSeat\(seat\)/);
  assert.doesNotMatch(rapid, /this\.clearLatestPublicCards\(\)/);
  assert.doesNotMatch(rapid, /Table_Cards/);
});

test('single five screenshot hand first hints one spare seven and keeps the six bomb last', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 214, 113, 112, 212, 111, 110, 210, 109, 108, 107, 207, 106, 206, 306, 406];
  const sixBomb = [106, 206, 306, 406];
  const candidates = [
    ...hand.filter((card) => card % 100 > 5).map((card, order) => ({ cards: [card], order })),
    { cards: sixBomb, order: hand.length },
  ];
  const ranked = rankCleanPdkHints(hand, candidates, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    protectedBombs: [sixBomb],
  });

  assert.deepEqual(ranked[0], [107]);
  assert.equal(ranked[0].length, 1);
  assert.deepEqual(ranked.at(-1), sixBomb);
  assert.ok(ranked.slice(0, -1).every((cards) => !cards.some((card) => card % 100 === 6)));
});

test('regional three-A bomb is protected from single hints', () => {
  const { rankCleanPdkHints } = loadHelper();
  const threeAceBomb = [114, 214, 314];
  const ordinarySeven = [107];
  const ranked = rankCleanPdkHints([...threeAceBomb, ...ordinarySeven], [
    { cards: [114], order: 0 },
    { cards: ordinarySeven, order: 1 },
    { cards: threeAceBomb, order: 2 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    protectedBombs: [threeAceBomb],
  });

  assert.deepEqual(ranked[0], ordinarySeven);
  assert.deepEqual(ranked.at(-1), threeAceBomb);
});

test('multi-card public play forces the authored Out_Card layout in the same frame', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /this\.updateActionCardLayout\(parent,/);
  assert.match(controller, /private updateActionCardLayout\(parent: Node \| null,[\s\S]*layout\.updateLayout\(\)/);
});

test('public compound cards use prefab-authored Out_Card spacing without a code minimum', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /const OUT_CARD_FALLBACK_WIDTH = 80/);
  assert.doesNotMatch(controller, /OUT_CARD_MINIMUM_STEP/);
  assert.match(controller, /const step = cardWidth \+ \(layout\?\.spacingX \?\? 0\)/);
});

test('authoritative multi-card play activates Out_Card before forcing its layout', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const render = controller.slice(controller.indexOf('private async renderPublicOperation'),
    controller.indexOf('private async presentPublicOperation'));
  const showAt = render.lastIndexOf('this.setOutCardVisible(outCardPath, values.length > 0)');
  const layoutAt = render.lastIndexOf('this.updateActionCardLayout(parent,');
  assert.ok(showAt >= 0 && layoutAt > showAt,
    'non-flight Cocos Layout must run after the hidden Out_Card container becomes active');
  assert.match(render, /if \(!landedFromOwnFlight\)/);
  assert.match(controller, /\[CommonRoomOutCardLayout\]/);
  assert.match(controller, /const step = cardWidth \+ \(layout\?\.spacingX \?\? 0\)/);
  assert.match(controller, /if \(layout\) layout\.enabled = false/);
  assert.match(controller, /parentTransform\.setContentSize\(totalWidth/);
  assert.match(controller, /const firstCenter = -\(\(cardNodes\.length - 1\) \* step\) \/ 2/);
  assert.match(controller, /card\.setPosition\(firstCenter \+ index \* step/);
  assert.doesNotMatch(controller, /const left = -parentTransform\.anchorX \* totalWidth/);
});

test('live Out_Card reuses the settlement play index without treating Count as a card', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const adapter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
  assert.match(controller, /if \(!count\) \{[\s\S]*instantiate\(source\)/);
  assert.match(controller, /clearExcept\(parent, \['Count'\]\)/);
  assert.match(controller, /child\.name !== 'Count'/);
  assert.match(controller, /label\.string = String\(playIndex\)/);
  assert.match(controller, /playIndex: Number\(latest\.playIndex \?\? 0\)/);
  assert.match(adapter, /playIndex: Number\(normalized\?\.playIndex \?\? 0\)/);
  assert.match(adapter, /isPlay \? \+\+committedPlayIndex : 0/);
});

test('a rolling-deployment packet without tableSnapshot still preserves the authoritative hand', () => {
  const adapter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
  assert.match(adapter, /const snapshotComplete = integer\(tableSnapshot\.stateVersion\)/);
  assert.match(adapter, /const comparison = snapshotComplete[\s\S]*legacyTrick[\s\S]*lastAction/);
  assert.match(adapter, /\? tableSnapshot\.operations : lastActions/);
  assert.doesNotMatch(adapter, /throw new Error\('CommonPdk 权威桌面快照不完整'\)/);
});

test('a stale authority restore cannot overwrite a newer compound play after the two-second hold', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = controller.slice(controller.indexOf('private reconcileAuthorityPublicCards'),
    controller.indexOf('private updateActionCardLayout'));
  const render = controller.slice(controller.indexOf('private async renderPublicOperation'),
    controller.indexOf('private async presentPublicOperation'));

  assert.match(controller, /private publicProjectionGeneration = 0/);
  assert.match(controller, /private readonly publicSeatRenderRevisions = new Map<number, number>\(\)/);
  assert.match(restore, /const projectionGeneration = \+\+this\.publicProjectionGeneration/);
  assert.match(restore, /restoreSeatPlayStates\(seatPlays, projectionGeneration\)/);
  assert.match(restore, /projectionGeneration !== this\.publicProjectionGeneration/);
  assert.match(render, /const seatRevision = this\.claimPublicSeatRender\(dataSeat\)/);
  assert.match(render, /await this\.waitForPublicCardHold\(dataSeat\)[\s\S]*isPublicSeatRenderCurrent/);
  assert.match(controller, /this\.publicSeatRenderRevisions\.get\(dataSeat\) === seatRevision/);
  const lastActions = restore.slice(restore.indexOf('private async restoreSeatPlayStates'));
  assert.ok(lastActions.indexOf('this.renderedActionIds.set(entry.dataSeat, actionKey)')
    > lastActions.indexOf('await this.waitForPublicCardHold(entry.dataSeat)'),
  'an action becomes rendered only after its stale-work guard has passed');
});

test('authority history restores only the latest play for each seat', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = controller.slice(controller.indexOf('private async restoreSeatPlayStates'),
    controller.indexOf('private updateActionCardLayout'));
  assert.match(restore, /const latestBySeat = new Map<number, unknown>\(\)/);
  assert.match(restore, /latestBySeat\.set\(seat, value\)/);
  assert.match(restore, /for \(const value of latestBySeat\.values\(\)\)/);
  assert.ok(restore.indexOf('for (const value of latestBySeat.values())')
    < restore.indexOf('const entry = createSeatEntries'));
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

test('whole-hand autoplay hides Hint and Play through its authority request', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const refresh = controller.slice(controller.indexOf('private refresh(): void'),
    controller.indexOf('private centerOperationButtons'));
  const auto = controller.slice(controller.indexOf('private maybeAutoPlay'),
    controller.indexOf('private autoPlayKey'));
  assert.match(refresh, /const automaticWholeHand = this\.isAutomaticWholeHand\(setInfo, localTurn\)/);
  assert.match(refresh, /canTip: localTurn && !this\.autoPlayInFlight && !automaticWholeHand/);
  assert.match(refresh, /canPlay: localTurn && !this\.autoPlayInFlight && !automaticWholeHand/);
  assert.match(auto, /this\.autoPlayInFlight = true;[\s\S]*this\.refresh\(\)/);
  assert.match(auto, /this\.outCard\(opType, true\)/);
  assert.ok(auto.indexOf('this.outCard(opType, true)') < auto.lastIndexOf('this.autoPlayInFlight = false'));
});

test('a rejected play restores only the local hand and never redraws public cards', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const out = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('/** Explain a rejected selection'));
  const rejected = out.slice(out.indexOf('} catch (error: unknown)'));
  assert.match(rejected, /await this\.renderHand\(\)/);
  assert.match(rejected, /this\.updateSelection\(\)/);
  assert.doesNotMatch(rejected, /this\.refresh\(\)/);
});

test('completed trick hold is owned by the authoritative table transition', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const reconcile = controller.slice(controller.indexOf('private reconcileAuthorityPublicCards'),
    controller.indexOf('private async restoreSeatPlayStates'));
  assert.match(controller, /const COMPLETED_TRICK_HOLD_MS = 2000/);
  assert.match(reconcile, /if \(trickReset\)[\s\S]*this\.clearCompletedTrickAfterHold/);
  assert.match(controller, /COMPLETED_TRICK_HOLD_MS - \(Date\.now\(\) - shownAt\)/);
});

test('an unbeatable lead re-arms its clear after landing when Authority already returned the turn', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const render = controller.slice(controller.indexOf('private async renderPublicOperation'),
    controller.indexOf('private async presentPublicOperation'));
  assert.match(render, /markPublicCardsShown\(dataSeat\)[\s\S]*dataSeat === this\.activeOpPos[\s\S]*clearPublicCardsForTurn\(dataSeat\)/);
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
  assert.match(render, /const landedFromOwnFlight = landed\.length > 0/);
  assert.match(render, /if \(layout\) layout\.enabled = false/);
  assert.match(render, /if \(!landedFromOwnFlight\) \{[\s\S]*this\.updateActionCardLayout/);
});

test('own flying cards converge directly to the final Out_Card spacing', () => {
  const play = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const flight = play.slice(play.indexOf('private async flyCardsToOwnAction'),
    play.indexOf('/** Swap landed flight clones'));
  assert.match(flight, /const step = cardWidth \+ \(layout\?\.spacingX \?\? 0\)/);
  assert.match(flight, /targetTransform\.convertToWorldSpaceAR[\s\S]*firstCenter \+ index \* step/);
  assert.match(flight, /position: destinations\[index\]/);
  assert.doesNotMatch(flight, /const spread = .*\* 18/);
});

test('remote moving cards stay hidden at the destination until their flight finishes', () => {
  const play = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = play.slice(play.indexOf('private async restoreSeatPlayStates'), play.indexOf('private updateActionCardLayout'));
  const hide = restore.indexOf('this.view.visible(path, false)');
  const fly = restore.indexOf('await this.flyRemoteCards(entry.physicalSlot, values)');
  const show = restore.indexOf('this.view.visible(path, values.length > 0)', fly);
  const create = restore.indexOf('this.cards.create(parent, value)', fly);
  assert.ok(hide >= 0 && hide < fly && fly < show && show < create);
});

test('round cleanup destroys cards directly without a centre-flight animation', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.doesNotMatch(controller, /animatePublicCardsClear/);
  assert.doesNotMatch(controller, /TABLE_CLEAR_FLIGHT_DURATION_SECONDS/);
  assert.doesNotMatch(controller, /TABLE_CLEAR_FINAL_SCALE/);
});

test('round end preserves cards until continue and last continue clears readiness after 1 second', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const adapter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
  const setEnd = controller.slice(controller.indexOf("event === 'CommonPdkSetEnd'"),
    controller.indexOf("event === 'ChatMessage'"));
  assert.doesNotMatch(controller, /ROUND_END_CLEANUP_DELAY_MS|scheduleRoundEndCleanup|ROUND_END_TIMER/);
  assert.doesNotMatch(setEnd, /clearPublicCards|clearTableCards|clearHandVisuals|resetRoundPresentation/);
  assert.match(adapter, /phase === 'FINISHED' \|\| phase === 'DIRECT_WIN'[\s\S]*Boolean\(seat\.continued\) : Boolean\(seat\.ready\)/);
  assert.match(adapter, /roomReady: readyState/);
  assert.doesNotMatch(adapter, /seat\.ready \|\| seat\.continued/);
  const continueClear = controller.slice(controller.indexOf('private scheduleContinueReadyClear'),
    controller.indexOf('private clearTableCards'));
  assert.match(controller, /await this\.renderHeads\(\);[\s\S]*this\.scheduleContinueReadyClear\(setInfo\)/);
  assert.match(controller, /this\.renderHeadsThenScheduleContinueClear\(setInfo\)/);
  assert.match(continueClear, /occupied\.every\(\(player\) => Boolean\(player\.isContinue\)\)/);
  assert.match(continueClear, /this\.seats\?\.hideReadyStates\(\)/);
  assert.match(continueClear, /}, 1000\)/);
  assert.doesNotMatch(continueClear, /PLAYING|COMPETE_DEALER|cardsDealt/);
});

test('Liangshan deal animation runs at the compete-dealer deal boundary', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const phase = controller.slice(controller.indexOf("if (to === 'COMPETE_DEALER')"),
    controller.indexOf("if (to === 'PLAYING')"));
  const animate = controller.slice(controller.indexOf('private shouldAnimateDeal'),
    controller.indexOf('public async waitForRoundEndPresentation'));
  assert.match(phase, /renderHand\(this\.shouldAnimateDeal\(setInfo\)\)/);
  assert.match(animate, /phase !== 'PLAYING' && phase !== 'COMPETE_DEALER'/);
  assert.match(controller, /PokerDealNodeAnim\.play\(this\.cardNodes, \[origin\]\)/);
});

test('required opening card constrains Hint only and never blocks manual Play validation', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const hint = controller.slice(controller.indexOf('private prepareHintCache'),
    controller.indexOf('private async outCard'));
  const out = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('/** Explain a rejected selection'));
  assert.match(hint, /required > 0 \? legal\.filter\(\(cards\) => cards\.includes\(required\)\) : legal/);
  assert.doesNotMatch(out, /activeRequiredFirstCard|requiredFirstCard|includes\(required\)/);
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

test('response hint prefers the straight that leaves fewer effective loose singles', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 214, 113, 112, 212, 111, 110, 210, 109, 108, 208, 308, 107, 106, 206, 105];
  const highStraight = [109, 110, 111, 112, 113, 114];
  const longLowStraight = [106, 107, 108, 109, 110, 111, 112];
  const ranked = rankCleanPdkHints(hand, [
    { cards: longLowStraight, order: 0 },
    { cards: highStraight, order: 1 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    prioritizeLooseSingles: true,
  });

  assert.deepEqual(ranked[0], highStraight,
    'preserving triple 888 lets it absorb two attachments and leaves fewer loose singles');
});

test('single responses minimize loose singles before choosing the lowest winning card by region', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [115, 113, 112, 110, 109, 108, 105, 205];
  const candidates = [109, 110, 112, 113, 115].map((card, order) => ({ cards: [card], order }));
  const baseRules = {
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    prioritizeLooseSingles: true,
  };

  const chengdu = rankCleanPdkHints(hand, candidates, {
    ...baseRules,
    minimumStraightLength: 5,
  });
  assert.equal(chengdu[0][0], 109, 'Chengdu has no three-card straight, so equal cleanup starts at 9');

  const liangshan = rankCleanPdkHints(hand, candidates, {
    ...baseRules,
    minimumStraightLength: 3,
  });
  assert.equal(liangshan[0][0], 112, 'Liangshan preserves 8-9-10 and then uses the lowest equal-cleanup winner Q');

  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /prioritizeLooseSingles: targetCount > 0/);
});

test('browser taps use UI-space card bounds and preserve exact toggle semantics', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const sample = controller.slice(controller.indexOf('private buildPointerSample'),
    controller.indexOf('private pointerSource'));
  const hit = controller.slice(controller.indexOf('private cardIndexAtUi'),
    controller.indexOf('private dragIndexAtUi'));
  const toggle = controller.slice(controller.indexOf('private async toggleCardAt'),
    controller.indexOf('private async toggleSingleResponseCard'));
  assert.match(sample, /base\.domPointer[\s\S]*this\.cardIndexAtUi\(base\.ui\.x, base\.ui\.y\)/);
  assert.match(hit, /convertToNodeSpaceAR\(world\)/);
  assert.match(hit, /for \(let index = this\.cardNodes\.length - 1/);
  assert.match(toggle, /CheckSelected[\s\S]*DeleteCardSelected/);
  assert.match(toggle, /else this\.logic\.SetCardSelected/);
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

test('lead hints with the same card count prefer fewer effective loose singles', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [110, 210, 310, 114, 107, 109, 108, 106, 105, 113, 112];
  const tripleWithTwo = [110, 210, 310, 114, 107];
  const straight = [105, 106, 107, 108, 109];
  const ranked = rankCleanPdkHints(hand, [
    { cards: tripleWithTwo, order: 0 },
    { cards: straight, order: 1 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
  }, true, true);

  assert.deepEqual(ranked[0], straight);
  assert.deepEqual(ranked[1], tripleWithTwo);

  const dragRanked = rankCleanPdkHints(hand, [
    { cards: tripleWithTwo, order: 0 },
    { cards: straight, order: 1 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
  }, true);
  assert.deepEqual(dragRanked[0], tripleWithTwo, 'drag ties keep source order instead of applying hint-only cleanup');
});

test('lead Hint keeps a legal complete triple-with-single hand ahead of a pair', () => {
  const { rankCleanPdkHints } = loadHelper();
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const lead = controller.slice(
    controller.indexOf('private leadTipCandidates'),
    controller.indexOf('private activeRequiredFirstCard'),
  );
  assert.match(lead, /const wholeHandType = this\.operationTypeForCards\(hand\)/);
  assert.match(lead, /this\.isWholeHandTypeEnabled\(wholeHandType\)/);
  assert.ok(lead.indexOf('candidates.push(hand)') < lead.indexOf('this.logic.GetDuiziTip()'));

  const hand = [108, 208, 308, 107];
  const ranked = rankCleanPdkHints(hand, [
    { cards: hand, order: 0 },
    { cards: [108, 208], order: 1 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
  }, true, true);
  assert.deepEqual(ranked[0], hand, '8887 must be prompted as triple-with-single, not pair 8');
});

test('response hints protect bombs while a lead uses the most cards', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [108, 208, 308, 408, 109, 110, 111, 112, 113];
  const rules = { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false };

  const leading = rankCleanPdkHints(hand, [
    { cards: [108, 109, 110, 111, 112, 113], order: 0 },
    { cards: [109], order: 1 },
  ], rules, true);
  assert.deepEqual(leading[0], [108, 109, 110, 111, 112, 113], 'lead hint uses the legal play with the most cards');

  const responding = rankCleanPdkHints(hand, [
    { cards: [108], order: 0 },
    { cards: [109], order: 1 },
    { cards: [108, 208, 308, 408], order: 2 },
  ], rules);
  assert.deepEqual(responding[0], [109], 'response hint must use a spare single before splitting four 8s');
  assert.deepEqual(responding[1], [108, 208, 308, 408], 'the intact bomb remains available before a split-bomb candidate');
  assert.equal(responding.length, 2, 'a split-bomb single must not enter the prompt cycle');
});

test('lead hint ranks only by legal card count', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 113, 213, 112, 212, 110, 210, 109, 209, 108, 208, 308, 408, 107, 106, 206];
  const ordinaryPair = { cards: [106, 206], order: 0 };
  const completeBomb = { cards: [108, 208, 308, 408], order: 1 };
  const ranked = rankCleanPdkHints(hand, [completeBomb, ordinaryPair], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
  }, true);
  assert.deepEqual(ranked[0], completeBomb.cards);
  assert.deepEqual(ranked[1], ordinaryPair.cards);
});

test('four-with-two body is not demoted as a spent bomb in lead hints', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 214, 113, 110, 210, 310, 410, 109];
  const fourWithTwo = {
    cards: [110, 210, 310, 410, 114, 214],
    order: 0,
    usesFourCardBody: true,
  };
  const ranked = rankCleanPdkHints(hand, [
    fourWithTwo,
    { cards: [109], order: 1 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
  }, true);
  assert.deepEqual(ranked[0], fourWithTwo.cards);
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
  const response = source.slice(source.indexOf('private responseTipCandidates'),
    source.indexOf('private exactSizeResponseSubsets'));
  const sorter = source.slice(source.indexOf('private sortedLegalTipCandidates'), source.indexOf('private cardsInHandOrder'));
  assert.match(response, /const candidates = \[\.\.\.legacy, \.\.\.this\.exactSizeResponseSubsets\(targetCards\.length\)\]/);
  assert.match(response, /this\.pushTipCandidates\(candidates, this\.logic\.GetZhaDanTip\(\)\)/);
  assert.match(sorter, /sameShape[\s\S]*fallbackBombs[\s\S]*rankCandidates\(sameShape\)[\s\S]*rankCandidates\(fallbackBombs\)/);
});

test('authority comparison normalizes canonical string card types before hinting', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const reconcile = source.slice(source.indexOf('private reconcileAuthorityPublicCards'), source.indexOf('private async restoreSeatPlayStates'));
  assert.match(reconcile, /legacyOperationType\(comparison\.cardType \?\? comparison\.type\)/);
  const synchronize = source.slice(source.indexOf('private synchronizeAuthorityComparison'), source.indexOf('private maybeAutoPlay'));
  assert.match(synchronize, /legacyOperationType\(comparison\?\.cardType \?\? comparison\?\.type\)/);
  assert.doesNotMatch(synchronize, /Number\(comparison\?\.cardType/);
});

test('turn ownership does not clear cards before the play snapshot defines the XQP transition', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const boundary = source.slice(source.indexOf('private applyAuthoritativeTurnBoundary'), source.indexOf('private reconcileAuthorityPublicCards'));
  assert.doesNotMatch(boundary, /clearPublicCards/);
  assert.match(boundary, /selectionAuthorityKey/);
});

test('ChangeStatus cannot mutate authoritative table presentation', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const branch = source.slice(source.indexOf("event === 'ChangeStatus'"), source.indexOf("event === 'CommonPdk_AuthoritativePhaseChanged'"));
  assert.doesNotMatch(branch, /clearPublicCards|renderPublicOperation|reconcileAuthorityPublicCards|presentPublicOperation/);
  assert.match(branch, /Turn-only compatibility events do not own table presentation/);
});

test('ordinary mode keeps every seat play until the completed trick clears together', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const reconcile = source.slice(source.indexOf('private reconcileAuthorityPublicCards'), source.indexOf('private async restoreSeatPlayStates'));
  assert.match(source, /const COMPLETED_TRICK_HOLD_MS = 2000/);
  assert.match(reconcile, /!this\.runtime\.arrangementEnabled\(\)/);
  assert.match(reconcile, /if \(trickReset\)[\s\S]*clearCompletedTrickAfterHold/);
  const ordinaryStart = reconcile.indexOf('// Each seat owns one live Out_Card slot');
  const ordinary = reconcile.slice(ordinaryStart, reconcile.indexOf('return Promise.resolve', ordinaryStart));
  assert.match(ordinary, /renderPublicOperation/);
  assert.doesNotMatch(ordinary, /clearLatestPublicCards\(\)/);
});

test('ordinary public cards have one complete-authority writer', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const opCard = source.slice(source.indexOf("event === 'OpCard'"), source.indexOf("event === 'ChangeStatus'"));
  const changeStatus = source.slice(source.indexOf("event === 'ChangeStatus'"), source.indexOf("event === 'CommonPdk_AuthoritativePhaseChanged'"));
  assert.match(source, /private reconcileAuthorityPublicCards\(packet: Record<string, unknown>\)/);
  assert.doesNotMatch(opCard, /renderPublicOperation|presentPublicOperation|reconcileAuthorityPublicCards/);
  assert.doesNotMatch(changeStatus, /renderPublicOperation|presentPublicOperation|reconcileAuthorityPublicCards/);
});

test('authority restore skips only the seat whose next turn has started', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = source.slice(source.indexOf('private async restoreSeatPlayStates'), source.indexOf('private updateActionCardLayout'));
  assert.match(restore, /entry\.dataSeat === this\.activeOpPos[\s\S]*continue/);
  assert.doesNotMatch(restore, /this\.activeOpPos === this\.clientSeat\(\) && entry\.dataSeat !== this\.clientSeat\(\)/);
});

test('history mode archives every play without shortening its live two-second presentation', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const render = source.slice(source.indexOf('private async renderPublicOperation'), source.indexOf('private async presentPublicOperation'));
  assert.doesNotMatch(render.slice(0, render.indexOf('const generation')), /clearPublicCards\(\)/);
  assert.match(render, /if \(values\.length > 0\) \{[\s\S]*markPublicCardsShown\(dataSeat\)/);
  const retained = source.slice(source.indexOf('private async presentPublicOperation'), source.indexOf('private async presentLatestAuthorityAction'));
  assert.match(source, /const HISTORY_MOVE_DELAY_MS = 500/);
  assert.match(retained, /setTimeout\(resolve, HISTORY_MOVE_DELAY_MS\)/);
  assert.doesNotMatch(retained, /clearPublicCardsForSeat\(dataSeat\)/);
  const restore = source.slice(source.indexOf('private async restoreTableCards'), source.indexOf('private async clearActionSlot'));
  assert.match(restore, /packet\.tableOperations/);
  assert.match(restore, /await this\.appendTableCards/);
  assert.doesNotMatch(restore, /packet\.playedCardList|GetRoomSetProperty\('playedCardList'\)/);
  assert.doesNotMatch(restore, /this\.clearTableCards\(\)/);
  const append = source.slice(source.indexOf('private async appendTableCards'), source.indexOf('private async restoreTableCards'));
  assert.match(append, /parent\.children\.some\(\(child\) => child\.name === nodeName\)/);
  const latest = source.slice(source.indexOf('private async presentLatestAuthorityAction'), source.indexOf('private clearPublicCards'));
  assert.match(latest, /if \(!this\.authorityActionsInitialized\)[\s\S]*reconcileAuthorityPublicCards\(setInfo\)/);
  assert.doesNotMatch(latest, /if \(!this\.authorityActionsInitialized\)[\s\S]*clearLatestPublicCards\(\)/);
});

test('an immediately unbeatable own lead is not synchronously removed by empty authority history', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = source.slice(source.indexOf('private async restoreSeatPlayStates'), source.indexOf('private updateActionCardLayout'));
  const missing = restore.slice(restore.indexOf('if (this.authorityActionsInitialized)'));
  assert.match(missing, /this\.renderedActionIds\.delete\(seat\)/);
  assert.doesNotMatch(missing, /clearPublicCardsForSeat|schedulePublicCardsClear/);
  assert.doesNotMatch(missing, /clearActionSlot/);
});

test('an unbeatable lead is rendered from the committed ledger before its two-second clear starts', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const reconcile = source.slice(source.indexOf('private reconcileAuthorityPublicCards'),
    source.indexOf('private async restoreSeatPlayStates'));
  const reset = reconcile.slice(reconcile.indexOf('if (!this.runtime.arrangementEnabled())'),
    reconcile.indexOf('} else {', reconcile.indexOf('if (!this.runtime.arrangementEnabled())')));
  assert.match(reset, /packet\.tableOperations/);
  assert.match(reset, /latestPlay\.cards/);
  assert.match(reset, /publicSeatOperationIds\.get\(winningSeat\) === winningOperationId/);
  assert.match(reset, /renderPublicOperation\([\s\S]*\.then\(\(\) => this\.clearCompletedTrickAfterHold\(winningSeat\)\)/);
  assert.doesNotMatch(reconcile.slice(0, reconcile.indexOf('if (!this.runtime.arrangementEnabled())')),
    /clearPublicCardsForTurn/);
});

test('completed trick clears every player together after the winning card hold', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const clear = source.slice(source.indexOf('private clearCompletedTrickAfterHold'),
    source.indexOf('private clearPublicCardsForSeat'));
  assert.match(clear, /COMPLETED_TRICK_HOLD_MS/);
  assert.match(clear, /publicCardShownAt\.get\(winningSeat\)/);
  assert.match(clear, /clearLatestPublicCards\(\)/);
  assert.doesNotMatch(clear, /clearPublicCardsForSeat\(winningSeat\)/);
});

test('starting the next round clears completed cards before rendering its hand', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const phase = source.slice(source.indexOf("event === 'CommonPdk_AuthoritativePhaseChanged'"),
    source.indexOf("event === 'CommonPdk_PosUpdate'"));
  const compete = phase.slice(phase.indexOf("if (to === 'COMPETE_DEALER')"),
    phase.indexOf("if (to === 'PLAYING')"));
  assert.match(compete, /this\.completedRoundVisualsCleared = false/);
  const playing = phase.slice(phase.indexOf("if (to === 'PLAYING')"));
  const reset = playing.indexOf('this.resetRoundPresentation()');
  const init = playing.indexOf('this.logic.InitHandCard()');
  const render = playing.indexOf('this.trackPresentation(this.renderHand');
  assert.ok(reset >= 0 && reset < init);
  assert.ok(init >= 0 && init < render);
  assert.match(playing, /this\.completedRoundVisualsCleared = false/);
  assert.match(playing, /\[CommonRoomRoundStart\]/);
});

test('continue clears completed-round cards but a delayed acknowledgement cannot clear the next deal', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'), 'utf8');
  const result = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts'), 'utf8');
  const continued = source.slice(source.indexOf("event === 'CommonPdk_PosContinueGame'"),
    source.indexOf("event === 'CommonPdk_StartVoteDissolve'"));
  assert.match(continued, /forms\.close\(this\.smallSettlementForm\)/);
  assert.match(continued, /phase === 'COMPETE_DEALER' \|\| phase === 'PLAYING'/);
  assert.match(continued, /this\.playController\?\.clearCompletedRound\(\)/);
  assert.match(continued, /SKIP_ACTIVE_ROUND/);
  assert.match(continued, /CLEAR_COMPLETED_ROUND/);
  const click = result.slice(result.indexOf('private continueGame(): void'),
    result.indexOf('private canContinue(): boolean'));
  assert.match(source, /\(\) => this\.playController\?\.clearCompletedRound\(\)/);
  assert.ok(click.indexOf('this.clearCompletedRoundVisuals()')
    < click.indexOf("this.runtime.action('continue'"));
});

test('authoritative continued state cannot restore the previous round operation ledger', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const authority = source.slice(source.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    source.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(authority, /Boolean\(localPlayer\?\.isContinue\)/);
  assert.match(authority, /this\.completedRoundVisualsCleared = true/);
  assert.ok(authority.indexOf('Boolean(localPlayer?.isContinue)')
    < authority.indexOf('if (!playing && this.completedRoundVisualsCleared)'));
  assert.match(authority, /\[CommonRoomContinueVisualClear\]/);
});

test('dealer competition also clears the previous round before dealing', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const compete = source.slice(source.indexOf("if (to === 'COMPETE_DEALER')"),
    source.indexOf("if (to === 'PLAYING')"));
  assert.ok(compete.indexOf('this.resetRoundPresentation()') < compete.indexOf('this.logic.InitHandCard()'));
  assert.ok(compete.indexOf('this.resetRoundPresentation()') < compete.indexOf('this.renderHand('));
});

test('dealer-competition snapshots cannot restore the completed round ledger', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const authority = source.slice(source.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    source.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(authority, /const formalCardPlayPhase = this\.isFormalCardPlayPhase\(setInfo\)/);
  assert.ok(authority.indexOf('if (this.competeDealerPhase) this.resetRoundPresentation()')
    < authority.indexOf('const publicPresentation'));
  assert.match(authority, /const projectRoundCards = formalCardPlayPhase \|\| waitingForContinue/);
  assert.match(authority, /const publicPresentation = !projectRoundCards[\s\S]*\? Promise\.resolve\(\)/);
  const onShow = source.slice(source.indexOf('public onShow(): void'), source.indexOf('public onEvent('));
  assert.match(onShow, /const formalCardPlayPhase = this\.isFormalCardPlayPhase\(snapshot\)/);
  assert.match(onShow, /if \(this\.competeDealerPhase\) this\.resetRoundPresentation\(\)/);
  assert.match(onShow, /if \(formalCardPlayPhase \|\| waitingForContinue\) \{[\s\S]*restoreTableCards\(snapshot\)/);
});

test('finished-round authority keeps cards until local continue', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const authority = source.slice(source.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    source.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(authority, /const waitingForContinue = !playing && Boolean\(completedRound\) && !Boolean\(localPlayer\?\.isContinue\)/);
  assert.match(authority, /const projectRoundCards = formalCardPlayPhase \|\| waitingForContinue/);
  assert.match(authority, /formalCardPlayPhase[\s\S]*this\.presentLatestAuthorityAction\(setInfo\)[\s\S]*: this\.restoreTableCards\(setInfo\)/);
  assert.doesNotMatch(source, /scheduleRoundEndCleanup|ROUND_END_TIMER/);
});

test('an own winning play keeps its public cards for the two-second hold', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(source, /private readonly publicCardShownAt = new Map<number, number>\(\)/);
  assert.match(source, /if \(values\.length > 0\) \{[\s\S]*this\.markPublicCardsShown\(dataSeat\)/);
  assert.match(source, /private waitForPublicCardHold[\s\S]*COMPLETED_TRICK_HOLD_MS/);
});

test('visual card selection is reconciled before the empty-selection warning', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const play = source.slice(source.indexOf('private async outCard'), source.indexOf('private buildHandCompactionPlan'));
  assert.match(play, /cards\.isSelected\(this\.cardNodes\[index\]\)[\s\S]*ChangeSelectCard\(values\)[\s\S]*请先选择要出的牌/);
});

test('local recognition never blocks exact selected cards from Authority submission', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const play = source.slice(source.indexOf('private async outCard'), source.indexOf('private buildHandCompactionPlan'));
  assert.doesNotMatch(play, /if \(opType <= 0\)|if \(comparableType <= 0\)/);
  assert.match(play, /await this\.lifecycle\.play\([\s\S]*Math\.max\(0, opType\), values/);
});
