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

test('last-hand autoplay never carries an extra card with AAA or a four-card bomb', () => {
  const { isAtomicPdkWholeHandCandidate } = loadHelper();
  const aces = [114, 214, 314];
  const sixes = [106, 206, 306, 406];
  const queen = 112;

  assert.equal(isAtomicPdkWholeHandCandidate(aces, [aces]), true);
  assert.equal(isAtomicPdkWholeHandCandidate([...aces, queen], [aces]), false);
  assert.equal(isAtomicPdkWholeHandCandidate(sixes, []), true);
  assert.equal(isAtomicPdkWholeHandCandidate([...sixes, queen], []), false);
});

test('clicking one card expands to the pair or bare-triple response body', () => {
  const { pdkClickedResponseGroup } = loadHelper();
  const hand = [113, 213, 313, 109, 209, 108];

  assert.deepEqual(pdkClickedResponseGroup(hand, 313, 3, 2), [113, 313],
    'a clicked card inside a triple must remain one of the two raised pair cards');
  assert.deepEqual(pdkClickedResponseGroup(hand, 209, 3, 2), [109, 209]);
  assert.deepEqual(pdkClickedResponseGroup(hand, 313, 5, 3), [113, 213, 313]);
  assert.deepEqual(pdkClickedResponseGroup(hand, 108, 3, 2), [],
    'a loose single must remain a manual single selection');
  assert.deepEqual(pdkClickedResponseGroup(hand, 313, 6, 4), [],
    'attachment families are not silently fabricated by a body-card click');
});

test('manual triple swipe carries loose singles before splitting a pair', () => {
  const { rankPdkManualAttachmentCandidates } = loadHelper();
  const hand = [107, 106, 206, 306, 105, 205, 104, 103, 203];
  const ranked = rankPdkManualAttachmentCandidates(hand, [
    [106, 206, 306, 105, 205],
    [106, 206, 306, 103, 203],
    [107, 106, 206, 306, 104],
    [107, 106, 206, 306, 105],
  ]);

  assert.deepEqual(ranked[0], [107, 106, 206, 306, 104]);
  assert.deepEqual(ranked[1], [107, 106, 206, 306, 105]);
  assert.deepEqual(ranked[2], [106, 206, 306, 103, 203]);
  assert.deepEqual(ranked[3], [106, 206, 306, 105, 205]);
});

test('same-size manual swipe chooses a straight before triple-with-two', () => {
  const { rankPdkManualAttachmentCandidates } = loadHelper();
  const hand = [107, 106, 206, 306, 105, 205, 104, 103, 203];
  const ranked = rankPdkManualAttachmentCandidates(hand, [
    [107, 106, 206, 306, 104],
    [107, 106, 105, 104, 103],
  ]);
  assert.deepEqual(ranked[0], [107, 106, 105, 104, 103]);
  assert.deepEqual(ranked[1], [107, 106, 206, 306, 104]);
});

test('one swipe replaces prior selection with its largest legal subset by card count', () => {
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
  assert.match(commit, /ChangeSelectCard\(selected\)/);
  assert.doesNotMatch(commit, /GetSelectCard|combined|selectionFromSuggestion|canExtendSelectionAsBomb/);
  const manual = controller.slice(controller.indexOf('private largestLegalDragCandidates'),
    controller.indexOf('private cancelDragSelection'));
  assert.match(manual, /largestLegalPdkSubsets\(touched/);
  assert.match(manual, /sortedLegalTipCandidates\(candidates, leading, leading\)/);
  assert.doesNotMatch(controller, /private legalManualDragCandidates/);
});

test('5-to-A sweep keeps direction and selects six-card four-with-two before the four-card bomb', () => {
  const { largestLegalPdkSubsets } = loadHelper();
  const rightToLeft = [105, 106, 107, 207, 307, 407, 108, 208, 109, 209, 110, 112, 212, 113, 213, 114];
  const ranked = largestLegalPdkSubsets(rightToLeft, (subsets) => subsets.filter((cards) => {
    const counts = new Map();
    for (const card of cards) counts.set(card % 100, (counts.get(card % 100) ?? 0) + 1);
    const fourWithTwo = cards.length === 6 && [...counts.values()].includes(4);
    const bomb = cards.length === 4 && [...counts.values()].includes(4);
    return fourWithTwo || bomb;
  }));

  assert.deepEqual(ranked[0], [105, 106, 107, 207, 307, 407]);
  assert.equal(ranked[0].length, 6);
});

test('only responding clicks replace an automatic hint while leading clicks preserve prior selections', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const toggle = controller.slice(controller.indexOf('private async toggleCardAt'),
    controller.indexOf('private groupedResponseSelection'));
  assert.match(toggle, /const responding = !this\.isAuthoritativeLeadingTurn\(\)/);
  assert.match(toggle, /selectionFromSuggestion/);
  assert.match(toggle, /if \(responding && this\.selectionFromSuggestion/);
  assert.match(toggle, /!this\.canExtendSelectionAsBomb\(current, \[clicked\]\)/);
  assert.match(toggle, /this\.logic\.ChangeSelectCard\(\[\]\)/);
  assert.doesNotMatch(toggle, /this\.selectionFromSuggestion = false/);
  const autoHint = controller.slice(controller.indexOf('private async autoHintForAuthoritativeTurn'),
    controller.indexOf('private maybeAutoPlay'));
  assert.match(autoHint, /ChangeSelectCard\(automatic\)[\s\S]*selectionFromSuggestion = true/);
  const drag = controller.slice(controller.indexOf('private commitSmartDragSelection'),
    controller.indexOf('private largestLegalDragCandidates'));
  assert.match(drag, /const replacementMode = this\.selectionFromSuggestion/);
  assert.match(drag, /this\.selectionFromSuggestion = replacementMode/);
});

test('swiping exactly three cards still uses the largest legal subset', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const select = controller.slice(controller.indexOf('private largestLegalDragCandidates'),
    controller.indexOf('private cancelDragSelection'));
  assert.match(select, /largestLegalPdkSubsets\(touched/);
  assert.doesNotMatch(select, /touched\.length === 3|return \[\[\.\.\.touched\]\]/);
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
  assert.match(outsideClear, /hasInteractiveButtonAncestor\(target\)[\s\S]*interactiveButtonAtUi\(uiX, uiY\) !== null/);
  assert.match(controller, /clearSelectionOutsideCards\(target, screen\.x, screen\.y, windowId, location\.x, location\.y\)/);
  assert.match(controller, /clearSelectionOutsideCards\(target, location\.x, location\.y, windowId, uiLocation\.x, uiLocation\.y\)/);
  const buttonHit = controller.slice(controller.indexOf('private interactiveButtonAtUi'),
    controller.indexOf('private sampleFromPointer'));
  assert.match(buttonHit, /\[this\.view\?\.root, this\.commonView\?\.root\]/);
  const pointerDown = controller.slice(controller.indexOf('private readonly onDomPointerDown'),
    controller.indexOf('private readonly onDomPointerMove'));
  assert.ok(pointerDown.indexOf('sample.index >= 0') < pointerDown.indexOf('interactiveButtonAtUi'));
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

test('a pointer inside the visible card union can never clear the complete selection', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const sample = controller.slice(controller.indexOf('private buildPointerSample'),
    controller.indexOf('private pointerSource'));
  assert.match(sample, /const index = exactIndex/);
  assert.doesNotMatch(sample, /cardIndexWithinHandCoverage/);
  const outsideClear = controller.slice(controller.indexOf('private clearSelectionOutsideCards'),
    controller.indexOf('private clearCardSelection'));
  assert.match(outsideClear, /cardIndexWithinHandCoverage\(uiX, uiY\) >= 0/);
  const coverage = controller.slice(controller.indexOf('private cardIndexWithinHandCoverage'),
    controller.indexOf('private dragIndexAtUi'));
  assert.match(coverage, /getBoundingBoxToWorld/);
  assert.match(coverage, /uiX < left \|\| uiX > right \|\| uiY < bottom \|\| uiY > top/);
  assert.doesNotMatch(coverage, /gestureSurface/);
});

test('a moving swipe uses exact card ownership and never projects to a nearby card', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.doesNotMatch(controller, /private dragIndexAtUi|nearestDistance|worldPosition\.x - uiX/);
  assert.match(controller, /this\.updateDragSelection\(sample\.index\)/);
  assert.match(controller, /this\.bindDomPointerBridge\(\)/);
  assert.match(controller, /document\.addEventListener\('pointerdown', this\.onDomPointerDown, true\)/);
  assert.match(controller, /this\.capturedPointerId = event\.pointerId;[\s\S]*this\.beginDragSelection\(sample\)/);
});

test('pointer jitter over one card remains a tap instead of an empty one-card swipe', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  for (const [start, end] of [
    ['private readonly onDomPointerMove', 'private readonly onDomPointerUp'],
    ['private onHandTouchMove', 'private onHandTouchCancel'],
    ['private onHandMouseMove', 'private onHandMouseUp'],
  ]) {
    const move = controller.slice(controller.indexOf(start), controller.indexOf(end));
    assert.doesNotMatch(move, /DRAG_THRESHOLD_PX/);
    assert.match(move, /this\.updateDragSelection\(sample\.index\)/);
  }
  const update = controller.slice(controller.indexOf('private updateDragSelection'),
    controller.indexOf('private previewDragSelection'));
  assert.match(update, /if \(index !== this\.dragStartIndex\) this\.dragMoved = true/);
});

test('PDK taps stay mask-free while a confirmed multi-card drag previews its range', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const cardPresenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const commonPresenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/Common/Code/Card/Poker_Card_Presenter.ts'), 'utf8');
  const mouseDown = controller.slice(controller.indexOf('private onHandMouseDown'),
    controller.indexOf('private onHandMouseMove'));
  const mouseMove = controller.slice(controller.indexOf('private onHandMouseMove'),
    controller.indexOf('private onHandMouseUp'));
  assert.doesNotMatch(mouseDown, /previewDragSelection/);
  assert.match(mouseMove, /if \(this\.dragMoved\) this\.previewDragSelection\(\)/);
  assert.match(controller, /private clearDragPreview\(\)/);
  assert.match(cardPresenter, /public previewDrag[\s\S]*setPdkDragPreview/);
  assert.match(commonPresenter, /setPdkDragPreview[\s\S]*selectedMask!\.active = this\.presentationOnly \? false : !this\.selected && preview/);
  const mouseUp = controller.slice(controller.indexOf('private onHandMouseUp'),
    controller.indexOf('private onHandMouseCancel'));
  assert.match(mouseUp, /suppressClickUntil = Date\.now\(\) \+ CLICK_SUPPRESS_MS/);
  assert.equal((mouseUp.match(/toggleCardAt\(/g) ?? []).length, 1);
});

test('every committed Out_Card layout strips hand selection and drag masks', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const layout = controller.slice(controller.indexOf('private layoutActionCards'),
    controller.indexOf('private async flyRemoteCards'));
  const atomicCreate = controller.slice(controller.indexOf('private async createActionCardsAtomically'),
    controller.indexOf('private setOutCardVisible'));
  const remoteFlight = controller.slice(controller.indexOf('private async flyRemoteCards'),
    controller.indexOf('private initializeRemainingCards'));
  const flight = controller.slice(controller.indexOf('private prepareOwnFlightCards'),
    controller.indexOf('private async flyCardsToOwnAction'));
  assert.match(atomicCreate, /for \(const card of created\) this\.cards\.stripInteractionVisual\(card\)/);
  assert.match(layout, /for \(const card of cardNodes\) this\.cards\.stripInteractionVisual\(card\)/);
  assert.match(remoteFlight, /for \(const card of nodes\) this\.cards\.stripInteractionVisual\(card\)/);
  assert.match(flight, /this\.cards\.stripInteractionVisual\(flying\)/);
  assert.match(presenter, /setPresentationOnly\(\)/);
  assert.match(presenter, /child\.name === 'Selected_Mask' \|\| child\.name === 'Disabled_Mask'[\s\S]*removeFromParent\(\)[\s\S]*destroy\(\)/);
  const commonPresenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/Common/Code/Card/Poker_Card_Presenter.ts'), 'utf8');
  assert.match(commonPresenter, /setPresentationOnly\(\)[\s\S]*removeFromParent\(\)[\s\S]*destroy\(\)[\s\S]*this\.selectedMask = null[\s\S]*this\.disabledMask = null/);
  assert.match(controller, /private refresh\(\): void \{[\s\S]*this\.stripPublicCardInteractionVisuals\(\)/);
  assert.match(controller, /stripPublicCardInteractionVisuals[\s\S]*\['Out_Card', 'Table_Cards'\][\s\S]*stripTree\(root\)/);
});

test('unchanged selection refresh cannot cancel a running hand compaction tween', () => {
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const selectMethod = presenter.slice(presenter.indexOf('public select('), presenter.indexOf('public isSelected('));
  assert.match(selectMethod, /const changed =/);
  assert.match(selectMethod, /if \(!changed\) return;[\s\S]*this\.animateToPose\(card,/);
  assert.doesNotMatch(selectMethod, /Tween\.stopAllByTarget\(card\)/);
});

test('overlapping asynchronous hand renders cannot leave a deferred-destroy layout slot', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const render = source.slice(source.indexOf('private async renderHand'),
    source.indexOf('private shouldAnimateDeal'));
  assert.match(render, /const createdNodes: Node\[\] = \[\]/);
  assert.match(render, /const staging = new Node\('PDK_Hand_Render_Staging'\)/);
  assert.match(render, /this\.cards\.create\(staging,/);
  assert.match(render, /for \(const card of createdNodes\) parent\.addChild\(card\)/);
  assert.doesNotMatch(render, /this\.cards\.create\(parent,/);
  assert.match(render, /const createdValues: number\[\] = \[\]/);
  assert.match(render, /createdNodes\.push\(card\)/);
  assert.match(render, /this\.cardNodes\.splice\(0, this\.cardNodes\.length, \.\.\.createdNodes\)/);
  assert.match(render, /generation !== this\.handRenderGeneration[\s\S]*discardUncommittedHandNodes/);
  assert.match(render, /private discardUncommittedHandNodes[\s\S]*card\.removeFromParent\(\);[\s\S]*card\.destroy\(\)/);
  assert.ok(render.indexOf('card.removeFromParent()') < render.indexOf('card.destroy()'));
});

test('hint queues without mutating selection while a play transaction owns the hand', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const tip = source.slice(source.indexOf('private tip(): void'),
    source.indexOf('private prepareHintCache'));
  const lock = tip.indexOf('if (this.playInFlight || this.keepOperationsVisibleDuringPlay)');
  const queued = tip.indexOf('this.hintRequestedDuringPlay = true', lock);
  const guardedReturn = tip.indexOf('return;', queued);
  assert.ok(lock >= 0 && queued > lock && guardedReturn > queued);
  assert.ok(guardedReturn < tip.indexOf('this.cancelAutoPlay()'));
  assert.ok(guardedReturn < tip.indexOf('this.logic.ChangeSelectCard'));
});

test('manual Hint invalidates an older automatic hint waiting for hand compaction', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const tip = controller.slice(controller.indexOf('private tip(): void'),
    controller.indexOf('private prepareHintCache'));
  assert.match(tip, /this\.selectionIntentRevision \+= 1/);

  const automatic = controller.slice(controller.indexOf('private async autoHintForAuthoritativeTurn'),
    controller.indexOf('private operationTypeForCards'));
  assert.match(automatic, /expectedSelectionRevision !== this\.selectionIntentRevision/);
  assert.match(automatic, /MANUAL_SELECTION_OWNS_TURN/);

  const authority = controller.slice(controller.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    controller.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(authority, /const authoritySelectionRevision = this\.selectionIntentRevision/);
  assert.match(authority,
    /autoHintForAuthoritativeTurn\(\s*setInfo, authoritySelectionRevision, authorityProjectionStartedAt,\s*\)/);
});

test('selection and hand compaction share one composed card-position owner', () => {
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const select = presenter.slice(presenter.indexOf('public select('),
    presenter.indexOf('public moveBase'));
  const moveBase = presenter.slice(presenter.indexOf('public moveBase'),
    presenter.indexOf('public clearSelectionImmediately'));
  assert.match(select, /this\.animateToPose\(card,/);
  assert.doesNotMatch(select, /Tween\.stopAllByTarget/);
  assert.match(moveBase, /this\.basePositions\.set\(card, target\.clone\(\)\)/);
  assert.match(moveBase, /return this\.animateToPose\(card, duration\)/);

  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const compact = controller.slice(controller.indexOf('private compactVisibleHand'),
    controller.indexOf('private markPublicCardsShown'));
  assert.match(compact, /this\.cards\.moveBase\(card, target, HAND_COMPACT_DURATION_SECONDS\)/);
  assert.doesNotMatch(compact, /Tween\.stopAllByTarget/);
  assert.doesNotMatch(compact, /\.by\(/);
});

test('a hint selected during hand compaction remains raised after Layout reconciliation', () => {
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const synchronize = presenter.slice(presenter.indexOf('public synchronizeLayout'),
    presenter.indexOf('public createFlyingOverlay'));
  assert.match(synchronize, /const base = this\.canonicalLayoutBase\(card, current\)/);
  assert.match(synchronize, /base\.y \+ \(selected \? SELECTED_OFFSET_Y : 0\)/);
  assert.doesNotMatch(synchronize, /basePositions\.set\(card, new Vec3\(current\.x, current\.y/);
});

test('hand compaction always targets a fresh authored Layout instead of accumulating old X coordinates', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const method = source.slice(source.indexOf('private buildCanonicalHandCompactionPlan'),
    source.indexOf('private compactVisibleHand'));
  assert.match(method, /layout\.enabled = true;[\s\S]*layout\.updateLayout\(\)/);
  assert.match(method, /targets\.set\(card, this\.cards\.canonicalLayoutBase\(card, card\.position\)\)/);
  assert.match(method, /layout\.enabled = false/);
  assert.match(method, /card\.setPosition\(start\)/);
  assert.doesNotMatch(source, /private buildHandCompactionPlan/);
  assert.doesNotMatch(method, /removedBefore|selectedCount \/ 2|positions\[index\]/);
});

test('rapid play cannot persist an automatic hint deselection tween as the hand baseline', () => {
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const canonical = presenter.slice(presenter.indexOf('public canonicalLayoutBase'),
    presenter.indexOf('public clearSelectionImmediately'));
  assert.match(canonical, /const previousBase = this\.basePositions\.get\(card\)/);
  assert.match(canonical,
    /new Vec3\(layoutPosition\.x, previousBase\?\.y \?\? layoutPosition\.y, layoutPosition\.z\)/);
  assert.doesNotMatch(canonical, /card\.position\.y/);

  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const compactMethod = controller.includes('private buildCanonicalHandCompactionPlan')
    ? 'private buildCanonicalHandCompactionPlan'
    : 'private buildHandCompactionPlan';
  const compact = controller.slice(controller.indexOf(compactMethod),
    controller.indexOf('private compactVisibleHand'));
  assert.match(compact, /canonicalLayoutBase\(card,/);
  assert.doesNotMatch(compact, /plan\.set\(card, new Vec3\([^;]*start\.y/);
});

test('authoritative deselection does not stop compaction tweens on surviving cards', () => {
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const clear = presenter.slice(presenter.indexOf('public clearSelectionImmediately'),
    presenter.indexOf('public preview'));
  const selectedGuard = clear.indexOf('this.selectedStates.get(card) !== true');
  const cancelMotion = clear.indexOf('this.cancelMotion(card)');
  assert.ok(selectedGuard >= 0 && selectedGuard < cancelMotion);
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
  assert.match(controller, /private nextPlayerReportedSingle\(\): boolean/);
  assert.match(controller, /GetRoomSetInfo\(\)[\s\S]*posInfo[\s\S]*Number\(nextPlayer\?\.cardCount\)/);

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

test('compound response hints enumerate one exact-size candidate per rank multiset', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const response = controller.slice(
    controller.indexOf('private responseTipCandidates'),
    controller.indexOf('private sortedLegalTipCandidates'),
  );
  assert.match(response, /this\.logic\.GetTipCard\(\)/);
  assert.match(response, /exactSizeResponseSubsets\(targetCards\.length\)/);
  assert.match(response, /const groups = new Map<number, number\[\]>\(\)/);
  assert.match(response, /if \(selected\.length === size\)[\s\S]*result\.push\(\[\.\.\.selected\]\)/);
  assert.match(response, /selected\.push\(\.\.\.group\.slice\(0, count\)\)[\s\S]*build\(groupIndex \+ 1\)/);
  assert.doesNotMatch(response, /build\(index \+ 1, cards\)/);
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

test('COMMON keeps an intact pair run visible when a longer run would split a triple', () => {
  const { rankCleanPdkHints } = loadHelper();
  const tripleTen = [110, 210, 310];
  const pairJack = [111, 211];
  const pairQueen = [112, 212];
  const pairSix = [106, 206];
  const pairFour = [104, 204];
  const hand = [...pairQueen, ...pairJack, ...tripleTen, ...pairSix, ...pairFour];
  const completePairRun = [...pairJack, ...pairQueen];
  const tripleSplittingRun = [110, 210, ...completePairRun];
  const tripleWithLowPair = [...tripleTen, ...pairFour];
  const ranked = rankCleanPdkHints(hand, [
    { cards: pairFour, order: 0, containsRuleMaximum: false },
    { cards: completePairRun, order: 1, containsRuleMaximum: false },
    { cards: tripleSplittingRun, order: 2, containsRuleMaximum: false },
    { cards: tripleWithLowPair, order: 3, containsRuleMaximum: false },
  ], {
    policyId: 'COMMON', minimumStraightLength: 5, minimumPairRunLength: 2,
    allowTwoInRuns: false, tripleAttachmentMode: 'EITHER', optimizeWholeHand: true,
  }, true, true);

  assert.ok(ranked.some((cards) => cards.join(',') === completePairRun.join(',')),
    'a theoretical 10-J-Q run must not hide the intact J-Q run');
  assert.deepEqual(ranked[0], tripleWithLowPair,
    'the complete triple family preserves the same high pair run as leading 44');
});

test('COMMON response spends an unbeatable single before an equal-turn low probe', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [115, 106, 206, 306, 104, 204];
  const candidates = [
    { cards: [104], order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: [115], order: 1, finishesInTwo: true, containsRuleMaximum: true },
    { cards: [106], order: 2, finishesInTwo: false, containsRuleMaximum: false },
  ];
  const rules = {
    policyId: 'COMMON', minimumStraightLength: 5, minimumPairRunLength: 2,
    allowTwoInRuns: false, tripleAttachmentMode: 'EITHER', optimizeWholeHand: true,
    maximumSingleRanks: [15],
  };
  assert.deepEqual(rankCleanPdkHints(hand, candidates, rules, false)[0], [115],
    '2 takes the trick, leaving 666+44 as one legal hand');

  const notFinishing = candidates.map((candidate) => ({ ...candidate,
    finishesInTwo: candidate.cards[0] === 115 ? false : candidate.finishesInTwo }));
  assert.deepEqual(rankCleanPdkHints(hand, notFinishing, rules, false)[0], [104],
    'maximum alone must not outrank the lower response without a complete finishing plan');
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

test('Liangshan two-play lead exposes maximum ace before retaining the 8-to-J straight', () => {
  const { rankCleanPdkHints } = loadHelper();
  const ace = [114];
  const straight = [108, 109, 110, 111];
  const ranked = rankCleanPdkHints([...ace, ...straight], [
    { cards: straight, order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: ace, order: 1, finishesInTwo: true, containsRuleMaximum: true },
  ], {
    minimumStraightLength: 3,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    tripleAttachmentMode: 'SINGLE_OR_PAIR',
  }, true, true);

  assert.deepEqual(ranked[0], ace);
});

test('COMMON exact two-play lead spends a maximum single before a much longer straight', () => {
  const { rankCleanPdkHints } = loadHelper();
  const maximumSingle = [115];
  const straight = [106, 107, 108, 109, 110];
  const ranked = rankCleanPdkHints([...maximumSingle, ...straight], [
    { cards: straight, order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: maximumSingle, order: 1, finishesInTwo: true, containsRuleMaximum: true },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false }, true, true);

  assert.deepEqual(ranked[0], maximumSingle);
});

test('COMMON exact two-play lead spends the maximum pair before a longer triple family', () => {
  const { rankCleanPdkHints } = loadHelper();
  const maximumPair = [114, 214];
  const tripleFamily = [109, 209, 309, 107, 108];
  const ranked = rankCleanPdkHints([...maximumPair, ...tripleFamily], [
    { cards: tripleFamily, order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: maximumPair, order: 1, finishesInTwo: true, containsRuleMaximum: true },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false }, true, true);

  assert.deepEqual(ranked[0], maximumPair);
});

test('COMMON exact two-play lead spends the maximum triple family before a longer pair run', () => {
  const { rankCleanPdkHints } = loadHelper();
  const maximumTripleFamily = [114, 214, 314, 106, 107];
  const pairRun = [108, 208, 109, 209, 110, 210];
  const ranked = rankCleanPdkHints([...maximumTripleFamily, ...pairRun], [
    { cards: pairRun, order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: maximumTripleFamily, order: 1, finishesInTwo: true, containsRuleMaximum: true },
  ], { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false }, true, true);

  assert.deepEqual(ranked[0], maximumTripleFamily);
});

test('two-play maximum priority never splits a protected regional bomb', () => {
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

  assert.deepEqual(ranked[0], [109]);
});

test('without compare-triple-attachments a two-play triple keeps the regional maximum out of its wings', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [112, 212, 312, 115, 111, 113];
  const carriesMaximum = [112, 212, 312, 115, 111];
  const carriesLowerSingles = [112, 212, 312, 111, 113];
  const ranked = rankCleanPdkHints(hand, [
    { cards: carriesMaximum, order: 0, finishesInTwo: true, containsRuleMaximum: true },
    { cards: carriesLowerSingles, order: 1, finishesInTwo: true, containsRuleMaximum: false },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    maximumSingleRanks: [15],
  }, true, true);

  assert.deepEqual(ranked[0], carriesLowerSingles);
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

test('single response preserves the cleanest remainder and keeps the six bomb last', () => {
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

  assert.deepEqual(ranked[0], [110]);
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
  assert.match(controller, /this\.layoutActionCards\(parent,/);
  assert.match(controller, /private layoutActionCards\(parent: Node \| null,[\s\S]*layout\.enabled = true;[\s\S]*layout\.updateLayout\(true\)/);
  assert.match(controller, /layout\.updateLayout\(true\);[\s\S]*layout\.enabled = false/);
});

test('prompt never converts a complete bomb into a triple body plus attachment', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [112, 212, 312, 412, 113];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [112, 212, 312, 412, 113] },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
  });
  assert.deepEqual(ranked, []);
});

test('public compound cards use prefab-authored Out_Card spacing without a code minimum', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.doesNotMatch(controller, /OUT_CARD_FALLBACK_WIDTH/);
  assert.doesNotMatch(controller, /OUT_CARD_MINIMUM_STEP/);
  const layout = controller.slice(controller.indexOf('private layoutActionCards'),
    controller.indexOf('private async flyRemoteCards'));
  assert.doesNotMatch(layout, /cardWidth|const step|setPosition\(/);
});

test('authoritative multi-card play commits a complete hidden group before showing Out_Card', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const render = controller.slice(controller.indexOf('private async renderPublicOperation'),
    controller.indexOf('private async presentPublicOperation'));
  const createAt = render.lastIndexOf('this.createActionCardsAtomically(parent, values,');
  const showAt = render.lastIndexOf('this.setOutCardVisible(outCardPath, values.length > 0)');
  const layoutAt = render.lastIndexOf('this.layoutActionCards(parent,');
  assert.ok(createAt >= 0 && showAt > createAt && layoutAt > showAt);
  assert.match(controller, /new Node\('PDK_Action_Cards_Staging'\)/);
  assert.match(controller, /Promise\.all\(values\.map\(\(value\) => this\.cards\.create\(staging, value\)\)\)/);
  assert.match(controller, /for \(const card of created\) parent\.addChild\(card\)/);
});

test('live Out_Card reuses the settlement play index without treating Count as a card', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const adapter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
  const retainedFlow = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/LSPDK/Code/LS201PlayedCardFlow.ts'), 'utf8');
  assert.match(controller, /this\.clearOutCardPlayCount\(parent\)/);
  assert.match(controller, /child\.name !== 'PlayCount'/);
  assert.match(retainedFlow, /\?\? instantiate\(countTemplate\)/);
  assert.match(retainedFlow, /label\.string = String\(playIndex\)/);
  assert.match(controller, /playIndex: Number\(latestPlay\.playIndex \?\? 0\)/);
  assert.match(adapter, /playIndex: Number\(normalized\?\.playIndex \?\? 0\)/);
  assert.match(adapter, /isPlay \? \+\+committedPlayIndex : 0/);
});

test('a rolling-deployment packet without tableSnapshot still preserves the authoritative hand', () => {
  const adapter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
  assert.match(adapter, /const snapshotComplete = integer\(tableSnapshot\.stateVersion\)/);
  assert.match(adapter,
    /const comparison = snapshotComplete[\s\S]*Boolean\(source\.trickReset\) \? \{\}[\s\S]*legacyTrick[\s\S]*lastAction/);
  assert.match(adapter, /\? tableSnapshot\.operations : lastActions/);
  assert.doesNotMatch(adapter, /throw new Error\('CommonPdk 权威桌面快照不完整'\)/);
});

test('a stale authority restore cannot overwrite a newer compound play after the two-second hold', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = controller.slice(controller.indexOf('private reconcileAuthorityPublicCards'),
    controller.indexOf('private layoutActionCards'));
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
    controller.indexOf('private layoutActionCards'));
  assert.match(restore, /const latestBySeat = new Map<number, unknown>\(\)/);
  assert.match(restore, /latestBySeat\.set\(seat, value\)/);
  assert.match(restore, /for \(const value of latestBySeat\.values\(\)\)/);
  assert.ok(restore.indexOf('for (const value of latestBySeat.values())')
    < restore.indexOf('const entry = createSeatEntries'));
});

test('More visibility does not override prefab-authored adaptation', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const method = controller.slice(controller.indexOf('private toggleMoreMenu'),
    controller.indexOf('private hideMoreMenu'));
  assert.match(method, /node\.active = opening/);
  assert.doesNotMatch(method, /setScale|Widget|updateLayout/);
});

test('More hit-through is identical for touch and desktop mouse input', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const touch = controller.slice(controller.indexOf('private onRoomTouchEnd'),
    controller.indexOf('private onRoomMouseUp'));
  const mouse = controller.slice(controller.indexOf('private onRoomMouseUp'),
    controller.indexOf('private isCommonMoreHit'));
  const hit = controller.slice(controller.indexOf('private isCommonMoreHit'),
    controller.indexOf('private clearSelectionOutsideCards'));
  assert.match(touch, /this\.isCommonMoreHit\(location\.x, location\.y\)[\s\S]*this\.toggleMoreMenu\(\)/);
  assert.match(mouse, /this\.isCommonMoreHit\(uiLocation\.x, uiLocation\.y\)[\s\S]*this\.toggleMoreMenu\(\)/);
  assert.match(hit, /getBoundingBoxToWorld\(\)/);
});

test('More opens on physical press before an overlapping form can steal release', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /private bindCommonMoreButton\(\): void/);
  assert.match(controller, /entry\.on\(Node\.EventType\.TOUCH_START, invoke, this\)/);
  assert.match(controller, /entry\.on\(Node\.EventType\.MOUSE_DOWN, invoke, this\)/);
  assert.match(controller, /entry\.on\(Button\.EventType\.CLICK, invoke, this\)/);
  assert.match(controller, /this\.bindCommonMoreButton\(\)/);
});

test('CommonRoom overlay stays above the game form so MoreItems is visible', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const raise = controller.slice(controller.indexOf('private raiseCommonOverlay'),
    controller.indexOf('private bindCommonCapability'));
  assert.match(raise, /root\.setSiblingIndex\(parent\.children\.length - 1\)/);
  assert.equal(controller.match(/this\.raiseCommonOverlay\(\)/g)?.length, 2);
});

test('More de-duplicates the complete browser down-up-click gesture', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const toggle = controller.slice(controller.indexOf('private toggleMoreMenu'),
    controller.indexOf('private hideMoreMenu'));
  assert.match(toggle, /now - this\.lastMoreToggleAt < 750/);
});

test('MoreItems is promoted and anchored below the visible More button', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const overlay = controller.slice(controller.indexOf('private ensureMoreMenuOverlay'),
    controller.indexOf('private showCurrentRoomRules'));
  assert.match(overlay, /node\.setParent\(overlay, true\)/);
  assert.match(overlay, /node\.setSiblingIndex\(overlay\.children\.length - 1\)/);
  assert.match(overlay, /buttonTransform\.getBoundingBoxToWorld\(\)/);
  assert.match(overlay, /node\.setWorldPosition\(bounds\.x \+ bounds\.width \/ 2, bounds\.y/);
});

test('submitting a play hides controls immediately and Authority owns restoration', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const out = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('/** Explain a rejected selection'));
  const authorityRequest = 'const result = await this.lifecycle.play';
  const pendingAuthority = out.slice(0, out.indexOf(authorityRequest));
  const resolvedAuthority = out.slice(out.indexOf(authorityRequest));
  const auto = controller.slice(controller.indexOf('private maybeAutoPlay'),
    controller.indexOf('private autoPlayKey'));
  assert.match(pendingAuthority, /this\.operations\?\.hide\(\)/);
  assert.match(resolvedAuthority,
    /if \(resultTurnSeat !== this\.clientSeat\(\)\) this\.operations\?\.hide\(\)/);
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
  const visibility = controller.slice(controller.indexOf('private isAutomaticWholeHand'),
    controller.indexOf('private maybeAutoPlay'));
  assert.match(visibility, /if \(!localTurn \|\| !this\.isFormalCardPlayPhase\(setInfo\)\) return false/);
  assert.match(refresh, /const automaticInteraction = this\.autoPlayInFlight \|\| this\.autoPassInFlight[\s\S]*automaticWholeHand \|\| unbeatableAutoPassPending/);
  assert.match(refresh, /canPass: baseCanPass && !automaticInteraction/);
  assert.match(refresh, /canTip: localTurn && !automaticInteraction/);
  assert.match(refresh, /canPlay: localTurn && !automaticInteraction/);
  assert.match(auto, /this\.autoPlayInFlight = true;[\s\S]*this\.refresh\(\)/);
  assert.match(auto, /this\.outCard\(opType, true\)/);
  assert.ok(auto.indexOf('this.outCard(opType, true)') < auto.lastIndexOf('this.autoPlayInFlight = false'));
});

test('authority unbeatable auto-pass hides every operation button', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const refresh = controller.slice(controller.indexOf('private refresh(): void'),
    controller.indexOf('private centerOperationButtons'));
  assert.match(refresh, /endsWith\('-unbeatable-auto-pass'\)/);
  assert.match(refresh, /isLocalTurn: localTurn && !unbeatableAutoPassPending/);
  assert.match(refresh, /automaticWholeHand \|\| unbeatableAutoPassPending/);
});

test('cancelled or stale last-hand autoplay cannot strand the operation buttons', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const auto = controller.slice(controller.indexOf('private maybeAutoPlay'),
    controller.indexOf('private hasUnretainedLatestAuthorityPlay'));
  const cancel = controller.slice(controller.indexOf('private cancelAutoPlay'),
    controller.indexOf('private startClockFromSetInfo'));
  const out = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('private selectedIntrinsicType'));
  assert.doesNotMatch(auto, /latestLeading/);
  assert.match(auto, /!stillLocalTurn \|\| this\.autoPlayKey\(latest, latestHand\) !== turnKey/);
  assert.match(auto, /this\.autoPlayTurnKey = ''/);
  assert.match(cancel, /this\.autoPlayTurnKey = ''/);
  assert.match(cancel, /this\.autoPlayOperationId = ''/);
  assert.match(out, /if \(automaticLastHand\) throw new Error\('自动出牌权威回合已失效'\)/);
});

test('a rejected play restores only the local hand and never redraws public cards', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const out = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('private selectedIntrinsicType'));
  const rejected = out.slice(out.indexOf('} catch (error: unknown)'));
  assert.match(rejected, /await this\.renderHand\(\)/);
  assert.match(rejected, /this\.updateSelection\(\)/);
  assert.match(rejected, /this\.refresh\(\)/);
  assert.doesNotMatch(rejected, /renderPublicOperation|reconcileAuthorityPublicCards/);
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
  const hideAt = render.indexOf('this.setOutCardVisible(outCardPath, false)');
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
  assert.doesNotMatch(render, /layout\.enabled = false/);
  assert.match(render, /this\.layoutActionCards\(parent,/);
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

test('remote authority cards commit immediately while the decorative flight runs independently', () => {
  const play = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = play.slice(play.indexOf('private async restoreSeatPlayStates'), play.indexOf('private layoutActionCards'));
  const fly = restore.indexOf('const remoteFlight = this.flyRemoteCards(entry.physicalSlot, values)');
  const track = restore.indexOf('this.trackPresentation(remoteFlight)', fly);
  const create = restore.indexOf('this.createActionCardsAtomically(parent, values,', fly);
  const show = restore.indexOf('this.setOutCardVisible(path, values.length > 0)', create);
  const layout = restore.indexOf('this.layoutActionCards(parent,', show);
  assert.ok(fly >= 0 && fly < track && track < create && create < show && show < layout);
  assert.doesNotMatch(restore, /await this\.flyRemoteCards/);
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

test('Liangshan deal boundary displays the complete hand immediately', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const animate = controller.slice(controller.indexOf('private shouldAnimateDeal'),
    controller.indexOf('public async truncateRoundEndPresentation'));
  assert.match(controller, /Boolean\(packet\.dealBoundary\) && this\.shouldAnimateDeal\(setInfo\)/);
  assert.match(controller, /renderHand\(animateDeal, authorityHand\)/);
  assert.match(animate, /phase !== 'PLAYING' && phase !== 'COMPETE_DEALER'/);
  assert.match(controller, /\[CommonPdkDealVisible\]/);
  assert.match(controller, /presentation: 'IMMEDIATE'/);
  assert.doesNotMatch(controller, /PokerDealNodeAnim\.play\(this\.cardNodes/);
});

test('required opening card constrains Hint only and never blocks manual Play validation', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const hint = controller.slice(controller.indexOf('private prepareHintCache'),
    controller.indexOf('private async outCard'));
  const out = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('private selectedIntrinsicType'));
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

test('first manual Hint reasserts the best response after automatic preselection', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const manual = controller.slice(controller.indexOf('private tip(): void'),
    controller.indexOf('private prepareHintCache'));
  const automatic = controller.slice(controller.indexOf('private async autoHintForAuthoritativeTurn'),
    controller.indexOf('private maybeAutoPlay'));

  assert.match(manual, /const continuingManualCycle = this\.promptCycleKey === key/);
  assert.match(manual, /continuingManualCycle && currentIndex >= 0/);
  assert.match(automatic, /this\.promptCycleKey = ''/);
  assert.match(automatic, /this\.tipIndex = 0/);
  assert.doesNotMatch(automatic, /this\.tipIndex = tips\.length > 1 \? 1 : 0/);
});

test('manual Hint cycles higher singles normally but keeps reported-single maximum constraint', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const prepare = controller.slice(controller.indexOf('private prepareHintCache'),
    controller.indexOf('private async outCard'));
  const sorter = controller.slice(controller.indexOf('private sortedLegalTipCandidates'),
    controller.indexOf('private cardsInHandOrder'));

  assert.match(prepare,
    /sortedLegalTipCandidates\(local, leading, leading\)/);
  assert.doesNotMatch(prepare,
    /sortedLegalTipCandidates\(local, leading, leading, false\)/);
  assert.match(sorter, /constrainToHighestReportedSingle = true/);
  assert.match(sorter,
    /constrainToHighestReportedSingle && this\.nextPlayerReportedSingle\(\)/);
});

test('manual Hint candidates above a table J include Q K A and 2', () => {
  const { pdkSingleResponseCandidates, rankCleanPdkHints } = loadHelper();
  // Mirrors the reported hand: table J; the hand contains Q, K, A and 2,
  // plus pairs/triples that must not prevent those legal singles from cycling.
  const hand = [115, 114, 113, 112, 212, 111, 211, 110, 109, 108, 208,
    107, 207, 307, 106, 206, 105];
  const raw = pdkSingleResponseCandidates(hand, 111, [])
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, raw, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
  });
  const distinctRanks = [...new Set(ranked.map((cards) => cards[0] % 100))];

  assert.deepEqual(new Set(distinctRanks), new Set([12, 13, 14, 15]));
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

test('single response opens the rule-maximum pair when the hand has no loose single', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [106, 107, 108, 109, 110, 112, 212, 114, 214];
  const candidates = [108, 109, 110, 112, 114].map((card, order) => ({
    cards: [card],
    order,
    containsRuleMaximum: card === 114,
  }));
  const ranked = rankCleanPdkHints(hand, candidates, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    prioritizeLooseSingles: true,
  });

  assert.equal(ranked[0][0], 114,
    '678910QQAA responding to 7 preserves the five-card straight and opens maximum AA first');
});

test('Liangshan three-card-straight rule also opens AA before lower clean singles', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [107, 108, 109, 110, 112, 212, 114, 214];
  const candidates = [108, 109, 110, 112, 114].map((card, order) => ({
    cards: [card],
    order,
    containsRuleMaximum: card === 114,
  }));
  const ranked = rankCleanPdkHints(hand, candidates, {
    minimumStraightLength: 3,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    prioritizeLooseSingles: true,
  });

  assert.equal(ranked[0][0], 114,
    '78910QQAA responding to 7 keeps the Liangshan straight and opens maximum AA first');
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

test('single response to seven uses loose ten before splitting pair kings', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [113, 213, 110, 109, 209, 309];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [113], order: 0, finishesInTwo: true },
    { cards: [110], order: 1, finishesInTwo: true },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    tripleAttachmentMode: 'EITHER',
    prioritizeLooseSingles: true,
    optimizeWholeHand: true,
  });

  assert.equal(ranked[0][0], 110, 'the lowest winning loose single preserves KK and 999');

  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /GetClientDownPos\(\)/);
  assert.match(controller, /Number\(nextPlayer\?\.cardCount\)/);
  assert.doesNotMatch(controller,
    /const nextSeat = \(this\.clientSeat\(\) \+ 1\) % playerCount/);
});

test('single response treats raw K as loose even when QQQ can absorb it as an attachment', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 113, 112, 212, 312, 109, 209, 108, 208, 105, 205];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [109], order: 0 },
    { cards: [112], order: 1 },
    { cards: [113], order: 2 },
    { cards: [114], order: 3 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    tripleAttachmentMode: 'EITHER',
    prioritizeLooseSingles: true,
    optimizeWholeHand: false,
  });

  assert.equal(ranked[0][0], 113,
    'A,K,QQQ,99,88,55 responding to 8 must use loose K before opening pair 99');
});

test('seven-card response hand keeps A and 2 after using the lowest winning Q', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [115, 114, 113, 213, 112, 108, 106];
  const ranked = rankCleanPdkHints(hand, [
    { cards: [115], order: 0, containsRuleMaximum: true },
    { cards: [114], order: 1 },
    { cards: [112], order: 2 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    prioritizeLooseSingles: true,
  });
  assert.deepEqual(ranked[0], [112]);
});

test('browser taps use UI-space card bounds and preserve exact toggle semantics', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const sample = controller.slice(controller.indexOf('private buildPointerSample'),
    controller.indexOf('private pointerSource'));
  const hit = controller.slice(controller.indexOf('private cardIndexAtUi'),
    controller.indexOf('private dragIndexAtUi'));
  const toggle = controller.slice(controller.indexOf('private async toggleCardAt'),
    controller.indexOf('private groupedResponseSelection'));
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

test('leading hint does not apply the single-response maximum-pair split rule', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 214, 112, 212, 111, 110, 210, 109];
  const pairTen = [110, 210];
  const singleAce = [114];
  const ranked = rankCleanPdkHints(hand, [
    { cards: singleAce, order: 0, containsRuleMaximum: true },
    { cards: pairTen, order: 1 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
  }, true, true);

  assert.deepEqual(ranked[0], pairTen,
    'an opening Hint must choose the legal shape with more cards before a split maximum A');
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
  assert.deepEqual(dragRanked[0], straight,
    'equal-size legal choices keep the cleaner complete-hand decomposition');
});

test('lead Hint enumerates every rank multiset before regional legality checks', () => {
  const { rankCleanPdkHints } = loadHelper();
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const lead = controller.slice(
    controller.indexOf('private leadTipCandidates'),
    controller.indexOf('private activeRequiredFirstCard'),
  );
  assert.match(lead, /enumeratePdkRankMultisetCandidates\(hand, required\)/);

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

test('response hints protect bombs and a lead never splits one for a straight', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [108, 208, 308, 408, 109, 110, 111, 112, 113];
  const rules = { minimumStraightLength: 5, minimumPairRunLength: 2, allowTwoInRuns: false };

  const leading = rankCleanPdkHints(hand, [
    { cards: [108, 109, 110, 111, 112, 113], order: 0 },
    { cards: [109], order: 1 },
  ], rules, true);
  assert.deepEqual(leading[0], [109], 'lead hint must not split the complete bomb for a straight');

  const responding = rankCleanPdkHints(hand, [
    { cards: [108], order: 0 },
    { cards: [109], order: 1 },
    { cards: [108, 208, 308, 408], order: 2 },
  ], rules);
  assert.deepEqual(responding[0], [109], 'response hint must use a spare single before splitting four 8s');
  assert.deepEqual(responding[1], [108, 208, 308, 408], 'the intact bomb remains available before a split-bomb candidate');
  assert.equal(responding.length, 2, 'a split-bomb single must not enter the prompt cycle');
});

test('lead hint keeps an independent bomb behind an ordinary pair', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [114, 113, 213, 112, 212, 110, 210, 109, 209, 108, 208, 308, 408, 107, 106, 206];
  const ordinaryPair = { cards: [106, 206], order: 0 };
  const completeBomb = { cards: [108, 208, 308, 408], order: 1 };
  const ranked = rankCleanPdkHints(hand, [completeBomb, ordinaryPair], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
  }, true);
  assert.deepEqual(ranked[0], ordinaryPair.cards);
  assert.deepEqual(ranked[1], completeBomb.cards);
});

test('a non-scoring four-card body may lead its legal four-with-two shape', () => {
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
  assert.deepEqual(ranked[0], fourWithTwo.cards,
    'the public bomb policy allows four-with-two when bombs do not score');
  assert.deepEqual(ranked[1], [109]);
});

test('a scoring bomb leads an exact two-play endgame and four-with-two is excluded', () => {
  const { rankCleanPdkHints } = loadHelper();
  const bomb = [113, 213, 313, 413];
  const pair = [114, 214];
  const fourWithPair = [...bomb, ...pair];
  const ranked = rankCleanPdkHints([...bomb, ...pair], [
    { cards: fourWithPair, order: 0, usesFourCardBody: true, finishesInTwo: false },
    { cards: pair, order: 1, finishesInTwo: true },
    { cards: bomb, order: 2, finishesInTwo: true },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    preserveScoringBombs: true,
  }, true, true);

  assert.deepEqual(ranked[0], bomb);
  assert.equal(ranked.some((cards) => cards.length === fourWithPair.length), false);
});

test('without compare-triple-attachments, wings use the lowest legal ranks before structural preferences', () => {
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

test('lead hint keeps QQQ intact and uses KK as wings for the smaller 333 body', () => {
  const { rankCleanPdkHints } = loadHelper();
  const hand = [403, 103, 203, 112, 412, 312, 113, 413, 304];
  const splitQueens = [403, 103, 203, 304, 112];
  const expected = [403, 103, 203, 113, 413];
  const largerBody = [112, 412, 312, 113, 413];
  const ranked = rankCleanPdkHints(hand, [
    { cards: splitQueens, order: 0 },
    { cards: expected, order: 1 },
    { cards: largerBody, order: 2 },
  ], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    prioritizeLooseSingles: true,
    optimizeWholeHand: true,
    singleAttachmentCapacityPerTriple: 2,
  }, true, true);

  assert.deepEqual(ranked[0], expected);
  assert.ok(ranked.findIndex((cards) => cards === largerBody) < 0
    || ranked.indexOf(expected) < ranked.indexOf(largerBody));
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
  assert.doesNotMatch(sorter, /scoringBombsFirst|rankCandidates\(constrained\)/);
});

test('authority comparison normalizes canonical string card types before hinting', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const reconcile = source.slice(source.indexOf('private reconcileAuthorityPublicCards'), source.indexOf('private async restoreSeatPlayStates'));
  assert.match(reconcile, /legacyOperationType\(comparison\.cardType \?\? comparison\.type\)/);
  const synchronize = source.slice(source.indexOf('private synchronizeAuthorityComparison'), source.indexOf('private maybeAutoPlay'));
  assert.match(synchronize, /legacyOperationType\(comparison\.cardType \?\? comparison\.type\)/);
  assert.doesNotMatch(synchronize, /Number\(comparison\.cardType/);
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
  const restore = source.slice(source.indexOf('private async restoreSeatPlayStates'), source.indexOf('private layoutActionCards'));
  assert.match(restore, /entry\.dataSeat === this\.activeOpPos[\s\S]*continue/);
  assert.doesNotMatch(restore, /this\.activeOpPos === this\.clientSeat\(\) && entry\.dataSeat !== this\.clientSeat\(\)/);
});

test('history mode delegates the complete live hold to the retained-card flow', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const render = source.slice(source.indexOf('private async renderPublicOperation'), source.indexOf('private async presentPublicOperation'));
  assert.doesNotMatch(render.slice(0, render.indexOf('const generation')), /clearPublicCards\(\)/);
  assert.match(render, /if \(values\.length > 0\) \{[\s\S]*markPublicCardsShown\(dataSeat\)/);
  const retained = source.slice(source.indexOf('private async presentPublicOperation'), source.indexOf('private async presentLatestAuthorityAction'));
  assert.match(retained, /moveAfterLiveHold\(\{/);
  assert.match(retained, /holdMs: 2000/);
  assert.doesNotMatch(retained, /clearPublicCardsForSeat\(dataSeat\)/);
  const restore = source.slice(source.indexOf('private async restoreTableCards'), source.indexOf('private async clearActionSlot'));
  assert.match(restore, /packet\.tableOperations/);
  assert.match(restore, /await this\.appendTableCards/);
  assert.doesNotMatch(restore, /packet\.playedCardList|GetRoomSetProperty\('playedCardList'\)/);
  assert.doesNotMatch(restore, /this\.clearTableCards\(\)/);
  const append = source.slice(source.indexOf('private async appendTableCards'), source.indexOf('private async restoreTableCards'));
  assert.match(append, /parent\.getChildByName\(nodeName\)/);
  const latest = source.slice(source.indexOf('private async presentLatestAuthorityAction'), source.indexOf('private clearPublicCards'));
  assert.match(latest, /if \(!this\.authorityActionsInitialized\)[\s\S]*reconcileAuthorityPublicCards\(setInfo\)/);
  assert.doesNotMatch(latest, /if \(!this\.authorityActionsInitialized\)[\s\S]*clearLatestPublicCards\(\)/);
});

test('an immediately unbeatable own lead is not synchronously removed by empty authority history', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = source.slice(source.indexOf('private async restoreSeatPlayStates'), source.indexOf('private layoutActionCards'));
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

test('playing phase advances the round boundary without starting a duplicate hand render', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const phase = source.slice(source.indexOf("event === 'CommonPdk_AuthoritativePhaseChanged'"),
    source.indexOf("event === 'CommonPdk_PosUpdate'"));
  const compete = phase.slice(phase.indexOf("if (to === 'COMPETE_DEALER')"),
    phase.indexOf("if (to === 'PLAYING')"));
  assert.doesNotMatch(compete, /clearedCompletedRoundKey\s*=/);
  const playing = phase.slice(phase.indexOf("if (to === 'PLAYING')"));
  const boundary = playing.indexOf("this.acceptPresentationRound(setInfo, 'PHASE_PLAYING')");
  assert.ok(boundary >= 0);
  assert.doesNotMatch(playing, /this\.logic\.InitHandCard\(\)|this\.renderHand\(/);
  assert.doesNotMatch(playing, /clearedCompletedRoundKey\s*=/);
  assert.match(playing, /\[CommonRoomRoundStart\]/);
});

test('deal projection is monotonic and an in-place rematch may reset round number', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const boundary = source.slice(source.indexOf('private acceptPresentationRound'),
    source.indexOf('private isCompletedRoundProjectionCleared'));
  assert.match(boundary, /shuffleSequence < this\.presentationShuffleSequence/);
  assert.match(boundary, /REJECT_STALE_DEAL/);
  assert.match(boundary, /allows an in-place rematch to move from roundLimit back to round 1/);
  assert.match(boundary, /!hasDealIdentity && roundNo < this\.presentationRoundNo/);
  assert.ok(boundary.indexOf('this.presentationShuffleSequence = shuffleSequence')
    < boundary.indexOf('this.resetRoundPresentation()'));
  assert.ok(boundary.indexOf('this.presentationRoundNo = roundNo')
    < boundary.indexOf('this.resetRoundPresentation()'));

  const authority = source.slice(source.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    source.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.ok(authority.indexOf("acceptPresentationRound(setInfo, 'AUTHORITY_STATE')")
    < authority.indexOf('reconcileAuthorityPublicCards'));
  assert.doesNotMatch(authority, /if \(this\.competeDealerPhase\) this\.resetRoundPresentation\(\)/);
});

test('retained table is reconciled to the complete authority ledger instead of append-only history', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = source.slice(source.indexOf('private async restoreTableCards('),
    source.indexOf('/** Only the newest committed play may own the single table arrow. */'));
  assert.match(restore, /const authoritativeHandNames = new Set\(operations/);
  assert.match(restore, /for \(const hand of \[\.\.\.table\.children\]\)/);
  assert.match(restore, /if \(authoritativeHandNames\.has\(hand\.name\)\) continue;/);
  assert.match(restore, /hand\.removeFromParent\(\)/);
  assert.match(restore, /this\.view\.visible\(path, table\.children\.length > 0\)/);
});

test('a previous-round async projection cannot regain ownership after the round reset', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const authority = source.slice(source.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    source.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(authority, /const snapshotPresentationGeneration = this\.presentationGeneration/);
  assert.match(authority,
    /presentLatestAuthorityAction\(setInfo, snapshotPresentationGeneration\)[\s\S]*restoreTableCards\(setInfo, snapshotPresentationGeneration\)/);
  const latest = source.slice(source.indexOf('private async presentLatestAuthorityAction('),
    source.indexOf('private async presentNewAuthorityAction('));
  assert.match(latest, /if \(expectedGeneration !== this\.presentationGeneration\) return;/);
  assert.match(latest, /await existingPresentation;[\s\S]*if \(expectedGeneration !== this\.presentationGeneration\) return;/);
  const restore = source.slice(source.indexOf('private async restoreTableCards('),
    source.indexOf('/** Only the newest committed play may own the single table arrow. */'));
  assert.match(restore, /if \(expectedGeneration !== this\.presentationGeneration\) return;/);
  assert.match(restore, /const generation = expectedGeneration/);
});

test('phase changes within one round do not reopen the previous round archive', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const phase = source.slice(source.indexOf("event === 'CommonPdk_AuthoritativePhaseChanged'"),
    source.indexOf("event === 'CommonPdk_PosUpdate'"));
  assert.match(phase, /acceptPresentationRound\(setInfo, 'PHASE_COMPETE_DEALER'\)/);
  assert.match(phase, /acceptPresentationRound\(setInfo, 'PHASE_PLAYING'\)/);
  assert.doesNotMatch(phase, /resetRoundPresentation\(\)/);
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
  assert.match(authority, /this\.clearedCompletedRoundKey = this\.continueReadyRoundKey\(setInfo\)/);
  assert.ok(authority.indexOf('Boolean(localPlayer?.isContinue)')
    < authority.indexOf('if (!playing && this.isCompletedRoundProjectionCleared(setInfo))'));
  assert.match(authority,
    /const projectRoundCards = !this\.isCompletedRoundProjectionCleared\(setInfo\)/);
  assert.match(authority, /\[CommonRoomContinueVisualClear\]/);
});

test('dealer competition advances the round boundary without duplicating authority rendering', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const compete = source.slice(source.indexOf("if (to === 'COMPETE_DEALER')"),
    source.indexOf("if (to === 'PLAYING')"));
  const boundary = compete.indexOf("this.acceptPresentationRound(setInfo, 'PHASE_COMPETE_DEALER')");
  assert.ok(boundary >= 0);
  assert.doesNotMatch(compete, /this\.logic\.InitHandCard\(\)|this\.renderHand\(/);
  assert.doesNotMatch(compete, /resetRoundPresentation\(\)/);
});

test('dealer-competition snapshots cannot restore the completed round ledger', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const authority = source.slice(source.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    source.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(authority, /const formalCardPlayPhase = this\.isFormalCardPlayPhase\(setInfo\)/);
  assert.ok(authority.indexOf('if (this.competeDealerPhase) this.resetRoundPresentation()')
    < authority.indexOf('const publicPresentation'));
  assert.match(authority,
    /const projectRoundCards = !this\.isCompletedRoundProjectionCleared\(setInfo\)[\s\S]*formalCardPlayPhase \|\| waitingForContinue/);
  assert.match(authority, /const publicPresentation = !projectRoundCards[\s\S]*\? Promise\.resolve\(\)/);
  const onShow = source.slice(source.indexOf('public onShow(): void'), source.indexOf('public onEvent('));
  assert.match(onShow, /const formalCardPlayPhase = this\.isFormalCardPlayPhase\(snapshot\)/);
  assert.match(onShow, /if \(this\.competeDealerPhase\) this\.resetRoundPresentation\(\)/);
  assert.match(onShow, /if \(formalCardPlayPhase \|\| waitingForContinue\) \{[\s\S]*restoreTableCards\(snapshot, snapshotPresentationGeneration\)/);
});

test('finished-round authority keeps cards until local continue', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const authority = source.slice(source.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    source.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(authority, /const waitingForContinue = !playing && Boolean\(completedRound\) && !Boolean\(localPlayer\?\.isContinue\)/);
  assert.match(authority,
    /const projectRoundCards = !this\.isCompletedRoundProjectionCleared\(setInfo\)[\s\S]*formalCardPlayPhase \|\| waitingForContinue/);
  assert.match(authority, /formalCardPlayPhase[\s\S]*this\.presentLatestAuthorityAction\(setInfo, snapshotPresentationGeneration\)[\s\S]*this\.restoreTableCards\(setInfo, snapshotPresentationGeneration\)/);
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

test('play transport failures are not reported as invalid card shapes', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const reporter = controller.slice(
    controller.indexOf('private reportUserActionError'),
    controller.indexOf('\n    }\n}', controller.indexOf('private reportUserActionError')),
  );
  assert.match(reporter, /CONNECTION_NOT_READY/);
  assert.match(reporter, /网络未连接，请稍后重试/);
  assert.match(reporter, /必须带\$\{this\.cardDisplayName\(required\)\}牌/);
  assert.match(reporter, /this\.isAuthoritativeLeadingTurn\(\)/);
  assert.match(reporter, /GetSelectCard\(\)/);
  assert.match(reporter, /this\.showMessage\('牌型错误'\)/);
  assert.doesNotMatch(reporter, /这手牌不能出/);
  assert.ok(
    reporter.indexOf('CONNECTION_NOT_READY') < reporter.indexOf("label === '出牌'"),
    'transport failures must be classified before the generic play-error fallback',
  );
  const gameLogic = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/logic/CommonPdkGameLogic.ts'), 'utf8');
  assert.doesNotMatch(gameLogic, /console\.log\('eeeeeeeee'\)/);
});

test('play click hides controls before authority and does not await card flight', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const play = source.slice(source.indexOf('private async outCard'), source.indexOf('private selectedIntrinsicType'));
  const beforeAuthority = play.slice(0, play.indexOf('const result = await this.lifecycle.play'));
  assert.match(beforeAuthority, /this\.operations\?\.hide\(\)/);
  assert.match(play, /resultTurnSeat !== this\.clientSeat\(\)\) this\.operations\?\.hide\(\)/);
  assert.match(play, /HIDE_ON_PLAY_SUBMIT/);
  assert.match(play, /HIDE_AFTER_AUTHORITY_RESULT/);
  assert.match(play, /void flight\.catch\(/);
  assert.doesNotMatch(play, /await flight;/);
  assert.match(play, /await this\.renderHand\(\);[\s\S]*this\.refresh\(\);/);
});

test('continuous operation buttons depend on authority turn result, not maximum-card guessing', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const play = source.slice(source.indexOf('private async outCard'), source.indexOf('private selectedIntrinsicType'));
  const refresh = source.slice(source.indexOf('private refresh(): void'), source.indexOf('private centerOperationButtons'));
  assert.match(play, /HIDE_ON_PLAY_SUBMIT/);
  assert.match(play, /await this\.lifecycle\.play\([\s\S]*this\.refresh\(\)/);
  assert.match(refresh, /const snapshotTurnSeat = Number\(setInfo\.opPos \?\? authorityDeadline\?\.seatId \?\? -1\)/);
  assert.match(refresh, /const localTurn = state === 1 && snapshotTurnSeat === positions\.GetClientPos\(\)/);
  assert.doesNotMatch(refresh, /activeOpPos/);
  assert.doesNotMatch(play, /keepControlsForMaximum|containsRegionalMaximum\(values\)/);
});

test('an unresolved play keeps controls stable and only a remote authority result hides them', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const play = source.slice(source.indexOf('private async outCard'),
    source.indexOf('private selectedIntrinsicType'));
  const refresh = source.slice(source.indexOf('private refresh(): void'),
    source.indexOf('private centerOperationButtons'));

  assert.match(play, /this\.keepOperationsVisibleDuringPlay = true;[\s\S]*this\.refresh\(\)/);
  assert.match(refresh,
    /const localTurn = authorityLocalTurn[\s\S]*this\.keepOperationsVisibleDuringPlay/);
  assert.match(play,
    /resultSet\.opPos \?\? resultSet\.currentSeat \?\? resultSet\.turnSeat/);
  assert.match(play,
    /this\.keepOperationsVisibleDuringPlay = false;[\s\S]*if \(resultTurnSeat !== this\.clientSeat\(\)\)[\s\S]*this\.operations\?\.hide\(\);[\s\S]*else[\s\S]*this\.refresh\(\)/);
  assert.doesNotMatch(play, /containsRegionalMaximum\(values\)|keepControlsForMaximum/);
});

test('Hint clicked during continuous play is queued and consumed on the next local authority hand', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const tip = source.slice(source.indexOf('private tip(): void'),
    source.indexOf('private prepareHintCache'));
  const consume = source.slice(source.indexOf('private consumeQueuedHintAfterPlay'),
    source.indexOf('private async outCard'));
  const authority = source.slice(source.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    source.indexOf("} else if (event === 'CommonPdkSetStart')"));

  assert.match(tip,
    /this\.playInFlight \|\| this\.keepOperationsVisibleDuringPlay[\s\S]*this\.hintRequestedDuringPlay = true/);
  assert.match(consume,
    /turnSeat !== this\.clientSeat\(\)[\s\S]*this\.hintRequestedDuringPlay = false[\s\S]*this\.resetPromptCycle\(\)[\s\S]*this\.tip\(\)/);
  assert.match(authority, /consumeQueuedHintAfterPlay\(\)[\s\S]*autoHintForAuthoritativeTurn/);
});

test('manual Hint keeps the authored selection tween and hand rendering does not synchronously precompute hints', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const presenter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/CardPresenter.ts'), 'utf8');
  const tip = controller.slice(controller.indexOf('private tip(): void'),
    controller.indexOf('private prepareHintCache'));
  const render = controller.slice(controller.indexOf('private async renderHand'),
    controller.indexOf('private shouldAnimateDeal'));

  assert.match(tip, /this\.updateSelection\(\)/);
  assert.match(controller, /this\.cards\.select\(node, selectedSlots\[index\] === true\)/);
  assert.doesNotMatch(presenter, /selectImmediately/);
  assert.doesNotMatch(render, /prepareHintCache\(\)/);
});

test('turn interaction is never gated by decorative public-card presentation', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const snapshot = controller.slice(controller.indexOf('const handRender ='),
    controller.indexOf("} else if (event === 'CommonPdkSetStart')"));
  const refresh = controller.slice(controller.indexOf('private refresh(): void'),
    controller.indexOf('private centerOperationButtons'));

  assert.match(snapshot, /const hintReady = handRender/);
  assert.match(snapshot, /this\.trackPresentation\(settledPublicPresentation\)/);
  assert.doesNotMatch(snapshot, /Promise\.all\(\[handRender, settledPublicPresentation\]\)/);
  assert.match(refresh, /canTip: localTurn && !this\.autoPlayInFlight/);
  assert.match(refresh, /canPlay: localTurn && !this\.autoPlayInFlight/);
  assert.doesNotMatch(refresh, /canTip:[^\n]*automaticWholeHand/);
});

test('round reset always clears retained Table_Cards even outside arrangement phase', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const clear = controller.slice(controller.indexOf('private clearTableCards'),
    controller.indexOf('private async appendTableCards'));

  assert.doesNotMatch(clear, /arrangementEnabled/);
  assert.match(clear, /Players\/Play_\$\{slot\}\/Card\/Table_Cards/);
  assert.match(clear, /this\.cards\.clear\(table\)/);
  assert.match(clear, /this\.view\.visible\(path, false\)/);
});

test('Play click never waits for the preceding retained-card transfer', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const out = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('private selectedIntrinsicType'));
  const beforeRequest = out.slice(0, out.indexOf('const result = await this.lifecycle.play'));

  assert.doesNotMatch(beforeRequest, /await Promise\.all\(precedingTablePresentations\)/);
  assert.doesNotMatch(beforeRequest, /await this\.retainedPlayedCardFlow\?\.waitForPendingTransfers\(\)/);
  assert.match(beforeRequest, /flushPendingHolds\(shouldAdvancePrecedingPresentation\)/);
  assert.match(beforeRequest, /this\.flyCardsToOwnAction\(flyingCards\)/);
});

test('remote authority cards land without waiting for decorative flight', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const restore = source.slice(source.indexOf('private async restoreSeatPlayStates'), source.indexOf('private layoutActionCards'));
  assert.match(restore, /const remoteFlight = this\.flyRemoteCards/);
  assert.match(restore, /this\.trackPresentation\(remoteFlight\)/);
  assert.doesNotMatch(restore, /await this\.flyRemoteCards/);
});

test('drag selection starts on a real card and commits the last exact endpoint', () => {
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const start = source.slice(source.indexOf('private readonly onDomPointerDown'), source.indexOf('private readonly onDomPointerMove'));
  const move = source.slice(source.indexOf('private readonly onDomPointerMove'), source.indexOf('private readonly onDomPointerUp'));
  const end = source.slice(source.indexOf('private readonly onDomPointerUp'), source.indexOf('private readonly onDomPointerCancel'));
  assert.match(source, /private beginDragSelection\(sample: HandPointerSample\)/);
  assert.match(start, /this\.isHandInteractionEnabled\(\) && sample\.index >= 0[\s\S]*this\.beginDragSelection\(sample\)/);
  assert.match(move, /this\.updateDragSelection\(sample\.index\)/);
  assert.match(end, /this\.updateDragSelection\(sample\.index\)[\s\S]*if \(this\.dragMoved\)/);
  assert.match(end, /if \(this\.dragMoved\)[\s\S]*commitSmartDragSelection/);
});

test('COMMON control ordering uses physical deck and public plays across lead and response', () => {
  const { rankCleanPdkHints, effectivePdkMaximumSingleRanks,
    isRegionalMaximumPdkCombination } = loadHelper();
  const deck = Array.from({ length: 11 }, (_, index) => index + 3)
    .flatMap((value) => [100, 200, 300, 400].map((suit) => suit + value))
    .concat([114, 214, 314, 115]);
  const ranks = (cards) => cards.map((card) => card % 100).sort((a, b) => a - b);
  const ranked = (hand, plays, played = [], leading = true) => {
    const maximumSingleRanks = effectivePdkMaximumSingleRanks(deck, hand, played);
    const candidates = plays.map(([cards, finishesInTwo], order) => ({
      cards, order, finishesInTwo,
      containsRuleMaximum: isRegionalMaximumPdkCombination(cards, deck)
        || (cards.every((card) => card % 100 === cards[0] % 100)
          && maximumSingleRanks.includes(cards[0] % 100)),
    }));
    const protectedBombs = [...new Set(hand.map((card) => card % 100))]
      .map((value) => hand.filter((card) => card % 100 === value))
      .filter((cards) => cards.length === 4);
    return rankCleanPdkHints(hand, candidates, {
      policyId: 'COMMON', minimumStraightLength: 5, minimumPairRunLength: 2,
      allowTwoInRuns: false, tripleAttachmentMode: 'EITHER',
      optimizeWholeHand: true, prioritizeLooseSingles: !leading,
      preserveScoringBombs: true, protectedBombs, deckCards: deck, playedCards: played,
      maximumSingleRanks,
    }, leading, leading).map(ranks);
  };

  const bomb = [113, 213, 313, 413];
  const pair9 = [109, 209];
  const ace = [114];
  const two = [115];
  assert.deepEqual(ranked([...pair9, ...bomb, ...ace, ...two], [
    [pair9, false], [bomb, false], [two, false], [ace, false],
  ]).slice(0, 2), [[14], [15]]);
  assert.deepEqual(ranked([...pair9, ...bomb, ...two], [
    [pair9, false], [bomb, false], [two, false],
  ])[0], [15], 'after A, the held 2 is the next control single');

  const pairA = [114, 214];
  assert.deepEqual(ranked([...pairA, 115, 113], [
    [[113], false], [[115], false], [pairA, false], [[114], false],
  ])[0], [14, 14], 'the intact maximum pair precedes 2 and the ordinary K');
  const pairK = [113, 213];
  assert.deepEqual(ranked([...pair9, ...pairK, ...pairA], [
    [pair9, true], [[...pairK, ...pairA], true],
  ])[0], [13, 13, 14, 14], 'a two-hand maximum pair run leads before the low pair');
  assert.deepEqual(ranked([...pairA, 107], [
    [[107], true], [[114], false],
  ], [115, 105], false)[0], [14],
  'two held A singles become independent controls once 2 is publicly spent');
  assert.deepEqual(ranked([114, 109], [
    [[109], true], [[114], true],
  ], [115])[0], [14], 'public 2 makes a held A the maximum single');

  const straightHand = [114, 113, 213, 313, 112, 111, 110, 109, 108, 106, 206];
  assert.deepEqual(ranked(straightHand, [
    [[108], false], [[114], false],
  ], [], false)[0], [14],
  'response chooses the two-turn remainder while retaining the five-card straight');
  assert.deepEqual(ranked(straightHand, [
    [[108, 109, 110, 111, 112], false],
    [[109, 110, 111, 112, 113], false],
  ], [], false)[0], [8, 9, 10, 11, 12],
  'equal-length straight responses keep the intact triple instead of borrowing K');

  const aircraftHand = [114, 113, 112, 111, 110, 210, 310,
    109, 209, 309, 108, 106, 105, 205, 305, 405];
  const oneTriple = [109, 209, 309, 108, 106];
  const doubleAircraft = [109, 209, 309, 110, 210, 310, 114, 113, 112, 111];
  assert.deepEqual(ranked(aircraftHand, [
    [doubleAircraft, false], [oneTriple, false],
  ])[0], [6, 8, 9, 9, 9],
  'equal three-turn plans retain the confirmed fewest-residual-singles rule');

  const afterHighSingles = [113, 213, 112, 110,
    108, 208, 308, 107, 207, 307, 106, 206, 105, 205];
  const airplaneBody = [107, 207, 307, 108, 208, 308];
  const requestedWings = [...airplaneBody, 110, 112, 113, 213];
  const wasteLowPair = [...airplaneBody, 110, 112, 105, 205];
  assert.deepEqual(ranked([...afterHighSingles, 114, 115], [
    [[...airplaneBody, 114, 115, 110, 112], false],
    [[114], false], [[115], false],
    [requestedWings, false], [wasteLowPair, false],
  ])[0], [7, 7, 7, 8, 8, 8, 10, 12, 13, 13],
  'a complete large lead keeps A and 2 as a control chain despite one extra planned turn');
  assert.deepEqual(ranked(afterHighSingles, [
    [wasteLowPair, false], [requestedWings, true],
  ], [114, 115])[0], [7, 7, 7, 8, 8, 8, 10, 12, 13, 13],
  'after A and 2 are spent, airplane 777888 takes 10QKK and leaves 5566 as one run');
});

test('COMMON whole-hand control paths rank distinct endgames without eager maximum or bomb splits', () => {
  const { rankCleanPdkHints, enumeratePdkRankMultisetCandidates,
    effectivePdkMaximumSingleRanks, isRegionalMaximumPdkCombination,
    isAuthorityCompatiblePdkAircraft } = loadHelper();
  const logicSource = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/logic/CommonPdkGameLogic.ts'), 'utf8');
  const logicJs = ts.transpileModule(logicSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const logicModule = { exports: {} };
  Function('module', 'exports', logicJs)(logicModule, logicModule.exports);
  const { CommonPdkGameLogic } = logicModule.exports;
  const deck = Array.from({ length: 11 }, (_, index) => index + 3)
    .flatMap((value) => [100, 200, 300, 400].map((suit) => suit + value))
    .concat([114, 214, 314, 115]);
  const rank = (card) => card % 100;
  const signature = (cards) => cards.map(rank).sort((a, b) => a - b).join(',');
  const ranked = (hand, played = [], target = []) => {
    const ruleOptions = { minimumStraightLength: 5, minimumPairRunLength: 2,
      tripleAttachmentMode: 'EITHER', fourAttachmentMode: 'EITHER',
      airplaneAttachmentMode: 'EITHER', allowAirplaneWithTwo: true };
    const logic = new CommonPdkGameLogic({ room: {
      GetRoomConfig: () => ({ ruleOptions }), GetRoomPaiXing: () => false,
    } });
    logic.OutPokerCard([...hand]);
    logic.ClearCardData();
    let targetType = 0;
    if (target.length > 0) {
      logic.ChangeSelectCard(target);
      targetType = logic.GetCardType();
      logic.lastCardType = targetType;
      logic.lastCardList = [...target];
    }
    const candidates = enumeratePdkRankMultisetCandidates(hand)
      .flatMap((cards, order) => {
        logic.ChangeSelectCard(cards);
        const type = logic.GetCardType();
        if (type <= 0 || !isAuthorityCompatiblePdkAircraft(cards, type)
          || (targetType > 0 && (type !== targetType
            || cards.length !== target.length
            || rank(cards[0]) <= rank(target[0])))) return [];
        const remaining = [...hand];
        for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
        const previousType = logic.lastCardType;
        const previousCards = [...logic.lastCardList];
        logic.ClearCardData();
        logic.ChangeSelectCard(remaining);
        const finishesInTwo = remaining.length > 0 && logic.GetCardType() > 0;
        logic.lastCardType = previousType;
        logic.lastCardList = previousCards;
        return [{ cards, order, finishesInTwo,
          usesFourCardBody: [8, 9, 10, 20].includes(type),
          containsRuleMaximum: isRegionalMaximumPdkCombination(cards, deck) }];
      });
    const maximumSingleRanks = effectivePdkMaximumSingleRanks(deck, hand, played);
    for (const candidate of candidates) {
      const ranks = candidate.cards.map(rank);
      if (ranks.every((value) => value === ranks[0])
        && maximumSingleRanks.includes(ranks[0])) candidate.containsRuleMaximum = true;
    }
    const protectedBombs = [...new Set(hand.map(rank))]
      .map((value) => hand.filter((card) => rank(card) === value))
      .filter((cards) => cards.length === 4);
    return rankCleanPdkHints(hand, candidates, {
      policyId: 'COMMON', minimumStraightLength: 5, minimumPairRunLength: 2,
      allowTwoInRuns: false, tripleAttachmentMode: 'EITHER', optimizeWholeHand: true,
      deckCards: deck, playedCards: played, maximumSingleRanks, protectedBombs, preserveScoringBombs: true,
    }, targetType === 0, targetType === 0).map(signature);
  };
  const cases = [
    ['two-hand pair run uses 2 first', [115, 110, 210, 111, 211, 112, 212], [], [], '15'],
    ['three-hand pair run keeps 2 for the low tail',
      [115, 110, 210, 111, 211, 112, 212, 105, 205, 106, 206], [], [], '10,10,11,11,12,12'],
    ['2 precedes intact bomb and terminal straight',
      [115, 112, 212, 312, 412, 105, 106, 107, 108, 109], [], [], '15'],
    ['loose 3 probes before 2 while four-card bomb stays intact',
      [115, 109, 209, 309, 409, 103, 104, 110, 111, 112, 113, 114], [], [], '3'],
    ['public 2 makes A a recovery after the higher loose probe',
      [114, 109, 108], [115], [], '9'],
    ['held 2 makes A a recovery after the higher loose probe',
      [114, 115, 109, 108], [], [], '9'],
    ['A and 2 do not by themselves solve six other loose cards',
      [115, 114, 112, 110, 109, 209, 108, 106, 105, 205, 104, 204], [], [], '4,4,5,5'],
    ['two-control bomb and pair ending still starts at A',
      [114, 115, 109, 209, 113, 213, 313, 413], [], [], '14'],
    ['response 2 is followed by an atomic triple-with-pair',
      [115, 106, 206, 306, 104, 204], [], [103], '15'],
  ];
  assert.deepEqual(cases.map(([name, hand, played, target]) =>
    [name, ranked(hand, played, target)[0]]),
  cases.map(([name, , , , expected]) => [name, expected]));
});

test('COMMON ninety-example audit covers each distinct ordinary hint scenario once', () => {
  const { rankCleanPdkHints, enumeratePdkRankMultisetCandidates,
    effectivePdkMaximumSingleRanks, isRegionalMaximumPdkCombination,
    isAuthorityCompatiblePdkAircraft } = loadHelper();
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/logic/CommonPdkGameLogic.ts'), 'utf8');
  const module = { exports: {} };
  Function('module', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(module, module.exports);
  const { CommonPdkGameLogic } = module.exports;
  const deck = Array.from({ length: 11 }, (_, index) => index + 3)
    .flatMap((value) => [100, 200, 300, 400].map((suit) => suit + value))
    .concat([114, 214, 314, 115]);
  const rank = (card) => card % 100;
  const ranksOf = (notation) => [...notation.matchAll(/10|[2-9AJQK]/g)].map(([part]) =>
    ({ A: 14, K: 13, Q: 12, J: 11, 2: 15 }[part] ?? Number(part)));
  const cardsOf = (notation, excluded = []) => {
    const used = new Set(excluded);
    return ranksOf(notation).map((value) => {
      const card = deck.find((entry) => rank(entry) === value && !used.has(entry));
      assert.ok(card, `physical card unavailable: ${notation} rank ${value}`);
      used.add(card);
      return card;
    });
  };
  const signature = (cards) => cards.map(rank).sort((a, b) => a - b).join(',');
  const actualFirst = ({ hand: notation, played = '', target = '' }) => {
    const hand = cardsOf(notation);
    const known = cardsOf(played + target, hand);
    const targetCards = target ? known.slice(known.length - ranksOf(target).length) : [];
    const options = { minimumStraightLength: 5, minimumPairRunLength: 2,
      tripleAttachmentMode: 'EITHER', fourAttachmentMode: 'EITHER',
      airplaneAttachmentMode: 'EITHER', allowAirplaneWithTwo: true };
    const logic = new CommonPdkGameLogic({ room: {
      GetRoomConfig: () => ({ ruleOptions: options }), GetRoomPaiXing: () => false,
    } });
    logic.OutPokerCard([...hand]);
    logic.ClearCardData();
    let targetType = 0;
    if (targetCards.length > 0) {
      logic.ChangeSelectCard(targetCards);
      targetType = logic.GetCardType();
      logic.lastCardType = targetType;
      logic.lastCardList = [...targetCards];
    }
    const candidates = enumeratePdkRankMultisetCandidates(hand)
      .flatMap((cards, order) => {
        logic.ChangeSelectCard(cards);
        const type = logic.GetCardType();
        if (type <= 0 || !isAuthorityCompatiblePdkAircraft(cards, type)
          || (targetType > 0 && (type !== targetType
            || cards.length !== targetCards.length
            || rank(cards[0]) <= rank(targetCards[0])))) return [];
        const remaining = [...hand];
        for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
        const previousType = logic.lastCardType;
        const previousCards = [...logic.lastCardList];
        logic.ClearCardData();
        logic.ChangeSelectCard(remaining);
        const finishesInTwo = remaining.length > 0 && logic.GetCardType() > 0;
        logic.lastCardType = previousType;
        logic.lastCardList = previousCards;
        return [{ cards, order, finishesInTwo,
          usesFourCardBody: [8, 9, 10, 20].includes(type),
          containsRuleMaximum: isRegionalMaximumPdkCombination(cards, deck) }];
      });
    const maximumSingleRanks = effectivePdkMaximumSingleRanks(deck, hand, known);
    for (const candidate of candidates) {
      const values = candidate.cards.map(rank);
      if (values.every((value) => value === values[0])
        && maximumSingleRanks.includes(values[0])) candidate.containsRuleMaximum = true;
    }
    const protectedBombs = [...new Set(hand.map(rank))]
      .map((value) => hand.filter((card) => rank(card) === value))
      .filter((cards) => cards.length === 4);
    return rankCleanPdkHints(hand, candidates, {
      policyId: 'COMMON', minimumStraightLength: 5, minimumPairRunLength: 2,
      allowTwoInRuns: false, tripleAttachmentMode: 'EITHER', optimizeWholeHand: true,
      deckCards: deck, playedCards: known, maximumSingleRanks,
      protectedBombs, preserveScoringBombs: true,
    }, targetType === 0, targetType === 0).map(signature)[0];
  };
  // Three historical 30-row lists collapse to the distinct ordinary scenes
  // below. Superseded expectations (high pair-run before 2 in a two-hand end,
  // four-with-two splitting a scoring bomb, 8 before the recovered A) are not
  // counted as confirmations; the corrected examples have their own tests.
  const cases = [
    ['one maximum single and terminal single', '29', '', '', '15'],
    ['two ascending maximum singles and terminal K', 'A2K', '', '', '14'],
    ['maximum pair before two control singles', 'AA2K', '', '', '14,14'],
    ['triple with one attachment', '26664', '', '', '15'],
    ['triple with two loose attachments', '266645', '', '', '15'],
    ['triple with pair attachment', '266644', '', '', '15'],
    ['terminal pair-run', '24455', '', '', '15'],
    ['terminal five-card straight', '256789', '', '', '15'],
    ['two-hand high three-pair run', '21010JJQQ', '', '', '15'],
    ['three-hand high three-pair run', '21010JJQQ5566', '', '', '10,10,11,11,12,12'],
    ['maximum single then bomb and straight', '256789QQQQ', '', '', '15'],
    ['A then two with pair and bomb tail', 'A299KKKK', '', '', '14'],
    ['two intact bombs with terminal straight', '278910J44446666', '', '', '15'],
    ['A and two with two intact bombs', 'A2997777KKKK', '', '', '14'],
    ['four-pair run remains intact', '26677889944', '', '', '6,6,7,7,8,8,9,9'],
    ['three-pair run keeps the complete other straight', '244556678910J', '', '', '4,4,5,5,6,6'],
    ['three-pair run ahead of low straight', '21010JJQQ34567', '', '', '10,10,11,11,12,12'],
    ['public cards establish maximum two-body airplane', '2QQQKKK345678910J', 'AAA', '',
      '3,4,5,6,12,12,12,13,13,13'],
    ['public cards establish maximum K triple-with-pair', '2KKK4456789', 'AA', '',
      '4,4,13,13,13'],
    ['highest five-card straight retains two', '210JQKA4455', '', '', '10,11,12,13,14'],
    ['highest three-pair run retains two', '2QQKKAA4455', '', '', '12,12,13,13,14,14'],
    ['maximum pair retains two', '2AA34567', '', '', '14,14'],
    ['uncontrolled loose tail keeps a complete pair-run', '2AQ1099865544', '', '', '4,4,5,5'],
    ['weak single probe with two and another weak single', '296', '', '', '9'],
    ['weak single probe before pair tail', '2788', '', '', '7'],
    ['public two makes A a single recovery', 'A98', '2', '', '9'],
    ['held two makes A a single recovery', 'A298', '', '', '9'],
    ['public two makes A terminal-pair opener', 'A77', '2', '', '14'],
    ['public A and two make K a single control', 'K56789', '2AAA', '', '13'],
    ['two public A and two make KK a pair control', 'KK56789', '2AA', '', '13,13'],
    ['single response uses two then triple-pair', '266644', '', 'Q', '15'],
    ['pair response uses AA then singles', 'AA2K', '', 'QQ', '14,14'],
    ['straight response uses higher five-card straight', '10JQKA24455', '', '56789', '10,11,12,13,14'],
    ['long straight is not shortened without benefit', '23456789', '', '', '15'],
    ['terminal seven-card straight stays complete', '3456789', '', '', '3,4,5,6,7,8,9'],
    ['two-body airplane preserves A and two as later controls',
      '77788810QKK5566A2', '', '', '7,7,7,8,8,8,10,12,13,13'],
    ['low single probe preserves scoring bomb', '299993410JQKA', '', '', '3'],
  ];
  const results = cases.map(([name, hand, played, target, expected]) =>
    [name, actualFirst({ hand, played, target }), expected]);
  assert.deepEqual(results.map(([name, actual]) => [name, actual]),
    results.map(([name, , expected]) => [name, expected]));
});

test('COMMON ninety-example audit distinguishes conditional authority card families', () => {
  const { rankCleanPdkHints, enumeratePdkRankMultisetCandidates,
    isAuthorityCompatiblePdkAircraft } = loadHelper();
  const source = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/logic/CommonPdkGameLogic.ts'), 'utf8');
  const module = { exports: {} };
  Function('module', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(module, module.exports);
  const { CommonPdkGameLogic } = module.exports;
  const deck = Array.from({ length: 11 }, (_, index) => index + 3)
    .flatMap((value) => [100, 200, 300, 400].map((suit) => suit + value))
    .concat([114, 214, 314, 115]);
  const ranksOf = (notation) => [...notation.matchAll(/10|[2-9AJQK]/g)].map(([part]) =>
    ({ A: 14, K: 13, Q: 12, J: 11, 2: 15 }[part] ?? Number(part)));
  const cardType = (selected, extraHand = '', changes = {}, flags = {}) => {
    const used = new Set();
    const cards = [...ranksOf(selected + extraHand)].map((value) => {
      const card = deck.find((entry) => entry % 100 === value && !used.has(entry));
      assert.ok(card, `physical card unavailable: ${selected + extraHand} rank ${value}`);
      used.add(card);
      return card;
    });
    const ruleOptions = { minimumStraightLength: 5, minimumPairRunLength: 2,
      tripleAttachmentMode: 'EITHER', fourAttachmentMode: 'EITHER',
      airplaneAttachmentMode: 'EITHER', allowAirplaneWithTwo: true, ...changes };
    const logic = new CommonPdkGameLogic({ room: {
      GetRoomConfig: () => ({ ruleOptions }),
      GetRoomPaiXing: (key) => Boolean(flags[key]),
    } });
    logic.OutPokerCard(cards);
    logic.ClearCardData();
    logic.ChangeSelectCard(cards.slice(0, ranksOf(selected).length));
    return logic.GetCardType();
  };
  const cases = [
    ['three without wings enabled as final hand', '666', '', {}, { SanBuDai: true }, 5],
    ['three without wings disabled outside final hand', '666', '9', {}, {}, 0],
    ['bare airplane enabled as final hand', '666777', '', {}, { SanBuDai: true }, 16],
    ['bare airplane disabled outside final hand', '666777', '9', {}, {}, 0],
    ['double airplane one single each', '66677745', '', {}, {}, 16],
    ['double airplane one pair each', '6667774455', '', {}, {}, 17],
    ['double airplane two singles each', '6667773458', '', {}, {}, 18],
    ['three-body airplane one single each', '666777888345', '', {}, {}, 16],
    ['four with two singles enabled', '444478', '', { fourAttachmentMode: 'SINGLES' }, {}, 9],
    ['four with two singles disabled', '444478', '', { fourAttachmentMode: 'DISABLED' }, {}, 0],
    ['four with two pairs enabled', '55557788', '', { fourAttachmentMode: 'PAIRS' }, {}, 20],
    ['four with one complete pair as final hand', '555577', '', {
      fourAttachmentMode: 'PAIRS',
    }, {}, 20],
    ['four with three enabled', '6666345', '', { allowFourWithThree: true }, {}, 10],
    ['four with three disabled', '6666345', '', { allowFourWithThree: false }, {}, 0],
    ['four with three accepts one pair and one single', '6666334', '', {
      allowFourWithThree: true,
    }, {}, 10],
    ['four with three rejects one pair and one single when disabled', '6666334', '', {
      allowFourWithThree: false,
    }, {}, 0],
    ['four with three accepts a triple wing', '6666333', '', {
      allowFourWithThree: true,
    }, {}, 10],
    ['four with three rejects a triple wing when disabled', '6666333', '', {
      allowFourWithThree: false,
    }, {}, 0],
    ['special three-ace bomb', 'AAA', '', { specialTripleBombRanks: [14] }, {}, 11],
    ['special three-ace plus one bomb', 'AAAK', '', {
      specialTripleBombRanks: [14], allowSpecialTripleBombWithOne: true,
    }, {}, 11],
    ['four plus one bomb enabled', '99993', '', { allowFourBombWithOne: true }, {}, 11],
    ['consecutive four-card bomb enabled', '44445555', '', { allowConsecutiveBomb: true }, {}, 11],
  ];
  assert.deepEqual(cases.map(([name, selected, extra, changes, flags]) =>
    [name, cardType(selected, extra, changes, flags)]),
  cases.map(([name, , , , , expected]) => [name, expected]));
  assert.equal(isAuthorityCompatiblePdkAircraft(
    [106, 206, 306, 107, 207, 307], 16), false,
  'a non-final bare airplane cannot bypass the ordinary wing rule');
  assert.equal(isAuthorityCompatiblePdkAircraft(
    [106, 206, 306, 107, 207, 307], 16, true), true,
  'only an authority-accepted final bare airplane can enter Hint');
  assert.equal(isAuthorityCompatiblePdkAircraft(
    [106, 206, 306, 108, 208, 308], 16, true), false,
  'the final-hand exception cannot invent a disconnected airplane body');
  for (const [name, selected, extra, changes, flags, expected] of cases) {
    if (expected <= 0) continue;
    const used = new Set();
    const hand = ranksOf(selected + extra).map((value) => {
      const card = deck.find((entry) => entry % 100 === value && !used.has(entry));
      assert.ok(card);
      used.add(card);
      return card;
    });
    const selectedRanks = ranksOf(selected).sort((a, b) => a - b).join(',');
    const exists = enumeratePdkRankMultisetCandidates(hand).some((cards) =>
      cards.map((card) => card % 100).sort((a, b) => a - b).join(',') === selectedRanks
      && cardType(selected, extra, changes, flags) === expected
      && isAuthorityCompatiblePdkAircraft(cards, expected, cards.length === hand.length));
    assert.ok(exists, `${name} must enter the authoritative Hint candidate set`);
  }
  const asNotation = (cards) => cards.map((card) => ({
    15: '2', 14: 'A', 13: 'K', 12: 'Q', 11: 'J',
  })[card % 100] ?? String(card % 100)).join('');
  for (const notation of ['6666345', '6666334', '6666333']) {
    const used = new Set();
    const hand = ranksOf(notation).map((value) => {
      const card = deck.find((entry) => entry % 100 === value && !used.has(entry));
      assert.ok(card);
      used.add(card);
      return card;
    });
    const candidates = enumeratePdkRankMultisetCandidates(hand)
      .flatMap((cards, order) => {
        const remaining = [...hand];
        for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
        const type = cardType(asNotation(cards), asNotation(remaining), {
          allowFourWithThree: true,
        });
        return type > 0 ? [{ cards, order, finishesInTwo: false,
          usesFourCardBody: [8, 9, 10, 20].includes(type),
          containsRuleMaximum: false }] : [];
      });
    assert.ok(candidates.some(({ cards }) => cards.length === hand.length),
      `authority must enumerate complete four-with-three: ${notation}`);
    const ranked = rankCleanPdkHints(hand, candidates, {
      policyId: 'COMMON', minimumStraightLength: 5, minimumPairRunLength: 2,
      allowTwoInRuns: false, tripleAttachmentMode: 'EITHER', optimizeWholeHand: true,
      deckCards: deck, maximumSingleRanks: [15], preserveScoringBombs: false,
    }, true, true);
    assert.ok(ranked.some((cards) => cards.length === hand.length),
      `enabled four-with-three must remain in the Hint cycle: ${notation}`);
  }
});
