import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const clientRoot = new URL('../..', import.meta.url).pathname;
const helperPath = join(clientRoot,
  'assets/Games/Poker/PDK/Common/Code/Runtime/logic/PdkCleanHintRanker.ts');
const controllerPath = join(clientRoot,
  'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');

function loadRanker() {
  const source = readFileSync(helperPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  return module.exports.rankCleanPdkHints;
}

const card = (rank, suit = 1) => suit * 100 + rank;
const group = (rank, count) => Array.from({ length: count }, (_value, index) => card(rank, index + 1));
const flatten = (...groups) => groups.flat();
const candidate = (cards, order) => ({ cards, order });
const rules = {
  policyId: 'COMMON',
  minimumStraightLength: 5,
  minimumPairRunLength: 2,
  allowTwoInRuns: false,
  singleAttachmentCapacityPerTriple: 2,
  prioritizeLooseSingles: true,
  optimizeWholeHand: true,
  compareTripleAttachments: true,
  maximumSingleRanks: [15],
};
const liangshanDeck = Array.from({ length: 4 }, (_value, suit) =>
  Array.from({ length: 8 }, (_rank, index) => card(index + 7, suit + 1))).flat();
const liangshanLeadRules = {
  ...rules,
  policyId: 'LS201',
  minimumStraightLength: 3,
  tripleAttachmentMode: 'SINGLE_OR_PAIR',
  maximumSingleRanks: [14],
  deckCards: liangshanDeck,
  prioritizeMaximumWithOneOrdinaryPlay: true,
  prioritizeLargestLeadWithoutMaximum: true,
  prioritizeMaximumLeadUnlessConnectedRun: true,
  prioritizeMaximumResponseWithinThreePlays: true,
  prioritizeLargestLeadUnlessMaximumStraight: true,
};

test('COMMON policy ignores every LS201-only priority even with an ace-high deck', () => {
  const rank = loadRanker();
  const ace = card(14);
  const straight = [card(7), card(8), card(9), card(10), card(11)];
  const hand = [ace, ...straight];
  const candidates = [
    { ...candidate(straight, 0), finishesInTwo: true },
    { ...candidate([ace], 1), finishesInTwo: true, containsRuleMaximum: true },
  ];
  const common = {
    ...rules,
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
    deckCards: liangshanDeck,
  };
  const contaminated = {
    ...common,
    prioritizeMaximumWithOneOrdinaryPlay: true,
    prioritizeLargestLeadWithoutMaximum: true,
    prioritizeMaximumLeadUnlessConnectedRun: true,
    prioritizeMaximumResponseWithinThreePlays: true,
    prioritizeLargestLeadUnlessMaximumStraight: true,
    didCompeteDealer: true,
  };

  assert.deepEqual(rank(hand, candidates, contaminated, true, true),
    rank(hand, candidates, common, true, true));
});

test('Liangshan lead keeps the maximum triple as recapture control and sheds the lowest pair', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const sevens = group(7, 2);
  const hand = flatten(aces, [card(13), card(12), card(8)], sevens);
  const ranked = rank(hand, [
    candidate([...aces, ...sevens], 0),
    candidate([...aces, card(8)], 1),
    candidate(sevens, 2),
    candidate([card(8)], 3),
    candidate([card(12)], 4),
    candidate([card(13)], 5),
  ], liangshanLeadRules, true, true);

  assert.deepEqual(ranked[0], sevens);
});

test('maximum-triple recapture priority does not depend on an optional UI optimization flag', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const sevens = group(7, 2);
  const hand = flatten(aces, [card(13), card(12), card(8)], sevens);
  const ranked = rank(hand, [
    candidate([...aces, ...sevens], 0),
    candidate([...aces, card(8)], 1),
    candidate(sevens, 2),
    candidate([card(8)], 3),
  ], {
    ...liangshanLeadRules,
    optimizeWholeHand: false,
  }, true, true);
  assert.deepEqual(ranked[0], sevens);
});

test('an ordinary non-maximum triple does not activate maximum-triple pair priority', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const sevens = group(7, 2);
  const hand = flatten([card(14)], queens, [card(13), card(8)], sevens);
  const tripleFamily = [...queens, ...sevens];
  const ranked = rank(hand, [
    candidate(tripleFamily, 0),
    candidate(sevens, 1),
  ], liangshanLeadRules, true, true);

  assert.deepEqual(ranked[0], tripleFamily);
});

test('attachment comparison carries the highest available cards instead of the smallest pair', () => {
  const rank = loadRanker();
  const nines = group(9, 3);
  const hand = flatten(group(15, 1), group(13, 1), group(12, 2), group(11, 2),
    group(10, 2), nines, group(8, 2), group(6, 1), group(5, 2));
  const strongest = [...nines, card(15), card(13)];
  const ranked = rank(hand, [
    candidate([...nines, ...group(5, 2)], 0),
    candidate([...nines, ...group(8, 2)], 1),
    candidate([...nines, ...group(5, 2)], 2),
    candidate([...nines, card(15), card(13)], 3),
  ], rules);
  assert.deepEqual(ranked[0], strongest);
});

test('ordinary low loose cards are triple attachments and rank 2 is retained', () => {
  const rank = loadRanker();
  const sixes = group(6, 3);
  const hand = flatten(group(15, 1), group(14, 1), group(13, 2), group(9, 3),
    group(7, 1), sixes, group(5, 1));
  const low = [...sixes, card(7), card(5)];
  const ranked = rank(hand, [
    candidate([...sixes, card(15), card(14)], 0),
    candidate(low, 1),
    candidate([...sixes, ...group(13, 2)], 2),
  ], rules);
  assert.deepEqual(ranked[0], low);
});

test('single response to K uses A and retains the sole regional-maximum 2', () => {
  const rank = loadRanker();
  const eight = [card(8)];
  const ace = [card(14)];
  const two = [card(15)];
  const ranked = rank(flatten(eight, ace, two), [
    candidate(ace, 0),
    { ...candidate(two, 1), containsRuleMaximum: true },
  ], rules, false, true);
  assert.deepEqual(ranked[0], ace);
  assert.deepEqual(ranked[1], two);
});

test('Liangshan AA plus ten answers a single with its rule-maximum A', () => {
  const rank = loadRanker();
  const aces = group(14, 2);
  const ten = card(10);
  const liangshanDeck = Array.from({ length: 4 }, (_value, suit) =>
    Array.from({ length: 8 }, (_rank, index) => card(index + 7, suit + 1))).flat();
  const ranked = rank(flatten(aces, [ten]), [
    { ...candidate([ten], 0), finishesInTwo: true, containsRuleMaximum: false },
    { ...candidate([aces[0]], 1), finishesInTwo: false, containsRuleMaximum: true },
  ], { ...rules, policyId: 'LS201', minimumStraightLength: 3, maximumSingleRanks: [14],
    deckCards: liangshanDeck }, false, true);

  assert.deepEqual(ranked[0], [aces[0]]);
});

test('555 carries J and K before opening 33 or 1010 and retains A plus 2', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const pairThrees = group(3, 2);
  const pairTens = group(10, 2);
  const jack = card(11);
  const king = card(13);
  const ace = card(14);
  const two = card(15);
  const hand = flatten(pairThrees, fives, pairTens, [jack, king, ace, two]);
  const expected = [...fives, jack, king];
  const ranked = rank(hand, [
    candidate([...fives, ...pairThrees], 0),
    candidate([...fives, ...pairTens], 1),
    candidate(expected, 2),
    candidate([...fives, jack, ace], 3),
    { ...candidate([...fives, jack, two], 4), containsRuleMaximum: true },
  ], { ...rules, compareTripleAttachments: false }, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('attachment comparison carries the highest available pair', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const hand = flatten(group(14, 1), group(13, 2), queens, group(11, 2),
    group(10, 1), group(7, 2));
  const strongestPair = [...queens, ...group(11, 2)];
  const ranked = rank(hand, [
    candidate([...queens, ...group(7, 2)], 0),
    candidate([...queens, ...group(7, 2)], 1),
    candidate([...queens, ...group(11, 2)], 2),
  ], rules);
  assert.deepEqual(ranked[0], strongestPair);
});

test('888 carries 33 when two sub-ten pairs face only ten-or-higher loose singles', () => {
  const rank = loadRanker();
  const eights = group(8, 3);
  const pairThrees = group(3, 2);
  const pairFives = group(5, 2);
  const hand = flatten([card(14), card(11)], eights, pairFives, pairThrees);
  const expected = [...eights, ...pairThrees];
  for (const compareTripleAttachments of [false, true]) {
    const ranked = rank(hand, [
      candidate(eights, 0),
      candidate([...eights, card(11)], 1),
      candidate([...eights, card(11), card(14)], 2),
      candidate([...eights, ...pairFives], 3),
      candidate(expected, 4),
    ], { ...rules, compareTripleAttachments }, true, true);
    assert.deepEqual(ranked[0], expected);
  }
});

test('lead planning chooses the lower triple family that minimizes the complete hand', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const hand = flatten(group(15, 1), group(14, 1), group(13, 2), group(11, 1), group(9, 1),
    group(8, 3), group(7, 2), group(6, 2), fives);
  const expected = [...fives, ...group(6, 2)];
  const ranked = rank(hand, [
    candidate([...group(8, 3), ...group(7, 2)], 0),
    candidate(expected, 1),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('an all-triple-family hand leads the lower triple with its two smallest loose singles', () => {
  const rank = loadRanker();
  const threes = group(3, 3);
  const hand = flatten(threes, group(4, 1), group(10, 1));
  const complete = [...threes, card(4), card(10)];
  const ranked = rank(hand, [
    candidate(threes, 0),
    candidate(complete, 1),
    candidate([card(4)], 2),
    candidate([card(10)], 3),
  ], rules, true, true);
  assert.deepEqual(ranked[0], complete);
});

test('bombs stay atomic and an ordinary pair run is prompted before either bomb', () => {
  const rank = loadRanker();
  const kings = group(13, 4);
  const queens = group(12, 4);
  const hand = flatten(group(15, 1), group(14, 1), kings, queens, group(10, 1),
    group(7, 2), group(6, 2), group(5, 1));
  const pairRun = [...group(6, 2), ...group(7, 2)];
  const ranked = rank(hand, [
    candidate([...queens, card(15), card(5), card(10)], 0),
    candidate([...kings, card(5), card(10)], 1),
    candidate(pairRun, 2),
    candidate([card(13)], 3),
  ], { ...rules, protectedBombs: [kings, queens] }, true, true);
  assert.deepEqual(ranked[0], pairRun);
  assert.ok(ranked.every((cards) => cards.length !== 1 || cards[0] !== card(13)));
});

test('single attachment keeps 55-66 pair run and splits a ten instead', () => {
  const rank = loadRanker();
  const jacks = group(11, 3);
  const hand = flatten(group(14, 2), jacks, group(10, 2), group(7, 1), group(6, 2), group(5, 2));
  const preserveRun = [...jacks, card(10)];
  const ranked = rank(hand, [
    candidate([...jacks, card(5)], 0),
    candidate(preserveRun, 1),
  ], { ...rules, singleAttachmentCapacityPerTriple: 1 });
  assert.deepEqual(ranked[0], preserveRun);
});

test('triple with two follows the decomposition with fewer remaining loose singles', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const threes = group(3, 2);
  const hand = flatten(group(15, 1), group(14, 1), group(9, 1), group(8, 1), fives, threes);
  const looseWings = [...fives, card(9), card(14)];
  const ranked = rank(hand, [
    candidate([...fives, ...threes], 0),
    candidate(looseWings, 1),
    candidate([...fives, card(9), card(14)], 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], looseWings);
});

test('888 carries loose 9 and K while retaining the control ace', () => {
  const rank = loadRanker();
  const eights = group(8, 3);
  const ninesAndKing = [...eights, card(9), card(13)];
  const hand = flatten(group(14, 1), group(13, 1), group(11, 2), group(9, 1),
    eights, group(3, 2));
  const ranked = rank(hand, [
    candidate([...eights, card(9), card(14)], 0),
    candidate(ninesAndKing, 1),
    candidate([...eights, card(13), card(14)], 2),
  ], { ...rules, compareTripleAttachments: true }, true, true);
  assert.deepEqual(ranked[0], ninesAndKing);
});

test('scoring AAA stays intact but follows ordinary leads', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const hand = flatten(aces, group(13, 2), group(11, 2), group(10, 1),
    group(9, 2), group(7, 2), group(6, 2), group(4, 2));
  const ordinaryPair = group(4, 2);
  const ranked = rank(hand, [candidate(aces, 0), candidate(ordinaryPair, 1)], {
    ...rules,
    protectedBombs: [aces],
    preserveScoringBombs: true,
  }, true, true);
  assert.deepEqual(ranked[0], ordinaryPair);
  assert.deepEqual(ranked[1], aces);
});

test('bomb hint cycle orders 6666 before the regional AAA bomb', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const sixes = group(6, 4);
  const queen = [card(12)];
  const hand = flatten(aces, queen, sixes);
  const ranked = rank(hand, [
    candidate(aces, 0),
    candidate(queen, 1),
    candidate(sixes, 2),
  ], {
    ...rules,
    protectedBombs: [aces],
    preserveScoringBombs: true,
  }, true, true);
  assert.deepEqual(ranked, [queen, sixes, aces]);
});

test('equivalent triple plans play the smaller body and retain higher recapture bodies', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const tens = group(10, 3);
  const eights = group(8, 3);
  const hand = flatten(group(14, 1), group(13, 1), queens, tens, group(9, 2), eights,
    group(7, 1), group(5, 2));
  const lowBody = [...eights, card(7), card(14)];
  const ranked = rank(hand, [
    candidate([...queens, card(7), card(14)], 0),
    candidate([...tens, card(7), card(14)], 1),
    candidate(lowBody, 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], lowBody);
});

test('equal-turn straight plan sheds the longer 6-to-K straight first', () => {
  const rank = loadRanker();
  const hand = flatten(group(13, 1), group(12, 1), group(11, 2), group(10, 1), group(9, 2),
    group(8, 2), group(7, 2), group(6, 2), group(5, 1));
  const short = [card(5), card(6), card(7), card(8), card(9)];
  const long = [card(6), card(7), card(8), card(9), card(10), card(11), card(12), card(13)];
  const ranked = rank(hand, [candidate(short, 0), candidate(long, 1)], rules, true, true);
  assert.deepEqual(ranked[0], long);
});

test('Liangshan equal-turn plan keeps the complete 7-to-Q straight intact', () => {
  const rank = loadRanker();
  const hand = [card(14), card(12), card(11), card(10),
    card(9), card(9, 2), card(8), card(7)];
  const short = [9, 10, 11, 12].map((value) => card(value));
  const long = [7, 8, 9, 10, 11, 12].map((value) => card(value));
  const ranked = rank(hand, [candidate(short, 0), candidate(long, 1)],
    liangshanLeadRules, true, true);

  assert.deepEqual(ranked[0], long);
});

test('Liangshan keeps 1010JJ pair run instead of building the longer 78910J straight', () => {
  const rank = loadRanker();
  const lowStraight = [card(7), card(8), card(9)];
  const pairRun = [...group(10, 2), ...group(11, 2)];
  const longStraight = [card(7), card(8), card(9), card(10), card(11)];
  const hand = [...lowStraight, ...pairRun, card(13)];
  const ranked = rank(hand, [
    candidate(longStraight, 0),
    candidate(lowStraight, 1),
    candidate(pairRun, 2),
    candidate([card(13)], 3),
  ], liangshanLeadRules, true, true);

  assert.deepEqual(ranked[0], pairRun);
  assert.deepEqual(ranked[1], lowStraight);
});

test('whole-hand isolation keeps the shorter straight when it leaves fewer singles', () => {
  const rank = loadRanker();
  const hand = flatten(group(15, 1), group(14, 1), group(13, 2), group(12, 1),
    group(10, 2), group(9, 2), group(8, 2), group(7, 1), group(6, 2),
    group(5, 1), group(4, 1));
  const short = [4, 5, 6, 7, 8].map((value) => card(value));
  const medium = [4, 5, 6, 7, 8, 9].map((value) => card(value));
  const long = [4, 5, 6, 7, 8, 9, 10].map((value) => card(value));
  const ranked = rank(hand, [candidate(long, 0), candidate(medium, 1), candidate(short, 2)],
    rules, true, true);
  assert.deepEqual(ranked[0], short);
});

test('lead enumeration is complete by rank without duplicating equivalent suits', () => {
  const source = readFileSync(helperPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  const enumerate = module.exports.enumeratePdkRankMultisetCandidates;
  const hand = flatten(group(13, 1), group(12, 1), group(11, 2), group(10, 1), group(9, 2),
    group(8, 2), group(7, 2), group(6, 2), group(5, 1));
  const startedAt = performance.now();
  const candidates = enumerate(hand);
  assert.equal(candidates.length, (2 * 2 * 3 * 2 * 3 * 3 * 3 * 3 * 2) - 1);
  assert.ok(performance.now() - startedAt < 100, '16-card rank enumeration should stay below one frame budget class');
  assert.ok(candidates.some((cards) => cards.length === 8
    && cards.map((value) => value % 100).join(',') === '6,7,8,9,10,11,12,13'));
});

test('authority aircraft guard selects the consecutive body and allows a foreign triple as wings', () => {
  const source = readFileSync(helperPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  const guard = module.exports.isAuthorityCompatiblePdkAircraft;
  const foreignTripleWings = flatten(group(12, 3), group(9, 3), group(8, 3), group(6, 1));
  const valid = flatten(group(12, 2), group(9, 3), group(8, 3), group(6, 2));
  assert.equal(guard(foreignTripleWings, 18), true);
  assert.equal(guard(valid, 17), true);
  const controller = readFileSync(controllerPath, 'utf8');
  assert.match(controller,
    /if \(!isAuthorityCompatiblePdkAircraft\(cards, cardType\)\) continue;/);
  assert.match(controller,
    /return isAuthorityCompatiblePdkAircraft\(cards, cardType\) \? cardType : 0;/);
});

test('exactly two hands left exposes the regional maximum 2 before the lower single', () => {
  const rank = loadRanker();
  const two = card(15);
  const ten = card(10);
  const ranked = rank([two, ten], [
    { cards: [ten], order: 0, finishesInTwo: true, containsRuleMaximum: false },
    { cards: [two], order: 1, finishesInTwo: true, containsRuleMaximum: true },
  ], rules, true, true);
  assert.deepEqual(ranked[0], [two]);
});

test('two-hand lead spends the lone maximum 2 before a much larger aircraft family', () => {
  const rank = loadRanker();
  const two = card(15);
  const largeFamily = flatten(group(6, 3), group(7, 3), group(8, 3),
    group(9, 2), [card(11), card(13), card(14)]);
  const hand = [...largeFamily, two];
  const ranked = rank(hand, [
    { ...candidate([two], 0), finishesInTwo: true, containsRuleMaximum: true },
    { ...candidate(largeFamily, 1), finishesInTwo: true, containsRuleMaximum: false },
  ], rules, true, true);

  assert.deepEqual(ranked[0], [two]);
});

test('pair response consumes independent 99 before opening 445566', () => {
  const rank = loadRanker();
  const lowRun = flatten(group(4, 2), group(5, 2), group(6, 2));
  const independent = group(9, 2);
  const hand = flatten(lowRun, independent);
  const ranked = rank(hand, [
    candidate(group(5, 2), 0),
    candidate(group(6, 2), 1),
    candidate(independent, 2),
  ], rules, false, true);
  assert.deepEqual(ranked[0], independent);
});

test('pair response without an independent pair opens QQ from the higher QQKK run', () => {
  const rank = loadRanker();
  const lowRun = flatten(group(5, 2), group(6, 2));
  const highRun = flatten(group(12, 2), group(13, 2));
  const hand = flatten(lowRun, highRun);
  const ranked = rank(hand, [
    candidate(group(5, 2), 0),
    candidate(group(6, 2), 1),
    candidate(group(12, 2), 2),
    candidate(group(13, 2), 3),
  ], rules, false, true);
  assert.deepEqual(ranked[0], group(12, 2));
});

test('pair-run response keeps 999 intact and uses QQKK when it leaves fewer plays', () => {
  const rank = loadRanker();
  const fives = group(5, 2);
  const nines = group(9, 3);
  const tens = group(10, 2);
  const queens = group(12, 2);
  const kings = group(13, 2);
  const splitTripleRun = [...nines.slice(0, 2), ...tens];
  const intactHighRun = [...queens, ...kings];
  const hand = flatten(fives, nines, tens, queens, kings);
  const ranked = rank(hand, [
    candidate(splitTripleRun, 0),
    candidate(intactHighRun, 1),
  ], rules, false, true);

  assert.deepEqual(ranked[0], intactHighRun);
});

test('pair seven response from the sole QQKK run opens QQ and retains KK', () => {
  const rank = loadRanker();
  const queens = group(12, 2);
  const kings = group(13, 2);
  const hand = flatten(queens, kings);
  const ranked = rank(hand, [
    candidate(kings, 0),
    candidate(queens, 1),
  ], rules, false, true);
  assert.deepEqual(ranked[0], queens);
  assert.deepEqual(ranked[1], kings);
});

test('two-play pair response uses the regional-maximum AA to take control', () => {
  const rank = loadRanker();
  const queens = group(12, 2);
  const aces = group(14, 2);
  const deck = flatten(group(12, 4), group(13, 4), group(14, 3), group(15, 1));
  const ranked = rank(flatten(aces, queens), [
    { ...candidate(queens, 0), finishesInTwo: true, containsRuleMaximum: false },
    { ...candidate(aces, 1), finishesInTwo: true, containsRuleMaximum: true },
  ], { ...rules, deckCards: deck }, false, true);

  assert.deepEqual(ranked[0], aces);
});

test('three-play response uses maximum AA when the hand contains two maximum controls', () => {
  const rank = loadRanker();
  const queens = group(12, 2);
  const aces = group(14, 2);
  const two = card(15);
  const deck = flatten(group(12, 4), group(13, 4), group(14, 3), group(15, 1));
  const ranked = rank(flatten(aces, queens, [two]), [
    { ...candidate(queens, 0), containsRuleMaximum: false },
    { ...candidate(aces, 1), containsRuleMaximum: true },
  ], { ...rules, deckCards: deck }, false, true);

  assert.deepEqual(ranked[0], aces);
});

test('ordinary three-play response retains its only maximum pair for recovery', () => {
  const rank = loadRanker();
  const queens = group(12, 2);
  const aces = group(14, 2);
  const three = card(3);
  const deck = flatten(group(3, 4), group(12, 4), group(13, 4), group(14, 3), group(15, 1));
  const ranked = rank(flatten(aces, queens, [three]), [
    { ...candidate(queens, 0), containsRuleMaximum: false },
    { ...candidate(aces, 1), containsRuleMaximum: true },
  ], { ...rules, deckCards: deck }, false, true);

  assert.deepEqual(ranked[0], queens);
});

test('pair-three response uses 88 and preserves the 34567 straight', () => {
  const rank = loadRanker();
  const pairAces = group(14, 2);
  const pairQueens = group(12, 2);
  const jacks = group(11, 3);
  const pairEights = group(8, 2);
  const pairFours = group(4, 2);
  const hand = flatten(pairAces, pairQueens, jacks, group(10, 1), pairEights,
    group(7, 1), group(6, 1), group(5, 1), pairFours, group(3, 1));
  const ranked = rank(hand, [
    candidate(pairFours, 0),
    candidate(pairEights, 1),
    candidate(pairQueens, 2),
    candidate(pairAces, 3),
  ], { ...rules, optimizeWholeHand: true }, false, false);
  assert.deepEqual(ranked[0], pairEights);
});

test('self lead 77 plus QQKK sheds the four-card pair run before pair sevens', () => {
  const rank = loadRanker();
  const sevens = group(7, 2);
  const highRun = flatten(group(12, 2), group(13, 2));
  const hand = flatten(highRun, sevens);
  const ranked = rank(hand, [
    { ...candidate(sevens, 0), finishesInTwo: true, containsRuleMaximum: false },
    { ...candidate(highRun, 1), finishesInTwo: true, containsRuleMaximum: false },
  ], rules, true, true);
  assert.deepEqual(ranked[0], highRun);
  assert.deepEqual(ranked[1], sevens);
});

test('two-hand endgame leads maximum pair run KKAA before the larger JJJ33 family', () => {
  const rank = loadRanker();
  const tripleWithPair = flatten(group(11, 3), group(3, 2));
  const maximumPairRun = flatten(group(13, 2), group(14, 2));
  const hand = flatten(tripleWithPair, maximumPairRun);
  const ranked = rank(hand, [
    { ...candidate(tripleWithPair, 0), finishesInTwo: true, containsRuleMaximum: false },
    { ...candidate(maximumPairRun, 1), finishesInTwo: true, containsRuleMaximum: true },
  ], { ...rules, maximumSingleRanks: [14] }, true, true);

  assert.deepEqual(ranked[0], maximumPairRun);
});

test('Liangshan two-hand endgame leads the JQKA maximum straight before 9997', () => {
  const rank = loadRanker();
  const maximumStraight = [card(11), card(12), card(13), card(14)];
  const tripleWithSingle = [...group(9, 3), card(7)];
  const hand = [...maximumStraight, ...tripleWithSingle];
  const ranked = rank(hand, [
    { ...candidate(tripleWithSingle, 0), finishesInTwo: true, containsRuleMaximum: false },
    { ...candidate(maximumStraight, 1), finishesInTwo: true, containsRuleMaximum: true },
  ], {
    ...rules,
    policyId: 'LS201',
    minimumStraightLength: 3,
    tripleAttachmentMode: 'SINGLE_OR_PAIR',
    maximumSingleRanks: [14],
    prioritizeMaximumWithOneOrdinaryPlay: true,
  }, true, true);

  assert.deepEqual(ranked[0], maximumStraight);
});

test('public two-hand maximum lead ignores card-count gap', () => {
  const rank = loadRanker();
  const ace = [card(14)];
  const longOrdinaryPlay = [card(7), card(8), card(9), card(10), card(11)];
  const hand = [...ace, ...longOrdinaryPlay];
  const ranked = rank(hand, [
    { ...candidate(longOrdinaryPlay, 0), finishesInTwo: true, containsRuleMaximum: false },
    { ...candidate(ace, 1), finishesInTwo: true, containsRuleMaximum: true },
  ], {
    ...rules,
    policyId: 'COMMON',
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
  }, true, true);

  assert.deepEqual(ranked[0], ace);
});

test('Liangshan hand without ace leads its largest legal shape', () => {
  const rank = loadRanker();
  const straight = [card(9), card(10), card(11), card(12), card(13)];
  const hand = [...straight, card(12, 2), card(9, 2), card(7)];
  const ranked = rank(hand, [
    { ...candidate([card(7)], 0), containsRuleMaximum: false },
    { ...candidate([card(9), card(9, 2)], 1), containsRuleMaximum: false },
    { ...candidate(straight, 2), containsRuleMaximum: false },
  ], {
    ...rules,
    policyId: 'LS201',
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
    prioritizeLargestLeadWithoutMaximum: true,
  }, true, true);

  assert.deepEqual(ranked[0], straight);
});

test('Liangshan no-ace hand leads triple with intact pair', () => {
  const rank = loadRanker();
  const tripleWithPair = [...group(12, 3), ...group(13, 2)];
  const hand = [...tripleWithPair, card(10), card(9), card(7)];
  const ranked = rank(hand, [
    { ...candidate([card(7)], 0), containsRuleMaximum: false },
    { ...candidate([...group(12, 3), card(10)], 1), containsRuleMaximum: false },
    { ...candidate(tripleWithPair, 2), containsRuleMaximum: false },
  ], {
    ...rules,
    policyId: 'LS201',
    minimumStraightLength: 3,
    tripleAttachmentMode: 'SINGLE_OR_PAIR',
    maximumSingleRanks: [14],
    prioritizeLargestLeadWithoutMaximum: true,
  }, true, true);

  assert.deepEqual(ranked[0], tripleWithPair);
});

test('Liangshan lead uses A before a disconnected triple family', () => {
  const rank = loadRanker();
  const ace = [card(14)];
  const tripleWithPair = [...group(9, 3), ...group(7, 2)];
  const hand = [...ace, card(13), card(12), ...tripleWithPair];
  const ranked = rank(hand, [
    { ...candidate(tripleWithPair, 0), containsRuleMaximum: false },
    { ...candidate(ace, 1), containsRuleMaximum: true },
  ], {
    ...rules,
    policyId: 'LS201',
    minimumStraightLength: 3,
    tripleAttachmentMode: 'SINGLE_OR_PAIR',
    maximumSingleRanks: [14],
    prioritizeMaximumLeadUnlessConnectedRun: true,
  }, true, true);

  assert.deepEqual(ranked[0], ace);
});

test('Liangshan connected KKQQ lead stays ahead of A', () => {
  const rank = loadRanker();
  const ace = [card(14)];
  const pairRun = [...group(12, 2), ...group(13, 2)];
  const hand = [...ace, ...pairRun, card(10), ...group(8, 2)];
  const ranked = rank(hand, [
    { ...candidate(ace, 0), containsRuleMaximum: true },
    { ...candidate(pairRun, 1), containsRuleMaximum: false },
  ], {
    ...rules,
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
    prioritizeMaximumLeadUnlessConnectedRun: true,
  }, true, true);

  assert.deepEqual(ranked[0], pairRun);
});

test('Liangshan response within three plays uses A first', () => {
  const rank = loadRanker();
  const ace = [card(14)];
  const queen = [card(12)];
  const hand = [...ace, card(13), ...queen];
  const ranked = rank(hand, [
    { ...candidate(queen, 0), containsRuleMaximum: false },
    { ...candidate(ace, 1), containsRuleMaximum: true },
  ], {
    ...rules,
    policyId: 'LS201',
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
    prioritizeMaximumResponseWithinThreePlays: true,
  }, false, true);

  assert.deepEqual(ranked[0], ace);
});

test('Liangshan response without A keeps fewest singles then uses lowest point', () => {
  const rank = loadRanker();
  const queen = [card(12)];
  const king = [card(13)];
  const hand = [...queen, ...king, card(10)];
  const ranked = rank(hand, [candidate(king, 0), candidate(queen, 1)], {
    ...rules,
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
    prioritizeMaximumResponseWithinThreePlays: true,
  }, false, true);

  assert.deepEqual(ranked[0], queen);
});

test('Liangshan equal-plan single response spends A and keeps the 789 straight', () => {
  const rank = loadRanker();
  const ace = card(14);
  const king = card(13);
  const hand = [card(7), card(8), card(9), card(9, 2), king, ace];
  const ranked = rank(hand, [
    candidate([king], 0),
    { ...candidate([ace], 1), containsRuleMaximum: true },
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, false, true);

  assert.deepEqual(ranked[0], [ace]);
});

test('Liangshan largest-shape lead chooses QQQ with pair sevens', () => {
  const rank = loadRanker();
  const tripleWithPair = [...group(12, 3), ...group(7, 2)];
  const shortStraight = [card(9), card(10), card(11), card(12)];
  const hand = [...group(12, 3), card(11), card(10), card(9), ...group(7, 2)];
  const ranked = rank(hand, [candidate(shortStraight, 0), candidate(tripleWithPair, 1)], {
    ...rules,
    minimumStraightLength: 3,
    tripleAttachmentMode: 'SINGLE_OR_PAIR',
    maximumSingleRanks: [14],
    prioritizeLargestLeadUnlessMaximumStraight: true,
  }, true, true);

  assert.deepEqual(ranked[0], tripleWithPair);
});

test('Liangshan newest largest-shape rule overrides the older standalone-A fallback', () => {
  const rank = loadRanker();
  const ace = [card(14)];
  const tripleWithPair = [...group(9, 3), ...group(7, 2)];
  const hand = [...ace, card(13), card(12), ...tripleWithPair];
  const ranked = rank(hand, [
    { ...candidate(ace, 0), containsRuleMaximum: true },
    candidate(tripleWithPair, 1),
  ], {
    ...rules,
    minimumStraightLength: 3,
    tripleAttachmentMode: 'SINGLE_OR_PAIR',
    maximumSingleRanks: [14],
    prioritizeMaximumLeadUnlessConnectedRun: true,
    prioritizeLargestLeadUnlessMaximumStraight: true,
  }, true, true);

  assert.deepEqual(ranked[0], tripleWithPair);
});

test('Liangshan equal-size two-play lead chooses triple carrying A', () => {
  const rank = loadRanker();
  const tripleWithAce = [...group(7, 3), card(14)];
  const remainingStraight = [card(8), card(9), card(10), card(11)];
  const hand = [...tripleWithAce, ...remainingStraight];
  const ranked = rank(hand, [
    { ...candidate(remainingStraight, 0), finishesInTwo: true },
    { ...candidate(tripleWithAce, 1), finishesInTwo: true,
      containsRuleMaximum: true },
  ], {
    ...rules,
    policyId: 'LS201',
    minimumStraightLength: 3,
    tripleAttachmentMode: 'SINGLE_OR_PAIR',
    maximumSingleRanks: [14],
    prioritizeLargestLeadUnlessMaximumStraight: true,
  }, true, true);

  assert.deepEqual(ranked[0], tripleWithAce);
});

test('Liangshan largest-shape lead chooses six-card pair run', () => {
  const rank = loadRanker();
  const pairRun = [...group(11, 2), ...group(12, 2), ...group(13, 2)];
  const hand = [card(14), ...pairRun, card(8)];
  const ranked = rank(hand, [
    { ...candidate([card(14)], 0), containsRuleMaximum: true },
    candidate(pairRun, 1),
  ], {
    ...rules,
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
    prioritizeLargestLeadUnlessMaximumStraight: true,
  }, true, true);

  assert.deepEqual(ranked[0], pairRun);
});

test('Liangshan pair-dominant hand keeps JJQQ ahead of a pair-splitting straight', () => {
  const rank = loadRanker();
  const pairRun = [...group(11, 2), ...group(12, 2)];
  const splitStraight = [card(8), card(9), card(10), card(11), card(12)];
  const hand = [...group(12, 2), ...group(11, 2), card(10), card(9), ...group(8, 2)];
  const ranked = rank(hand, [candidate(splitStraight, 0), candidate(pairRun, 1)], {
    ...rules,
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
    prioritizeLargestLeadUnlessMaximumStraight: true,
  }, true, true);

  assert.deepEqual(ranked[0], pairRun);
});

test('Liangshan equal pair and single cards still lead the longest straight', () => {
  const rank = loadRanker();
  const pairRun = [...group(11, 2), ...group(12, 2)];
  const longestStraight = [card(9), card(10), card(11), card(12), card(13)];
  const hand = [card(13), ...group(12, 2), ...group(11, 2), card(10), card(9), card(7)];
  const ranked = rank(hand, [candidate(pairRun, 0), candidate(longestStraight, 1)], {
    ...rules,
    minimumStraightLength: 3,
    maximumSingleRanks: [14],
    prioritizeLargestLeadUnlessMaximumStraight: true,
  }, true, true);

  assert.deepEqual(ranked[0], longestStraight);
});

test('Liangshan QQQ carries the lowest loose seven', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const seven = card(7);
  const hand = [...group(14, 2), card(13), ...queens, card(10), seven];
  const expected = [...queens, seven];
  const ranked = rank(hand, [
    candidate([card(14)], 0),
    candidate([...queens, card(10)], 1),
    candidate(expected, 2),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('Liangshan three-play A ten seven leads the second-highest ten', () => {
  const rank = loadRanker();
  const ace = card(14);
  const ten = card(10);
  const seven = card(7);
  const ranked = rank([ace, ten, seven], [
    { ...candidate([ace], 0), containsRuleMaximum: true },
    candidate([ten], 1),
    candidate([seven], 2),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true, true);
  assert.deepEqual(ranked[0], [ten]);
});

test('Liangshan three single cards A ten eight lead the second-highest ten', () => {
  const rank = loadRanker();
  const ace = card(14);
  const ten = card(10);
  const eight = card(8);
  const ranked = rank([ace, ten, eight], [
    { ...candidate([ace], 0), containsRuleMaximum: true },
    candidate([ten], 1),
    candidate([eight], 2),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true, true);
  assert.deepEqual(ranked[0], [ten]);
});

test('Liangshan QKA is first and 7778 is second when both are complete leads', () => {
  const rank = loadRanker();
  const maximumStraight = [card(12), card(13), card(14)];
  const tripleWithEight = [...group(7, 3), card(8)];
  const hand = [...maximumStraight, card(10), card(8), ...group(7, 3)];
  const ranked = rank(hand, [
    candidate([card(10)], 0),
    candidate(tripleWithEight, 1),
    { ...candidate(maximumStraight, 2), containsRuleMaximum: true },
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true, true);
  assert.deepEqual(ranked.slice(0, 2), [maximumStraight, tripleWithEight]);
});

test('Liangshan leads the longer maximum straight when no independent control remains', () => {
  const rank = loadRanker();
  const maximumStraight = [card(11), card(12), card(13), card(14)];
  const shorterHighStraight = [card(11), card(12), card(13)];
  const lowStraight = [card(7), card(8), card(9)];
  const hand = flatten(group(14, 1), group(13, 2), group(12, 1), group(11, 1),
    group(9, 1), group(8, 1), group(7, 1));
  const ranked = rank(hand, [
    candidate(lowStraight, 0),
    candidate(shorterHighStraight, 1),
    { ...candidate(maximumStraight, 2), containsRuleMaximum: true },
  ], { ...liangshanLeadRules, optimizeWholeHand: false }, true, true);
  assert.deepEqual(ranked[0], maximumStraight);
});

test('Liangshan pair-dominant hand leads its lowest intact pair before a split straight', () => {
  const rank = loadRanker();
  const aces = group(14, 2);
  const jacks = group(11, 2);
  const nines = group(9, 2);
  const splitStraight = [jacks[0], card(12), card(13), aces[0]];
  const hand = flatten(aces, group(13, 1), group(12, 1), jacks, nines);
  const ranked = rank(hand, [
    { ...candidate(splitStraight, 0), containsRuleMaximum: true },
    candidate(aces, 1), candidate(jacks, 2), candidate(nines, 3),
  ], { ...liangshanLeadRules, optimizeWholeHand: false }, true, true);
  assert.deepEqual(ranked[0], nines);
});

test('Liangshan low pairs alone do not activate pair-recovery priority', () => {
  const rank = loadRanker();
  const tens = group(10, 2);
  const nines = group(9, 2);
  const sevens = group(7, 2);
  const straight = [nines[0], tens[0], card(11), card(12)];
  const hand = flatten(tens, nines, sevens, group(11, 1), group(12, 1));
  const ranked = rank(hand, [
    candidate(sevens, 0), candidate(nines, 1), candidate(tens, 2),
    candidate(straight, 3),
  ], { ...liangshanLeadRules, optimizeWholeHand: false }, true, true);
  assert.deepEqual(ranked[0], straight);
});

test('Liangshan two pairs do not override a complete triple-with-pair lead', () => {
  const rank = loadRanker();
  const eights = group(8, 3);
  const queens = group(12, 2);
  const aces = group(14, 2);
  const tripleWithPair = [...eights, ...queens];
  const hand = flatten(aces, queens, group(9, 1), eights);
  const ranked = rank(hand, [
    candidate(queens, 0), candidate(aces, 1),
    candidate([...eights, card(9)], 2),
    candidate(tripleWithPair, 3),
  ], { ...liangshanLeadRules, optimizeWholeHand: false }, true, true);
  assert.deepEqual(ranked[0], tripleWithPair);
});

test('Liangshan exact two-hand finish outranks maximum-triple low-card probing', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const queens = group(12, 2);
  const lowStraight = [card(9), card(10), card(11)];
  const tripleWithPair = [...aces, ...queens];
  const hand = flatten(aces, queens, lowStraight);
  const ranked = rank(hand, [
    { ...candidate(tripleWithPair, 0), finishesInTwo: true },
    { ...candidate(lowStraight, 1), finishesInTwo: true },
    candidate([card(9)], 2),
  ], { ...liangshanLeadRules, optimizeWholeHand: false }, true, true);
  assert.deepEqual(ranked[0], tripleWithPair);
});

test('Liangshan AAA carries nine and leaves the ten-jack pair run', () => {
  const rank = loadRanker();
  const tripleAces = group(14, 3);
  const nine = card(9);
  const tripleWithNine = [...tripleAces, nine];
  const pairRun = [...group(10, 2), ...group(11, 2)];
  const hand = [...tripleAces, ...pairRun, nine];
  const ranked = rank(hand, [
    candidate(pairRun, 0),
    { ...candidate(tripleWithNine, 1), containsRuleMaximum: true },
  ], liangshanLeadRules, true, true);
  assert.deepEqual(ranked[0], tripleWithNine);
});

test('Liangshan A plus pair sevens spends A in the two-play endgame', () => {
  const rank = loadRanker();
  const ace = card(14);
  const sevens = group(7, 2);
  const ranked = rank([ace, ...sevens], [
    candidate(sevens, 0),
    { ...candidate([ace], 1), containsRuleMaximum: true },
  ], liangshanLeadRules, true, true);
  assert.deepEqual(ranked[0], [ace]);
});

test('Liangshan pair aces plus seven spends the maximum pair in the two-play endgame', () => {
  const rank = loadRanker();
  const aces = group(14, 2);
  const seven = card(7);
  const ranked = rank([...aces, seven], [
    { ...candidate(aces, 0), containsRuleMaximum: true },
    candidate([seven], 1),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true, true);
  assert.deepEqual(ranked[0], aces);
});

test('Liangshan leads low 8910 and retains QKA as the same-shape recovery', () => {
  const rank = loadRanker();
  const lowStraight = [card(8), card(9), card(10)];
  const recoveryStraight = [card(12), card(13), card(14)];
  const hand = [card(14), ...group(13, 2), card(12), ...group(10, 2), card(9), card(8)];
  const ranked = rank(hand, [
    { ...candidate(recoveryStraight, 0), containsRuleMaximum: true },
    candidate(lowStraight, 1),
  ], liangshanLeadRules, true, true);
  assert.deepEqual(ranked[0], lowStraight);
});

test('Liangshan leads 789 and retains QKA behind pair jacks', () => {
  const rank = loadRanker();
  const lowStraight = [card(7), card(8), card(9)];
  const recoveryStraight = [card(12), card(13), card(14)];
  const hand = [...lowStraight, ...group(11, 2), ...recoveryStraight];
  const ranked = rank(hand, [
    { ...candidate(recoveryStraight, 0), containsRuleMaximum: true },
    candidate(lowStraight, 1),
  ], liangshanLeadRules, true, true);

  assert.deepEqual(ranked.slice(0, 2), [lowStraight, recoveryStraight]);
});

test('Liangshan three-play AA nine seven leads the second-highest nine', () => {
  const rank = loadRanker();
  const aces = group(14, 2);
  const nine = card(9);
  const seven = card(7);
  const ranked = rank([...aces, nine, seven], [
    { ...candidate([aces[0]], 0), containsRuleMaximum: true },
    candidate([nine], 1),
    candidate([seven], 2),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true, true);
  assert.deepEqual(ranked[0], [nine]);
});

test('Liangshan three-play hand leads the six-card 9-to-A straight instead of single king', () => {
  const rank = loadRanker();
  const straight = [9, 10, 11, 12, 13, 14].map((value) => card(value));
  const hand = flatten(group(14, 1), group(13, 1), group(12, 2), group(11, 1),
    group(10, 1), group(9, 2));
  const ranked = rank(hand, [
    { ...candidate(straight, 0), containsRuleMaximum: true },
    candidate([card(13)], 1),
    candidate(group(12, 2), 2),
    candidate(group(9, 2), 3),
    candidate([card(9)], 4),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true, true);

  assert.deepEqual(ranked[0], straight);
});

test('Liangshan A J pair sevens leads J and retains A as recovery', () => {
  const rank = loadRanker();
  const ace = card(14);
  const jack = card(11);
  const sevens = group(7, 2);
  const ranked = rank([ace, jack, ...sevens], [
    candidate(sevens, 0),
    { ...candidate([ace], 1), containsRuleMaximum: true },
    candidate([jack], 2),
  ], liangshanLeadRules, true, true);
  assert.deepEqual(ranked[0], [jack]);
});

test('Liangshan K nine pair eights leads the intact pair when K is only an effective maximum', () => {
  const rank = loadRanker();
  const eights = group(8, 2);
  const king = card(13);
  const nine = card(9);
  const hand = flatten([king, nine], eights);
  const ranked = rank(hand, [
    { ...candidate([king], 0), containsRuleMaximum: true },
    candidate([nine], 1),
    candidate(eights, 2),
  ], {
    ...liangshanLeadRules,
    liangshanLeadStrategy: true,
    maximumSingleRanks: [13],
  }, true, true);

  assert.deepEqual(ranked[0], eights);
});

test('Liangshan leads JJQQKK before its loose seven and ten', () => {
  const rank = loadRanker();
  const pairRun = flatten(group(11, 2), group(12, 2), group(13, 2));
  const ten = card(10);
  const seven = card(7);
  const hand = flatten(pairRun, [ten, seven]);
  const ranked = rank(hand, [
    candidate(group(13, 2), 0), candidate(group(12, 2), 1), candidate(group(11, 2), 2),
    candidate([...group(11, 2), ...group(12, 2)], 3),
    candidate([...group(12, 2), ...group(13, 2)], 4), candidate(pairRun, 5),
    candidate([ten], 6), candidate([seven], 7),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked.slice(0, 3), [pairRun, [seven], [ten]]);
});

test('Liangshan leads QQKK pair run then A when no probing seven exists', () => {
  const rank = loadRanker();
  const hand = flatten(group(14, 1), group(13, 2), group(12, 2), group(9, 1));
  const pairRun = [...group(12, 2), ...group(13, 2)];
  const ranked = rank(hand, [
    candidate(pairRun, 0), candidate([card(14)], 1), candidate([card(9)], 2),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked[0], pairRun);
  assert.deepEqual(ranked[1], [card(14)]);
});

test('Liangshan leads KKAA pair run before 10JQ straight', () => {
  const rank = loadRanker();
  const hand = flatten(group(14, 2), group(13, 2), group(12, 1), group(11, 1), group(10, 1), group(7, 1));
  const pairRun = [...group(13, 2), ...group(14, 2)];
  const straight = [card(10), card(11), card(12)];
  const ranked = rank(hand, [candidate(pairRun, 0), candidate(straight, 1), candidate([card(7)], 2)],
    { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked[0], pairRun);
  assert.deepEqual(ranked[1], straight);
});

test('Liangshan double-triple lead depends on whether local player competed for dealer', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const eights = group(8, 3);
  const hand = flatten(kings, group(11, 1), group(10, 1), eights);
  const high = [...kings, card(11)];
  const low = [...eights, card(10)];
  assert.deepEqual(rank(hand, [candidate(low, 0), candidate(high, 1)], {
    ...liangshanLeadRules, liangshanLeadStrategy: true, didCompeteDealer: true,
  }, true)[0], high);
  assert.deepEqual(rank(hand, [candidate(low, 0), candidate(high, 1)], {
    ...liangshanLeadRules, liangshanLeadStrategy: true, didCompeteDealer: false,
  }, true)[0], low);
});

test('Liangshan triple comparison leads tens with king and preserves 789 plus A', () => {
  const rank = loadRanker();
  const tens = group(10, 3);
  const hand = flatten(group(14, 1), group(13, 1), tens, group(9, 1), group(8, 1), group(7, 1));
  const expected = [...tens, card(13)];
  const ranked = rank(hand, [
    candidate([...tens, card(7)], 0), candidate([...tens, card(8)], 1),
    candidate([...tens, card(9)], 2), candidate(expected, 3), candidate([...tens, card(14)], 4),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked[0], expected);
});

test('Liangshan leads QKA then triple tens with eight without splitting the triple', () => {
  const rank = loadRanker();
  const tens = group(10, 3);
  const hand = flatten(group(14, 1), group(13, 1), group(12, 1), tens,
    group(9, 1), group(8, 1));
  const splitStraight = [card(8), card(9), tens[0]];
  const maximumStraight = [card(12), card(13), card(14)];
  const tripleWithEight = [...tens, card(8)];
  const ranked = rank(hand, [
    candidate(splitStraight, 0),
    candidate(tripleWithEight, 1),
    candidate(maximumStraight, 2),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true, true);

  assert.deepEqual(ranked[0], maximumStraight);
  assert.deepEqual(ranked[1], tripleWithEight);
  assert.ok(ranked.every((cards) => cards.map((value) => value % 100).join(',') !== '8,9,10'));
  const remaining = hand.filter((value) => !ranked[0].includes(value));
  assert.deepEqual(remaining.map((value) => value % 100), [10, 10, 10, 9, 8]);
});

test('Liangshan maximum AAA with more loose singles leads the lowest single', () => {
  const rank = loadRanker();
  const hand = flatten(group(14, 3), group(12, 1), group(11, 2), group(9, 1), group(7, 1));
  const ranked = rank(hand, [
    candidate([...group(14, 3), card(7)], 0), candidate(group(11, 2), 1),
    candidate([card(12)], 2), candidate([card(9)], 3), candidate([card(7)], 4),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked[0], [card(7)]);
});

test('Liangshan maximum AAA with more pair cards leads the lowest pair', () => {
  const rank = loadRanker();
  const hand = flatten(group(14, 3), group(12, 2), group(11, 2), group(9, 1));
  const ranked = rank(hand, [
    candidate([...group(14, 3), card(9)], 0), candidate(group(12, 2), 1),
    candidate(group(11, 2), 2), candidate([card(9)], 3),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked[0], group(11, 2));
});

test('Liangshan high QQQ is retained for response while loose seven leads', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const hand = flatten(group(14, 1), group(13, 1), queens,
    group(10, 1), group(8, 1), group(7, 1));
  const ranked = rank(hand, [
    candidate([...queens, card(7)], 0), candidate([card(14)], 1),
    candidate([card(13)], 2), candidate([card(10)], 3),
    candidate([card(8)], 4), candidate([card(7)], 5),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked[0], [card(7)]);
});

test('Liangshan low 999 leads as triple family despite many loose singles', () => {
  const rank = loadRanker();
  const nines = group(9, 3);
  const triple = [...nines, card(7)];
  const hand = flatten(group(14, 1), group(13, 1), group(12, 1),
    group(10, 1), nines, group(8, 1), group(7, 1));
  const ranked = rank(hand, [candidate(triple, 0), candidate([card(7)], 1)],
    { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked[0], triple);
});

test('Liangshan relative triple policy also supports a five-to-ace deck', () => {
  const rank = loadRanker();
  const fiveToAceDeck = Array.from({ length: 4 }, (_value, suit) =>
    Array.from({ length: 10 }, (_rank, index) => card(index + 5, suit + 1))).flat();
  const regionalRules = {
    ...liangshanLeadRules,
    deckCards: fiveToAceDeck,
    liangshanLeadStrategy: true,
  };
  const queens = group(12, 3);
  const highHand = flatten(group(14, 1), group(13, 1), queens,
    group(10, 1), group(8, 1), group(5, 1));
  assert.deepEqual(rank(highHand, [
    candidate([...queens, card(5)], 0), candidate([card(5)], 1),
  ], regionalRules, true)[0], [card(5)]);

  const nines = group(9, 3);
  const lowTriple = [...nines, card(5)];
  const lowHand = flatten(group(14, 1), group(13, 1), group(12, 1),
    group(10, 1), nines, group(8, 1), group(5, 1));
  assert.deepEqual(rank(lowHand, [candidate(lowTriple, 0), candidate([card(5)], 1)],
    regionalRules, true)[0], lowTriple);
});

test('Liangshan two-play finish overrides retaining high JJJ for response', () => {
  const rank = loadRanker();
  const jacks = group(11, 3);
  const triple = [...jacks, card(12)];
  const hand = flatten(group(12, 1), jacks, group(9, 1), group(8, 1), group(7, 1));
  const ranked = rank(hand, [
    { ...candidate(triple, 0), finishesInTwo: true },
    candidate([card(7)], 1), candidate([card(8)], 2), candidate([card(9)], 3),
  ], { ...liangshanLeadRules, liangshanLeadStrategy: true }, true);
  assert.deepEqual(ranked[0], triple);
});

test('authority auto hint does not wait for the public-card hold animation', () => {
  const controller = readFileSync(controllerPath, 'utf8');
  assert.match(controller, /const hintReady = handRender;/);
  assert.doesNotMatch(controller,
    /const hintReady[\s\S]{0,180}Promise\.all\(\[handRender, settledPublicPresentation\]\)/);
  assert.match(controller, /this\.trackPresentation\(settledPublicPresentation\);/);
  assert.match(controller, /authorityToHintMs:/);
  assert.match(controller, /hintComputeMs:/);
});

test('JJJ with loose 7 and 9 is prompted before consuming pair tens', () => {
  const rank = loadRanker();
  const jacks = group(11, 3);
  const hand = flatten(group(14, 1), jacks, group(10, 2), group(9, 1), group(7, 1));
  const expected = [...jacks, card(9), card(7)];
  const ranked = rank(hand, [
    candidate([...jacks, ...group(10, 2)], 0),
    candidate(expected, 1),
    candidate([card(7)], 2),
    candidate([card(9)], 3),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('non-scoring bomb leads its legal four-with-two before the long straight', () => {
  const rank = loadRanker();
  const kings = group(13, 4);
  const hand = flatten(group(15, 1), group(14, 1), kings, group(11, 1), group(10, 2),
    group(9, 1), group(8, 2), group(7, 2), group(6, 1), group(5, 1));
  const straight = [5, 6, 7, 8, 9, 10, 11].map((value) => card(value));
  const bombWithLoose = [...kings, card(7), card(8)];
  const bombWithTen = [...kings, card(7), card(10)];
  const ranked = rank(hand, [
    { ...candidate(bombWithTen, 0), usesFourCardBody: true },
    candidate(straight, 1),
    { ...candidate(bombWithLoose, 2), usesFourCardBody: true },
  ], { ...rules, protectedBombs: [kings] }, true, true);
  assert.deepEqual(ranked[0], bombWithLoose);
});

test('complete Chengdu triple-with-two beats a bare triple and preserves every pair', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const hand = flatten(group(14, 1), group(13, 3), group(12, 2), group(11, 1),
    group(10, 3), group(8, 2), group(7, 1), fives);
  const expected = [...fives, card(7), card(11)];
  const ranked = rank(hand, [candidate(fives, 0), candidate(expected, 1),
    candidate([...fives, ...group(8, 2)], 2)], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('long 6-to-Q straight is prompted before the low pair five', () => {
  const rank = loadRanker();
  const hand = flatten(group(13, 3), group(12, 2), group(11, 1), group(10, 1),
    group(9, 2), group(8, 3), group(7, 1), group(6, 1), group(5, 2));
  const straight = [6, 7, 8, 9, 10, 11, 12].map((value) => card(value));
  const ranked = rank(hand, [candidate(group(5, 2), 0), candidate(straight, 1)], rules, true, true);
  assert.deepEqual(ranked[0], straight);
});

test('double-aircraft with four attachments is the first complete lead shape', () => {
  const rank = loadRanker();
  const body = flatten(group(6, 3), group(7, 3));
  const hand = flatten(group(13, 2), group(12, 1), group(11, 1), group(10, 2),
    group(9, 1), group(8, 1), body, group(5, 2));
  const aircraft = [...body, ...group(5, 2), card(10), card(13)];
  const ranked = rank(hand, [candidate(body, 0), candidate(group(5, 2), 1),
    candidate(aircraft, 2)], rules, true, true);
  assert.deepEqual(ranked[0], aircraft);
});

test('three-aircraft consumes a fallback triple as wings and leaves the highest final ace', () => {
  const rank = loadRanker();
  const sixes = group(6, 3);
  const nines = group(9, 3);
  const tens = group(10, 3);
  const jacks = group(11, 3);
  const eight = card(8);
  const queen = card(12);
  const king = card(13);
  const ace = card(14);
  const hand = flatten(sixes, nines, tens, jacks, [eight, queen, king, ace]);
  const aircraft = [...nines, ...tens, ...jacks,
    ...sixes, eight, queen, king];
  const lowTriple = [...sixes, eight, queen];
  const ranked = rank(hand, [
    candidate(lowTriple, 0),
    { ...candidate(aircraft, 1), finishesInTwo: true },
  ], rules, true, true);

  assert.deepEqual(ranked[0], aircraft);
  assert.deepEqual(hand.filter((value) => !aircraft.includes(value)), [ace]);
});

test('equal-turn KKK555444 hand leads complete 444555 plus pair kings', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const fives = group(5, 3);
  const fours = group(4, 3);
  const hand = flatten(kings, fives, fours);
  const aircraft = [...fours, ...fives, ...kings.slice(0, 2)];
  const splitTriples = [...kings, fours[0], fives[0]];
  const ranked = rank(hand, [
    candidate(splitTriples, 0),
    candidate(aircraft, 1),
  ], rules, true, true);
  assert.deepEqual(ranked[0], aircraft);
});

test('triple chain fills both loose wings and carries K after the low 6', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const jacks = group(11, 3);
  const hand = flatten(group(15, 1), group(14, 1), group(13, 1), group(12, 2),
    jacks, group(8, 2), group(7, 2), group(6, 1), fives);
  const complete = [...fives, card(6), card(13)];
  const ranked = rank(hand, [
    candidate([...fives, card(6)], 0),
    candidate(complete, 1),
    candidate([...fives, ...group(7, 2)], 2),
    candidate([...jacks, card(6)], 3),
    candidate([...jacks, card(6), card(13)], 4),
    candidate(group(7, 2), 5),
    candidate(group(8, 2), 6),
    candidate(group(12, 2), 7),
  ], { ...rules, tripleAttachmentMode: 'EITHER' }, true, true);
  assert.deepEqual(ranked[0], complete);
});

test('low-pair triple attachment never dismantles an atomic 7788 pair run', () => {
  const rank = loadRanker();
  const jacks = group(11, 3);
  const pairSevens = group(7, 2);
  const pairEights = group(8, 2);
  const pairRun = [...pairSevens, ...pairEights];
  const hand = flatten(group(14, 1), group(12, 2), jacks, pairEights, pairSevens);
  const ranked = rank(hand, [
    candidate([...jacks, ...group(12, 2)], 0),
    candidate([...jacks, ...pairSevens], 1),
    candidate([...jacks, ...pairEights], 2),
    candidate(pairRun, 3),
    candidate(group(12, 2), 4),
    candidate(group(14, 1), 5),
  ], { ...rules, tripleAttachmentMode: 'EITHER' }, true, true);
  assert.deepEqual(ranked[0], pairRun);
});

test('a non-scoring bomb remains atomic instead of donating to a long straight', () => {
  const rank = loadRanker();
  const nines = group(9, 4);
  const hand = flatten(group(14, 1), group(13, 1), group(12, 1), group(11, 1),
    group(10, 2), nines, group(8, 1), group(7, 2), group(6, 1), group(5, 1));
  const straight = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((value) => card(value));
  const triple = [...nines.slice(0, 3), card(7), card(10)];
  const ranked = rank(hand, [candidate(nines, 0), candidate(triple, 1), candidate(straight, 2)],
    { ...rules, protectedBombs: [nines] }, true, true);
  assert.deepEqual(ranked, [nines]);
});

test('base grouping retains high pair JJ instead of splitting one J into triple wings', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const hand = flatten(group(15, 1), kings, group(11, 2), group(10, 1), group(9, 2),
    group(8, 2), group(7, 2), group(5, 3));
  const expected = group(11, 2);
  const splitHighPair = [...kings, card(10), card(11)];
  const ranked = rank(hand, [candidate([...kings, card(15), card(10)], 0),
    candidate(splitHighPair, 1), candidate(group(11, 2), 2)], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('three-pair run 77-99 precedes shorter low-rank shapes', () => {
  const rank = loadRanker();
  const hand = flatten(group(15, 1), group(10, 1), group(9, 2), group(8, 2),
    group(7, 2), group(5, 3));
  const pairRun = flatten(group(7, 2), group(8, 2), group(9, 2));
  const ranked = rank(hand, [candidate(group(5, 3), 0), candidate(group(7, 2), 1),
    candidate(pairRun, 2)], rules, true, true);
  assert.deepEqual(ranked[0], pairRun);
});

test('three-pair run 55-77 sheds six cards before pair tens while both retain KKAA', () => {
  const rank = loadRanker();
  const lowPairRun = flatten(group(5, 2), group(6, 2), group(7, 2));
  const pairTens = group(10, 2);
  const highPairRun = flatten(group(13, 2), group(14, 2));
  const highStraight = [9, 10, 11, 12, 13, 14].map((value) => card(value));
  const hand = flatten(group(15, 1), highPairRun, group(12, 1), group(11, 1),
    pairTens, group(9, 1), lowPairRun);
  const ranked = rank(hand, [
    candidate(pairTens, 0),
    candidate(lowPairRun, 1),
    candidate(highPairRun, 2),
    candidate(highStraight, 3),
    candidate(group(9, 1), 4),
    candidate(group(11, 1), 5),
    candidate(group(12, 1), 6),
    candidate(group(15, 1), 7),
  ], rules, true, true);

  assert.deepEqual(ranked[0], lowPairRun);
});

test('three-pair run survives a theoretical extension that would split a bomb', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const tens = group(10, 4);
  const pairRun = flatten(group(7, 2), group(8, 2), group(9, 2));
  const splitBombExtension = [...pairRun, ...tens.slice(0, 2)];
  const tripleWithLoose = [...aces, card(12), card(3)];
  const hand = flatten(group(15, 1), aces, group(12, 1), tens, pairRun, group(3, 1));
  const ranked = rank(hand, [
    candidate(pairRun, 0),
    candidate(splitBombExtension, 1),
    candidate(tripleWithLoose, 2),
    candidate(tens, 3),
    candidate([card(15)], 4),
  ], { ...rules, protectedBombs: [tens], preserveScoringBombs: true }, true, true);
  assert.deepEqual(ranked[0], pairRun);
  assert.ok(!ranked.some((cards) => cards.length === splitBombExtension.length
    && splitBombExtension.every((card) => cards.includes(card))));
});

test('a four-pair run never cycles through its constituent pairs', () => {
  const rank = loadRanker();
  const pairRun = flatten(group(7, 2), group(8, 2), group(9, 2), group(10, 2));
  const tripleWithLoose = flatten(group(3, 3), [card(4)], [card(6)]);
  const hand = flatten(group(14, 2), [card(13)], pairRun, [card(6)], [card(4)], group(3, 3));
  const ranked = rank(hand, [
    candidate(pairRun, 0),
    candidate(tripleWithLoose, 1),
    candidate(group(7, 2), 2),
    candidate(group(8, 2), 3),
    candidate(group(9, 2), 4),
    candidate(group(10, 2), 5),
  ], rules, true, true);
  assert.deepEqual(ranked[0], pairRun);
  assert.deepEqual(ranked[1], tripleWithLoose);
  assert.equal(ranked.length, 2);
});

test('666 carries loose 5 and K without consuming pair aces or triple tens', () => {
  const rank = loadRanker();
  const sixes = group(6, 3);
  const hand = flatten(group(14, 2), group(13, 1), group(10, 3), sixes, group(5, 1));
  const expected = [...sixes, card(5), card(13)];
  const ranked = rank(hand, [candidate([...sixes, ...group(14, 2)], 0),
    candidate([...sixes, card(10), card(13)], 1), candidate(expected, 2)], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('two intact triple bodies lead from 666 before KKK in the reported hand', () => {
  const rank = loadRanker();
  const sixes = group(6, 3);
  const kings = group(13, 3);
  const hand = flatten(group(14, 2), kings, group(12, 2), group(11, 1),
    group(10, 1), group(9, 1), sixes, group(5, 1), group(3, 2));
  const lowBody = [...sixes, card(5), card(9)];
  const highBody = [...kings, card(10), card(11)];
  const nineToKing = [card(9), card(10), card(11), card(12), card(13)];
  const tenToAce = [card(10), card(11), card(12), card(13), card(14)];
  const ranked = rank(hand, [
    candidate(highBody, 0),
    candidate(lowBody, 1),
    candidate(nineToKing, 2),
    candidate(tenToAce, 3),
  ], {
    ...rules,
    compareTripleAttachments: false,
  }, true, true);

  assert.deepEqual(ranked[0], lowBody);

  const highBodyOneCardShorter = [...kings, card(10)];
  const nearSizeRanked = rank(hand, [
    candidate(highBodyOneCardShorter, 0),
    candidate(lowBody, 1),
  ], {
    ...rules,
    compareTripleAttachments: false,
  }, true, true);
  assert.deepEqual(nearSizeRanked[0], lowBody);
});

test('aircraft attachments leave the highest final single Q instead of a low 6', () => {
  const rank = loadRanker();
  const body = flatten(group(8, 3), group(9, 3));
  const queens = group(12, 3);
  const sixes = group(6, 2);
  const hand = flatten(queens, body, sixes);
  const leaveQueen = [...body, ...sixes, ...queens.slice(0, 2)];
  const leaveSix = [...body, sixes[0], ...queens];
  const ranked = rank(hand, [candidate(leaveSix, 0), candidate(leaveQueen, 1)], rules, true, true);
  assert.deepEqual(ranked[0], leaveQueen);
});

test('attachment comparison consumes the highest loose cards before a low pair', () => {
  const rank = loadRanker();
  const jacks = group(11, 3);
  const hand = flatten(group(14, 1), group(13, 1), jacks,
    group(10, 2), group(8, 2), group(6, 2));
  const expected = [...jacks, card(14), card(13)];
  const ranked = rank(hand, [
    candidate([...jacks, card(14), card(13)], 0),
    candidate([...jacks, ...group(10, 2)], 1),
    candidate([...jacks, ...group(8, 2)], 2),
    candidate(expected, 3),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('triple with pair keeps rank two as the recapture card', () => {
  const rank = loadRanker();
  const sevens = group(7, 3);
  const hand = flatten(sevens, group(9, 2), group(15, 1), group(5, 1));
  const expected = [...sevens, ...group(9, 2)];
  const ranked = rank(hand, [
    candidate([...sevens, card(15), card(5)], 0),
    candidate(expected, 1),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('an intact triple is always prompted before splitting another bomb into a triple', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const eights = group(8, 4);
  const hand = flatten(group(14, 1), kings, group(12, 1), group(11, 2),
    eights, group(7, 1), group(6, 2), group(5, 2));
  const intact = [...kings, card(12), card(14)];
  const splitBomb = [...eights.slice(0, 3), card(12), card(14)];
  const ranked = rank(hand, [candidate(splitBomb, 0), candidate(intact, 1)],
    { ...rules, protectedBombs: [eights] }, true, true);
  assert.deepEqual(ranked[0], intact);
});

test('loose attachments are consumed before any bomb is split for a triple body', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const eights = group(8, 4);
  const hand = flatten(group(14, 1), kings, group(12, 1), eights,
    group(7, 1), group(6, 2), group(5, 2));
  const intact = [...kings, card(12), card(14)];
  const splitBomb = [...eights.slice(0, 3), card(12), card(14)];
  const ranked = rank(hand, [candidate(splitBomb, 0), candidate(intact, 1)],
    { ...rules, protectedBombs: [eights] }, true, true);
  assert.deepEqual(ranked[0], intact);
});

test('lower pair run is led first while the higher pair run remains to recapture', () => {
  const rank = loadRanker();
  const fives = group(5, 4);
  const lowRun = flatten(group(8, 2), group(9, 2));
  const highRun = flatten(group(11, 2), group(12, 2));
  const hand = flatten(group(15, 1), group(13, 1), highRun, lowRun,
    group(7, 1), group(6, 1), fives);
  const ranked = rank(hand, [
    candidate(highRun, 0),
    candidate([card(6)], 1),
    candidate(lowRun, 2),
    candidate(fives, 3),
  ], { ...rules, protectedBombs: [fives] }, true, true);
  assert.deepEqual(ranked[0], lowRun);
});

test('independent pair five leads while the higher KKAA pair run remains to recapture', () => {
  const rank = loadRanker();
  const pairFives = group(5, 2);
  const pairTens = group(10, 2);
  const pairKings = group(13, 2);
  const pairAces = group(14, 2);
  const highRun = [...pairKings, ...pairAces];
  const hand = flatten(group(15, 1), pairAces, pairKings, group(11, 1),
    pairTens, group(6, 1), pairFives);
  const ranked = rank(hand, [
    candidate(highRun, 0),
    candidate(pairFives, 1),
    candidate(pairTens, 2),
    candidate(pairKings, 3),
    candidate(pairAces, 4),
    candidate(group(6, 1), 5),
    candidate(group(11, 1), 6),
    candidate(group(15, 1), 7),
  ], rules, true, true);
  assert.deepEqual(ranked[0], pairFives);
});

test('low 334455 pair run precedes the high 10-to-A straight on equal remaining turns', () => {
  const rank = loadRanker();
  const lowPairRun = flatten(group(3, 2), group(4, 2), group(5, 2));
  const highPairRun = flatten(group(8, 2), group(9, 2), group(10, 2));
  const highStraight = [card(10), card(11), card(12), card(13), card(14)];
  const hand = flatten(highStraight, highPairRun, lowPairRun);
  const ranked = rank(hand, [
    candidate(highStraight, 0),
    candidate(highPairRun, 1),
    candidate(lowPairRun, 2),
    candidate([...highStraight, card(9)], 3),
    candidate(flatten(group(9, 2), group(10, 2)), 4),
  ], rules, true, true);

  assert.deepEqual(ranked[0], lowPairRun);
});

test('lowest complete triple family precedes pair runs when a higher triple can recapture', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const tens = group(10, 3);
  const expected = [...fives, card(3), card(7)];
  const hand = flatten(group(14, 1), group(13, 1), group(11, 1), tens,
    group(9, 2), group(8, 1), group(7, 1), group(6, 2), fives, group(3, 1));
  const ranked = rank(hand, [
    candidate(expected, 0),
    candidate([...tens, card(3), card(7)], 1),
    candidate(flatten(group(5, 2), group(6, 2)), 2),
    candidate(flatten(group(9, 2), group(10, 2)), 3),
    candidate([card(9), card(10), card(11), card(12), card(13), card(14)], 4),
  ], rules, true, true);

  assert.deepEqual(ranked[0], expected);
});

test('a minimum five-card straight never breaks a bomb before the lower pair run', () => {
  const rank = loadRanker();
  const fives = group(5, 4);
  const lowRun = flatten(group(8, 2), group(9, 2));
  const highRun = flatten(group(11, 2), group(12, 2));
  const hand = flatten(group(15, 1), group(13, 1), highRun, lowRun,
    group(7, 1), group(6, 1), fives);
  const splitBombStraight = [5, 6, 7, 8, 9].map((value) => card(value));
  const ranked = rank(hand, [
    candidate(splitBombStraight, 0),
    candidate(highRun, 1),
    candidate(lowRun, 2),
    candidate(fives, 3),
  ], { ...rules, protectedBombs: [fives] }, true, true);
  assert.deepEqual(ranked[0], lowRun);
  assert.ok(!ranked.some((cards) => cards === splitBombStraight));
});

test('KKK carries pair queens and retains rank two as the final recovery card', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const queens = group(12, 2);
  const two = card(15);
  const expected = [...kings, ...queens];
  const ranked = rank(flatten([two], kings, queens), [
    candidate([...kings, queens[0], two], 0),
    candidate(expected, 1),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('multiple triples keep the higher triple bodies intact for recapture', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const eights = group(8, 3);
  const tens = group(10, 3);
  const kings = group(13, 3);
  const hand = flatten(kings, tens, group(9, 2), eights, group(7, 1), fives);
  const expected = [...fives, card(7), card(9)];
  const splitHigherTriple = [...fives, ...eights.slice(0, 2)];
  const ranked = rank(hand, [
    candidate(splitHigherTriple, 0),
    candidate([...tens, card(7), card(9)], 1),
    candidate(expected, 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('complete low triple-with-two precedes a bare higher triple in the live hand shape', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const eights = group(8, 3);
  const tens = group(10, 3);
  const kings = group(13, 3);
  const hand = flatten(kings, group(11, 1), tens, group(9, 2), eights,
    group(7, 1), fives);
  const expected = [...fives, card(7), card(11)];
  const ranked = rank(hand, [
    candidate(tens, 0),
    candidate([...tens, card(7), card(11)], 1),
    candidate(expected, 2),
    candidate(fives, 3),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('whole-hand isolation uses the larger straight when the public decomposition ranks it first', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const eights = group(8, 3);
  const tens = group(10, 3);
  const kings = group(13, 3);
  const hand = flatten(kings, group(12, 1), group(11, 1), tens,
    group(9, 2), eights, group(7, 1), fives);
  const straight = [7, 8, 9, 10, 11, 12].map((value) => card(value));
  const expected = [...fives, card(7), card(11)];
  const ranked = rank(hand, [
    candidate(straight, 0),
    candidate([...tens, card(7), card(11)], 1),
    candidate(expected, 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], straight);
});

test('lead straight 7-to-J preserves both the four-queen bomb and triple sixes', () => {
  const rank = loadRanker();
  const queens = group(12, 4);
  const sixes = group(6, 3);
  const sevens = group(7, 2);
  const hand = flatten(group(15, 1), group(14, 1), queens, group(11, 1),
    group(10, 1), group(9, 1), group(8, 1), sevens, sixes);
  const expected = [7, 8, 9, 10, 11].map((value) => card(value));
  const ranked = rank(hand, [
    candidate([...sixes, ...queens.slice(0, 2)], 0),
    candidate([...sixes, ...sevens], 1),
    candidate([...sixes, card(7), card(14)], 2),
    candidate([...sixes, card(8), card(10)], 3),
    candidate([...sixes, card(9), card(11)], 4),
    candidate(expected, 5),
    candidate(queens, 6),
  ], { ...rules, protectedBombs: [queens] }, true, true);
  assert.deepEqual(ranked[0], expected);
  assert.deepEqual(ranked.slice(0, 2).map((cards) => cards.map((value) => value % 100)), [
    [7, 8, 9, 10, 11],
    [7, 8, 9, 10, 11],
  ]);
  assert.notEqual(ranked[0][0], ranked[1][0]);
});

test('without attachment comparison a triple carries the lowest legal pair', () => {
  const rank = loadRanker();
  const eights = group(8, 3);
  const hand = flatten(group(14, 1), group(13, 1), group(12, 1), group(11, 2), eights);
  const smallestPair = [...eights, ...group(11, 2)];
  const ranked = rank(hand, [
    candidate([...eights, card(13), card(14)], 0),
    candidate([...eights, card(11), card(12)], 1),
    candidate([...eights, ...group(11, 2)], 2),
  ], { ...rules, compareTripleAttachments: false }, true, true);
  assert.deepEqual(ranked[0], smallestPair);
});

test('triple carries the surplus 9 instead of breaking the 9-to-A straight', () => {
  const rank = loadRanker();
  const eights = group(8, 3);
  const nines = group(9, 2);
  const hand = flatten([card(14), card(13), card(12), card(11), card(10)], nines,
    eights, [card(6)], group(5, 3), group(4, 2));
  const fives = group(5, 3);
  const lowBody = [...fives, card(6)];
  const keepStraight = [...eights, nines[0]];
  const ranked = rank(hand, [
    candidate([...eights, card(14)], 0),
    candidate([...fives, nines[0]], 1),
    candidate(keepStraight, 2),
    candidate([...eights, card(6)], 3),
    candidate(lowBody, 4),
  ], rules, true, true);
  assert.deepEqual(ranked, [lowBody, keepStraight]);
});

test('triple hint carries the largest loose single when attachments participate in comparison', () => {
  const rank = loadRanker();
  const fours = group(4, 3);
  const hand = flatten(group(14, 1), group(12, 2), group(11, 1), group(5, 2), fours, group(3, 1));
  const expected = [...fours, card(14)];
  const ranked = rank(hand, [
    candidate([...fours, card(14)], 0),
    candidate([...fours, card(11)], 1),
    candidate(expected, 2),
  ], { ...rules, compareTripleAttachments: true }, true, true);

  assert.deepEqual(ranked[0], expected);
});

test('triple attachment order follows the authoritative comparison option', () => {
  const rank = loadRanker();
  const eights = group(8, 3);
  const nine = card(9);
  const jack = card(11);
  const ace = card(14);
  const kings = group(13, 2);
  const hand = flatten(eights, [nine, jack], kings, [ace]);
  const candidates = [
    candidate([...eights, nine], 0),
    candidate([...eights, jack], 1),
    candidate([...eights, ace], 2),
  ];

  assert.deepEqual(rank(hand, candidates, {
    ...liangshanLeadRules,
    compareTripleAttachments: true,
  }, true, true)[0], [...eights, ace]);
  assert.deepEqual(rank(hand, candidates, {
    ...liangshanLeadRules,
    compareTripleAttachments: false,
  }, true, true)[0], [...eights, nine]);
});

test('a scoring bomb stays atomic and follows ordinary leads', () => {
  const rank = loadRanker();
  const jacks = group(11, 4);
  const tens = group(10, 3);
  const queen = card(12);
  const hand = flatten([queen], jacks, tens);
  const expected = [...tens, queen];
  const ranked = rank(hand, [
    candidate(hand, 0),
    candidate(expected, 1),
    candidate(jacks, 2),
  ], { ...rules, protectedBombs: [jacks], preserveScoringBombs: true }, true, true);
  assert.deepEqual(ranked[0], expected);
  assert.deepEqual(ranked[1], jacks);
  assert.ok(!ranked.some((cards) => cards.length === hand.length));
});

test('a scoring four-card bomb follows a pair and cannot carry it', () => {
  const rank = loadRanker();
  const queens = group(12, 4);
  const threes = group(3, 2);
  const bombWithPair = [...queens, ...threes];
  const ranked = rank(bombWithPair, [
    { ...candidate(bombWithPair, 0), usesFourCardBody: true },
    candidate(queens, 1),
    candidate(threes, 2),
  ], { ...rules, protectedBombs: [queens], preserveScoringBombs: true }, true, true);
  assert.deepEqual(ranked[0], threes);
  assert.deepEqual(ranked[1], queens);
  assert.ok(!ranked.some((cards) => cards.length === bombWithPair.length));
});

test('a non-scoring four-card rank stays atomic instead of becoming aircraft wings', () => {
  const rank = loadRanker();
  const jacks = group(11, 4);
  const tens = group(10, 3);
  const queen = card(12);
  const hand = flatten([queen], jacks, tens);
  const aircraftFinish = [...hand];
  const ranked = rank(hand, [
    candidate([...tens, queen], 0),
    candidate(jacks, 1),
    candidate(aircraftFinish, 2),
  ], { ...rules, protectedBombs: [jacks], preserveScoringBombs: false }, true, true);
  assert.deepEqual(ranked, [[...tens, queen], jacks]);
});

test('three-ace bomb follows scoring mode when answering a triple-with-pair', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const threes = group(3, 3);
  const tripleWithPair = [...aces, ...threes.slice(0, 2)];
  const hand = flatten(aces, threes, group(10, 2), group(6, 2), group(12, 1),
    group(11, 1), group(8, 1), group(7, 1), group(5, 1), group(4, 1));
  const candidates = [candidate(tripleWithPair, 0), candidate(aces, 1)];

  const scoring = rank(hand, candidates, {
    ...rules, protectedBombs: [aces], preserveScoringBombs: true,
  }, false, true);
  // Response flow ranks the same-shape pool before fallback bombs when scoring
  // is disabled, so model that pool boundary here instead of mixing shapes.
  const ordinary = rank(hand, [candidate(tripleWithPair, 0)], {
    ...rules, protectedBombs: [aces], preserveScoringBombs: false,
  }, false, true);

  assert.deepEqual(scoring, [aces]);
  assert.deepEqual(ordinary, []);
});

test('an ordinary same-shape response is prompted before a scoring bomb fallback', () => {
  const rank = loadRanker();
  const queens = group(12, 4);
  const sixes = group(6, 2);
  const hand = flatten(queens, sixes, group(13, 1), group(11, 1), group(10, 1), group(7, 1), group(3, 1));
  const scoring = rank(hand, [candidate(sixes, 0), candidate(queens, 1)], {
    ...rules, protectedBombs: [queens], preserveScoringBombs: true,
  });
  const ordinary = rank(hand, [candidate(sixes, 0), candidate(queens, 1)], {
    ...rules, protectedBombs: [queens], preserveScoringBombs: false,
  });
  assert.deepEqual(scoring[0], sixes);
  assert.deepEqual(ordinary[0], sixes);
});

test('a simple 2,44,3 equal-turn lead sheds the larger pair first', () => {
  const rank = loadRanker();
  const two = card(15);
  const fours = group(4, 2);
  const three = card(3);
  const hand = flatten([two], fours, [three]);
  const ranked = rank(hand, [
    { ...candidate([two], 0), containsRuleMaximum: true },
    candidate(fours, 1),
    candidate([three], 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], fours);
});

test('multiple pairs lead the smallest pair when loose A is not the regional maximum', () => {
  const rank = loadRanker();
  const sixes = group(6, 2);
  const eights = group(8, 2);
  const tens = group(10, 2);
  const three = card(3);
  const ace = card(14);
  const hand = flatten(sixes, eights, tens, [three, ace]);
  const ranked = rank(hand, [
    { cards: [three], order: 0, containsRuleMaximum: false },
    { cards: [ace], order: 1, containsRuleMaximum: false },
    candidate(tens, 2), candidate(eights, 3), candidate(sixes, 4),
  ], rules, true, true);
  assert.deepEqual(ranked[0], sixes);
});

test('pair-dominant hand leads 33 before loose singles including the maximum 2', () => {
  const rank = loadRanker();
  const threes = group(3, 2);
  const hand = flatten([card(15), card(11), card(9), card(6)],
    group(12, 2), group(7, 2), group(5, 2), threes);
  const ranked = rank(hand, [
    candidate([card(6)], 0),
    candidate([card(9)], 1),
    candidate([card(11)], 2),
    candidate([card(15)], 3),
    candidate(group(12, 2), 4),
    candidate(group(7, 2), 5),
    candidate(group(5, 2), 6),
    candidate(threes, 7),
  ], rules, true, true);
  assert.deepEqual(ranked[0], threes);
});

test('self lead without the regional maximum prefers pair QQ over single J', () => {
  const rank = loadRanker();
  const queens = group(12, 2);
  const jack = [card(11)];
  const ranked = rank(flatten(queens, jack), [
    candidate(jack, 0), candidate(queens, 1),
  ], rules, true, true);
  assert.deepEqual(ranked[0], queens);
});

test('self lead KKJQ prefers the pair when neither single is the regional maximum', () => {
  const rank = loadRanker();
  const kings = group(13, 2);
  const jack = [card(11)];
  const queen = [card(12)];
  const ranked = rank(flatten(kings, jack, queen), [
    candidate(jack, 0), candidate(queen, 1), candidate(kings, 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], kings);
});

test('self lead AAK4 preserves the regional-maximum pair and starts from 4', () => {
  const rank = loadRanker();
  const aces = group(14, 2);
  const four = [card(4)];
  const king = [card(13)];
  const ranked = rank(flatten(aces, king, four), [
    { ...candidate(aces, 0), containsRuleMaximum: true },
    candidate(king, 1),
    candidate(four, 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], four);
  assert.deepEqual(ranked[1], king);
  assert.deepEqual(ranked[2], aces);
});

test('self lead 4,5,7,J plus KK or AA starts from the lowest single', () => {
  const rank = loadRanker();
  for (const pairRank of [13, 14]) {
    const pair = group(pairRank, 2);
    const four = [card(4)];
    const hand = flatten(four, [card(5), card(7), card(11)], pair);
    const ranked = rank(hand, [
      { ...candidate(pair, 0), containsRuleMaximum: pairRank === 14 },
      candidate([card(11)], 1),
      candidate([card(7)], 2),
      candidate([card(5)], 3),
      candidate(four, 4),
    ], rules, true, true);
    assert.deepEqual(ranked[0], four, `pair rank ${pairRank}`);
    assert.deepEqual(ranked[1], [card(5)], `pair rank ${pairRank}`);
    assert.deepEqual(ranked.at(-1), pair, `pair rank ${pairRank}`);
  }
});

test('complete 44433 leads before the independent 56789 and retains 101010QQ', () => {
  const rank = loadRanker();
  const threes = group(3, 2);
  const fours = group(4, 3);
  const straight = [5, 6, 7, 8, 9].map((value) => card(value));
  const tens = group(10, 3);
  const queens = group(12, 2);
  const lowTripleFamily = [...fours, ...threes];
  const highTripleFamily = [...tens, ...queens];
  const hand = flatten([card(13)], queens, tens, straight, fours, threes);
  const ranked = rank(hand, [
    candidate(straight, 0),
    candidate(highTripleFamily, 1),
    candidate(lowTripleFamily, 2),
    candidate([...fours, ...queens], 3),
    candidate([...tens, ...threes], 4),
    candidate(fours, 5),
    candidate(tens, 6),
  ], rules, true, true);
  assert.deepEqual(ranked[0], lowTripleFamily);
  assert.ok(ranked.some((cards) => cards.map((value) => value % 100).join(',')
    === straight.map((value) => value % 100).join(',')));
  assert.ok(ranked.some((cards) => cards.map((value) => value % 100).sort((a, b) => a - b).join(',')
    === highTripleFamily.map((value) => value % 100).sort((a, b) => a - b).join(',')));
});

test('self lead without the regional maximum prefers 8899 and defers the bomb', () => {
  const rank = loadRanker();
  const pairRun = flatten(group(8, 2), group(9, 2));
  const bomb = group(10, 4);
  const hand = flatten([card(14)], group(13, 2), group(11, 2), bomb,
    pairRun, [card(5)], group(3, 2));
  const ranked = rank(hand, [
    candidate(group(3, 2), 0),
    candidate(group(8, 2), 1),
    candidate(pairRun, 2),
    candidate(bomb, 3),
  ], rules, true, true);
  assert.deepEqual(ranked[0], pairRun);
  assert.deepEqual(ranked.at(-1), bomb);
});

test('whole-hand isolation chooses the 5-to-A straight and retains 991010', () => {
  const rank = loadRanker();
  const long = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((value) => card(value));
  const short = [5, 6, 7, 8, 9].map((value) => card(value));
  const hand = flatten([card(14), card(13), card(12), card(11)], group(10, 3),
    group(9, 3), [card(8), card(7), card(6)], group(5, 2), [card(3)]);
  const ranked = rank(hand, [candidate(short, 0), candidate(long, 1)], rules, true, true);
  assert.deepEqual(ranked[0], long);
});

test('lead QQQ carries 77 and preserves the regional maximum 2 before the final hand', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const sevens = group(7, 2);
  const hand = flatten([card(15), card(14)], queens, group(11, 2), group(9, 2), sevens);
  const expected = [...queens, ...sevens];
  const ranked = rank(hand, [
    { ...candidate([...queens, card(15), card(14)], 0), containsRuleMaximum: true },
    candidate(expected, 1),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('response uses KKK with clean wings when it preserves the most structured cards', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const eights = group(8, 3);
  const hand = flatten(kings, [card(12), card(11), card(10), card(9)], eights,
    [card(7), card(6)], group(5, 2), [card(4), card(3)]);
  const expected = [...kings, card(5), card(8)];
  const ranked = rank(hand, [
    candidate([...eights, card(5), card(12)], 0),
    candidate(expected, 1),
    candidate([...kings, card(5), card(12)], 2),
  ], rules, false, true);
  const first = ranked[0];
  assert.ok(first.length === 5 && kings.every((value) => first.includes(value)));
  assert.ok(first.includes(card(5)));
  assert.ok(first.includes(card(8)) || first.includes(card(12)));
});

test('triple-chain wing allocation never carries A when lower real singles exist', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const fours = group(4, 3);
  const hand = flatten([card(14)], queens, [card(11)], group(10, 2), [card(9)],
    group(8, 2), [card(6)], fours);
  const ranked = rank(hand, [
    candidate([...fours, card(6), card(8)], 0),
    candidate([...fours, card(6), card(9)], 1),
    candidate([...fours, card(6), card(14)], 2),
    candidate([...queens, card(6), card(8)], 3),
    candidate([...queens, card(6), card(9)], 4),
    candidate([...queens, card(6), card(14)], 5),
    candidate([8, 9, 10, 11, 12].map((value) => card(value)), 6),
  ], rules, true, true);
  const fourFamily = ranked.find((cards) => cards.filter((value) => value % 100 === 4).length === 3);
  assert.ok(fourFamily);
  assert.ok(!fourFamily.includes(card(14)));
  assert.ok(fourFamily.includes(card(6)));
  assert.ok(fourFamily.includes(card(8)) || fourFamily.includes(card(9)));
});

test('triple with two compares the smallest loose single against the smallest pair', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const pairFives = group(5, 2);
  const highSingleHand = flatten([card(15), card(14)], kings, group(12, 2), group(9, 2), pairFives);
  const pairFirst = rank(highSingleHand, [
    candidate([...kings, card(14), card(5)], 0),
    candidate([...kings, ...pairFives], 1),
    { ...candidate([...kings, card(15), card(14)], 2), containsRuleMaximum: true },
  ], rules, true, true);
  assert.deepEqual(pairFirst[0], [...kings, ...pairFives]);

  const lowSingleHand = flatten([card(15), card(4)], kings, group(12, 2), group(9, 2), pairFives);
  const splitPair = rank(lowSingleHand, [
    candidate([...kings, ...pairFives], 0),
    candidate([...kings, card(4), card(5)], 1),
    { ...candidate([...kings, card(15), card(4)], 2), containsRuleMaximum: true },
  ], rules, true, true);
  assert.deepEqual(splitPair[0], [...kings, card(4), card(5)]);
});

test('no attachment comparison still carries loose 5 and 6 before splitting pair fours', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const pairFours = group(4, 2);
  const hand = flatten(group(15, 1), group(14, 1), queens, group(11, 2),
    group(10, 2), group(9, 2), group(7, 1), group(6, 1), group(5, 1), pairFours);
  const looseWings = [...queens, card(5), card(6)];
  const ranked = rank(hand, [
    candidate([...queens, ...pairFours], 0),
    candidate(looseWings, 1),
  ], { ...rules, compareTripleAttachments: false }, true, true);
  assert.deepEqual(ranked[0], looseWings);
});

test('whole-hand isolation chooses the clean straight before the triple', () => {
  const rank = loadRanker();
  const threes = group(3, 3);
  const hand = flatten(group(14, 1), group(12, 1), group(11, 1), group(10, 1),
    group(9, 1), group(8, 1), group(7, 1), group(6, 1), group(5, 1), group(4, 1), threes);
  const longest = [4, 5, 6, 7, 8, 9, 10, 11, 12].map((value) => card(value));
  const longerButSplitsTriple = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((value) => card(value));
  const low = [4, 5, 6, 7, 8, 9, 10, 11].map((value) => card(value));
  const high = [5, 6, 7, 8, 9, 10, 11, 12].map((value) => card(value));
  const triple = [...threes, card(4), card(5)];
  const ranked = rank(hand, [
    candidate(low, 0), candidate(high, 1), candidate(triple, 2), candidate(longest, 3),
    candidate(longerButSplitsTriple, 4),
  ],
    { ...rules, singleAttachmentCapacityPerTriple: 2 }, true, true);
  assert.deepEqual(ranked.slice(0, 2), [longest, triple]);
  assert.ok(ranked.findIndex((cards) => cards.length === high.length
    && cards.every((value) => high.includes(value))) > 1);
});

test('scoring regional three-ace bomb stays atomic and follows ordinary leads', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const four = card(4);
  const hand = flatten(aces, [four], group(10, 2), group(6, 2));
  const ranked = rank(hand, [
    candidate([aces[0]], 0),
    candidate([...aces, four], 1),
    candidate([four], 2),
    { ...candidate(aces, 3), containsRuleMaximum: true },
  ], { ...rules, protectedBombs: [aces], preserveScoringBombs: true }, true, true);
  assert.deepEqual(ranked[0], [four]);
  assert.ok(ranked.some((cards) => cards.length === aces.length
    && cards.every((cardValue) => aces.includes(cardValue))));
  assert.ok(!ranked.some((cards) => cards.length < aces.length
    && cards.some((cardValue) => aces.includes(cardValue))));
});

test('scoring three-ace bomb stays intact behind the largest ordinary structure', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const threes = group(3, 3);
  const tens = group(10, 2);
  const straight = [4, 5, 6, 7, 8, 9].map((value) => card(value));
  const cleanTriple = [...threes, ...tens];
  const splitAceBomb = [...threes, ...aces.slice(0, 2)];
  const hand = flatten(aces, threes, tens, group(9, 1), group(8, 1), group(7, 1),
    group(6, 1), group(5, 1), group(4, 1));
  const ranked = rank(hand, [
    candidate(splitAceBomb, 0),
    candidate(cleanTriple, 1),
    candidate(straight, 2),
    { ...candidate(aces, 3), containsRuleMaximum: true },
  ], { ...rules, protectedBombs: [aces], preserveScoringBombs: true }, true, true);
  assert.deepEqual(ranked[0], straight);
  assert.ok(ranked.some((cards) => cards.length === straight.length
    && cards.every((value) => straight.includes(value))));
  assert.ok(ranked.some((cards) => cards.length === cleanTriple.length
    && cards.every((value) => cleanTriple.includes(value))));
  assert.ok(!ranked.some((cards) => cards.length === splitAceBomb.length
    && cards.every((value) => splitAceBomb.includes(value))));
});

test('self lead keeps a scoring queen bomb behind ordinary triple families', () => {
  const rank = loadRanker();
  const queens = group(12, 4);
  const nines = group(9, 3);
  const threes = group(3, 3);
  const pairSevens = group(7, 2);
  const hand = flatten(group(14, 1), group(13, 1), queens, nines, pairSevens,
    group(6, 1), group(5, 1), threes);
  const threesWithLoose = [...threes, card(5), card(6)];
  const ranked = rank(hand, [
    candidate(queens, 0),
    candidate(threesWithLoose, 1),
    candidate([...nines, card(5), card(6)], 2),
    candidate(pairSevens, 3),
  ], { ...rules, protectedBombs: [queens], preserveScoringBombs: true }, true, true);
  assert.deepEqual(ranked[0], threesWithLoose);
  assert.ok(!ranked.some((cards) => cards.length > queens.length
    && queens.every((cardValue) => cards.includes(cardValue))));
});

test('a non-scoring bomb prefers a legal four-with-two finish', () => {
  const rank = loadRanker();
  const fours = group(4, 4);
  const six = card(6);
  const seven = card(7);
  const finish = [...fours, six, seven];
  const ranked = rank(finish, [
    { ...candidate(finish, 0), usesFourCardBody: true },
    candidate(fours, 1),
    candidate([seven], 2),
    candidate([six], 3),
  ], { ...rules, protectedBombs: [fours], preserveScoringBombs: false }, true, true);
  assert.deepEqual(ranked[0], finish);
  assert.deepEqual(ranked.slice(1), [[six], [seven], fours]);
});

test('a scoring bomb rejects the same four-with-two split', () => {
  const rank = loadRanker();
  const fours = group(4, 4);
  const six = card(6);
  const seven = card(7);
  const finish = [...fours, six, seven];
  const ranked = rank(finish, [
    { ...candidate(finish, 0), usesFourCardBody: true },
    candidate(fours, 1),
    candidate([seven], 2),
    candidate([six], 3),
  ], { ...rules, protectedBombs: [fours], preserveScoringBombs: true }, true, true);
  assert.deepEqual(ranked, [[six], [seven], fours]);
});

test('bomb atomicity is identical for self lead and response hints', () => {
  const rank = loadRanker();
  const fours = group(4, 4);
  const hand = flatten([card(15)], group(13, 2), [card(11), card(10), card(7)],
    group(6, 3), [card(5)], fours, group(3, 2));
  const brokenTriple = [...fours.slice(0, 3), card(5), card(7)];
  const brokenSingle = [fours[0]];
  const candidates = [candidate(brokenTriple, 0), candidate(brokenSingle, 1), candidate(fours, 2)];
  const activeRules = { ...rules, protectedBombs: [fours], preserveScoringBombs: false };

  assert.deepEqual(rank(hand, candidates, activeRules, true, true), [fours]);
  assert.deepEqual(rank(hand, candidates, activeRules, false, true), [fours]);
});

test('self-lead final queue keeps complete QQQQ as the last hint without splitting it', () => {
  const rank = loadRanker();
  const queens = group(12, 4);
  const pairJacks = group(11, 2);
  const pairTens = group(10, 2);
  const hand = flatten([card(15)], group(14, 2), group(13, 2), queens,
    pairJacks, pairTens, [card(8), card(7), card(6)]);
  const ranked = rank(hand, [
    candidate(queens.slice(0, 3), 0),
    candidate([...queens.slice(0, 3), card(6), card(7)], 1),
    candidate(queens, 2),
    candidate(pairJacks, 3),
    candidate(pairTens, 4),
    candidate([card(6)], 5),
  ], { ...rules, protectedBombs: [queens], preserveScoringBombs: false }, true, true);

  assert.deepEqual(ranked.at(-1), queens);
  assert.ok(!ranked.some((cards) => cards.length !== 4
    && cards.some((value) => queens.includes(value))));
});

test('feedback figure 1 leads the lower equal-length straight 34567', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const hand = flatten([card(14)], group(13, 2), group(12, 2), [card(11), card(10)],
    group(9, 2), [card(7), card(6)], fives, [card(4), card(3)]);
  const low = [3, 4, 5, 6, 7].map((value) => card(value));
  const high = [10, 11, 12, 13, 14].map((value) => card(value));
  const ranked = rank(hand, [
    candidate(high, 0),
    candidate([...fives, card(3), card(4)], 1),
    candidate(low, 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], low);
});

test('feedback figure 2 uses 444 with loose 3 and 6 to minimize singles', () => {
  const rank = loadRanker();
  const fours = group(4, 3);
  const hand = flatten([card(14), card(13)], group(12, 2), group(11, 2), [card(10)],
    group(9, 2), [card(6)], group(5, 2), fours, [card(3)]);
  const expected = [...fours, card(3), card(6)];
  const ranked = rank(hand, [
    candidate([...fours, card(3), card(5)], 0),
    candidate([...fours, ...group(5, 2)], 1),
    candidate(expected, 2),
    candidate([9, 10, 11, 12, 13].map((value) => card(value)), 3),
  ], rules, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('feedback figure 3 uses QQQ with pair fours', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const fours = group(4, 2);
  const hand = flatten([card(14)], group(13, 2), queens, group(11, 2), [card(10)], fours);
  const expected = [...queens, ...fours];
  const ranked = rank(hand, [
    candidate([...queens, card(10), card(11)], 0),
    candidate(expected, 1),
    candidate(group(13, 2), 2),
  ], { ...rules, maximumSingleRanks: [14] }, true, true);
  assert.deepEqual(ranked[0], expected);
});

test('feedback figure 4 keeps an opening bomb behind every ordinary lead', () => {
  const rank = loadRanker();
  const kings = group(13, 4);
  const threes = group(3, 3);
  const hand = flatten([card(15)], kings, [card(11), card(9)], group(8, 2),
    [card(7), card(6), card(5), card(4)], threes);
  const straight = [3, 4, 5, 6, 7].map((value) => card(value));
  const ranked = rank(hand, [
    candidate(kings, 0),
    candidate([...threes, card(4), card(5)], 1),
    candidate(straight, 2),
  ], { ...rules, protectedBombs: [kings], preserveScoringBombs: true }, true, true);
  assert.notDeepEqual(ranked[0], kings);
  assert.deepEqual(ranked.at(-1), kings);
});

test('feedback figure 5 compares the complete decomposition before local pairs', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const hand = flatten([card(14)], kings, group(12, 2), [card(11), card(10), card(8), card(7), card(6)],
    group(5, 2), group(4, 2), [card(3)]);
  const lowStraight = [3, 4, 5, 6, 7, 8].map((value) => card(value));
  const ranked = rank(hand, [
    candidate(group(5, 2), 0),
    candidate(group(4, 2), 1),
    candidate([...kings, card(3), card(4)], 2),
    candidate(lowStraight, 3),
  ], rules, true, true);
  assert.deepEqual(ranked[0], lowStraight);
});

test('equal minimum singles next prefer fewer remaining plays and retain JJJ plus 33', () => {
  const rank = loadRanker();
  const jacks = group(11, 3);
  const threes = group(3, 2);
  const hand = flatten(group(14, 2), group(13, 2), jacks,
    [card(10), card(9), card(8), card(7), card(6), card(5), card(4)], threes);
  const fourToTen = [4, 5, 6, 7, 8, 9, 10].map((value) => card(value));
  const fourToJack = [...fourToTen, jacks[0]];
  const ranked = rank(hand, [
    candidate(fourToJack, 0),
    candidate(fourToTen, 1),
  ], rules, true, true);

  assert.deepEqual(ranked[0], fourToTen);
});
