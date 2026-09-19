import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const source = read('assets/Games/Poker/Common/Code/Card/Poker_Deck_Presenter.ts');
const pdkController = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');
const pdkCoordinator = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts');
const prefab = JSON.parse(read('assets/Games/Poker/Common/Prefab/PokerTest.prefab'));

test('PokerTest owns both the card view and rule-driven deck presenter without CardTest dependency', () => {
  assert.ok(prefab.some(entry => Array.isArray(entry.blackRanks)), 'PokerTest must own Poker_Card_Presenter');
  assert.ok(prefab.some(entry => entry.__type__ === '24bc2cvp2RFkqlemRhOgPoK'), 'PokerTest must own Poker_Deck_Presenter');
  assert.ok(prefab.every(entry => !Object.hasOwn(entry, 'cardPrefab')), 'whole-deck CardTest must not be used as one card');
  assert.match(source, /this\.cardTemplate \?\?= this\.createCardTemplate\(\)/);
  assert.match(source, /const card = instantiate\(this\.cardTemplate!\)/);
  assert.match(source, /child\.removeFromParent\(\)[\s\S]*child\.destroy\(\)/);
  assert.match(source, /template\.removeComponent\(deckPresenter\)/);
});

test('each rank owns its available suit cards and absent ranks or cards are omitted', () => {
  assert.match(source, /const PROTOCOL_SUITS = Object\.freeze\(\[1, 2, 3, 4\]\)/);
  assert.match(source, /if \(!rankCards\.some\(card => deck\.has\(card\)\)\) continue/);
  assert.match(source, /rankCards\.filter\(card => deck\.has\(card\)\)/);
  assert.match(source, /const column = visibleIndex % 5/);
  assert.match(source, /RANK_GROUP_WIDTH \+ RANK_GROUP_GAP/);
  assert.match(source, /RANK_GROUP_HEIGHT \+ RANK_GROUP_GAP/);
});

test('only cards from the authoritative deck are rendered and selectable', () => {
  assert.match(source, /rankCards\.filter\(card => deck\.has\(card\)\)/);
  assert.match(source, /button\.interactable = true/);
  assert.match(source, /presentFromRules\([\s\S]*ruleOptions\.deckCards/);
});

test('cards use the enlarged separated layout and selected cards mirror into Selected', () => {
  assert.match(source, /const CARD_SCALE = 0\.567/);
  assert.match(source, /card\.setScale\(new Vec3\(CARD_SCALE, CARD_SCALE, 1\)\)/);
  assert.match(source, /availableIndex \* 38/);
  assert.match(source, /getChildByName\('Selected'\)/);
  assert.match(source, /this\.refreshSelectedContent\(\)/);
  assert.match(source, /this\.selectedContent!\.addChild\(card\)/);
});

test('deal-once games hide round-stage controls while staged games keep them', () => {
  assert.match(source, /export type PokerDealFlow = 'DEAL_ONCE' \| 'DEAL_DURING_GAME'/);
  assert.match(source, /const stagedDeal = this\.context\?\.dealFlow === 'DEAL_DURING_GAME'/);
  assert.match(source, /currentRound\.active = stagedDeal/);
  assert.match(source, /nextRound\.active = stagedDeal/);
  assert.match(source, /dealFlow === 'DEAL_ONCE' \? 'INITIAL' : this\.dealStage/);
  assert.doesNotMatch(source, /if \(this\.context\?\.dealFlow === 'DEAL_ONCE'\) this\.submit\(\)/);
  assert.match(source, /const confirm = this\.findDescendant\('Confirm'\)/);
  assert.match(source, /confirm\.active = !stagedDeal/);
  assert.match(source, /this\.bindButton\(confirm, \(\) => this\.submit\(\)\)/);
  assert.ok(prefab.some(entry => entry?._name === 'Confirm'), 'PokerTest must contain the authored Confirm button');
  assert.ok(prefab.some(entry => entry?._name === 'Close'), 'PokerTest must contain the authored Close button');
  assert.match(source, /this\.node\.emit\('poker-card-selection-close'\)/);
});

test('submitting emits target player, stage and selected cards as one payload', () => {
  assert.match(source, /targetPlayerId: number/);
  assert.match(source, /targetSeat: number/);
  assert.match(source, /cards: Object\.freeze\(\[\.\.\.this\.selected\(\)\]\)/);
  assert.match(source, /this\.node\.emit\('poker-card-selection-submit', detail\)/);
});

test('PokerTest owns a backmost modal mask and resilient authored controls', () => {
  assert.match(source, /new Node\('CardSelectionModalMask'\)/);
  assert.match(source, /mask\.addComponent\(BlockInputEvents\)/);
  assert.match(source, /mask\.setSiblingIndex\(0\)/);
  assert.match(source, /this\.node\.getComponent\(BlockInputEvents\)/);
  assert.match(source, /this\.content\?\.setSiblingIndex\(1\)/);
  assert.match(source, /this\.bindPointerBlocker\(mask\)/);
  assert.match(source, /card\.on\(Node\.EventType\.TOUCH_END, activate, this\)/);
  assert.match(source, /card\.on\(Node\.EventType\.MOUSE_UP, activate, this\)/);
  assert.match(source, /node\.on\(Node\.EventType\.TOUCH_END, pointerEnd, this\)/);
  assert.match(source, /node\.on\(Node\.EventType\.MOUSE_UP, pointerEnd, this\)/);
  assert.match(source, /event\.propagationStopped = true/);
  assert.match(source, /now - this\.lastControlPointerAt < 180/);
  assert.match(pdkCoordinator, /onCardSelectionClose[\s\S]*closeAfterPointer\(POKER_CARD_SELECTION_FORM\)/);
});

test('deal-once PDK keeps PokerTest available to the room owner', () => {
  assert.match(pdkController, /const cardSelectionAvailable = localSeated/);
  assert.match(pdkController, /CardSelection`,\s*cardSelectionAvailable/);
  assert.doesNotMatch(pdkCoordinator, /blocked after deal/);
  assert.match(pdkCoordinator, /this\.forms\.closeAfterPointer\(POKER_CARD_SELECTION_FORM\)/);
});

test('PDK submits the complete selection with replace semantics', () => {
  assert.match(pdkCoordinator, /selectionMode: 'REPLACE'/);
  assert.match(pdkCoordinator, /this\.forms\.closeAfterPointer\(POKER_CARD_SELECTION_FORM\)/);
  assert.match(pdkCoordinator, /this\.showMessage\('OK了'\)/);
  assert.match(pdkCoordinator, /this\.forms\.closeAfterPointer\(POKER_CARD_SELECTION_FORM\)/);
  assert.match(pdkCoordinator, /form\.node\.on\('poker-card-selection-close', this\.onCardSelectionClose, this\)/);
  assert.doesNotMatch(pdkCoordinator, /selectionMode: detail\.dealFlow === 'DEAL_ONCE' \? 'APPEND'/);
});
