import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { projectPdkAuthoritativeView } from '../../assets/Games/Poker/PDK/Common/Code/Runtime/PdkAuthoritativeViewAdapter.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hintControllerPath = path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/PdkHintController.ts');
const adapterPath = path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/PdkAuthoritativeViewAdapter.ts');
const hintController = fs.readFileSync(hintControllerPath, 'utf8');
const adapter = fs.readFileSync(adapterPath, 'utf8');

const openingMethod = hintController.slice(
  hintController.indexOf('public isMandatoryFirstCardRule'),
  hintController.indexOf('public authoritativeDeckCards'),
);

const packet = (overrides = {}) => ({
  roomId: 73001,
  ownerId: 2001,
  family: 'PDK',
  playVersion: '1.0.0',
  playerCount: 2,
  roundNo: 1,
  roundLimit: 8,
  shuffleSequence: 1,
  stateVersion: 2,
  phase: 'PLAYING',
  currentSeat: 0,
  firstPlayOfRound: true,
  roundFirstPlay: true,
  activeRequiredFirstCard: 105,
  publicPlayedRankCounts: Array(16).fill(0),
  seats: {
    0: { playerId: 2001, cards: [105, 106, 107], roundScore: 0, totalScore: 0 },
    1: { playerId: 2002, cards: [205, 206, 207], roundScore: 0, totalScore: 0 },
  },
  ruleOptions: {
    requiredFirstCard: 103,
    requiredFirstCardRounds: 1,
    mustBeatWhenPossible: true,
    tripleAttachmentMode: 'EITHER',
    fourAttachmentMode: 'SINGLES',
    tripleWithoutAttachmentTiming: 'ANYTIME',
    specialTripleBombRanks: [],
    playRule: ['require_spade_three'],
    firstPlayRule: 'winner_first',
    minimumPairRunLength: 2,
  },
  ...overrides,
});

test('numeric requiredFirstCard and explicit playRule vocabulary are present in the opening gate', () => {
  assert.match(openingMethod, /configuredCardText/);
  assert.match(openingMethod, /Number\(configuredCardText\) > 0/);
  assert.match(openingMethod, /rules\.playRule/);
  assert.match(openingMethod, /require_\(\?:spade\|heart\|club\|diamond\)/);
  assert.doesNotMatch(openingMethod, /firstPlayRule/);
});

test('authoritative adapter preserves opening markers and the resolved physical card', () => {
  const { snapshot } = projectPdkAuthoritativeView(packet(), 2001);
  assert.equal(snapshot.set.activeRequiredFirstCard, 105);
  assert.equal(snapshot.set.firstPlayOfRound, true);
  assert.equal(snapshot.set.roundFirstPlay, true);
  assert.deepEqual(snapshot.set.publicPlayedRankCounts, Array(16).fill(0));
});

test('first-player selection alone does not become a must-carry rule', () => {
  const source = openingMethod;
  assert.doesNotMatch(source, /firstPlayRule\s*===\s*['"]spade_three_first/);
  assert.match(source, /actual card to include still comes from activeRequiredFirstCard/);
});

test('legacy opening packet without rank ledger can still identify a pending required opening', () => {
  const { snapshot } = projectPdkAuthoritativeView(packet({
    firstPlayOfRound: undefined,
    roundFirstPlay: undefined,
    publicPlayedRankCounts: undefined,
    currentTrick: {},
    trickReset: true,
  }), 2001);
  assert.equal(snapshot.set.activeRequiredFirstCard, 105);
  assert.equal(snapshot.set.isFirstOp, true);
  assert.equal(snapshot.set.comparisonState.cards.length, 0);
});
