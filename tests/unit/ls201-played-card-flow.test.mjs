import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../assets/Games/Poker/PDK/', import.meta.url);
const flow = readFileSync(new URL('LSPDK/Code/LS201PlayedCardFlow.ts', root), 'utf8');
const controller = readFileSync(new URL('Common/Code/Runtime/CommonPdkPlayController.ts', root), 'utf8');
const coordinator = readFileSync(new URL('Common/Code/Runtime/CommonPdkSwitchCoordinator.ts', root), 'utf8');
const retainedLayout = readFileSync(new URL('Common/Code/Runtime/Room/PdkRetainedPlayedCardFlow.ts', root), 'utf8');
const roundLifecycle = readFileSync(new URL('Common/Code/Runtime/Room/PdkRoundPresentationLifecycle.ts', root), 'utf8');
const nodePaths = readFileSync(new URL('Common/Code/Runtime/Room/PdkRoomNodePaths.ts', root), 'utf8');
const prefab = JSON.parse(readFileSync(new URL('Common/Prefab/PDK_CommonRoom.prefab', root), 'utf8'));

test('LS201 alone moves the live Out_Card nodes into Table_Cards after a fixed two-second hold', () => {
  assert.match(flow, /const OUT_CARD_HOLD_MS = 2000/);
  assert.match(flow, /pendingHoldReleases = new Set<\(\) => void>/);
  assert.match(flow, /public flushPendingHolds\(\): void/);
  assert.match(flow, /public async waitForPendingTransfers\(\): Promise<void>/);
  assert.match(flow, /public async finishPendingImmediately\(\): Promise<void>/);
  assert.match(flow, /public async cancelPendingForSettlement\(\): Promise<void>/);
  assert.match(flow, /this\.flushPendingHolds\(\)[\s\S]*this\.pendingTransferFinishes/);
  assert.match(flow, /private readonly activeTransfers = new Set<Promise<void>>\(\)/);
  assert.match(flow, /this\.pendingHoldReleases\.add\(finish\)/);
  assert.match(flow, /request\.outCard\.children\.filter/);
  assert.match(flow, /child\.name !== 'PlayCount'/);
  assert.match(flow, /const holdLayer = request\.outCard\.parent/);
  assert.match(flow, /hand\.parent = holdLayer/);
  assert.match(flow, /for \(const card of cards\) card\.parent = hand/);
  assert.match(flow, /layoutPdkRetainedHand\(hand, cards, request\.outCard\.getComponent\(Layout\)\?\.spacingX \?\? 0\)/);
  assert.doesNotMatch(flow, /HAND_CARD_SPACING_X/);
  assert.match(flow, /outerLayout\.enabled = false/);
  assert.match(flow, /tween\(card\)\.to\(MOVE_TO_ARRANGEMENT_SECONDS/);
  assert.match(flow, /Tween\.stopAllByTarget\(card\)[\s\S]*card\.setPosition\(targets\[index\]\.position\)/);
  assert.match(flow, /this\.addStoppedPlayCount\(hand,[\s\S]*request\.playIndex\)/);
  const liveMove = flow.slice(flow.indexOf('const starts = cards.map'), flow.indexOf('public addStoppedPlayCount'));
  assert.doesNotMatch(liveMove.slice(0, liveMove.indexOf('const transfer = Promise.all')), /addStoppedPlayCount/);
  assert.match(flow, /PlayCount_\$\{playIndex\}/);
  assert.match(flow, /tableCards\?\.getChildByName\(nodeName\)/);
  assert.match(flow, /\?\? instantiate\(countTemplate\)/);
  assert.match(flow, /label\.string = String\(playIndex\)/);
  assert.match(flow, /positionPdkPlayCount\(count, cards\)/);
  assert.match(retainedLayout, /PDK_PLAY_COUNT_RIGHT_INSET = 0/);
  assert.match(retainedLayout, /count\.parent = tableCards/);
  assert.match(retainedLayout, /child\.name\.startsWith\('PlayCount_'\)/);
  assert.match(retainedLayout, /badge\.setSiblingIndex\(tableCards\.children\.length - 1\)/);
  assert.match(retainedLayout, /tableCards\.getChildByName\(`PlayCount_\$\{playIndex\}`\)/);
  assert.match(retainedLayout, /positionPdkPlayCount\(badge, hand\.children\.filter/);
  assert.match(liveMove, /await transfer;[\s\S]*this\.addStoppedPlayCount\(hand/);
  assert.match(retainedLayout, /const cardBounds = cardTransform\.getBoundingBoxToWorld\(\)/);
  assert.match(retainedLayout, /cardBounds\.yMin \+ countHeight \* countTransform\.anchorPoint\.y/);
  assert.match(retainedLayout, /cardBounds\.xMax - PDK_PLAY_COUNT_RIGHT_INSET/);
  assert.match(retainedLayout, /return leftEdge - rightEdge/);
  assert.doesNotMatch(flow, /lastCard\.position\.y - 12/);
  assert.doesNotMatch(flow, /cards\.create/);
  assert.match(controller, /retainedPlayedCardFlow\?\.moveAfterLiveHold/);
  assert.match(controller, /Players\/Play_\$\{entry\.physicalSlot\}\/Card\/Table_Cards/);
  assert.doesNotMatch(controller, /Card\/Out_Card\/Table_Cards/);
  assert.match(nodePaths, /playCountTemplate: 'RoomCommon\/PlayCount'/);
  assert.match(controller, /playCountTemplate: this\.view\.find\(PdkRoomNodePath\.playCountTemplate\)/);
  assert.match(controller, /private clearOutCardPlayCount\(parent: Node \| null\)/);
  assert.match(controller, /child\.name === 'PlayCount' \|\| child\.name\.startsWith\('PlayCount_'\)/);
  assert.doesNotMatch(controller, /private updateOutCardPlayIndex/);
  assert.doesNotMatch(controller, /Table_Cards'\)\?\.getChildByName\('PlayCount'\)/);
  assert.match(controller, /outCard\.active = visible/);
  assert.match(controller, /if \(shouldAdvancePrecedingPresentation\) \{[\s\S]*this\.retainedPlayedCardFlow\?\.flushPendingHolds\(\)/);
  assert.match(controller, /await this\.retainedPlayedCardFlow\?\.waitForPendingTransfers\(\)/);
  assert.doesNotMatch(controller.slice(controller.indexOf('private async presentPublicOperation'),
    controller.indexOf('private async presentLatestAuthorityAction')), /appendTableCards\(packet\)/);
  assert.match(controller, /dataSeat === this\.activeOpPos && !this\.runtime\.arrangementEnabled\(\)/);
  assert.doesNotMatch(controller, /HISTORY_MOVE_DELAY_MS/);
  assert.ok(flow.indexOf('const cards = request.outCard.children.filter')
    < flow.indexOf('await new Promise<void>((resolve)'));
  assert.ok(flow.indexOf('hand.parent = holdLayer')
    < flow.indexOf('await new Promise<void>((resolve)'));
  assert.ok(flow.indexOf('hand.parent = request.tableCards')
    > flow.indexOf('await new Promise<void>((resolve)'));
  assert.doesNotMatch(flow, /card\.parent !== request\.outCard/);
  assert.match(flow, /request\.outCard\.active = request\.outCard\.children\.some/);
  assert.match(coordinator, /runtime\.getGameCode\(\) === PDK_BUSINESS_CODES\.LIANGSHAN[\s\S]*new LS201PlayedCardFlow\(\)/);
});

test('terminal settlement cancels a transient final hand instead of archiving it', () => {
  const cancel = flow.slice(flow.indexOf('public async cancelPendingForSettlement'),
    flow.indexOf('public async moveAfterLiveHold'));
  const truncate = controller.slice(controller.indexOf('public async truncateRoundEndPresentation'),
    controller.indexOf('public async waitForInitialPresentation'));
  assert.match(flow, /private readonly transientHands = new Set<Node>\(\)/);
  assert.match(flow, /this\.transientHands\.add\(hand\)/);
  assert.match(cancel, /if \(hand\.isValid\) \{[\s\S]*hand\.removeFromParent\(\);[\s\S]*hand\.destroy\(\)/);
  assert.match(cancel, /this\.flushPendingHolds\(\)/);
  assert.match(cancel, /this\.pendingTransferFinishes/);
  assert.match(truncate, /this\.endRoundPresentation\('SET_END'\)/);
  assert.doesNotMatch(truncate, /finishPendingImmediately\(\)/);
});

test('an old public-operation continuation cannot adopt the next round lease', () => {
  const presentation = controller.slice(controller.indexOf('private async presentPublicOperation'),
    controller.indexOf('private resolveAuthorityPlayIndex'));
  const capture = presentation.indexOf('const lease = this.roundPresentation.lease()');
  const render = presentation.indexOf('const landing = this.rememberLatestPublicCardLanding(this.renderPublicOperation(packet))');
  const boundary = presentation.indexOf('!this.roundPresentation.isCurrent(lease)');
  const move = presentation.indexOf('retainedPlayedCardFlow?.moveAfterLiveHold');
  assert.ok(capture >= 0 && capture < render);
  assert.ok(boundary > render && boundary < move);
});

test('a transfer completing after the round boundary cannot restore its card or PlayCount', () => {
  const afterTransfer = flow.slice(flow.indexOf('await transfer;'),
    flow.indexOf('public addStoppedPlayCount'));
  const ownership = afterTransfer.indexOf('!request.isCurrent()');
  const detach = afterTransfer.indexOf('hand.removeFromParent()');
  const badge = afterTransfer.indexOf('this.addStoppedPlayCount');
  assert.ok(ownership >= 0 && ownership < badge);
  assert.ok(detach > ownership && detach < badge);
  const cancellation = flow.slice(flow.indexOf('public async cancelPendingForRoundBoundary'),
    flow.indexOf('public async moveAfterLiveHold'));
  assert.match(cancellation, /hand\.removeFromParent\(\);\s*hand\.destroy\(\)/);
});

test('next-round ownership is represented by one lifecycle rather than a cross-round id cache', () => {
  const boundary = controller.slice(controller.indexOf('private acceptPresentationRound'),
    controller.indexOf('private clearTableCards'));
  const live = controller.slice(controller.indexOf('private async presentLatestAuthorityAction'),
    controller.indexOf('private async presentNewAuthorityAction'));
  assert.match(controller, /roundPresentation = new PdkRoundPresentationLifecycle\(\)/);
  assert.match(boundary, /this\.roundPresentation\.accept/);
  assert.doesNotMatch(controller, /previousRoundActionIds/);
  assert.match(live, /this\.roundPresentation\.isCurrent\(expectedLease\)/);
  assert.match(roundLifecycle, /public end\(\)/);
  assert.match(roundLifecycle, /this\.revision \+= 1/);
  assert.match(roundLifecycle, /this\.active = false/);
});

test('a rapid next play releases the preceding shared Out_Card without blocking its own flight', () => {
  const play = controller.slice(controller.indexOf('private async outCard('),
    controller.indexOf('private selectedIntrinsicType'));
  const flush = play.indexOf('this.retainedPlayedCardFlow?.flushPendingHolds()');
  const prepare = play.indexOf('this.prepareOwnFlightCards(selectedNodes)');
  const fly = play.indexOf('this.flyCardsToOwnAction(flyingCards)');
  assert.ok(flush >= 0 && prepare > flush && fly > prepare);
  assert.match(play, /await precedingOwnCardFlight/);
  assert.doesNotMatch(play, /await Promise\.allSettled\(precedingTablePresentations\)/);
  assert.match(play, /void this\.advanceLatestAuthorityPlayToRetained\(setInfo\)/);
});

test('a recovery copy cannot coexist with physical Out_Card nodes for the same operation', () => {
  assert.match(flow, /const retainedHand = request\.tableCards\.getChildByName\(nodeName\)/);
  assert.match(flow, /if \(retainedHand\) \{[\s\S]*retainedHand\.removeFromParent\(\)[\s\S]*retainedHand\.destroy\(\)/);
  const collision = flow.slice(flow.indexOf('const retainedHand = request.tableCards.getChildByName(nodeName)'),
    flow.indexOf('const landingPoses'));
  assert.doesNotMatch(collision, /return true/);
  assert.doesNotMatch(flow, /const recoveredHand = request\.tableCards\.getChildByName\(nodeName\)/);
  assert.match(controller, /const existingHand = parent\.getChildByName\(nodeName\)/);
  assert.match(controller, /if \(existingHand\) \{[\s\S]*addStoppedPlayCount\([\s\S]*existingHand,[\s\S]*Number\(packet\.playIndex \?\? 0\)[\s\S]*layoutPdkRetainedHands\(parent\)/);
});

test('automatic final hand may advance only an existing preceding hold and always keeps its own hold', () => {
  const play = controller.slice(controller.indexOf('private async outCard('),
    controller.indexOf('private selectedIntrinsicType'));
  assert.match(controller, /private hasUnretainedLatestAuthorityPlay[\s\S]*`Play_\$\{operationId\}`/);
  assert.match(play, /hasPrecedingAuthorityPresentation[\s\S]*void this\.advanceLatestAuthorityPlayToRetained\(setInfo\)/);
  assert.match(controller, /private async advanceLatestAuthorityPlayToRetained[\s\S]*flushPendingHolds\(\)[\s\S]*waitForPendingTransfers/);
  assert.doesNotMatch(flow, /releaseNextHold/);
  assert.match(flow, /request\.outCard\.active = request\.outCard\.children\.some[\s\S]*await new Promise<void>/);
  assert.match(flow, /const timeout = globalThis\.setTimeout\(finish, OUT_CARD_HOLD_MS\)/);
});

test('a retained operation releases the shared Out_Card before its hold and movement', () => {
  const claim = flow.indexOf('for (const card of cards) card.parent = hand');
  const release = flow.indexOf('request.outCard.active = request.outCard.children.some');
  const hold = flow.indexOf('await new Promise<void>');
  const archive = flow.indexOf('hand.parent = request.tableCards');
  const transfer = flow.indexOf('const transfer = Promise.all');
  assert.ok(claim >= 0 && release > claim && hold > release && archive > hold && transfer > archive);
});

test('an operation that loses its round lease destroys retained nodes before PlayCount', () => {
  const claim = flow.indexOf('for (const card of cards) card.parent = hand');
  const owned = flow.slice(claim, flow.indexOf('public addStoppedPlayCount'));
  assert.ok(claim >= 0);
  assert.match(owned, /!request\.isCurrent\(\)/);
  assert.match(owned, /if \(hand\.isValid\) \{\s*hand\.removeFromParent\(\);\s*hand\.destroy\(\);\s*\}[\s\S]*return false/);
  assert.match(owned, /this\.addStoppedPlayCount\(hand, request\.playCountTemplate, request\.playIndex\)/);
});

test('retained hands are laid out by authoritative playIndex rather than async creation order', () => {
  assert.match(retainedLayout, /const retainedPlayIndexes = new WeakMap<Node, number>\(\)/);
  assert.match(retainedLayout, /setPdkRetainedPlayIndex\(hand: Node, playIndex: number\)/);
  assert.match(retainedLayout, /playIndex: retainedPlayIndexes\.get\(hand\)/);
  assert.match(retainedLayout, /left\.playIndex - right\.playIndex/);
  assert.match(flow, /setPdkRetainedPlayIndex\(hand, request\.playIndex\)/);
  assert.match(controller, /setPdkRetainedPlayIndex\(hand, Number\(packet\.playIndex \?\? 0\)\)/);
});

test('PlayCount has one root template and no per-seat prefab copies', () => {
  const nodes = prefab.filter((entry) => entry?.__type__ === 'cc.Node');
  const templates = nodes.filter((entry) => entry._name === 'PlayCount');
  assert.equal(templates.length, 1);
  const template = templates[0];
  assert.equal(prefab[template._parent.__id__]._name, 'RoomCommon');
  assert.equal(template._active, false);
});

test('retained hands use a 2px outer gap while cards keep the Out_Card overlap', () => {
  assert.match(retainedLayout, /PDK_RETAINED_HAND_GAP = 2/);
  assert.match(retainedLayout, /if \(automatic\) automatic\.enabled = false/);
  assert.match(retainedLayout, /automatic\?\.horizontalDirection === Layout\.HorizontalDirection\.RIGHT_TO_LEFT/);
  assert.match(flow, /layoutPdkRetainedHands\(request\.tableCards\)/);
  assert.match(controller, /layoutPdkRetainedHands\(parent\)/);
  assert.match(flow, /request\.outCard\.getComponent\(Layout\)\?\.spacingX/);
  assert.match(controller, /getChildByName\('Out_Card'\)\?\.getComponent\(Layout\)\?\.spacingX/);
  assert.match(retainedLayout, /const firstCenter = -\(\(cards\.length - 1\) \* step\) \/ 2/);
  assert.match(retainedLayout, /rightToLeft \? cursor - width \/ 2 : cursor \+ width \/ 2/);
  assert.match(retainedLayout, /rightToLeft \? -1 : 1/);
  assert.match(retainedLayout, /let cursor = 0/);
  assert.doesNotMatch(retainedLayout, /rightToLeft \? totalWidth \/ 2 : -totalWidth \/ 2/);
});

test('duplicate authority refreshes wait for the same physical Liangshan transfer', () => {
  assert.match(controller, /tableActionPresentations = new Map<string, Promise<void>>/);
  assert.match(controller, /const existingPresentation = this\.tableActionPresentations\.get\(actionKey\);[\s\S]*await existingPresentation/);
  assert.match(controller, /this\.tableActionPresentations\.set\(actionKey, presentation\)/);
  assert.match(controller, /await presentation/);
});

test('coalesced live authority operations are all physically presented in ledger order', () => {
  const live = controller.slice(controller.indexOf('private async presentLatestAuthorityAction'),
    controller.indexOf('private async presentNewAuthorityAction'));
  assert.match(live, /for \(const value of actions\)/);
  assert.match(live, /const action = this\.record\(value\)/);
  assert.match(live, /const presentation = this\.presentNewAuthorityAction\(action, isPlay \? playIndex : 0\)/);
  assert.doesNotMatch(live, /actions\.at\(-1\)/);
});

test('every committed play receives its ordinal from the complete authority ledger', () => {
  const live = controller.slice(controller.indexOf('private async presentLatestAuthorityAction'),
    controller.indexOf('private async presentNewAuthorityAction'));
  const restore = controller.slice(controller.indexOf('private async restoreTableCards'),
    controller.indexOf('private showCurrentPlayArrow'));
  assert.match(live, /let playIndex = 0/);
  assert.match(live, /isPlay[\s\S]*playIndex \+= 1/);
  assert.match(live, /presentNewAuthorityAction\(action, isPlay \? playIndex : 0\)/);
  assert.match(controller, /playIndex: authorityPlayIndex/);
  assert.match(restore, /let playIndex = 0/);
  assert.match(restore, /cards\.length === 0[\s\S]*playIndex \+= 1/);
  assert.match(restore, /playIndex,\n\s*}, expectedLease/);
  assert.match(controller, /private resolveAuthorityPlayIndex\(operationId: string, fallback: number\)/);
  assert.match(controller, /playIndex: this\.resolveAuthorityPlayIndex\(operationId, Number\(packet\.playIndex \?\? 0\)\)/);
  assert.match(controller, /tableOperations[\s\S]*playIndex \+= 1;[\s\S]*operationId\) return playIndex/);
});

test('the final committed play uses the live Out_Card pipeline while history restoration stays reconnect-only', () => {
  const authority = controller.slice(controller.indexOf("event === 'CommonPdk_AuthoritativeState'"),
    controller.indexOf("event === 'CommonPdkSetStart'"));
  const arrangement = authority.slice(authority.indexOf('this.runtime.arrangementEnabled()'),
    authority.indexOf(': this.reconcileAuthorityPublicCards(setInfo)'));
  assert.match(arrangement, /this\.presentLatestAuthorityAction\(setInfo, snapshotPresentationLease\)/);
  assert.doesNotMatch(arrangement, /this\.restoreTableCards\(setInfo\)/);
  assert.doesNotMatch(arrangement, /presentLatestAuthorityAction\(setInfo\)[\s\S]*\.then\(\(\) => this\.restoreTableCards/);
  assert.doesNotMatch(arrangement, /formalCardPlayPhase[\s\S]*\? this\.presentLatestAuthorityAction/);
});

test('a consecutive own lead cannot be restored directly into Table_Cards', () => {
  const authority = controller.slice(controller.indexOf("event === 'CommonPdk_AuthoritativeState'"),
    controller.indexOf("event === 'CommonPdkSetStart'"));
  assert.match(authority, /const snapshotOwnCardFlight = this\.ownCardFlight/);
  assert.match(authority, /await snapshotOwnCardFlight/);
  assert.match(authority, /this\.ownCardFlight === snapshotOwnCardFlight/);
  assert.doesNotMatch(authority, /finally\(async \(\) => \{\s*await this\.ownCardFlight/);

  const restore = controller.slice(controller.indexOf('private async restoreTableCards'),
    controller.indexOf('private showCurrentPlayArrow'));
  assert.match(restore, /const actionKey = this\.authorityActionKey\(operation\)/);
  assert.match(restore, /this\.tableActionPresentations\.has\(actionKey\)[\s\S]*continue/);
  assert.ok(restore.indexOf('tableActionPresentations.has(actionKey)')
    < restore.indexOf('await this.appendTableCards'));
});

test('a new authoritative round clears the previous retained archive before projecting cards', () => {
  const authority = controller.slice(controller.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    controller.indexOf("} else if (event === 'CommonPdkSetStart')"));
  assert.match(controller, /private readonly roundPresentation = new PdkRoundPresentationLifecycle\(\)/);
  assert.match(authority, /const roundAcceptance = this\.acceptPresentationRound\(setInfo, 'AUTHORITY_STATE'\)/);
  assert.match(controller, /if \(!acceptance\.changed && acceptance\.previousKey\) return acceptance;[\s\S]*this\.clearRoundPresentationNodes\(\)/);
  assert.match(authority, /this\.runtime\.arrangementEnabled\(\)[\s\S]*this\.presentLatestAuthorityAction\(setInfo, snapshotPresentationLease\)/);
  assert.doesNotMatch(authority, /presentLatestAuthorityAction\(setInfo\)[\s\S]*\.then\(\(\) => this\.restoreTableCards/);
  assert.match(controller, /private clearRoundPresentationNodes\(\): Promise<void> \{[\s\S]*this\.authorityActionsInitialized = false/);
});

test('the new-round boundary suppresses only retained history and keeps ordinary current-play projection', () => {
  const authority = controller.slice(controller.indexOf("if (event === 'CommonPdk_AuthoritativeState')"),
    controller.indexOf("} else if (event === 'CommonPdkSetStart')"));
  const accept = controller.slice(controller.indexOf('private acceptPresentationRound'),
    controller.indexOf('private clearTableCards'));
  assert.match(authority, /const roundPresentationChanged = roundAcceptance\.changed/);
  assert.match(authority,
    /const skipStaleRetainedLedger = roundPresentationChanged\s*&& this\.runtime\.arrangementEnabled\(\)/);
  assert.match(authority, /!projectRoundCards \|\| skipStaleRetainedLedger\s*\? Promise\.resolve\(\)/);
  assert.match(authority, /: this\.reconcileAuthorityPublicCards\(setInfo\)/,
    'ordinary PDK must still project comparisonState when this observer first accepts the deal');
  assert.doesNotMatch(authority,
    /!projectRoundCards \|\| roundPresentationChanged\s*\? Promise\.resolve\(\)/);
  assert.match(accept, /if \(!acceptance\.changed && acceptance\.previousKey\) return acceptance/);
  assert.match(accept, /this\.clearRoundPresentationNodes\(\)/);
});

test('a round reset cancels retained hands that are still waiting outside Out_Card', () => {
  assert.match(controller,
    /clearRoundPresentationNodes\(\): Promise<void> \{[\s\S]*cancelPendingForRoundBoundary\(\)[\s\S]*clearPublicCards\(\)/);
  assert.match(flow,
    /if \(!request\.isCurrent\(\)[\s\S]*hand\.destroy\(\)/);
});

test('small settlement clears at modal mount while floating waits from terminal landing', () => {
  const setEnd = controller.slice(controller.indexOf("event === 'CommonPdkSetEnd'"),
    controller.indexOf("event === 'ChatMessage'"));
  assert.doesNotMatch(setEnd, /truncateRoundEndPresentation/);
  assert.match(coordinator, /waitForTerminalCardHold\(1500\)/);
  assert.match(coordinator, /await terminalHold;[\s\S]*truncateRoundEndPresentation\(\)[\s\S]*await this\.forms\.show/);
});

test('settlement invalidates a held hand before deferred node destruction completes', () => {
  const end = controller.slice(controller.indexOf('private endRoundPresentation'),
    controller.indexOf('private clearHandVisuals'));
  assert.ok(end.indexOf('this.roundPresentation.end()') < end.indexOf('this.clearRoundPresentationNodes()'));
  assert.match(flow, /remaining awaits only drain[\s\S]*request\.isCurrent\(\)/);
  assert.doesNotMatch(flow, /lifecycleGeneration/);
});

test('small settlement clears both pending and already-retained terminal cards', () => {
  const truncate = controller.slice(controller.indexOf('public async truncateRoundEndPresentation'),
    controller.indexOf('public async waitForInitialPresentation'));
  assert.match(truncate, /this\.completedRoundVisualsCleared = true/);
  assert.match(truncate, /this\.endRoundPresentation\('SET_END'\)/);
  const clear = controller.slice(controller.indexOf('private clearRoundPresentationNodes'),
    controller.indexOf('private clearHandVisuals'));
  assert.match(clear, /cancelPendingForRoundBoundary\(\)/);
  assert.match(clear, /this\.clearPublicCards\(\)/);
  assert.match(clear, /this\.clearTableCards\(\)/);
});

test('every live retained-table authority commit uses the physical Out_Card pipeline', () => {
  assert.match(controller, /this\.runtime\.arrangementEnabled\(\)[\s\S]*\? this\.presentLatestAuthorityAction\(setInfo, snapshotPresentationLease\)/);
  assert.doesNotMatch(controller, /this\.authorityActionsInitialized \|\| roundPresentationChanged[\s\S]*this\.restoreTableCards\(setInfo\)/);
  assert.match(controller, /if \(formalCardPlayPhase \|\| waitingForContinue\)[\s\S]*this\.restoreTableCards\(\s*snapshot,\s*snapshotPresentationLease/);
});

test('reconnect history freezes its ledger before asynchronous card creation', () => {
  const restore = controller.slice(controller.indexOf('private async restoreTableCards'),
    controller.indexOf('private showCurrentPlayArrow'));
  assert.match(restore, /const operations = Array\.isArray\(packet\.tableOperations\) \? \[\.\.\.packet\.tableOperations\] : \[\]/);
});

test('a consecutive hand starts without waiting for the preceding archive transfer', () => {
  const play = controller.slice(controller.indexOf('private async outCard'),
    controller.indexOf('private selectedIntrinsicType'));
  assert.match(play, /if \(shouldAdvancePrecedingPresentation\)/);
  assert.doesNotMatch(play, /await Promise\.allSettled\(precedingTablePresentations\)/);
  assert.doesNotMatch(play, /await this\.retainedPlayedCardFlow\?\.waitForPendingTransfers\(\)/);
});

test('continued or next-round lease invalidates an in-flight retained history restore', () => {
  const append = controller.slice(controller.indexOf('private async appendTableCards'),
    controller.indexOf('private async restoreTableCards'));
  const restore = controller.slice(controller.indexOf('private async restoreTableCards'),
    controller.indexOf('private showCurrentPlayArrow'));
  assert.match(append, /expectedLease: PdkRoundPresentationLease/);
  assert.match(append, /!this\.roundPresentation\.isCurrent\(expectedLease\)/);
  assert.match(append, /if \(hand\.isValid\) hand\.destroy\(\)/);
  assert.match(restore, /this\.roundPresentation\.isCurrent\(expectedLease\)/);
  assert.match(restore, /}, expectedLease, ownsReconciliation\)/);
});

test('only the latest authority state version may reconcile retained five-card hands', () => {
  const adapter = readFileSync(new URL('Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts', root), 'utf8');
  const append = controller.slice(controller.indexOf('private async appendTableCards'),
    controller.indexOf('private async restoreTableCards'));
  const restore = controller.slice(controller.indexOf('private async restoreTableCards'),
    controller.indexOf('private showCurrentPlayArrow'));
  assert.match(adapter, /const set = \{[\s\S]*stateVersion,/);
  assert.match(restore, /const authorityVersion = Number\(packet\.stateVersion/);
  assert.match(restore, /authorityVersion === currentAuthorityVersion\(\)/);
  assert.match(restore, /!this\.roundPresentation\.isCurrent\(expectedLease\) \|\| !ownsReconciliation\(\)/);
  assert.match(restore, /}, expectedLease, ownsReconciliation\)/);
  assert.match(append, /ownsReconciliation: \(\) => boolean/);
  assert.match(append, /await this\.cards\.create\(hand, value\);[\s\S]*!ownsReconciliation\(\)/);
});

test('auto hint does not wait for the retained-card presentation', () => {
  assert.match(controller, /const hintReady = handRender;/);
  assert.match(controller, /this\.trackPresentation\(settledPublicPresentation\);[\s\S]*const turnPresentation = hintReady/);
  assert.match(controller, /hintReady[\s\S]*autoHintForAuthoritativeTurn\(\s*setInfo,\s*authoritySelectionRevision/);
});
