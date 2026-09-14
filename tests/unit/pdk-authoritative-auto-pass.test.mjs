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
test('automatic hint waits for both hand and table projection so every card type stays raised', () => {
  const state = play.slice(play.indexOf("if (event === 'CommonPdk_AuthoritativeState')"), play.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(state, /Promise\.all\(\[handRender, settledPublicPresentation\]\)[\s\S]*autoHintForAuthoritativeTurn\(setInfo\)/);
  assert.ok(state.indexOf('Promise.all([handRender, settledPublicPresentation])') < state.indexOf('autoHintForAuthoritativeTurn(setInfo)'));
});
test('automatic hint stays turn-scoped but replaces a stale manual selection', () => {
  assert.doesNotMatch(play, /selectionUnchanged/);
  assert.match(play, /if \(!stillCurrent \|\| this\.autoPlayInFlight\) return/);
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
  assert.match(state, /const targetCards = Array\.isArray\(setInfo\.cardList\)/);
  assert.match(state, /this\.logic\.SetCardData\(targetType, targetCards\)/);
  const auto = play.slice(play.indexOf('private async autoHintForAuthoritativeTurn'), play.indexOf('private maybeAutoPlay'));
  assert.match(auto, /if \(tips\.length > 0\)[\s\S]*ChangeSelectCard\(\[\]\)[\s\S]*await this\.pass\(\)/);
  assert.match(play, /this\.cards\.clearSelectionImmediately\(this\.cardNodes\)/);
});

test('lastActions presentation also restores the current trick before automatic hinting', () => {
  const restore = play.slice(play.indexOf('private restorePublicCards'), play.indexOf('private async restoreLastActions'));
  const historyBranch = restore.slice(restore.indexOf('if (Array.isArray(packet.lastActions))'));
  assert.match(historyBranch, /this\.record\(packet\.currentTrick\)/);
  assert.match(historyBranch, /Array\.isArray\(packet\.cardList\)/);
  assert.match(historyBranch, /packet\.opCardType \?\? packet\.opType/);
  assert.match(historyBranch, /this\.logic\.SetCardData\(currentType, currentCards\)/);
  assert.match(historyBranch, /return this\.restoreLastActions/);
  assert.ok(historyBranch.indexOf('SetCardData(currentType, currentCards)') < historyBranch.indexOf('return this.restoreLastActions'));
});

test('authority adapter falls back to the last played action when currentTrick is omitted', () => {
  assert.match(adapter, /const lastActions = Array\.isArray\(source\.lastActions\)/);
  assert.match(adapter, /const lastAction = record\(lastActions\.at\(-1\)\)/);
  assert.match(adapter, /const effectiveTrick = cardValues\(currentTrick\.cards\)\.length > 0 \? currentTrick : lastAction/);
  assert.match(adapter, /const publicCards = cardValues\(effectiveTrick\.cards\)/);
  assert.match(adapter, /effectiveTrick\.cardType/);
  assert.match(adapter, /playedCardList,/);
  assert.match(play, /presentLatestAuthorityAction\(setInfo\)[\s\S]*\.then\(\(\) => this\.restoreTableCards\(setInfo\)\)/);
});

test('a committed trick reset clears lead state without reopening a duplicate authority hint', () => {
  const boundary = play.slice(play.indexOf('private applyAuthoritativeTurnBoundary'), play.indexOf('private restorePublicCards'));
  assert.match(boundary, /this\.logic\.ChangeSelectCard\(\[\]\)/);
  assert.match(boundary, /this\.resetPromptCycle\(\)/);
  assert.match(boundary, /if \(trickReset\) \{[\s\S]*this\.logic\.ClearCardData\(\)/);
  assert.doesNotMatch(boundary, /this\.autoHintTurnKey = ''/);
  assert.match(boundary, /stateVersion > submitted\.stateVersion/);
  assert.match(boundary, /this\.playInFlight = false;[\s\S]*this\.playRequestScope = null/);
  const out = play.slice(play.indexOf('private async outCard'), play.indexOf('private prepareOwnFlightCards'));
  assert.match(out, /const scope = \{ roomId, stateVersion, trickId, operationId \}/);
  assert.match(out, /Number\(setInfo\.opPos \?\? deadline\?\.seatId \?\? -1\) !== this\.clientSeat\(\)/);
  assert.match(out, /await this\.lifecycle\.play\(roomId/);
  assert.match(out, /let requestAccepted = false/);
  assert.match(out, /requestAccepted = true/);
  assert.match(out, /if \(!requestAccepted\) this\.refresh\(\)/);
  assert.ok(out.indexOf('this.flyCardsToOwnAction(flyingCards)') < out.indexOf('await this.lifecycle.play(roomId'));
  assert.ok(out.indexOf('await this.lifecycle.play(roomId') < out.indexOf('this.playInFlight = false'));
});

test('same-turn authority refresh preserves a visible selection and local flight swaps without overlap', () => {
  const boundary = play.slice(play.indexOf('private applyAuthoritativeTurnBoundary'), play.indexOf('private restorePublicCards'));
  assert.match(boundary, /const selectionKey =/);
  assert.match(boundary, /if \(selectionKey !== this\.selectionAuthorityKey\)/);
  const render = play.slice(play.indexOf('private async renderPublicOperation'), play.indexOf('private async presentPublicOperation'));
  assert.match(render, /await this\.ownCardFlight[\s\S]*card\.parent = parent[\s\S]*this\.ownLandingCards\.length = 0/);
  assert.doesNotMatch(render, /dataSeat === this\.clientSeat\(\)\) this\.clearOwnLandingCards\(\)/);
  assert.doesNotMatch(render, /clearOwnOutgoingSlot\(\)/);
});

test('manual card selection is unrestricted and play legality is submitted to Authority', () => {
  const selection = play.slice(play.indexOf('private async toggleCardAt'), play.indexOf('private async toggleSingleResponseCard'));
  assert.match(selection, /CheckSelected[\s\S]*DeleteCardSelected[\s\S]*SetCardSelected/);
  assert.doesNotMatch(selection, /GetLastCardType|strictly|locallyLegal/);
  const drag = play.slice(play.indexOf('private commitSmartDragSelection'), play.indexOf('private largestLegalDragCandidates'));
  assert.match(drag, /largestLegalDragCandidates\(gesturePool\)\[0\]/);
  const out = play.slice(play.indexOf('private async outCard'), play.indexOf('private prepareOwnFlightCards'));
  assert.match(out, /this\.selectedIntrinsicType\(\)/);
  assert.doesNotMatch(out, /下家报单只能出最大单张|requiredFirstCard > 0/);
  assert.match(play, /card type\|pattern\|attachment\|invalid play\|牌型[\s\S]*showMessage\('牌型错误'\)/);
});

test('manual hint uses the authoritative trick reset instead of stale local response state', () => {
  assert.match(play, /private tip\(\): void \{[\s\S]*this\.cancelAutoPlay\(\)[\s\S]*this\.logic\.ChangeSelectCard\(tips\[this\.tipIndex\]\)/);
  assert.match(play, /private prepareHintCache\(\): void \{[\s\S]*const leading = this\.isAuthoritativeLeadingTurn\(\)/);
  assert.match(play, /if \(leading && \(this\.logic\.GetLastCardType\(\) !== 0 \|\| this\.logic\.lastCardList\.length > 0\)\) \{\s*this\.logic\.ClearCardData\(\)/);
  const leading = play.slice(play.indexOf('private isAuthoritativeLeadingTurn'), play.indexOf('private async autoHintForAuthoritativeTurn'));
  assert.match(leading, /setInfo\.currentTrick/);
  assert.match(leading, /cards\.length === 0 \|\| type <= 0/);
  assert.doesNotMatch(leading, /lastActions|actions\?\.length === 0/);
  const restore = play.slice(play.indexOf('private restorePublicCards'), play.indexOf('private async restoreLastActions'));
  assert.match(restore, /packet\.lastActions\.length === 0[\s\S]*currentTrick[\s\S]*SetCardData\(currentType, currentCards\)[\s\S]*renderPublicOperation/);
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
  assert.match(authority, /required <= 0 \|\| hand\.includes\(required\)/);
  assert.match(authority, /this\.maybeAutoPlay\(latestSet, true, \{ cards: hand, opType: wholeHandType \}\)/);
  assert.ok(authority.indexOf('const wholeHandType') < authority.indexOf('const localSource'));
  assert.ok(authority.indexOf('if (leading) return') < authority.indexOf('if (tips.length > 0)'));
});

test('last-hand autoplay is delayed, turn-scoped, and submits through common.room.play_req once', () => {
  const auto = play.slice(play.indexOf('private maybeAutoPlay'), play.indexOf('private startClockFromSetInfo'));
  assert.match(auto, /AUTO_PLAY_SELECTION_DELAY_MS/);
  assert.match(play, /const AUTO_PLAY_SELECTION_DELAY_MS = 600/);
  assert.match(auto, /this\.autoPlayTurnKey === turnKey/);
  assert.match(auto, /this\.outCard\(opType\)/);
  assert.match(auto, /setInfo\.trickId/);
  assert.match(auto, /deadline\?\.operationId/);
  const lifecycle = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/Room/RoomLifecycleController.ts'), 'utf8');
  assert.match(lifecycle, /common\.room\.play_req/);
});
