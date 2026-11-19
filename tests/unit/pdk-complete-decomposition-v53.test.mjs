import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const helperPath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/logic/PdkCleanHintRanker.ts', import.meta.url).pathname;
function loadRanker() {
  const modules = new Map();
  const loadModule = (filename) => {
    const normalized = extname(filename) ? filename : `${filename}.ts`;
    if (modules.has(normalized)) return modules.get(normalized).exports;
    const module = { exports: {} };
    modules.set(normalized, module);
    const source = readFileSync(normalized, 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (specifier) => {
      if (specifier === '../../Regional/PdkBusinessCodes') {
        return { PDK_BUSINESS_CODES: { LIANGSHAN: 'LS201' } };
      }
      if (specifier.startsWith('./')) return loadModule(resolve(dirname(normalized), specifier));
      throw new Error(`Unexpected dependency: ${specifier}`);
    };
    Function('module', 'exports', 'require', js)(module, module.exports, require);
    return module.exports;
  };
  return loadModule(helperPath);
}

const card = (rank, suit = 1) => suit * 100 + rank;
const group = (rank, count) => Array.from({ length: count }, (_v, index) => card(rank, index + 1));
const deck = Array.from({ length: 4 }, (_v, suit) =>
  Array.from({ length: 13 }, (_r, index) => card(index + 3, suit + 1))).flat();
const played = (cards = []) => cards.reduce((counts, value) => {
  counts[value % 100] += 1;
  return counts;
}, Array(16).fill(0));
const rules = {
  minimumStraightLength: 5,
  minimumPairRunLength: 2,
  allowTwoInRuns: false,
  tripleAttachmentMode: 'EITHER',
  decompositionPlanMode: 'SELF',
  deckCards: deck,
  playedRankCounts: played(),
  maximumSingleRanks: [15],
  preserveScoringBombs: false,
};
const candidate = (cards, order = 0, extras = {}) => ({ cards, order, ...extras });
const ranks = (cards) => cards.map((value) => value % 100).sort((a, b) => a - b);
const sameRanks = (left, right) => assert.deepEqual(ranks(left), ranks(right));
const load = loadRanker();

function ranked(hand, candidates, override = {}) {
  const rankingRules = { ...rules, ...override };
  if (rankingRules.decompositionPlanMode === 'RESPONSE') {
    const source = load.generatePdkFixedPlanCandidates(hand, rankingRules);
    return load.rankCleanPdkHints(hand, source, rankingRules);
  }
  const fixedDecomposition = load.decomposePdkHand(hand, {
    ...rankingRules,
    decompositionPlanMode: 'SELF',
  });
  return load.rankCleanPdkHints(hand,
    candidates.map((cards, order) => candidate(cards, order, {
      fixedDecomposition,
    })),
    { ...rankingRules, fixedDecomposition });
}

function fullPlan(hand, override = {}) {
  return load.decomposePdkHand(hand, { ...rules, ...override });
}

test('01 complete decomposition covers every physical card exactly once', () => {
  const hand = [...group(9, 3), card(5), card(11), ...group(10, 2), card(15)];
  const plan = fullPlan(hand);
  const flattened = plan.groups.flatMap((entry) => entry.cards);
  assert.equal(flattened.length, hand.length);
  assert.equal(new Set(flattened).size, hand.length);
  assert.deepEqual([...flattened].sort((a, b) => a - b), [...hand].sort((a, b) => a - b));
});

test('02 independent singles are used before splitting a pair for a triple wing', () => {
  const hand = [...group(9, 3), card(5), card(11), ...group(10, 2)];
  const plan = fullPlan(hand);
  const triple = plan.groups.find((entry) => entry.kind === 'TRIPLE_FAMILY');
  assert.ok(triple);
  sameRanks(triple.cards, [card(9, 1), card(9, 2), card(9, 3), card(5), card(11)]);
  assert.ok(plan.groups.some((entry) => entry.kind === 'PAIR'));
});

test('03 only the smallest pair is opened when loose singles are insufficient', () => {
  const hand = [...group(9, 3), ...group(6, 2), ...group(10, 2)];
  const plan = fullPlan(hand);
  const triple = plan.groups.find((entry) => entry.kind === 'TRIPLE_FAMILY');
  assert.ok(triple);
  assert.ok(triple.cards.some((value) => value % 100 === 6));
  assert.ok(!triple.cards.some((value) => value % 100 === 10));
});

test('04 2 is excluded from ordinary wings and allowed as the final emergency wing', () => {
  const hand = [...group(9, 3), card(15)];
  const plan = fullPlan(hand);
  assert.ok(plan.groups.some((entry) => entry.kind === 'TRIPLE_FAMILY'));
  assert.ok(plan.groups.some((entry) => ranks(entry.cards).includes(15)));
  const nonEmergency = fullPlan([...group(9, 3), card(15), card(5), card(7)]);
  const nonEmergencyTriple = nonEmergency.groups.find((entry) => entry.kind === 'TRIPLE_FAMILY');
  assert.ok(nonEmergencyTriple);
  assert.ok(!ranks(nonEmergencyTriple.cards).includes(15));
  const prompt = ranked(hand, [[...group(9, 3), card(15)]]);
  assert.equal(prompt[0].length, 4);
});

test('05 a scoring bomb stays intact while an unscored bomb remains available', () => {
  const scoring = group(12, 4);
  const ordinary = group(8, 4);
  const hand = [...scoring, ...ordinary, card(5), card(6)];
  const plan = fullPlan(hand, { protectedBombs: [scoring], preserveScoringBombs: true });
  assert.ok(plan.groups.some((entry) => entry.kind === 'BOMB' && ranks(entry.cards).every((v) => v === 12)));
  const prompt = ranked(hand, [ordinary, scoring, [card(5)]], {
    protectedBombs: [scoring], preserveScoringBombs: true,
  });
  sameRanks(prompt.at(-1), scoring);
});

test('05b an unscored bomb may participate in the minimum-turn decomposition', () => {
  const hand = [...group(8, 4), card(6), card(7)];
  const plan = fullPlan(hand);
  assert.ok(plan.groups.some((entry) => entry.kind === 'TRIPLE_FAMILY'));
  assert.ok(!plan.groups.some((entry) => entry.kind === 'BOMB'));
  assert.equal(plan.turns, 2);
});

test('05c an airplane keeps its body and follows it with the smallest loose wings', () => {
  const hand = [...group(5, 3), ...group(6, 3), card(7), card(8)];
  const plan = fullPlan(hand);
  const airplane = plan.groups.find((entry) => entry.kind === 'AIRPLANE');
  assert.ok(airplane);
  assert.deepEqual(ranks(airplane.cards), [5, 5, 5, 6, 6, 6, 7, 8]);
  assert.deepEqual(airplane.attachments.sort((a, b) => a - b), [7, 8]);
});

test('06 A becomes the absolute maximum single after every 2 is public', () => {
  const hand = [card(14), card(13)];
  const prompt = ranked(hand, [[card(13)], [card(14)]], { playedRankCounts: played(group(15, 4)) });
  sameRanks(prompt[0], [card(14)]);
});

test('07 AA becomes the absolute maximum pair after every 2 is public', () => {
  const hand = [...group(14, 2), ...group(12, 2)];
  const prompt = ranked(hand, [group(12, 2), group(14, 2)], { playedRankCounts: played(group(15, 4)) });
  sameRanks(prompt[0], group(14, 2));
});

test('08 no finish proof uses the largest complete decomposed candidate', () => {
  const hand = [...group(8, 3), card(12), ...group(13, 2)];
  const prompt = ranked(hand, [[card(12)], group(13, 2), [...group(8, 3), card(12)]], {
    finishesInTwo: false,
  });
  sameRanks(prompt[0], [...group(8, 3), card(12)]);
});

test('09 equal-size candidates use the lower point first', () => {
  const hand = [...group(7, 2), ...group(9, 2)];
  const prompt = ranked(hand, [group(9, 2), group(7, 2)]);
  sameRanks(prompt[0], group(7, 2));
});

test('10 final three singles use second-largest, maximum, smallest', () => {
  const hand = [card(15), card(7), card(9)];
  const prompt = ranked(hand, [[card(7)], [card(15)], [card(9)]], {
    playedRankCounts: played(group(15, 4)),
  });
  assert.deepEqual(prompt.map(ranks), [[9], [15], [7]]);
});

test('11 final three pairs use second-largest, maximum, smallest', () => {
  const hand = [...group(15, 2), ...group(7, 2), ...group(9, 2)];
  const prompt = ranked(hand, [group(7, 2), group(15, 2), group(9, 2)], {
    playedRankCounts: played(group(15, 2)),
  });
  assert.deepEqual(prompt.map(ranks), [[9, 9], [15, 15], [7, 7]]);
});

test('12 final three with a bomb uses 2, bomb, other group', () => {
  const hand = [card(15), ...group(9, 4), card(7)];
  const prompt = ranked(hand, [[card(7)], [card(15)], group(9, 4)], {
    preserveScoringBombs: true, protectedBombs: [group(9, 4)],
  });
  assert.deepEqual(prompt.map(ranks), [[15], [9, 9, 9, 9], [7]]);
});

test('13 response matches upper type and chooses the smallest single wing', () => {
  const hand = [...group(8, 3), card(6), card(9), card(14)];
  const prompt = ranked(hand, [[...group(8, 3), card(14)], [...group(8, 3), card(9)], [...group(8, 3), card(6)]], {
    decompositionPlanMode: 'RESPONSE', responseTargetType: 6, responseTargetCount: 4,
    responseTargetCards: [...group(7, 3), card(5)],
  });
  sameRanks(prompt[0], [...group(8, 3), card(6)]);
});

test('14 response does not mix a triple-with-one candidate with a bare triple', () => {
  const hand = [...group(8, 3), card(6), card(9)];
  const prompt = ranked(hand, [[...group(8, 3)], [...group(8, 3), card(6)]], {
    decompositionPlanMode: 'RESPONSE', responseTargetType: 6, responseTargetCount: 4,
    responseTargetCards: [...group(7, 3), card(5)],
  });
  assert.equal(prompt.length, 2);
  assert.ok(prompt.every((cards) => cards.length === 4
    && ranks(cards).filter((rank) => rank === 8).length === 3));
});

test('15 self lead allows same triple body attachment variants in one cycle', () => {
  const hand = [...group(5, 3), ...group(8, 2), card(7), card(9)];
  const prompt = ranked(hand, [[...group(5, 3), card(7), card(9)], [...group(5, 3), ...group(8, 2)]]);
  sameRanks(prompt[0], [...group(5, 3), card(7), card(9)]);
  sameRanks(prompt[1], [...group(5, 3), ...group(8, 2)]);
});

test('16 required first card filters every self-lead candidate', () => {
  const hand = [card(5), card(9)];
  const prompt = ranked(hand, [[card(9)], [card(5)]], {
    requiredFirstCard: card(5), isFirstPlayOfRound: true,
  });
  sameRanks(prompt[0], [card(5)]);
  assert.equal(prompt.length, 1);
});

test('17 disabled single and pair rules filter those candidate kinds', () => {
  const hand = [card(5), ...group(7, 2)];
  const prompt = ranked(hand, [[card(5)], group(7, 2)], { allowSingle: false, allowPair: true });
  // A complete decomposition cannot leave an illegal single tail. The
  // planner therefore fails closed instead of ranking a partial pair plan.
  assert.deepEqual(prompt, []);
});

test('18 unplanned candidates fail closed instead of triggering a second decomposition', () => {
  const hand = [...group(8, 3), card(6), card(9)];
  const prompt = ranked(hand, [[card(6)]], {});
  assert.deepEqual(prompt, []);
});

test('19 repeated ranking is deterministic', () => {
  const hand = [...group(6, 3), ...group(7, 2), card(8), card(9)];
  const candidates = [
    [...group(6, 3), card(8)],
    [...group(6, 3), card(9)],
    [...group(6, 3), ...group(7, 2)],
  ];
  const first = ranked(hand, candidates).map(ranks);
  for (let i = 0; i < 10; i += 1) assert.deepEqual(ranked(hand, candidates).map(ranks), first);
});

test('20 fifty generated hands preserve full decomposition and deterministic order', () => {
  let seed = 0x12345678;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  for (let index = 0; index < 50; index += 1) {
    const shuffled = [...deck].sort(() => (next() & 1) ? -1 : 1);
    const hand = shuffled.slice(0, 9);
    const plan = fullPlan(hand);
    const flattened = plan.groups.flatMap((entry) => entry.cards).sort((a, b) => a - b);
    assert.deepEqual(flattened, [...hand].sort((a, b) => a - b));
    const source = load.generatePdkFixedPlanCandidates(hand, rules).map((entry) => entry.cards);
    const first = ranked(hand, source).map(ranks);
    const second = ranked(hand, source).map(ranks);
    assert.deepEqual(second, first);
  }
});

test('21 protected scoring bombs remain in physical-card coverage', () => {
  const scoring = group(12, 4);
  const hand = [...scoring, ...group(9, 3), card(6)];
  const plan = fullPlan(hand, { protectedBombs: [scoring], preserveScoringBombs: true });
  const flattened = plan.groups.flatMap((entry) => entry.cards).sort((a, b) => a - b);
  assert.deepEqual(flattened, [...hand].sort((a, b) => a - b));
  assert.ok(plan.groups.some((entry) => entry.kind === 'BOMB'));
});

test('22 numeric required-first-card authority is retained by the resolved plan', () => {
  const resolved = load.resolvePdkHintRulePlan(
    { minimumStraightLength: 5, minimumPairRunLength: 2, requiredFirstCard: card(5),
      isFirstPlayOfRound: true, deckCards: deck },
    { policyId: 'COMMON', workbookIdentity: 'test' },
    { leading: true, previousType: 0, previousCardCount: 0 },
  );
  assert.equal(resolved.rules.requiredFirstCard, card(5));
  assert.equal(resolved.rules.isFirstPlayOfRound, true);
  const active = load.resolvePdkHintRulePlan(
    { minimumStraightLength: 5, minimumPairRunLength: 2, activeRequiredFirstCard: card(6) },
    { policyId: 'COMMON', workbookIdentity: 'test' },
    { leading: true, previousType: 0, previousCardCount: 0 },
  );
  assert.equal(active.rules.requiredFirstCard, card(6));
});

test('23 required-first-card filtering is inactive after the first play', () => {
  const hand = [card(5), card(9)];
  const prompt = ranked(hand, [[card(9)], [card(5)]], {
    requiredFirstCard: card(5), isFirstPlayOfRound: false,
  });
  assert.equal(prompt.length, 2);
});

test('24 response planning keeps the upper play type and count', () => {
  const hand = [...group(7, 2), ...group(9, 2), card(5)];
  const prompt = ranked(hand, [group(9, 2), [card(5)], group(7, 2)], {
    decompositionPlanMode: 'RESPONSE', responseTargetType: 3, responseTargetCount: 2,
    responseTargetCards: [...group(6, 2)],
  });
  assert.ok(prompt.length > 0);
  assert.ok(prompt.every((cards) => cards.length === 2 && ranks(cards)[0] === ranks(cards)[1]));
});

test('25 a 2 is not an ordinary wing when a loose card is available', () => {
  const plan = fullPlan([...group(9, 3), card(15), card(5)]);
  const triple = plan.groups.find((entry) => entry.kind === 'TRIPLE_FAMILY');
  assert.ok(triple && !ranks(triple.cards).includes(15));
  assert.ok(plan.groups.some((entry) => entry.kind === 'SINGLE' && ranks(entry.cards).includes(15)));
  assert.equal(plan.turns, 2);
});

test('26 pair-run structure is retained as one group', () => {
  const plan = fullPlan([...group(6, 2), ...group(7, 2), ...group(8, 2)]);
  assert.ok(plan.groups.some((entry) => entry.kind === 'PAIR_RUN'));
  assert.equal(plan.turns, 1);
});

test('27 straight structure is retained as one group', () => {
  const plan = fullPlan([card(5), card(6), card(7), card(8), card(9)]);
  assert.ok(plan.groups.some((entry) => entry.kind === 'STRAIGHT'));
  assert.equal(plan.turns, 1);
});

test('28 airplane pair wings are kept with the airplane body', () => {
  const hand = [...group(5, 3), ...group(6, 3), ...group(7, 2), ...group(8, 2)];
  const plan = fullPlan(hand);
  const airplane = plan.groups.find((entry) => entry.kind === 'AIRPLANE');
  assert.ok(airplane);
  assert.deepEqual(ranks(airplane.cards), [5, 5, 5, 6, 6, 6, 7, 7, 8, 8]);
});

test('29 scoring-bomb candidates remain after ordinary candidates in a hint cycle', () => {
  const scoring = group(12, 4);
  const hand = [...scoring, ...group(9, 2), ...group(10, 2)];
  const prompt = ranked(hand, [scoring, group(10, 2), group(9, 2)], {
    protectedBombs: [scoring], preserveScoringBombs: true,
  });
  assert.deepEqual(ranks(prompt.at(-1)), [12, 12, 12, 12]);
});

test('30 repeated hints preserve the same fixed candidate sequence', () => {
  const hand = [...group(5, 3), card(7), card(9), ...group(8, 2)];
  const candidates = [
    [...group(5, 3), card(7), card(9)],
    [...group(5, 3), ...group(8, 2)],
  ];
  const first = ranked(hand, candidates).map(ranks);
  assert.deepEqual(ranked(hand, candidates).map(ranks), first);
});

test('31 fixed decomposition keeps same triple-body variants together', () => {
  const hand = [...group(5, 3), card(7), ...group(8, 2), card(9)];
  const source = load.generatePdkFixedPlanCandidates(hand, rules);
  const prompt = load.rankCleanPdkHints(hand, source, rules).map(ranks);
  assert.deepEqual(prompt.slice(0, 2), [[5, 5, 5, 7, 9], [5, 5, 5, 8, 8]]);
});

test('32 response decomposition emits every higher same-shape group', () => {
  const hand = [...group(7, 1), ...group(8, 1), ...group(9, 1)];
  const source = load.generatePdkFixedPlanCandidates(hand, {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(8)],
  });
  const prompt = load.rankCleanPdkHints(hand, source, {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(8)],
  });
  assert.deepEqual(prompt.map(ranks), [[9]]);
});

test('33 response triple-with-one keeps the smallest legal loose wing', () => {
  const hand = [...group(8, 3), card(6), card(9), card(14)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 6,
    responseTargetCount: 4,
    responseTargetCards: [...group(7, 3), card(5)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.ok(prompt.length > 0);
  assert.deepEqual(ranks(prompt[0]), [6, 8, 8, 8]);
  assert.ok(prompt.every((cards) => cards.length === 4 && ranks(cards)[1] === 8));
});

test('34 two-hand残局 puts the single absolute maximum before the larger play', () => {
  const hand = [...group(14, 2), ...group(11, 3), ...group(5, 2)];
  const prompt = ranked(hand, load.generatePdkFixedPlanCandidates(hand, {
    ...rules,
    playedRankCounts: played(group(15, 4)),
  }).map((entry) => entry.cards), { playedRankCounts: played(group(15, 4)) });
  assert.deepEqual(ranks(prompt[0]), [14, 14]);
});

test('35 response honors attachment comparison and bomb tiers', () => {
  const attachmentRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 6,
    responseTargetCount: 4,
    responseTargetCards: [...group(11, 3), card(5)],
    compareTripleAttachments: true,
  };
  const attachmentHand = [...group(12, 3), card(4), card(6)];
  const attachmentSource = load.generatePdkFixedPlanCandidates(attachmentHand, attachmentRules);
  const attachmentPrompt = load.rankCleanPdkHints(attachmentHand, attachmentSource, attachmentRules);
  assert.deepEqual(ranks(attachmentPrompt[0]), [6, 12, 12, 12]);

  const bombRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 11,
    responseTargetCount: 3,
    responseTargetCards: [...group(13, 3)],
    specialTripleBombRanks: [13, 14],
    specialBombTier: 2,
  };
  const bombHand = [...group(14, 3)];
  const bombSource = load.generatePdkFixedPlanCandidates(bombHand, bombRules);
  const bombPrompt = load.rankCleanPdkHints(bombHand, bombSource, bombRules);
  assert.deepEqual(ranks(bombPrompt[0]), [14, 14, 14]);

  const lowerTierRules = { ...bombRules, responseTargetCards: [...group(13, 3)] };
  const standardBombHand = [...group(15, 4)];
  assert.deepEqual(load.generatePdkFixedPlanCandidates(standardBombHand, lowerTierRules), []);
});

test('36 each response root owns a complete fixed remainder decomposition', () => {
  const hand = [...group(8, 3), card(6), card(9), card(14)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 6,
    responseTargetCount: 4,
    responseTargetCards: [...group(7, 3), card(5)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  assert.ok(source.length > 0);
  for (const candidate of source) {
    const fixed = candidate.fixedDecomposition;
    assert.ok(fixed);
    const flattened = fixed.groups.flatMap((entry) => entry.cards) ?? [];
    assert.equal(flattened.length, hand.length);
    assert.deepEqual([...flattened].sort((a, b) => a - b), [...hand].sort((a, b) => a - b));
    assert.ok(fixed.groups.some((entry) => ranks(entry.cards).join(',') === ranks(candidate.cards).join(',')),
      'the response root must belong to its own complete plan');
  }
});

test('39 response to bare 777 exposes 999 and never a different shape', () => {
  const hand = [card(14), ...group(13, 2), ...group(12, 2), ...group(11, 3),
    ...group(9, 3), card(8), ...group(6, 3)];
  const responseRules = {
    ...rules,
    airplaneAttachmentMode: 'EITHER',
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 5,
    responseTargetCount: 3,
    responseTargetCards: [...group(7, 3)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.ok(prompt.some((cards) => ranks(cards).every((rank) => rank === 9)));
  assert.ok(prompt.every((cards) => cards.length === 3
    && ranks(cards).every((rank) => rank === ranks(cards)[0])));
  assert.deepEqual(ranks(prompt[0]), [9, 9, 9]);
});

test('37 pure classifier enforces public operation rules without legacy state', () => {
  const classify = load.pdkOperationTypeForCards;
  assert.equal(classify([card(5)]), 2);
  assert.equal(classify([card(5)], { allowSingle: false }), 0);
  assert.equal(classify([card(5)], { allowSingle: 1 }), 2,
    'Authority numeric 1 must enable a single response');
  assert.equal(classify([card(5)], { allowSingle: 0 }), 0,
    'Authority numeric 0 must disable a single response');
  assert.equal(classify(group(5, 2)), 3);
  assert.equal(classify(group(5, 2), { allowPair: false }), 0);
  assert.equal(classify(group(5, 2), { allowPair: 1 }), 3,
    'Authority numeric 1 must enable a pair response');
  assert.equal(classify(group(5, 2), { allowPair: 0 }), 0,
    'Authority numeric 0 must disable a pair response');

  const tripleWithSingles = [...group(8, 3), card(5), card(6)];
  assert.equal(classify(tripleWithSingles, {
    tripleAttachmentMode: 'EITHER_MATCH_SHAPE',
  }), 7);

  const airplaneWithTwo = [...group(8, 3), ...group(9, 3), card(5), card(6), card(7), card(10)];
  assert.equal(classify(airplaneWithTwo, {
    airplaneAttachmentMode: 'EITHER_MATCH_SHAPE',
  }), 18);

  const nonConsecutiveBomb = [...group(8, 4), ...group(10, 4)];
  assert.notEqual(classify(nonConsecutiveBomb, {
    allowConsecutiveBomb: true,
    fourAttachmentMode: 'DISABLED',
  }), 11);
  const consecutiveBomb = [...group(8, 4), ...group(9, 4)];
  assert.equal(classify(consecutiveBomb, { allowConsecutiveBomb: true }), 11);

  const fourWithPairs = [...group(8, 4), ...group(5, 2), ...group(6, 2)];
  assert.equal(classify(fourWithPairs, { fourAttachmentMode: 'EITHER' }), 20);
});

test('38 bare triple timing is evaluated with the current hand and turn context', () => {
  const classify = load.pdkOperationTypeForCards;
  assert.equal(classify(group(8, 3), {
    tripleAttachmentMode: 'EITHER',
    tripleWithoutAttachmentTiming: 'FINAL_ONLY',
    handCardCount: 3,
    responseTurn: false,
  }), 5);
  assert.equal(classify(group(8, 3), {
    tripleAttachmentMode: 'EITHER',
    tripleWithoutAttachmentTiming: 'FINAL_ONLY',
    handCardCount: 6,
    responseTurn: false,
  }), 0);
  assert.equal(classify(group(8, 3), {
    tripleAttachmentMode: 'EITHER',
    tripleWithoutAttachmentTiming: 'DEALER_RESPONSE_OR_FINAL',
    handCardCount: 6,
    responseTurn: true,
  }), 5);
});

test('40 response decomposition is rooted in the upper shape before it chooses the rest of the hand', () => {
  const hand = [...group(8, 3), ...group(9, 3), card(5), card(6)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 5,
    responseTargetCount: 3,
    responseTargetCards: [...group(7, 3)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.ok(prompt.some((cards) => ranks(cards).every((rank) => rank === 9)),
    '999 must remain available when responding to 777');
  assert.ok(source.every((entry) => entry.fixedDecomposition?.groups.flatMap((group) => group.cards)
    .sort((a, b) => a - b).join(',') === [...hand].sort((a, b) => a - b).join(',')));
});

test('41 same-body attachment variants do not inherit another group\'s finish proof', () => {
  const hand = [...group(5, 3), card(7), ...group(8, 2), card(9)];
  const source = load.generatePdkFixedPlanCandidates(hand, rules);
  const exact = source.find((entry) => ranks(entry.cards).join(',') === '5,5,5,7,9');
  const pairWing = source.find((entry) => ranks(entry.cards).join(',') === '5,5,5,8,8');
  assert.equal(exact?.remainingCovered, true);
  assert.equal(exact?.remainingTurns, 1);
  assert.equal(pairWing?.remainingCovered, false);
  assert.equal(pairWing?.remainingTurns, undefined);
  const prompt = load.rankCleanPdkHints(hand, source, rules).map(ranks);
  assert.deepEqual(prompt.slice(0, 2), [[5, 5, 5, 7, 9], [5, 5, 5, 8, 8]]);
});

test('42 a 2 remains an attachment fallback instead of a global decomposition priority', () => {
  const plan = fullPlan([...group(9, 3), card(15)]);
  assert.equal(Object.hasOwn(plan, 'twoAttachmentCards'), false);
  assert.ok(plan.groups.some((entry) => ranks(entry.cards).join(',') === '9,9,9,15'));
});

test('43 a physical JJ pair keeps QQ available as its response', () => {
  const hand = [card(14), card(13), ...group(12, 2), ...group(10, 2), card(9), card(7)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 3,
    responseTargetCount: 2,
    responseTargetCards: [...group(11, 2)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.ok(prompt.some((cards) => ranks(cards).join(',') === '12,12'),
    'QQ must be a response to a physical JJ pair');
});

test('43b a committed 77 pair exposes the physical 99 response', () => {
  const hand = [card(14), card(12), card(10), ...group(9, 2), card(8), ...group(7, 2)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 3,
    responseTargetCount: 2,
    responseTargetCards: [...group(7, 2)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.deepEqual(ranks(prompt[0]), [9, 9],
    'a pair of 99 must be the first legal response to the committed 77 pair');
    assert.ok(prompt.every((cards) => cards.length === 2 && ranks(cards)[0] === ranks(cards)[1]),
        'response candidates must remain physical pairs');
});

test('43ba numeric single rules retain an A response to K', () => {
  const hand = [card(14), ...group(13, 2), card(12), card(11), ...group(9, 2), card(8)];
  const responseRules = {
    ...rules,
    // Authority publishes this room option as a protocol number, rather than
    // a JavaScript boolean. Candidate recognition must preserve its meaning.
    allowSingle: 1,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(13)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
    assert.deepEqual(prompt.map(ranks), [[14]],
    'an authority allowSingle: 1 must keep the physical A response to K');
});

test('43bb Liangshan response roots must beat K before fixed decomposition', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [card(14), ...group(13, 2), card(12), card(11), ...group(8, 2)];
  const responseRules = {
    ...rules,
    minimumStraightLength: 3,
    allowTwoInRuns: false,
    deckCards: liangshanDeck,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(13, 4)],
  };
  const plan = load.decomposePdkHand(hand, responseRules, { type: 2, count: 1 });
  assert.deepEqual(ranks(plan.groups[0].cards), [14],
    'the equal K must not become a response root merely because it saves a turn');
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  assert.deepEqual(source.map((entry) => ranks(entry.cards)), [[14]],
    'only the physical A response may be generated from the fixed plan');
  assert.deepEqual(load.rankCleanPdkHints(hand, source, responseRules).map(ranks), [[14]],
    'candidate ordering must retain the A rooted by response decomposition');
});

test('43bc a legal bomb remains a response root when its card count differs', () => {
  const hand = group(7, 4);
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 5,
    responseTargetCount: 3,
    responseTargetCards: group(7, 3),
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  assert.deepEqual(source.map((entry) => ranks(entry.cards)), [[7, 7, 7, 7]],
    'a legal bomb must remain available as the response fallback');
});

test('43c a single response keeps pairs intact while a loose single can beat', () => {
  const hand = [...group(7, 2), card(9), card(11), card(12), ...group(13, 2), card(14)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(6)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.deepEqual(prompt.map(ranks), [[9], [11], [12], [14]],
    'loose response singles must be exhausted before either pair is opened');
});

test('43d a response plan cannot relabel a split pair as a loose single', () => {
  const hand = [card(5), ...group(7, 2), card(8), card(9), ...group(10, 2), card(11)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(4)],
  };
  const plan = load.decomposePdkHand(hand, responseRules, { type: 2, count: 1 });
  assert.ok(plan.groups.some((entry) => entry.kind === 'SINGLE' && ranks(entry.cards)[0] === 7),
    'the minimum-turn plan deliberately opens 77 to preserve a five-card straight');
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.deepEqual(prompt.map(ranks), [[5]],
    'only the original loose 5 may answer while it can beat the upper single');
});

test('43e a single response opens only the smallest legal pair when no loose single can beat', () => {
  const hand = [card(5), ...group(7, 2), ...group(13, 2)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(6)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.deepEqual(prompt.map(ranks), [[7]],
    'without a legal loose response, only the lowest legal pair may supply one card');
});

test('43f reported-single response constrains the fixed root before candidate filtering', () => {
  const hand = [...group(13, 2), card(12), ...group(11, 2), card(9), card(8), card(7)];
  const responseRules = {
    ...rules,
    minimumStraightLength: 3,
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(7, 4)],
  };
  const ordinary = load.rankCleanPdkHints(
    hand,
    load.generatePdkFixedPlanCandidates(hand, responseRules),
    responseRules,
  );
  assert.deepEqual(ordinary.map(ranks), [[12]],
    'without a reported-single constraint, the fixed response preserves KK and answers with Q');

  const reportedSingleRules = { ...responseRules, requiredResponseSingleRank: 13 };
  const plan = load.decomposePdkHand(hand, reportedSingleRules, { type: 2, count: 1 });
  assert.deepEqual(ranks(plan.groups[0].cards), [13],
    'the maximum K must become the response root even though it starts inside KK');
  const source = load.generatePdkFixedPlanCandidates(hand, reportedSingleRules);
  assert.deepEqual(source.map((entry) => ranks(entry.cards)), [[13]],
    'candidate generation must preserve the Authority-required K instead of filtering Q afterwards');
  assert.deepEqual(load.rankCleanPdkHints(hand, source, reportedSingleRules).map(ranks), [[13]]);
});

test('44 a same-body attachment variant cannot jump ahead of its fixed group', () => {
  const hand = [...group(7, 3), card(5), ...group(10, 2), ...group(14, 2)];
  const source = load.generatePdkFixedPlanCandidates(hand, rules);
  const exact = source.find((entry) => ranks(entry.cards).join(',') === '5,7,7,7');
  const variant = source.find((entry) => ranks(entry.cards).join(',') === '5,7,7,7,10');
  assert.equal(exact?.remainingCovered, true);
  assert.equal(variant?.remainingCovered, false);
  const prompt = load.rankCleanPdkHints(hand, source, rules).map(ranks);
  assert.deepEqual(prompt.slice(0, 2), [[5, 7, 7, 7], [5, 7, 7, 7, 10]]);
});


test('45 drag ranks only covered legal shapes by count, intact pairs, then smallest wings', () => {
  const dragRules = { ...rules, tripleAttachmentMode: 'EITHER' };
  const maxHand = [...group(5, 3), card(6), card(7), card(8), card(9)];
  const maxRanked = load.rankPdkDragCandidates(maxHand, [
    candidate([...group(5, 3), card(6)]),
    candidate([card(5), card(6), card(7), card(8), card(9)], 1),
  ], dragRules);
  assert.deepEqual(ranks(maxRanked[0]), [5, 6, 7, 8, 9]);

  const pairHand = [...group(5, 3), card(6), ...group(8, 2)];
  const pairRanked = load.rankPdkDragCandidates(pairHand, [
    candidate([...group(5, 3), card(6), card(8)]),
    candidate([...group(5, 3), ...group(8, 2)], 1),
  ], dragRules);
  assert.deepEqual(ranks(pairRanked[0]), [5, 5, 5, 8, 8]);

  const wingHand = [...group(5, 3), card(6), card(9)];
  const wingRanked = load.rankPdkDragCandidates(wingHand, [
    candidate([...group(5, 3), card(9)]),
    candidate([...group(5, 3), card(6)], 1),
  ], dragRules);
  assert.deepEqual(ranks(wingRanked[0]), [5, 5, 5, 6]);

  // A complete pair is not split, but when two independent singles exist they
  // are still the wing source before a lower-valued intact pair is consumed.
  const looseWingHand = [...group(5, 3), card(9), card(10), ...group(6, 2)];
  const looseWingRanked = load.rankPdkDragCandidates(looseWingHand, [
    candidate([...group(5, 3), ...group(6, 2)]),
    candidate([...group(5, 3), card(9), card(10)], 1),
  ], dragRules);
  assert.deepEqual(ranks(looseWingRanked[0]), [5, 5, 5, 9, 10]);
});

test('46 drag response validates its covered cards against the upper shape without fixed-plan ranking', () => {
  const hand = [...group(8, 3), ...group(9, 3), card(5), card(6)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 5,
    responseTargetCount: 3,
    responseTargetCards: [...group(7, 3)],
  };
  const prompt = load.rankPdkDragCandidates(hand, [
    candidate([...group(8, 3)]),
    candidate([...group(9, 3)], 1),
    candidate([card(5)], 2),
  ], responseRules);
  assert.deepEqual(prompt.map(ranks), [[8, 8, 8], [9, 9, 9]]);
  const source = readFileSync(helperPath, 'utf8');
  const dragStart = source.indexOf('export function rankPdkDragCandidates');
  const dragEnd = source.indexOf('const groupMatchesCandidate', dragStart);
  const drag = source.slice(dragStart, dragEnd);
  assert.doesNotMatch(drag, /decomposePdkHand|rankCleanPdkHints|fixedDecomposition/);
});

test('47 a full swipe falls back from the complete interval to its largest legal subset', () => {
  const hand = [card(14), card(13), ...group(12, 3), card(11), ...group(7, 2)];
  const rankCovered = (ruleOverride = {}) => load.largestLegalPdkSubsets(hand, (subsets) =>
    load.rankPdkDragCandidates(hand, subsets.map((cards, order) => candidate(cards, order)), {
      ...rules,
      tripleAttachmentMode: 'SINGLE_OR_PAIR',
      airplaneAttachmentMode: 'SINGLE_OR_PAIR',
      tripleWithoutAttachmentTiming: 'FINAL_ONLY',
      handCardCount: hand.length,
      ...ruleOverride,
    }));

  assert.deepEqual(ranks(rankCovered()[0]), [7, 7, 12, 12, 12],
    'A K QQQ J 77 must select QQQ77 when the full swipe is not itself a play');
  assert.deepEqual(ranks(rankCovered({ tripleAttachmentMode: 'DISABLED' })[0]), [7, 7],
    'when triples are disabled, the same full swipe must still select its legal 77 pair');
});


test('48 Liangshan equal-turn lead plan keeps the larger JQKA straight', () => {
  const hand = [card(14, 1), card(14, 2), card(13), card(12), card(11), card(9), card(8), card(7)];
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const liangshanRules = {
    ...rules,
    minimumStraightLength: 3,
    allowTwoInRuns: false,
    maximumSingleRanks: [14],
    deckCards: liangshanDeck,
  };
  const plan = fullPlan(hand, liangshanRules);
  assert.deepEqual(plan.groups.map((entry) => ranks(entry.cards)), [[7, 8, 9], [11, 12, 13, 14], [14]],
    'equal three-turn plans retain JQKA so the deterministic lead can start with four cards');
  const source = load.generatePdkFixedPlanCandidates(hand, liangshanRules);
  const prompt = load.rankCleanPdkHints(hand, source, {
    ...liangshanRules,
    fixedDecomposition: plan,
  });
  assert.deepEqual(ranks(prompt[0]), [11, 12, 13, 14]);

  // After the four-card straight is actually played, the next hint cache is
  // built from the new hand. Its two-hand maximum rule therefore takes A
  // before the remaining 789 straight.
  const remainder = [card(14, 2), card(9), card(8), card(7)];
  const remainderPlan = fullPlan(remainder, liangshanRules);
  const remainderPrompt = load.rankCleanPdkHints(
    remainder,
    load.generatePdkFixedPlanCandidates(remainder, liangshanRules),
    { ...liangshanRules, fixedDecomposition: remainderPlan },
  );
  assert.deepEqual(ranks(remainderPrompt[0]), [14]);
});

test('49 response ranks the exact complete straight before slices of its fixed remainder', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [card(14), card(13), card(12), card(11), card(10), card(9), card(8), card(7)];
  const responseRules = {
    ...rules,
    minimumStraightLength: 3,
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 4,
    responseTargetCount: 3,
    responseTargetCards: [card(7, 2), card(8, 2), card(9, 2)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.deepEqual(ranks(prompt[0]), [12, 13, 14],
    'QKA must answer 789 first because it leaves the fixed 78910J tail intact');
  assert.ok(source.some((entry) => ranks(entry.cards).join(',') === '12,13,14'
    && entry.remainingCovered === true));
});

test('50 compared triple wing searches beyond low attachments to produce JJJ+A', () => {
  const hand = [card(14, 1), card(14, 2), card(13),
    card(11, 1), card(11, 2), card(11, 3), card(10), card(8)];
  const responseRules = {
    ...rules,
    decompositionPlanMode: 'RESPONSE',
    tripleAttachmentMode: 'SINGLES',
    compareTripleAttachments: true,
    responseTargetType: 6,
    responseTargetCount: 4,
    responseTargetCards: [card(7, 1), card(7, 2), card(7, 3), card(13, 2)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.deepEqual(ranks(prompt[0]), [11, 11, 11, 14],
    '777+K must be answered by JJJ+A when the room compares triple wings');
});

test('51 a normal multi-single lead starts with the smallest single', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [card(14), card(12), card(10), card(8), card(7)];
  const leadRules = {
    ...rules,
    minimumStraightLength: 3,
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'SELF',
  };
  const plan = fullPlan(hand, leadRules);
  const prompt = load.rankCleanPdkHints(
    hand,
    load.generatePdkFixedPlanCandidates(hand, { ...leadRules, fixedDecomposition: plan }),
    { ...leadRules, fixedDecomposition: plan },
  );
  assert.deepEqual(ranks(prompt[0]), [7],
    'absolute A only changes the explicit two-hand and three-hand endgame orders');
});

test('52 compulsory physical opening card may remain inside the largest legal straight', () => {
  const requiredHeartSeven = card(7, 2);
  const hand = [card(14), card(13), card(11), card(10), card(9), card(8),
    card(7, 1), requiredHeartSeven];
  const leadRules = {
    ...rules,
    minimumStraightLength: 5,
    decompositionPlanMode: 'SELF',
    isFirstPlayOfRound: true,
    requiredFirstCard: requiredHeartSeven,
  };
  const plan = fullPlan(hand, leadRules);
  const prompt = load.rankCleanPdkHints(
    hand,
    load.generatePdkFixedPlanCandidates(hand, { ...leadRules, fixedDecomposition: plan }),
    { ...leadRules, fixedDecomposition: plan },
  );
  assert.deepEqual(ranks(prompt[0]), [7, 8, 9, 10, 11]);
  assert.ok(prompt[0].includes(requiredHeartSeven),
    'the required physical seven must be materialized into 7-J rather than force a lone seven');
});

test('53 a straight may release the lower mate of a pair as the triple wing', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [card(14), card(12, 1), card(12, 2), card(12, 3),
    card(9), card(8), card(7, 1), card(7, 2)];
  const leadRules = {
    ...rules,
    minimumStraightLength: 3,
    tripleAttachmentMode: 'SINGLES',
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'SELF',
  };
  const plan = fullPlan(hand, leadRules);
  assert.deepEqual(plan.groups.map((entry) => ranks(entry.cards)),
    [[7, 12, 12, 12], [7, 8, 9], [14]]);
  const prompt = load.rankCleanPdkHints(
    hand,
    load.generatePdkFixedPlanCandidates(hand, { ...leadRules, fixedDecomposition: plan }),
    { ...leadRules, fixedDecomposition: plan },
  );
  assert.deepEqual(ranks(prompt[0]), [7, 12, 12, 12],
    'QQQ must carry the released 7 before a higher loose attachment');
});

test('54 a normal multi-turn lead with pairs chooses the smallest pair before AA', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [card(14, 1), card(14, 2), card(13), card(11),
    card(9, 1), card(9, 2), card(7, 1), card(7, 2)];
  const leadRules = {
    ...rules,
    minimumStraightLength: 3,
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'SELF',
  };
  const plan = fullPlan(hand, leadRules);
  const prompt = load.rankCleanPdkHints(
    hand,
    load.generatePdkFixedPlanCandidates(hand, { ...leadRules, fixedDecomposition: plan }),
    { ...leadRules, fixedDecomposition: plan },
  );
  assert.deepEqual(ranks(prompt[0]), [7, 7]);
});

test('55 response roots independently decompose every legal split and retain absolute A', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [...group(11, 2), ...group(14, 2)];
  const responseRules = {
    ...rules,
    minimumStraightLength: 3,
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(7, 4)],
  };
  const source = load.generatePdkFixedPlanCandidates(hand, responseRules);
  const prompt = load.rankCleanPdkHints(hand, source, responseRules);
  assert.deepEqual(prompt.map(ranks), [[14], [11]],
    'against a single 7, JJAA must retain the A / A / JJ completion path');
  assert.ok(source.every((entry) => entry.remainingCovered === true),
    'each response root must own a complete fixed remainder plan');
});

test('56 response absolute maximum comes from the authoritative deck, not an assumed 2 rule', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [card(13), card(14)];
  const responseRules = {
    ...rules,
    minimumStraightLength: 3,
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(7, 4)],
  };
  const prompt = load.rankCleanPdkHints(
    hand, load.generatePdkFixedPlanCandidates(hand, responseRules), responseRules,
  );
  assert.deepEqual(ranks(prompt[0]), [14],
    'when the room deck has no 2, A is the confirmed absolute single response');
});

test('57 a loose response inside another decomposed structure cannot disappear', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [...group(13, 3), card(12), ...group(8, 2), card(7)];
  const responseRules = {
    ...rules,
    minimumStraightLength: 3,
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'RESPONSE',
    responseTurn: true,
    responseTargetType: 2,
    responseTargetCount: 1,
    responseTargetCards: [card(11, 4)],
  };
  const prompt = load.rankCleanPdkHints(
    hand, load.generatePdkFixedPlanCandidates(hand, responseRules), responseRules,
  );
  assert.deepEqual(ranks(prompt[0]), [12],
    'a legal Q response must survive even when the fixed tail groups it with KKK');
});

test('58 mixed three-turn lead keeps absolute AA and starts with the higher ordinary single', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [...group(14, 2), card(9), card(11)];
  const leadRules = {
    ...rules,
    minimumStraightLength: 3,
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'SELF',
  };
  const plan = fullPlan(hand, leadRules);
  const prompt = load.rankCleanPdkHints(
    hand, load.generatePdkFixedPlanCandidates(hand, { ...leadRules, fixedDecomposition: plan }),
    { ...leadRules, fixedDecomposition: plan },
  );
  assert.deepEqual(ranks(prompt[0]), [11],
    'AA 9 J must lead J, retaining absolute A for the recovery turn');
});

test('59 mixed three-turn lead preserves JJ and absolute A before it uses Q', () => {
  const liangshanDeck = Array.from({ length: 4 }, (_v, suit) =>
    Array.from({ length: 8 }, (_r, index) => card(index + 7, suit + 1))).flat();
  const hand = [...group(11, 2), card(12), card(14)];
  const leadRules = {
    ...rules,
    minimumStraightLength: 3,
    deckCards: liangshanDeck,
    maximumSingleRanks: [14],
    decompositionPlanMode: 'SELF',
  };
  const plan = fullPlan(hand, leadRules);
  const prompt = load.rankCleanPdkHints(
    hand, load.generatePdkFixedPlanCandidates(hand, { ...leadRules, fixedDecomposition: plan }),
    { ...leadRules, fixedDecomposition: plan },
  );
  assert.deepEqual(ranks(prompt[0]), [12],
    'JJ Q A must lead Q, keeping the pair and absolute recovery single');
});
