import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const play = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
test('automatic hint is computed locally and remains bound to the authoritative turn version', () => {
  const method = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private maybeAutoPlay'));
  assert.doesNotMatch(method, /this\.lifecycle\.hint/);
  assert.match(method, /this\.responseTipCandidates\(\)/);
  assert.match(method, /stateVersion/);
  assert.match(method, /operationId/);
  assert.match(method, /turnSeat/);
  assert.match(method, /tips\.length > 0/);
  assert.match(method, /this\.logic\.ChangeSelectCard\(automatic\)/);
  assert.doesNotMatch(method, /setTimeout|navigator|userAgent/);
});
test('an automatic pass failure stays diagnostic and never shows an automatic-hint toast', () => {
  const method = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private maybeAutoPlay'));
  assert.match(method, /\[CommonRoomAutoPassError\]/);
  assert.match(method, /let autoPassFailed = false/);
  assert.match(method, /autoPassFailed = true/);
  assert.match(method, /if \(autoPassFailed\) this\.refresh\(\)/);
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
  assert.match(play, /if \(!stillCurrent \|\| this\.autoPlayInFlight\) return/);
});

test('dealer competition cannot trigger whole-hand autoplay before the final dealer owns PLAYING', () => {
  const hint = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'),
    play.indexOf('private operationTypeForCards'));
  const visibility = play.slice(play.indexOf('private isAutomaticWholeHand'),
    play.indexOf('private maybeAutoPlay'));
  const submit = play.slice(play.indexOf('private maybeAutoPlay'),
    play.indexOf('private autoPlayKey'));
  const phase = play.slice(play.indexOf('private isFormalCardPlayPhase'),
    play.indexOf('private autoPlayKey'));
  assert.match(hint, /if \(!this\.isFormalCardPlayPhase\(setInfo\)\)/);
  assert.match(visibility, /!this\.isFormalCardPlayPhase\(setInfo\)/);
  assert.match(submit, /!this\.isFormalCardPlayPhase\(setInfo\)/);
  assert.match(submit, /this\.isFormalCardPlayPhase\(latest\)/);
  assert.match(phase, /!this\.competeDealerPhase && phase === 'PLAYING'/);
});

test('a lead turn auto-plays only when the complete hand is one legal final play', () => {
  const method = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private maybeAutoPlay'));
  const autoplay = method.indexOf('this.maybeAutoPlay');
  const leadReturn = method.indexOf('if (leading)');
  const automatic = method.indexOf('this.logic.ChangeSelectCard(automatic)');
  assert.ok(autoplay >= 0 && autoplay < leadReturn && leadReturn < automatic);
  assert.match(method, /if \(\(required <= 0 \|\| hand\.includes\(required\)\)/);
  assert.match(method.slice(leadReturn, automatic), /ChangeSelectCard\(\[\]\)[\s\S]*updateSelection\(\)[\s\S]*return/);
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
  assert.match(state, /this\.applyAuthoritativeTurnBoundary\(setInfo\);[\s\S]*this\.logic\.InitHandCard\(\)/);
  assert.match(state, /const authorityHand = \[\.\.\.\(this\.logic\.GetHandCard\(\) \?\? \[\]\)\]\.map\(Number\)/);
  assert.match(state, /this\.handCompaction\.then\(\(\) => this\.renderHand\(animateDeal, authorityHand\)\)/);
  assert.doesNotMatch(state, /setInfo\.cardList[\s\S]*SetCardData/);
  const auto = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private maybeAutoPlay'));
  assert.match(auto, /if \(tips\.length > 0\)[\s\S]*ChangeSelectCard\(\[\]\)[\s\S]*await this\.pass\(\)/);
  assert.match(play, /this\.cards\.clearSelectionImmediately\(this\.cardNodes\)/);
});

test('atomic table snapshot restores comparison before seat presentation', () => {
  const restore = play.slice(play.indexOf('private reconcileAuthorityPublicCards'), play.indexOf('private async restoreSeatPlayStates'));
  assert.match(restore, /this\.record\(packet\.comparisonState\)/);
  assert.match(restore, /const trickId = Number\(comparison\.trickId \?\? packet\.trickId \?\? 0\)/);
  assert.match(restore, /Array\.isArray\(packet\.seatPlayStates\)/);
  assert.match(restore, /this\.logic\.SetCardData\(opType, cardList\)/);
  assert.match(restore, /return this\.restoreSeatPlayStates/);
  assert.ok(restore.indexOf('SetCardData(opType, cardList)') < restore.indexOf('return this.restoreSeatPlayStates'));
});

test('ordinary live projection restores coalesced preceding seat plays after the comparison hand', () => {
  const restore = play.slice(play.indexOf('private reconcileAuthorityPublicCards'),
    play.indexOf('private async restoreSeatPlayStates'));
  const ordinary = restore.slice(restore.indexOf('if (!this.runtime.arrangementEnabled())'));
  assert.match(ordinary,
    /renderPublicOperation\([\s\S]*\.then\(\(\) => this\.restoreSeatPlayStates\(seatPlays, projectionGeneration\)\)/);
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
  assert.match(adapter, /playedCardList,/);
  assert.match(play, /presentLatestAuthorityAction\(setInfo, snapshotPresentationGeneration\)[\s\S]*\.then\(\(\) => this\.restoreTableCards\(setInfo, snapshotPresentationGeneration\)\)/);
});

test('a committed trick reset clears lead state without reopening a duplicate authority hint', () => {
  const boundary = play.slice(play.indexOf('private applyAuthoritativeTurnBoundary'), play.indexOf('private reconcileAuthorityPublicCards'));
  assert.match(boundary, /this\.logic\.ChangeSelectCard\(\[\]\)/);
  assert.match(boundary, /this\.resetPromptCycle\(\)/);
  assert.match(boundary, /if \(trickReset\) \{[\s\S]*this\.logic\.ClearCardData\(\)/);
  assert.doesNotMatch(boundary, /this\.autoHintTurnKey = ''/);
  assert.match(boundary, /stateVersion > submitted\.stateVersion/);
  assert.match(boundary, /this\.playInFlight = false;[\s\S]*this\.playRequestScope = null/);
  const out = play.slice(play.indexOf('private async outCard'), play.indexOf('private prepareOwnFlightCards'));
  assert.match(out, /const scope = \{ roomId, stateVersion, trickId, operationId \}/);
  assert.match(out, /const authorityTurnSeat = Number\(setInfo\.opPos \?\? deadline\?\.seatId \?\? -1\)/);
  assert.match(out, /authorityTurnSeat !== this\.clientSeat\(\)/);
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

test('manual card selection is unrestricted and play legality is submitted to Authority', () => {
  const selection = play.slice(play.indexOf('private async toggleCardAt'), play.indexOf('private groupedResponseSelection'));
  assert.match(selection, /CheckSelected[\s\S]*DeleteCardSelected[\s\S]*SetCardSelected/);
  assert.doesNotMatch(selection, /GetLastCardType|strictly|locallyLegal/);
  const drag = play.slice(play.indexOf('private commitSmartDragSelection'), play.indexOf('private largestLegalDragCandidates'));
  assert.match(drag, /const touched = this\.sortedDragIndices\(\)[\s\S]*largestLegalDragCandidates\(touched\)\[0\]/);
  const out = play.slice(play.indexOf('private async outCard'), play.indexOf('private prepareOwnFlightCards'));
  assert.match(out, /this\.selectedIntrinsicType\(\)/);
  assert.match(out, /this\.synchronizeAuthorityComparison\(setInfo\)/);
  assert.doesNotMatch(out, /if \(opType <= 0\)|if \(comparableType <= 0\)/);
  assert.match(out, /this\.lifecycle\.play\([\s\S]*Math\.max\(0, opType\), values/);
  assert.doesNotMatch(out, /下家报单只能出最大单张|requiredFirstCard > 0/);
  assert.match(play, /card type\|pattern\|attachment\|invalid play\|牌型/);
});

test('hint, automatic hint, and play all resync the same atomic authority comparison', () => {
  const sync = play.slice(play.indexOf('private synchronizeAuthorityComparison'), play.indexOf('private maybeAutoPlay'));
  assert.match(sync, /authorityComparison\(setInfo\)/);
  assert.match(sync, /SetCardData\(type, cards\)/);
  assert.match(sync, /ClearCardData\(\)/);
  const cache = play.slice(play.indexOf('private prepareHintCache'), play.indexOf('private async outCard'));
  const auto = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private operationTypeForCards'));
  assert.match(cache, /synchronizeAuthorityComparison\(\)/);
  assert.match(auto, /synchronizeAuthorityComparison\(setInfo\)/);
});

test('manual hint uses the authoritative trick reset instead of stale local response state', () => {
  assert.match(play, /private tip\(\): void \{[\s\S]*this\.cancelAutoPlay\(\)[\s\S]*this\.logic\.ChangeSelectCard\(tips\[this\.tipIndex\]\)/);
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
  const auto = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private maybeAutoPlay'));
  assert.match(auto, /const required = leading \? this\.activeRequiredFirstCard\(\) : 0/);
  assert.match(auto, /legal\.filter\(\(cards\) => cards\.includes\(required\)\)/);
});

test('last-hand autoplay directly validates the exact whole hand on lead and response turns', () => {
  const authority = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private maybeAutoPlay'));
  assert.match(authority, /const leading =/);
  assert.match(authority, /const wholeHandType = this\.operationTypeForCards\(hand\)/);
  assert.match(authority, /const wholeHandAllowed = this\.isWholeHandTypeEnabled\(wholeHandType\)/);
  assert.match(authority, /required <= 0 \|\| hand\.includes\(required\)/);
  assert.doesNotMatch(authority, /if \(!leading && \(required/);
  assert.match(authority, /this\.maybeAutoPlay\(latestSet, true, \{ cards: hand, opType: wholeHandType \}\)/);
  assert.ok(authority.indexOf('const wholeHandType') < authority.indexOf('const localSource'));
  assert.ok(authority.indexOf('if (leading) return') < authority.indexOf('if (tips.length > 0)'));
});

test('a complete legal response candidate auto-plays even when exact-hand preclassification was conservative', () => {
  const authority = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'),
    play.indexOf('private isWholeHandTypeEnabled'));
  assert.match(authority, /tips\.find\(\(cards\) => this\.sameCards\(cards, hand\)\)/);
  assert.match(authority, /this\.intrinsicOperationTypeForCards\(completeResponse\)/);
  assert.match(authority, /source: 'AUTHORITY_LEGAL_CANDIDATE'/);
  assert.match(authority, /this\.maybeAutoPlay\(latestSet, true/);
});

test('last-hand autoplay rejects disabled four-with-three before and after its delay', () => {
  const policy = play.slice(play.indexOf('private isWholeHandTypeEnabled'),
    play.indexOf('private isAutomaticWholeHand'));
  assert.match(policy, /case 10:[\s\S]*rules\.allowFourWithThree === true/);
  const auto = play.slice(play.indexOf('private maybeAutoPlay'), play.indexOf('private isFormalCardPlayPhase'));
  assert.match(auto, /const latestOpType = this\.operationTypeForCards\(latestHand\)/);
  assert.match(auto, /latestOpType <= 0 \|\| !this\.isAutomaticWholeHandCandidate\(latestHand, latestOpType\)/);
  assert.match(auto, /this\.outCard\(opType, true\)/);
});

test('scoring bombs are never auto-played as a four-with attachment family', () => {
  const policy = play.slice(play.indexOf('private isWholeHandTypeEnabled'),
    play.indexOf('private isAutomaticWholeHand'));
  assert.match(policy, /const scoringBomb = String\(rules\.bombScoreMode \?\? 'DISABLED'\) !== 'DISABLED'/);
  for (const opType of [8, 9, 10, 20]) {
    assert.match(policy, new RegExp(`case ${opType}:[\\s\\S]*?!scoringBomb`));
  }
  assert.doesNotMatch(policy, /case 11:[\s\S]*!scoringBomb/,
    'a standalone final bomb remains eligible for final-hand autoplay');
});

test('physical regional bomb cannot carry extra cards in whole-hand autoplay', () => {
  const guard = play.slice(play.indexOf('private isAutomaticWholeHandCandidate'),
    play.indexOf('/** The atomic table snapshot'));
  assert.match(guard, /isAtomicPdkWholeHandCandidate\(cards, this\.protectedBombGroups\(\)\)/);
  assert.match(play, /import \{[^}]*isAtomicPdkWholeHandCandidate[^}]*\} from '\.\/logic\/PdkCleanHintRanker'/);

  const authority = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'),
    play.indexOf('private operationTypeForCards'));
  assert.match(authority, /this\.isAutomaticWholeHandCandidate\(hand, wholeHandType\)/);
  assert.match(authority, /this\.isAutomaticWholeHandCandidate\(completeResponse, completeType\)/);

  const auto = play.slice(play.indexOf('private isAutomaticWholeHand'),
    play.indexOf('private isFormalCardPlayPhase'));
  assert.match(auto, /this\.isAutomaticWholeHandCandidate\(hand, opType\)/);
  assert.match(auto, /this\.isAutomaticWholeHandCandidate\(latestHand, latestOpType\)/);
});

test('last-hand autoplay is delayed, turn-scoped, and submits through common.room.play_req once', () => {
  const auto = play.slice(play.indexOf('private maybeAutoPlay'), play.indexOf('private startClockFromSetInfo'));
  assert.match(auto, /AUTO_PLAY_SELECTION_DELAY_MS/);
  assert.match(play, /const AUTO_PLAY_SELECTION_DELAY_MS = 600/);
  assert.match(auto, /this\.autoPlayTurnKey === turnKey/);
  assert.match(auto, /this\.outCard\(opType, true\)/);
  assert.match(auto, /setInfo\.trickId/);
  assert.match(auto, /deadline\?\.operationId/);
  assert.match(auto, /latestOperationId === this\.autoPlayOperationId/);
  assert.doesNotMatch(auto, /stillLocalTurn[\s\S]{0,180}this\.activeOpPos === this\.clientSeat\(\)/);
  const lifecycle = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/Room/RoomLifecycleController.ts'), 'utf8');
  assert.match(lifecycle, /common\.room\.play_req/);
});

test('same authority operation survives state-version and legacy seat projection races', () => {
  const refresh = play.slice(play.indexOf('private refresh()'), play.indexOf('private centerOperationButtons'));
  const key = play.slice(play.indexOf('private autoPlayKey'), play.indexOf('private sameCards'));
  assert.match(play, /private autoPlayOperationId = ''/);
  assert.match(refresh, /authorityOperationId === this\.autoPlayOperationId/);
  assert.match(refresh, /authorityTurnSeat === positions\.GetClientPos\(\)/);
  assert.doesNotMatch(key, /stateVersion/);
  assert.doesNotMatch(key, /this\.activeOpPos/);
});

test('a rejected last-hand autoplay restores manual operation buttons for the same turn', () => {
  const visibility = play.slice(play.indexOf('private isAutomaticWholeHand'),
    play.indexOf('private maybeAutoPlay'));
  const auto = play.slice(play.indexOf('private maybeAutoPlay'), play.indexOf('private isFormalCardPlayPhase'));
  assert.match(play, /private autoPlayRejectedTurnKey = ''/);
  assert.match(visibility, /this\.autoPlayRejectedTurnKey !== this\.autoPlayKey\(setInfo, hand\)/);
  assert.match(auto, /this\.autoPlayRejectedTurnKey === turnKey/);
  assert.match(auto, /\.catch\(\(error: unknown\) => \{[\s\S]*this\.autoPlayRejectedTurnKey = turnKey/);
  assert.ok(auto.indexOf('this.autoPlayRejectedTurnKey = turnKey') < auto.lastIndexOf('this.refresh()'));
});
