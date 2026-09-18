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
  minimumStraightLength: 5,
  minimumPairRunLength: 2,
  allowTwoInRuns: false,
  singleAttachmentCapacityPerTriple: 2,
  prioritizeLooseSingles: true,
  optimizeWholeHand: true,
  compareTripleAttachments: true,
};

test('triple attachments consume loose 6 and K without opening any pair', () => {
  const rank = loadRanker();
  const nines = group(9, 3);
  const hand = flatten(group(15, 1), group(13, 1), group(12, 2), group(11, 2),
    group(10, 2), nines, group(8, 2), group(6, 1), group(5, 2));
  const clean = [...nines, card(6), card(13)];
  const ranked = rank(hand, [
    candidate([...nines, ...group(5, 2)], 0),
    candidate([...nines, ...group(8, 2)], 1),
    candidate(clean, 2),
    candidate([...nines, card(15), card(13)], 3),
  ], rules);
  assert.deepEqual(ranked[0], clean);
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

test('triple attachments preserve a pair run even when that spends a high loose A', () => {
  const rank = loadRanker();
  const queens = group(12, 3);
  const hand = flatten(group(14, 1), group(13, 2), queens, group(11, 2),
    group(10, 1), group(7, 2));
  const preservePairs = [...queens, card(10), card(14)];
  const ranked = rank(hand, [
    candidate([...queens, ...group(7, 2)], 0),
    candidate(preservePairs, 1),
    candidate([...queens, ...group(11, 2)], 2),
  ], rules);
  assert.deepEqual(ranked[0], preservePairs);
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

test('triple with two uses loose singles before an intact pair', () => {
  const rank = loadRanker();
  const fives = group(5, 3);
  const threes = group(3, 2);
  const hand = flatten(group(15, 1), group(14, 1), group(9, 1), group(8, 1), fives, threes);
  const looseWings = [...fives, card(8), card(9)];
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

test('AAA is not the first hint while more than ten cards remain', () => {
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

test('shorter straight keeps 99 and 1010 when the longer straight creates loose singles', () => {
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

test('authority aircraft guard rejects a foreign triple used as wings', () => {
  const source = readFileSync(helperPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  const guard = module.exports.isAuthorityCompatiblePdkAircraft;
  const invalid = flatten(group(12, 3), group(9, 3), group(8, 3), group(6, 1));
  const valid = flatten(group(12, 2), group(9, 3), group(8, 3), group(6, 2));
  assert.equal(guard(invalid, 18), false);
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

test('lead planner plays the seven-card 5-to-J straight before four-with-two alternatives', () => {
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
  assert.deepEqual(ranked[0], straight);
  assert.deepEqual(ranked.filter((cards) => cards.length === 6), [bombWithLoose, bombWithTen]);
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

test('a non-scoring bomb may donate one card only to the current long straight', () => {
  const rank = loadRanker();
  const nines = group(9, 4);
  const hand = flatten(group(14, 1), group(13, 1), group(12, 1), group(11, 1),
    group(10, 2), nines, group(8, 1), group(7, 2), group(6, 1), group(5, 1));
  const straight = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((value) => card(value));
  const triple = [...nines.slice(0, 3), card(7), card(10)];
  const ranked = rank(hand, [candidate(nines, 0), candidate(triple, 1), candidate(straight, 2)],
    { ...rules, protectedBombs: [nines] }, true, true);
  assert.deepEqual(ranked[0], straight);
  assert.ok(!ranked.some((cards) => cards.length === 5
    && cards.map((value) => value % 100).sort((a, b) => a - b).join(',') === '7,9,9,9,10'));
});

test('lead triple uses loose 10 and J while retaining the regional maximum 2', () => {
  const rank = loadRanker();
  const kings = group(13, 3);
  const hand = flatten(group(15, 1), kings, group(11, 2), group(10, 1), group(9, 2),
    group(8, 2), group(7, 2), group(5, 3));
  const expected = [...kings, card(10), card(11)];
  const ranked = rank(hand, [candidate([...kings, card(15), card(10)], 0),
    candidate(expected, 1), candidate(group(11, 2), 2)], rules, true, true);
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

test('666 carries loose 5 and K without consuming pair aces or triple tens', () => {
  const rank = loadRanker();
  const sixes = group(6, 3);
  const hand = flatten(group(14, 2), group(13, 1), group(10, 3), sixes, group(5, 1));
  const expected = [...sixes, card(5), card(13)];
  const ranked = rank(hand, [candidate([...sixes, ...group(14, 2)], 0),
    candidate([...sixes, card(10), card(13)], 1), candidate(expected, 2)], rules, true, true);
  assert.deepEqual(ranked[0], expected);
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

test('pair-heavy hand carries the smallest pair and keeps high loose controls', () => {
  const rank = loadRanker();
  const jacks = group(11, 3);
  const hand = flatten(group(14, 1), group(13, 1), jacks,
    group(10, 2), group(8, 2), group(6, 2));
  const expected = [...jacks, ...group(6, 2)];
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

test('triple recovery chain precedes a straight that dismantles several triples', () => {
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
  assert.deepEqual(ranked[0], expected);
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

test('ordinary triple attachments consume loose singles before an intact pair', () => {
  const rank = loadRanker();
  const eights = group(8, 3);
  const hand = flatten(group(14, 1), group(13, 1), group(12, 1), group(11, 2), eights);
  const looseSingles = [...eights, card(13), card(14)];
  const ranked = rank(hand, [
    candidate([...eights, card(13), card(14)], 0),
    candidate([...eights, card(11), card(12)], 1),
    candidate([...eights, ...group(11, 2)], 2),
  ], { ...rules, compareTripleAttachments: false }, true, true);
  assert.deepEqual(ranked[0], looseSingles);
});

test('triple hint carries the smallest loose single when attachments participate in comparison', () => {
  const rank = loadRanker();
  const fours = group(4, 3);
  const hand = flatten(group(14, 1), group(12, 2), group(11, 1), group(5, 2), fours, group(3, 1));
  const expected = [...fours, card(3)];
  const ranked = rank(hand, [
    candidate([...fours, card(14)], 0),
    candidate([...fours, card(11)], 1),
    candidate(expected, 2),
  ], { ...rules, compareTripleAttachments: true }, true, true);

  assert.deepEqual(ranked[0], expected);
});

test('a scoring bomb stays atomic but an ordinary complete lead is prompted first', () => {
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

test('a scoring four-card bomb cannot carry a pair as a four-card body', () => {
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

test('a non-scoring four-card rank may become an aircraft body and wings to finish', () => {
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
  assert.deepEqual(ranked[0], aircraftFinish);
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
  assert.deepEqual(ordinary[0], tripleWithPair);
});

test('a scoring bomb is prompted before an ordinary same-shape response', () => {
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
  assert.deepEqual(scoring[0], queens);
  assert.deepEqual(ordinary[0], sixes);
});

test('a simple 2,44,3 lead starts from the loose 3 and retains 2 to recapture', () => {
  const rank = loadRanker();
  const two = card(15);
  const fours = group(4, 2);
  const three = card(3);
  const hand = flatten([two], fours, [three]);
  const ranked = rank(hand, [
    candidate([two], 0),
    candidate(fours, 1),
    candidate([three], 2),
  ], rules, true, true);
  assert.deepEqual(ranked[0], [three]);
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

test('an intact triple follows the cleanest straight before overlapping alternatives', () => {
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
  assert.deepEqual(ranked.slice(0, 2), [low, triple]);
  assert.ok(ranked.findIndex((cards) => cards.length === high.length
    && cards.every((value) => high.includes(value))) > 1);
});

test('scoring regional three-ace bomb stays atomic behind an ordinary self lead', () => {
  const rank = loadRanker();
  const aces = group(14, 3);
  const four = card(4);
  const hand = flatten(aces, [four], group(10, 2), group(6, 2));
  const ranked = rank(hand, [
    candidate([aces[0]], 0),
    candidate([...aces, four], 1),
    candidate([four], 2),
    candidate(aces, 3),
  ], { ...rules, protectedBombs: [aces], preserveScoringBombs: true }, true, true);
  assert.notDeepEqual(ranked[0], aces);
  assert.ok(ranked.some((cards) => cards.length === aces.length
    && cards.every((cardValue) => aces.includes(cardValue))));
  assert.ok(!ranked.some((cards) => cards.length < aces.length
    && cards.some((cardValue) => aces.includes(cardValue))));
});

test('scoring three-ace bomb stays intact while the cleanest ordinary structure leads', () => {
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
    candidate(aces, 3),
  ], { ...rules, protectedBombs: [aces], preserveScoringBombs: true }, true, true);
  assert.deepEqual(ranked[0], cleanTriple);
  assert.ok(ranked.some((cards) => cards.length === straight.length
    && cards.every((value) => straight.includes(value))));
  assert.ok(ranked.some((cards) => cards.length === cleanTriple.length
    && cards.every((value) => cleanTriple.includes(value))));
  assert.ok(!ranked.some((cards) => cards.length === splitAceBomb.length
    && cards.every((value) => splitAceBomb.includes(value))));
});

test('self lead starts from 333 with attachments before a scoring queen bomb', () => {
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

test('a non-scoring bomb hand cycles loose singles, bomb, then four-with-two finish', () => {
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
  assert.deepEqual(ranked, [[six], [seven], fours, finish]);
});
