import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../assets/Games/Poker/PDK/', import.meta.url);
const flow = readFileSync(new URL('LSPDK/Code/LS201PlayedCardFlow.ts', root), 'utf8');
const controller = readFileSync(new URL('Common/Code/Runtime/CommonPdkPlayController.ts', root), 'utf8');
const coordinator = readFileSync(new URL('Common/Code/Runtime/CommonPdkSwitchCoordinator.ts', root), 'utf8');
const retainedLayout = readFileSync(new URL('Common/Code/Runtime/Room/PdkRetainedPlayedCardFlow.ts', root), 'utf8');
const prefab = JSON.parse(readFileSync(new URL('Common/Prefab/PDK_CommonRoom.prefab', root), 'utf8'));

test('LS201 alone moves the live Out_Card nodes into Table_Cards after a fixed two-second hold', () => {
  assert.match(flow, /const OUT_CARD_HOLD_MS = 2000/);
  assert.match(flow, /pendingHoldReleases = new Set<\(\) => void>/);
  assert.match(flow, /public flushPendingHolds\(releaseNextHold = false\): void/);
  assert.match(flow, /public async waitForPendingTransfers\(\): Promise<void>/);
  assert.match(flow, /private readonly activeTransfers = new Set<Promise<void>>\(\)/);
  assert.match(flow, /this\.pendingHoldReleases\.add\(finish\)/);
  assert.match(flow, /request\.outCard\.children\.filter/);
  assert.match(flow, /child\.name !== 'PlayCount'/);
  assert.match(flow, /for \(const card of cards\) card\.parent = hand/);
  assert.match(flow, /layoutPdkRetainedHand\(hand, cards, request\.outCard\.getComponent\(Layout\)\?\.spacingX \?\? 0\)/);
  assert.doesNotMatch(flow, /HAND_CARD_SPACING_X/);
  assert.match(flow, /outerLayout\.enabled = false/);
  assert.match(flow, /tween\(card\)\.to\(MOVE_TO_ARRANGEMENT_SECONDS/);
  assert.match(flow, /this\.addStoppedPlayCount\(hand,[\s\S]*request\.playIndex\)/);
  assert.ok(flow.indexOf('await Promise.all(cards.map') < flow.indexOf('this.addStoppedPlayCount(hand'));
  assert.match(flow, /PlayCount_\$\{playIndex\}/);
  assert.match(flow, /child\.name === 'PlayCount' \|\| child\.name\.startsWith\('PlayCount_'\)/);
  assert.match(flow, /\?\? instantiate\(countTemplate\)/);
  assert.match(flow, /label\.string = String\(playIndex\)/);
  assert.match(flow, /positionPdkPlayCount\(count, cards\)/);
  assert.match(retainedLayout, /PDK_PLAY_COUNT_RIGHT_INSET = 10/);
  assert.match(retainedLayout, /const cardRight = cardTransform\.contentSize\.width/);
  assert.match(retainedLayout, /count\.parent = lastCard/);
  assert.match(retainedLayout, /const cardTop = cardTransform\.contentSize\.height/);
  assert.match(retainedLayout, /cardRight - PDK_PLAY_COUNT_RIGHT_INSET/);
  assert.match(retainedLayout, /return rightEdge - leftEdge/);
  assert.doesNotMatch(flow, /lastCard\.position\.y - 12/);
  assert.doesNotMatch(flow, /cards\.create/);
  assert.match(controller, /retainedPlayedCardFlow\?\.moveAfterLiveHold/);
  assert.match(controller, /Players\/Play_\$\{entry\.physicalSlot\}\/Card\/Table_Cards/);
  assert.doesNotMatch(controller, /Card\/Out_Card\/Table_Cards/);
  assert.match(controller, /playCountTemplate: this\.view\.find\('PlayCount'\)/);
  assert.match(controller, /private clearOutCardPlayCount\(parent: Node \| null\)/);
  assert.match(controller, /child\.name === 'PlayCount' \|\| child\.name\.startsWith\('PlayCount_'\)/);
  assert.doesNotMatch(controller, /private updateOutCardPlayIndex/);
  assert.doesNotMatch(controller, /Table_Cards'\)\?\.getChildByName\('PlayCount'\)/);
  assert.match(controller, /outCard\.active = visible/);
  assert.match(controller, /this\.retainedPlayedCardFlow\?\.flushPendingHolds\(shouldAdvancePrecedingPresentation\)/);
  assert.match(controller, /await this\.retainedPlayedCardFlow\?\.waitForPendingTransfers\(\)/);
  assert.doesNotMatch(controller.slice(controller.indexOf('private async presentPublicOperation'),
    controller.indexOf('private async presentLatestAuthorityAction')), /appendTableCards\(packet\)/);
  assert.match(controller, /dataSeat === this\.activeOpPos && !this\.runtime\.arrangementEnabled\(\)/);
  assert.doesNotMatch(controller, /HISTORY_MOVE_DELAY_MS/);
  assert.ok(flow.indexOf('const cards = request.outCard.children.filter')
    < flow.indexOf('await new Promise<void>((resolve)'));
  assert.match(flow, /card\.parent !== request\.outCard/);
  assert.match(flow, /request\.outCard\.active = request\.outCard\.children\.some/);
  assert.match(coordinator, /runtime\.getGameCode\(\) === PDK_BUSINESS_CODES\.LIANGSHAN[\s\S]*new LS201PlayedCardFlow\(\)/);
});

test('a rapid next play finishes the preceding transfer before starting its common hand flight', () => {
  const play = controller.slice(controller.indexOf('private async outCard('),
    controller.indexOf('private selectedIntrinsicType'));
  const flush = play.indexOf('this.retainedPlayedCardFlow?.flushPendingHolds(shouldAdvancePrecedingPresentation)');
  const wait = play.indexOf('await this.retainedPlayedCardFlow?.waitForPendingTransfers()');
  const precedingFlight = play.indexOf('await precedingOwnCardFlight');
  const prepare = play.indexOf('this.prepareOwnFlightCards(selectedNodes)');
  const fly = play.indexOf('this.flyCardsToOwnAction(flyingCards)');
  assert.ok(precedingFlight >= 0 && flush > precedingFlight && wait > flush);
  assert.ok(prepare > wait && fly > prepare);
});

test('an already retained authority hand still reconciles its missing play count', () => {
  assert.match(flow, /const retainedHand = request\.tableCards\.getChildByName\(nodeName\)/);
  assert.match(flow, /if \(retainedHand\) \{[\s\S]*this\.addStoppedPlayCount\(retainedHand,[\s\S]*request\.playIndex\)[\s\S]*return true;/);
  assert.match(flow, /const recoveredHand = request\.tableCards\.getChildByName\(nodeName\)/);
  assert.match(flow, /if \(recoveredHand\) \{[\s\S]*this\.addStoppedPlayCount\(recoveredHand,[\s\S]*request\.playIndex\)[\s\S]*return true;/);
  assert.match(controller, /const existingHand = parent\.getChildByName\(nodeName\)/);
  assert.match(controller, /if \(existingHand\) \{[\s\S]*addStoppedPlayCount\([\s\S]*existingHand,[\s\S]*Number\(packet\.playIndex \?\? 0\)[\s\S]*layoutPdkRetainedHands\(parent\)/);
});

test('automatic final hand cannot clear its preceding physical Out_Card before retained movement starts', () => {
  const play = controller.slice(controller.indexOf('private async outCard('),
    controller.indexOf('private selectedIntrinsicType'));
  assert.match(play, /const precedingOwnCardFlight = this\.ownCardFlight;[\s\S]*hasPrecedingAuthorityPresentation[\s\S]*shouldAdvancePrecedingPresentation[\s\S]*await precedingOwnCardFlight;[\s\S]*await Promise\.resolve\(\);[\s\S]*flushPendingHolds\(shouldAdvancePrecedingPresentation\)/);
  assert.match(play, /const precedingTablePresentations = \[\.\.\.this\.tableActionPresentations\.values\(\)\]/);
  assert.match(play, /shouldAdvancePrecedingPresentation && precedingTablePresentations\.length > 0[\s\S]*await Promise\.all\(precedingTablePresentations\)/);
  assert.match(controller, /private hasUnretainedLatestAuthorityPlay[\s\S]*`Play_\$\{operationId\}`/);
  assert.match(play, /hasPrecedingAuthorityPresentation[\s\S]*await this\.advanceLatestAuthorityPlayToRetained\(setInfo\)/);
  assert.match(controller, /private async advanceLatestAuthorityPlayToRetained[\s\S]*flushPendingHolds\(true\)[\s\S]*waitForPendingTransfers/);
  assert.match(flow, /if \(!released && releaseNextHold\) this\.releaseNextHold = true/);
  assert.match(flow, /const releaseImmediately = this\.releaseNextHold;[\s\S]*if \(!releaseImmediately\) await new Promise/);
  assert.ok(play.indexOf('await this.retainedPlayedCardFlow?.waitForPendingTransfers()')
    < play.indexOf('this.prepareOwnFlightCards(selectedNodes)'));
});

test('PlayCount has one root template and no per-seat prefab copies', () => {
  const nodes = prefab.filter((entry) => entry?.__type__ === 'cc.Node');
  const templates = nodes.filter((entry) => entry._name === 'PlayCount');
  assert.equal(templates.length, 1);
  const template = templates[0];
  assert.equal(prefab[template._parent.__id__]._name, 'PDK_CommonRoom');
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
  assert.match(live, /const presentation = this\.presentNewAuthorityAction\(action\)/);
  assert.doesNotMatch(live, /actions\.at\(-1\)/);
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

test('continued or next-round generation invalidates an in-flight retained history restore', () => {
  const append = controller.slice(controller.indexOf('private async appendTableCards'),
    controller.indexOf('private async restoreTableCards'));
  const restore = controller.slice(controller.indexOf('private async restoreTableCards'),
    controller.indexOf('private showCurrentPlayArrow'));
  assert.match(append, /expectedGeneration: number/);
  assert.match(append, /expectedGeneration !== this\.presentationGeneration/);
  assert.match(append, /if \(hand\.isValid\) hand\.destroy\(\)/);
  assert.match(restore, /const generation = this\.presentationGeneration/);
  assert.match(restore, /generation !== this\.presentationGeneration/);
  assert.match(restore, /}, generation\)/);
});

test('Liangshan auto hint does not wait for the two-second retained-card animation', () => {
  assert.match(controller, /const hintReady = this\.runtime\.arrangementEnabled\(\)[\s\S]*\? handRender[\s\S]*: Promise\.all\(\[handRender, settledPublicPresentation\]\)/);
  assert.match(controller, /hintReady[\s\S]*autoHintForAuthoritativeTurn\(setInfo\)/);
});
