import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  normalizePdkRoundActivitySnapshot,
  projectPdkAuthoritativeView,
} from '../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkAuthoritativeViewAdapter.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeCodeRoot = path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime');
const controller = fs.readFileSync(path.join(runtimeCodeRoot, 'PdkPlayController.ts'), 'utf8');
const semanticModule = (file) => fs.readFileSync(path.join(runtimeCodeRoot, file), 'utf8')
  .replaceAll('this.host.', 'this.')
  .replaceAll('public ', 'private ');
// The implementation is deliberately split by input, hints, table presentation and
// turn clock.  Test the same behavior through its new module boundaries instead of
// requiring it to live in one controller file.
const play = [
  semanticModule('PdkHandInputController.ts'),
  semanticModule('PdkHintController.ts'),
  semanticModule('PdkTablePresentationController.ts'),
  semanticModule('PdkTurnClockController.ts'),
  controller,
].join('\n');
const adapter = fs.readFileSync(path.join(runtimeCodeRoot, 'PdkAuthoritativeViewAdapter.ts'), 'utf8');
test('automatic turn handling is bound to Authority and submits only trusteeship or an exact final hand', () => {
  const method = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private operationTypeForCards'));
  assert.doesNotMatch(method, /this\.lifecycle\.hint/);
  assert.match(method, /this\.sortedLegalTipCandidates\(\s*leading/);
  assert.match(method, /sortedLegalTipCandidates\(false, 'HOST'\)/);
  assert.match(method, /sortedLegalTipCandidates\(\s*leading,\s*'HINT'/);
  assert.match(method, /stateVersion/);
  assert.match(method, /operationId/);
  assert.match(method, /turnSeat/);
  assert.match(method, /tips\.length > 0/);
  assert.match(method, /this\.logic\.ChangeSelectCard\(automatic\)/);
  assert.match(method, /this\.sameCards\(cards, finalHand\)/);
  assert.match(method, /await this\.outCard\(finalType\)/);
  assert.match(method, /await this\.outCard\(hostedType\)/);
  assert.doesNotMatch(method, /await this\.pass\(\)/);
  assert.doesNotMatch(method, /\[CommonRoomAutoPass\]/);
  assert.doesNotMatch(method, /maybeAutoPlay|isAutomaticWholeHand|wholeHandType/);
  assert.doesNotMatch(method, /setTimeout|navigator|userAgent/);
});

const authoritativePacket = (overrides = {}) => ({
  roomId: 71001,
  ownerId: 1752,
  family: 'PDK',
  playVersion: 'chengdu2001',
  playerCount: 2,
  roundNo: 2,
  roundLimit: 8,
  shuffleSequence: 2,
  stateVersion: 51,
  phase: 'PLAYING',
  currentSeat: 0,
  seats: {
    0: { playerId: 1752, cards: [105, 109, 113], roundScore: 0, totalScore: 100 },
    1: { playerId: 1753, cards: [205, 209, 213], roundScore: 0, totalScore: 100 },
  },
  ruleOptions: {
    mustBeatWhenPossible: false,
    tripleAttachmentMode: 'SINGLES',
    fourAttachmentMode: 'SINGLES',
    tripleWithoutAttachmentTiming: 'ANYTIME',
    specialTripleBombRanks: [],
  },
  lastActions: [{
    action: 'play', operationId: 'previous-round-final', seat: 1, cards: [55], cardType: 'SINGLE',
  }],
  ...overrides,
});

test('lastActions stays in history and cannot reconstruct active comparison or table operations', () => {
  const { snapshot } = projectPdkAuthoritativeView(authoritativePacket(), 1752);
  assert.deepEqual(snapshot.set.lastActions, authoritativePacket().lastActions);
  assert.deepEqual(snapshot.set.comparisonState.cards, []);
  assert.equal(snapshot.set.comparisonState.cardType, 0);
  assert.equal(snapshot.set.trickReset, true);
  assert.equal(snapshot.set.isFirstOp, true);
  assert.deepEqual(snapshot.set.tableOperations, []);
  assert.deepEqual(snapshot.set.seatPlayStates, []);
  assert.deepEqual(snapshot.set.tableLastOperation, {});
  assert.equal(snapshot.set.authoritativeTableSnapshotComplete, false);
  assert.deepEqual(snapshot.posList[0].cards, [105, 109, 113]);
});

test('legacy currentTrick may project its active comparison, but not history actions', () => {
  const packet = authoritativePacket({
    currentTrick: { trickId: 9, seat: 1, cards: [77], cardType: 'SINGLE', operationId: 'current-play' },
  });
  const { snapshot } = projectPdkAuthoritativeView(packet, 1752);
  assert.deepEqual(snapshot.set.comparisonState.cards, [77]);
  assert.equal(snapshot.set.comparisonState.leadSeat, 1);
  assert.equal(snapshot.set.trickReset, false);
  assert.deepEqual(snapshot.set.tableOperations, []);
  assert.deepEqual(snapshot.set.seatPlayStates, []);
});

test('new round boundary clears unversioned activity atomically while preserving hand and history', () => {
  const { snapshot } = projectPdkAuthoritativeView(authoritativePacket({
    currentTrick: { trickId: 8, seat: 1, cards: [55], cardType: 'SINGLE' },
  }), 1752);
  const nextRound = normalizePdkRoundActivitySnapshot(snapshot.set, true);
  assert.equal(nextRound.trickReset, true);
  assert.equal(nextRound.isFirstOp, true);
  assert.deepEqual(nextRound.comparisonState, {
    trickId: 0,
    leadSeat: -1,
    cards: [],
    cardType: 0,
    primaryRank: 0,
    operationId: '',
    playIndex: 0,
    stateVersion: 51,
  });
  assert.deepEqual(nextRound.currentTrick, {});
  assert.deepEqual(nextRound.lastOperation, {});
  assert.deepEqual(nextRound.tableLastOperation, {});
  assert.deepEqual(nextRound.passSeats, []);
  assert.deepEqual(nextRound.tableOperations, []);
  assert.deepEqual(nextRound.seatPlayStates, []);
  assert.deepEqual(nextRound.cardList, []);
  assert.equal(nextRound.opType, 0);
  assert.equal(nextRound.lastOpPos, -1);
  assert.deepEqual(nextRound.posInfo[0].cards, [105, 109, 113]);
  assert.deepEqual(nextRound.lastActions, authoritativePacket().lastActions);
});

test('a complete version-matched table snapshot remains atomic on a round transition', () => {
  const packet = authoritativePacket({
    tableSnapshot: {
      stateVersion: 51,
      trickId: 11,
      turnSeat: 0,
      operations: [{ action: 'play', operationId: 'round-2-play', seat: 1, cards: [66] }],
      trickOperations: [{ action: 'play', operationId: 'round-2-play', seat: 1, cards: [66] }],
      comparison: { trickId: 11, seat: 1, cards: [66], cardType: 'SINGLE', operationId: 'round-2-play' },
      lastOperation: { operationId: 'round-2-play' },
      passSeats: [0],
    },
  });
  const { snapshot } = projectPdkAuthoritativeView(packet, 1752);
  const nextRound = normalizePdkRoundActivitySnapshot(snapshot.set, true);
  assert.equal(nextRound, snapshot.set);
  assert.deepEqual(nextRound.comparisonState.cards, [66]);
  assert.deepEqual(nextRound.passSeats, [0]);
});
test('an automatic final-hand or trusteeship failure stays diagnostic and never submits pass', () => {
  const method = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private operationTypeForCards'));
  assert.match(method, /\[CommonRoomAutoActionError\]/);
  assert.match(method, /let autoActionFailed = false/);
  assert.match(method, /autoActionFailed = true/);
  assert.match(method, /if \(autoActionFailed\) this\.refresh\(\)/);
  assert.doesNotMatch(method, /await this\.pass\(\)/);
  assert.doesNotMatch(method, /reportUserActionError\('自动提示'/);
});
test('automatic hint waits for the hand but never blocks on the retained public-card hold', () => {
  const state = play.slice(play.indexOf("if (event === 'CommonPdk_AuthoritativeState')"), play.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(state, /const hintReady = handRender/);
  assert.match(state, /this\.trackPresentation\(settledPublicPresentation\)/);
  assert.match(state, /const turnPresentation = hintReady[\s\S]*autoHintForAuthoritativeTurn\(/);
});
test('automatic hint stays turn-scoped but replaces a stale manual selection', () => {
  assert.doesNotMatch(play, /selectionUnchanged/);
  assert.match(play, /if \(!stillCurrent\) return/);
});

test('reported-single rule constrains every local candidate source and final single submission', () => {
  const candidates = play.slice(play.indexOf('private sortedLegalTipCandidates'), play.indexOf('private scoringBombGroups'));
  assert.match(candidates, /this\.obeysReportedSingleRule\(candidate\.cards\)/);
  assert.match(play, /private requiredReportedSingleRank\(\): number \| null/);
  assert.match(play, /this\.remainingCards\.get\(nextSeat\) !== 1/);
  assert.match(play, /private obeysReportedSingleRule\(cards: readonly number\[\]\): boolean/);
  const out = play.slice(play.indexOf('private async outCard'), play.indexOf('private selectedIntrinsicType'));
  assert.match(out, /REPORTED_SINGLE_REQUIRES_HIGHEST/);
  assert.match(out, /this\.obeysReportedSingleRule\(values\)/);
  const drag = play.slice(play.indexOf('private largestLegalDragCandidates'), play.indexOf('private cancelDragSelection'));
  assert.match(drag, /largestLegalPdkSubsets\(touched/);
  assert.match(drag, /this\.sortedLegalTipCandidates\(leading, 'DRAG', candidates\)/);
  assert.doesNotMatch(drag, /this\.sortedLegalTipCandidates\(false\)/);
});

test('dealer competition cannot trigger trusteeship handling before the final dealer owns PLAYING', () => {
  const hint = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'),
    play.indexOf('private operationTypeForCards'));
  const phase = play.slice(play.indexOf('private isFormalCardPlayPhase'),
    play.indexOf('private sameCards'));
  assert.match(hint, /if \(!this\.isFormalCardPlayPhase\(setInfo\)\)/);
  assert.match(phase, /!this\.competeDealerPhase && phase === 'PLAYING'/);
});

test('a lead turn remains manual after Authority marks it as a lead', () => {
  const method = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private operationTypeForCards'));
  const leadReturn = method.indexOf('if (leading)');
  const leadLegal = method.indexOf('const legal = this.sortedLegalTipCandidates(\n                leading');
  assert.ok(leadReturn >= 0 && leadReturn < leadLegal);
  assert.match(method.slice(leadReturn, leadLegal), /ChangeSelectCard\(\[\]\)[\s\S]*updateSelection\(\)[\s\S]*return/);
  assert.doesNotMatch(method.slice(leadReturn, leadLegal), /outCard\(/);
});

test('refresh never races a second pass-specific hint request', () => {
  const refresh = play.slice(play.indexOf('private refresh()'), play.indexOf('private async renderHeads'));
  assert.doesNotMatch(refresh, /maybeAutoPass|lifecycle\.hint/);
  assert.equal((play.match(/private async autoHintForAuthoritativeTurn/g) ?? []).length, 1);
  const cache = play.slice(play.indexOf('private prepareHintCache'), play.indexOf('private async outCard'));
  assert.doesNotMatch(cache, /lifecycle\.hint/);
});

test('each committed authority version clears selection before rebuilding the hand', () => {
  const state = play.slice(play.indexOf("if (event === 'CommonPdk_AuthoritativeState')"), play.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(state, /normalizePdkRoundActivitySnapshot\(rawSetInfo, resetRoundActivity\)/);
  assert.match(state, /this\.applyAuthoritativeTurnBoundary\(setInfo\);[\s\S]*this\.logic\.InitHandCard\(\)/);
  assert.match(state, /const authorityHand = \[\.\.\.\(this\.logic\.GetHandCard\(\) \?\? \[\]\)\]\.map\(Number\)/);
  assert.match(state, /this\.handCompaction\.then\(\(\) => this\.renderHand\(false, authorityHand\)\)/);
  assert.doesNotMatch(state, /setInfo\.cardList[\s\S]*SetCardData/);
  const auto = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private operationTypeForCards'));
  const ordinaryResponse = auto.slice(auto.indexOf('if (leading)'), auto.indexOf('} catch (error: unknown)'));
  assert.match(ordinaryResponse, /if \(tips\.length > 0\)[\s\S]*CommonRoomAutoHintUnavailable/);
  assert.match(ordinaryResponse, /CommonRoomAutoHintUnavailable[\s\S]*return/);
  assert.doesNotMatch(ordinaryResponse, /await this\.pass\(\)|operations\?\.hide\(\)|Tip\/Pass/);
  assert.match(play, /this\.cards\.clearSelectionImmediately\(this\.cardNodes\)/);
});

test('atomic table snapshot restores comparison before seat presentation', () => {
  const restore = play.slice(play.indexOf('private reconcileAuthorityPublicCards'), play.indexOf('private async restoreSeatPlayStates'));
  assert.match(restore, /this\.record\(packet\.comparisonState\)/);
  assert.match(restore, /const trickId = Number\(comparison\.trickId \?\? packet\.trickId \?\? -1\)/);
  assert.match(restore, /Array\.isArray\(packet\.seatPlayStates\)/);
  assert.match(restore, /this\.logic\.SetCardData\(opType, cardList\)/);
  assert.match(restore, /return this\.restoreSeatPlayStates/);
  assert.ok(restore.indexOf('SetCardData(opType, cardList)') < restore.indexOf('return this.restoreSeatPlayStates'));
});

test('ordinary live projection restores coalesced preceding seat plays after the comparison hand', () => {
  const restore = play.slice(play.indexOf('private reconcileAuthorityPublicCards'),
    play.indexOf('private async restoreSeatPlayStates'));
  const ordinary = restore.slice(restore.indexOf('if (!this.runtime.arrangementEnabled())'));
  assert.match(ordinary, /renderPublicOperation\(/);
  assert.match(ordinary, /rememberLatestPublicCardLanding/);
});

test('legacy OpCard is fully inert after the authoritative snapshot cutover', () => {
  const branch = play.slice(play.indexOf("} else if (event === 'OpCard')"), play.indexOf("} else if (event === 'ChangeStatus')"));
  assert.doesNotMatch(branch, /SetCardData|ClearCardData|playGameOperation|playOperation|OutPokerCard|renderHand/);
  assert.match(branch, /only public-card and hand writer/);
});

test('authority adapter requires one atomic table snapshot without legacy reconstruction', () => {
  assert.match(adapter, /const tableSnapshot = record\(source\.tableSnapshot\)/);
  assert.match(adapter, /tableSnapshot\.stateVersion === stateVersion/);
  assert.match(adapter, /if \(hasTableSnapshot && !snapshotComplete\)/);
  assert.doesNotMatch(adapter, /suppliedSnapshotComplete|legacyCurrentTrick|seatPlays: lastActions/);
  assert.match(adapter, /CommonPdk 权威桌面快照不完整/);
  assert.match(adapter, /comparisonState:/);
  assert.match(adapter, /tableOperations:/);
  assert.match(adapter, /tableLastOperation/);
  assert.match(adapter, /seatPlayStates:/);
  assert.match(adapter, /const publicCards = cardValues\(effectiveTrick\.cards\)/);
  assert.match(adapter, /effectiveTrick\.cardType/);
  assert.match(adapter, /authoritativeTableSnapshotComplete: snapshotComplete/);
  assert.doesNotMatch(adapter, /lastActions\.at\(-1\)|:\s*lastActions;/);
  assert.match(adapter, /playedCardList,/);
  assert.match(play, /presentLatestAuthorityAction\(setInfo, snapshotPresentationLease\)/);
});

test('a round reset stays pending across phase or legacy deal events until activity proves its identity', () => {
  const reset = play.slice(play.indexOf('private shouldResetRoundActivity'), play.indexOf('private clearTableCards'));
  const round = play.slice(play.indexOf('private acceptPresentationRound'), play.indexOf('private shouldResetRoundActivity'));
  assert.match(round, /if \(acceptance\.previousKey\) this\.pendingRoundActivityResetKey = acceptance\.lease\.key/);
  assert.match(reset, /authoritativeTableSnapshotComplete === true/);
  assert.match(reset, /comparisonRoundNo === roundNo && comparisonStateVersion === stateVersion/);
  assert.match(reset, /this\.pendingRoundActivityResetKey = ''/);
});

test('a committed trick reset clears lead state without reopening a duplicate authority hint', () => {
  const boundary = play.slice(play.indexOf('private applyAuthoritativeTurnBoundary'), play.indexOf('private reconcileAuthorityPublicCards'));
  assert.match(boundary, /this\.logic\.ChangeSelectCard\(\[\]\)/);
  assert.match(boundary, /this\.resetPromptCycle\(\)/);
  assert.match(boundary, /if \(trickReset\) \{[\s\S]*this\.logic\.ClearCardData\(\)/);
  assert.doesNotMatch(boundary, /this\.autoHintTurnKey = ''/);
  assert.match(boundary, /stateVersion > submitted\.stateVersion/);
  assert.match(boundary, /this\.playInFlight = false;[\s\S]*this\.playRequestScope = null/);
  const out = play.slice(play.indexOf('private async outCard'), play.indexOf('private selectedIntrinsicType'));
  assert.match(out, /const scope = \{ roomId, stateVersion, trickId, operationId \}/);
  assert.match(out, /const turnSeat = Number\(setInfo\.opPos \?\? deadline\?\.seatId \?\? -1\)/);
  assert.match(out, /turnSeat !== this\.clientSeat\(\)/);
  assert.match(out, /await this\.lifecycle\.play\(roomId/);
  assert.match(out, /catch \(error: unknown\)[\s\S]*await this\.renderHand\(\)/);
  assert.doesNotMatch(out, /if \(!requestAccepted\) this\.refresh\(\)/);
  assert.ok(out.indexOf('this.flyCardsToOwnAction(flyingCards)') < out.indexOf('await this.lifecycle.play(roomId'));
  assert.ok(out.indexOf('await this.lifecycle.play(roomId') < out.indexOf('this.playInFlight = false'));
});

test('same-turn authority refresh preserves a visible selection and local flight swaps without overlap', () => {
  const boundary = play.slice(play.indexOf('private applyAuthoritativeTurnBoundary'), play.indexOf('private reconcileAuthorityPublicCards'));
  assert.match(boundary, /const selectionKey =/);
  assert.match(boundary, /if \(selectionKey !== this\.selectionAuthorityKey\)/);
  const render = play.slice(play.indexOf('private async renderPublicOperation'), play.indexOf('private async presentPublicOperation'));
  assert.match(render, /await this\.ownCardFlight[\s\S]*card\.parent = parent[\s\S]*this\.ownLandingCards\.length = 0/);
  assert.doesNotMatch(render, /dataSeat === this\.clientSeat\(\)\) this\.clearOwnLandingCards\(\)/);
  assert.doesNotMatch(render, /clearOwnOutgoingSlot\(\)/);
});

test('manual selection stays physical while authoritative mandatory constraints block only invalid final submissions', () => {
  const selection = play.slice(play.indexOf('private async toggleCardAt'), play.indexOf('private updateSelection'));
  assert.match(selection, /responseCoreSelectionForCard\(clicked\)/);
  assert.match(selection, /if \(this\.logic\.CheckSelected\(clicked\)\)[\s\S]*DeleteCardSelected[\s\S]*SetCardSelected/);
  assert.doesNotMatch(selection, /validPartialBomb|canExtendSelectionAsBomb|selectableBombGroups/);
  assert.doesNotMatch(selection, /GetLastCardType|strictly|locallyLegal/);
  const drag = play.slice(play.indexOf('private commitSmartDragSelection'), play.indexOf('private largestLegalDragCandidates'));
  assert.match(drag, /const touched = this\.orderedDragIndices\(\)[\s\S]*largestLegalDragCandidates\(touched\)\[0\]/);
  const out = play.slice(play.indexOf('private async outCard'), play.indexOf('private selectedIntrinsicType'));
  assert.match(out, /this\.selectedIntrinsicType\(\)/);
  assert.match(out, /this\.synchronizeAuthorityComparison\(setInfo\)/);
  assert.doesNotMatch(out, /if \(opType <= 0\)|if \(comparableType <= 0\)/);
  assert.match(out, /this\.lifecycle\.play\([\s\S]*Math\.max\(0, opType\), values/);
  assert.match(out, /this\.obeysReportedSingleRule\(values\)/);
  assert.match(out, /下家报单只能出最大单张/);
  assert.match(out, /this\.missingRequiredFirstCard\(values\)/);
  assert.match(play, /card type\|pattern\|attachment\|invalid play\|牌型/);
});

test('hint, automatic hint, and play all resync the same atomic authority comparison', () => {
  const sync = play.slice(play.indexOf('private synchronizeAuthorityComparison'), play.indexOf('private sameCards'));
  assert.match(sync, /authorityComparison\(setInfo\)/);
  assert.match(sync, /SetCardData\(type, cards\)/);
  assert.match(sync, /ClearCardData\(\)/);
  const hint = play.slice(play.indexOf('private tip()'), play.indexOf('private prepareHintCache'));
  const cache = play.slice(play.indexOf('private prepareHintCache'), play.indexOf('private async outCard'));
  const auto = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private operationTypeForCards'));
  assert.match(hint, /this\.synchronizeAuthorityComparison\(\)/);
  assert.ok(hint.indexOf('this.synchronizeAuthorityComparison();') < hint.indexOf('const key = this.promptKey();'),
    'Hint must synchronize the committed comparison before reusing a cache key');
  assert.match(cache, /synchronizeAuthorityComparison\(\)/);
  assert.match(auto, /synchronizeAuthorityComparison\(setInfo\)/);
});

test('a trick reset suppresses the stale winning comparison before automatic self-lead Hint', () => {
  const comparison = play.slice(play.indexOf('private authorityComparison'),
    play.indexOf('private sameCards'));
  assert.match(comparison,
    /Boolean\(setInfo\.trickReset\)[\s\S]*return \{ cards: \[\], type: 0 \}/);

  const automatic = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'),
    play.indexOf('private operationTypeForCards'));
  assert.match(automatic, /const leading = this\.isAuthoritativeLeadingTurn\(setInfo\)/);
  assert.doesNotMatch(automatic,
    /const leading = lastCardType <= 0 \|\| lastCards\.length === 0 \|\| Boolean\(setInfo\.isFirstOp\)/);

  const boundary = play.slice(play.indexOf('private applyAuthoritativeTurnBoundary'),
    play.indexOf('private reconcileAuthorityPublicCards'));
  assert.match(boundary,
    /const comparison = this\.authorityComparison\(setInfo\);[\s\S]*const trickReset = comparison\.cards\.length === 0 \|\| comparison\.type <= 0/);
  assert.doesNotMatch(boundary, /setInfo\.cardList/);
});

test('manual hint uses the authoritative trick reset instead of stale local response state', () => {
  assert.match(play, /private tip\(\): void \{[\s\S]*this\.logic\.ChangeSelectCard\(tips\[this\.tipIndex\]\)/);
  assert.match(play, /private prepareHintCache\(\): void \{[\s\S]*const leading = this\.isAuthoritativeLeadingTurn\(\)/);
  assert.match(play, /if \(leading && \(this\.logic\.GetLastCardType\(\) !== 0 \|\| this\.logic\.lastCardList\.length > 0\)\) \{\s*this\.logic\.ClearCardData\(\)/);
  const leading = play.slice(play.indexOf('private isAuthoritativeLeadingTurn'), play.indexOf('private async autoHintForAuthoritativeTurn'));
  assert.match(leading, /authorityComparison\(setInfo\)/);
  assert.match(leading, /cards\.length === 0 \|\| type <= 0/);
  assert.doesNotMatch(leading, /setInfo\.cardList|setInfo\.opCardType|setInfo\.cardType/);
  assert.doesNotMatch(leading, /lastActions|actions\?\.length === 0/);
  const restore = play.slice(play.indexOf('private reconcileAuthorityPublicCards'), play.indexOf('private async restoreSeatPlayStates'));
  assert.match(restore, /comparisonState[\s\S]*SetCardData\(opType, cardList\)[\s\S]*restoreSeatPlayStates/);
  assert.doesNotMatch(restore, /packet\.lastActions|packet\.currentTrick/);
});

test('first-lead hints consume the round-specific required card from Authority', () => {
  assert.match(adapter, /activeRequiredFirstCard/);
  const cache = play.slice(play.indexOf('private prepareHintCache'), play.indexOf('private async outCard'));
  assert.match(cache, /const required = leading \? this\.activeRequiredFirstCard\(\) : 0/);
  assert.match(cache, /legal\.filter\(\(cards\) => cards\.includes\(required\)\)/);
  const auto = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private operationTypeForCards'));
  assert.match(auto, /if \(leading\) \{/);
  const leadBranch = auto.slice(auto.indexOf('if (leading)'), auto.indexOf('const hintComputeStartedAt'));
  assert.doesNotMatch(leadBranch, /outCard\(/);
});

test('only an exact legal final hand submits automatically; ordinary turns stay manual', () => {
  assert.doesNotMatch(play, /AUTO_PLAY_SELECTION_DELAY_MS|autoPlayTurnKey|autoPlayOperationId|autoPlayInFlight|autoPlayTimer|autoPlayRejectedTurnKey/);
  assert.doesNotMatch(play, /isAutomaticWholeHand|maybeAutoPlay|last-hand-auto-play/);
  const authority = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'),
    play.indexOf('private operationTypeForCards'));
  assert.match(authority, /const finalCandidate = finalHand\.length > 0[\s\S]*?\.find\(\(cards\) => this\.sameCards\(cards, finalHand\)\)/);
  assert.match(authority, /if \(finalCandidate\) \{[\s\S]*await this\.outCard\(finalType\)/);
  assert.match(authority, /if \(hostedResponse\) \{/);
  assert.match(authority, /await this\.outCard\(hostedType\)/);
  assert.equal([...authority.matchAll(/await this\.outCard\(/g)].length, 2,
    'only the exact-final-hand and trusteeship branches may submit during automatic turn handling');
});

test('only score-bearing bombs enter decomposition protection while every bomb remains manually selectable', () => {
  const selection = play.slice(play.indexOf('private async toggleCardAt'), play.indexOf('private updateSelection'));
  const planning = play.slice(play.indexOf('private sortedLegalTipCandidates'), play.indexOf('private cardsInHandOrder'));
  const bombs = play.slice(play.indexOf('private scoringBombGroups'), play.indexOf('private cardsInHandOrder'));
  assert.doesNotMatch(selection, /selectableBombGroups|validPartialBomb|canExtendSelectionAsBomb/);
  assert.match(planning, /protectedBombs: this\.scoringBombGroups\(\)/);
  assert.match(bombs, /private scoringBombGroups\(\): number\[\]\[\] \{[\s\S]*bombScoreMode[\s\S]*=== 'DISABLED'\) return \[\]/);
});

test('comparison cards override a mismatched legacy numeric type before response filtering', () => {
  const comparison = play.slice(play.indexOf('private authorityComparison'), play.indexOf('private hasUnretainedLatestAuthorityPlay'));
  assert.match(comparison, /const declaredType = this\.legacyOperationType/);
  assert.match(comparison, /pdkOperationTypeForCards\(cards, this\.recognitionRules\(cards\.length, false\)\)/);
  assert.match(comparison, /const type = physicalType > 0 \? physicalType : declaredType;/);
});

test('table reconciliation and Hint use the same physical comparison type', () => {
  const reconcile = play.slice(play.indexOf('private reconcileAuthorityPublicCards'),
    play.indexOf('private async restoreSeatPlayStates'));
  assert.match(reconcile, /const \{ cards: cardList, type: opType \} = this\.authorityComparison\(packet\)/);
  assert.match(reconcile, /this\.logic\.SetCardData\(opType, cardList\)/);
  assert.doesNotMatch(reconcile, /legacyOperationType\(comparison\.cardType \?\? comparison\.type\)/);
});
