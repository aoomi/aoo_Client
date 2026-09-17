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
});

test('each rank owns four suit slots and absent ranks are omitted', () => {
  assert.match(source, /const PROTOCOL_SUITS = Object\.freeze\(\[1, 2, 3, 4\]\)/);
  assert.match(source, /if \(!rankCards\.some\(card => deck\.has\(card\)\)\) continue/);
  assert.match(source, /rankCards\.forEach\(\(card, suitIndex\) => this\.createCard\(group, card, deck\.has\(card\), suitIndex\)\)/);
  assert.match(source, /group\.setPosition\(-540 \+ column \* 180/);
});

test('cards absent from the authoritative deck are masked and cannot be selected', () => {
  assert.match(source, /presenter\.present\([\s\S]*false, !available\)/);
  assert.match(source, /button\.interactable = available/);
  assert.match(source, /if \(available\) card\.on\(Button\.EventType\.CLICK/);
  assert.match(source, /presentFromRules\([\s\S]*ruleOptions\.deckCards/);
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
  assert.match(source, /node\.getComponent\(UITransform\)\?\.hitTest\(location\)/);
  assert.match(source, /this\.node\.on\(Node\.EventType\.TOUCH_END, this\.onControlPointerEnd, this, true\)/);
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
