import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const clientRoot = new URL('../..', import.meta.url).pathname;
const logicPath = join(clientRoot,
  'assets/Games/Poker/PDK/Common/Code/Runtime/logic/CommonPdkGameLogic.ts');
const rankerPath = join(clientRoot,
  'assets/Games/Poker/PDK/Common/Code/Runtime/logic/PdkCleanHintRanker.ts');
const policyRegistryPath = join(clientRoot,
  'assets/Games/Poker/PDK/Common/Code/Regional/PdkHintPolicyRegistry.ts');

function loadLogic() {
  const source = readFileSync(logicPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  return { CommonPdkGameLogic: module.exports.CommonPdkGameLogic, source };
}

function createLogic(ruleOptions) {
  const { CommonPdkGameLogic } = loadLogic();
  const authoritative = { minimumPairRunLength: 2, ...ruleOptions };
  return new CommonPdkGameLogic({
    room: {
      GetRoomConfig: () => ({ ruleOptions: authoritative }),
      GetRoomPaiXing: (name) => {
        const four = String(authoritative.fourAttachmentMode ?? 'DISABLED');
        if (name === 'SiDaiEr') return four === 'SINGLES' || four === 'EITHER';
        if (name === 'SiDaiYi') return authoritative.allowFourBombWithOne === true;
        if (name === 'SiDaiSan') return authoritative.allowFourWithThree === true;
        if (name === 'JieMeiDui') return authoritative.jieMeiDui === true;
        return false;
      },
    },
  });
}

function loadRanker() {
  const source = readFileSync(rankerPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', js)(module, module.exports);
  return module.exports;
}

const regionalRules = {
  CD201: { policyId: 'COMMON', minimumStraightLength: 5, tripleAttachmentMode: 'EITHER', fourAttachmentMode: 'DISABLED' },
  NJ201: { policyId: 'COMMON', minimumStraightLength: 5, tripleAttachmentMode: 'EITHER', fourAttachmentMode: 'DISABLED' },
  LS201: { policyId: 'LS201', minimumStraightLength: 3, tripleAttachmentMode: 'SINGLE_OR_PAIR', fourAttachmentMode: 'DISABLED' },
};

test('three regional clients derive straight length from the authoritative snapshot', () => {
  for (const [gameCode, rules] of Object.entries(regionalRules)) {
    const logic = createLogic(rules);
    logic.ChangeSelectCard([103, 104, 105]);
    assert.equal(logic.CheckShunzi(), gameCode === 'LS201', gameCode);
  }
});

test('regional hint identity remains diagnostic while every region shares ranking', () => {
  const registry = readFileSync(policyRegistryPath, 'utf8');
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const ranker = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/logic/PdkCleanHintRanker.ts'), 'utf8');
  assert.match(registry, /\[PDK_BUSINESS_CODES\.LIANGSHAN\]: 'LS201'/);
  assert.match(registry, /DEFAULT_PDK_HINT_POLICY: PdkHintPolicyId = 'COMMON'/);
  assert.match(controller, /policyId: resolvePdkHintPolicyId\(gameCode\)/);
  assert.doesNotMatch(ranker, /rules\.policyId|liangshanPolicy/);
  assert.doesNotMatch(registry, /deckMaximumRank|compareTripleAttachments/);
});

test('required opening card constrains decomposition before hint ranking', () => {
  const { enumeratePdkRankMultisetCandidates } = loadRanker();
  const hand = [103, 203, 107, 207, 108, 208, 109, 209];
  const candidates = enumeratePdkRankMultisetCandidates(hand, 103);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((cards) => cards.includes(103)));
  assert.deepEqual(enumeratePdkRankMultisetCandidates(hand, 303), []);
});

test('Liangshan rule accepts triple with one card or one pair but rejects two loose cards', () => {
  const logic = createLogic(regionalRules.LS201);
  logic.ChangeSelectCard([103, 203, 303, 104]);
  assert.equal(logic.GetCardType(), 6);

  logic.ChangeSelectCard([103, 203, 303, 104, 204]);
  assert.equal(logic.GetCardType(), 15);

  logic.ChangeSelectCard([103, 203, 303, 104, 205]);
  assert.equal(logic.GetCardType(), 0);
});

test('full lead enumeration ranks 888 plus pair threes before bare 888', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [114, 111, 108, 208, 308, 105, 205, 103, 203];
  const expected = [108, 208, 308, 103, 203];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  assert.ok(legal.some(({ cards }) => cards.length === 5
    && expected.every((card) => cards.includes(card))), '888+33 must enter the legal candidate pool');
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('full lead enumeration uses another triple as aircraft wings only when needed and leaves ace', () => {
  const options = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(options);
  const sixes = [106, 206, 306];
  const nines = [109, 209, 309];
  const tens = [110, 210, 310];
  const jacks = [111, 211, 311];
  const eight = 108;
  const queen = 112;
  const king = 113;
  const ace = 114;
  const hand = [...sixes, ...nines, ...tens, ...jacks, eight, queen, king, ace];
  const expected = [...nines, ...tens, ...jacks, ...sixes, eight, queen, king];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();

  const {
    enumeratePdkRankMultisetCandidates,
    isAuthorityCompatiblePdkAircraft,
    rankCleanPdkHints,
  } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      const type = logic.GetCardType();
      return type > 0 && isAuthorityCompatiblePdkAircraft(cards, type);
    })
    .map((cards, order) => ({ cards, order }));
  assert.ok(legal.some(({ cards }) => cards.length === 15
    && expected.every((card) => cards.includes(card))),
  'the complete three-aircraft candidate that leaves A must enter the legal pool');

  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
  assert.deepEqual(hand.filter((card) => !ranked[0].includes(card)), [ace]);
});

test('full lead triple carries loose seven and ten without opening pair threes', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [115, 112, 110, 107, 105, 205, 305, 103, 203];
  const expected = [105, 205, 305, 107, 110];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .flatMap((cards, order) => {
      logic.ChangeSelectCard(cards);
      const cardType = Number(logic.GetCardType());
      if (cardType <= 0) return [];
      const remaining = [...hand];
      for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
      logic.ChangeSelectCard(remaining);
      const finishesInTwo = remaining.length > 0 && Number(logic.GetCardType()) > 0;
      return [{
        cards,
        order,
        usesFourCardBody: [8, 9, 10, 20].includes(cardType),
        finishesInTwo,
        containsRuleMaximum: cards.some((card) => card % 100 === 15),
      }];
    });
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    tripleAttachmentMode: 'EITHER',
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('minimum-turn triple decomposition outranks a low duplicate straight', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [113, 213, 111, 110, 109, 209, 309, 107,
    106, 206, 105, 205, 104, 204, 304, 103];
  const expected = [104, 204, 304, 103, 107];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .flatMap((cards, order) => {
      logic.ChangeSelectCard(cards);
      const cardType = Number(logic.GetCardType());
      if (cardType <= 0) return [];
      const remaining = [...hand];
      for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
      logic.ChangeSelectCard(remaining);
      const finishesInTwo = remaining.length > 0 && Number(logic.GetCardType()) > 0;
      return [{
        cards,
        order,
        usesFourCardBody: [8, 9, 10, 20].includes(cardType),
        finishesInTwo,
        containsRuleMaximum: cards.some((card) => card % 100 === 15),
      }];
    });
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    tripleAttachmentMode: 'EITHER',
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('equal-turn lead keeps 4455 atomic instead of promoting the destructive 3-to-J straight', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [115, 114, 111, 211, 110, 109, 209, 108, 208,
    107, 106, 105, 205, 104, 204, 103];
  const pairRun = [104, 204, 105, 205];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);

  assert.deepEqual(ranked[0], pairRun);
});

test('full lead enumeration keeps 556677 ahead of the pair-splitting 9-to-A straight', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [115, 114, 214, 113, 213, 112, 111, 110, 210, 109,
    107, 207, 106, 206, 105, 205];
  const expected = [105, 205, 106, 206, 107, 207];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .flatMap((cards, order) => {
      logic.ChangeSelectCard(cards);
      const cardType = Number(logic.GetCardType());
      if (cardType <= 0) return [];
      const remaining = [...hand];
      for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
      logic.ChangeSelectCard(remaining);
      const finishesInTwo = remaining.length > 0 && Number(logic.GetCardType()) > 0;
      return [{
        cards,
        order,
        usesFourCardBody: [8, 9, 10, 20].includes(cardType),
        finishesInTwo,
        containsRuleMaximum: cards.some((card) => card % 100 === 15),
      }];
    });
  const highStraight = [109, 110, 111, 112, 113, 114];
  assert.ok(legal.some(({ cards }) => cards.length === highStraight.length
    && highStraight.every((card) => cards.includes(card))),
  'the competing 9-to-A straight must enter the legal pool');
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    tripleAttachmentMode: 'EITHER',
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);

  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('seven-card control endgame leads 333 with pair nines and retains K plus maximum 2', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [115, 113, 109, 209, 103, 203, 303];
  const expected = [103, 203, 303, 109, 209];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .flatMap((cards, order) => {
      logic.ChangeSelectCard(cards);
      const cardType = Number(logic.GetCardType());
      if (cardType <= 0) return [];
      const remaining = [...hand];
      for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
      logic.ChangeSelectCard(remaining);
      const finishesInTwo = remaining.length > 0 && Number(logic.GetCardType()) > 0;
      return [{
        cards,
        order,
        usesFourCardBody: [8, 9, 10, 20].includes(cardType),
        finishesInTwo,
        containsRuleMaximum: cards.some((card) => card % 100 === 15),
      }];
    });
  assert.ok(legal.some(({ cards }) => cards.length === expected.length
    && expected.every((card) => cards.includes(card))), '333+99 must enter the legal candidate pool');
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    tripleAttachmentMode: 'EITHER',
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('exact two-play triple endgame carries K and A and leaves pair jacks', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [110, 210, 310, 111, 211, 113, 114];
  const expected = [110, 210, 310, 113, 114];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .flatMap((cards, order) => {
      logic.ChangeSelectCard(cards);
      const cardType = Number(logic.GetCardType());
      if (cardType <= 0) return [];
      const remaining = [...hand];
      for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
      logic.ChangeSelectCard(remaining);
      const finishesInTwo = remaining.length > 0 && Number(logic.GetCardType()) > 0;
      return [{
        cards,
        order,
        usesFourCardBody: [8, 9, 10, 20].includes(cardType),
        finishesInTwo,
        containsRuleMaximum: cards.some((card) => card % 100 === 15),
      }];
    });
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    tripleAttachmentMode: 'EITHER',
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('Chengdu exact two-play 332 endgame leads the rule-maximum single two', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [103, 203, 115];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({
      cards,
      order,
      finishesInTwo: cards.length === 1 || cards.length === 2,
      containsRuleMaximum: cards.length === 1 && cards[0] % 100 === 15,
    }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual(ranked[0], [115]);
});

test('low 55677899 hand preserves the five-to-nine straight', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [105, 205, 106, 107, 207, 108, 208, 109, 209];
  const expected = [105, 106, 107, 108, 109];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('low-straight duplicate tolerance includes ten for 67789910', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [106, 107, 207, 108, 208, 109, 209, 110];
  const expected = [106, 107, 108, 109, 110];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), expected);
});

test('low-straight duplicate tolerance includes a straight ending at J', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [107, 207, 108, 208, 109, 209, 110, 210, 111];
  const expected = [107, 108, 109, 110, 111];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), expected);
});

test('equal-turn decomposition sheds the longer 5-to-10 straight before pair tens', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [114, 113, 112, 110, 210, 109, 108, 208, 308,
    107, 106, 105, 104, 204, 103, 203];
  const expected = [105, 106, 107, 108, 109, 110];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), expected);
});

test('base-shape decomposition assigns low singles to 666 before recovery cards', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [114, 113, 112, 212, 111, 211, 311, 109, 209,
    107, 106, 206, 306, 105, 103, 203];
  const expected = [106, 206, 306, 105, 107];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('base decomposition keeps 5566 as an atomic pair run beside AAA and 99', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false, jieMeiDui: true };
  const logic = createLogic(rules);
  const hand = [115, 114, 214, 314, 113, 109, 209, 106, 206, 105, 205];
  const expected = [105, 205, 106, 206];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  assert.ok(legal.some(({ cards }) => cards.length === expected.length
    && expected.every((card) => cards.includes(card))), '5566 must enter the legal pair-run pool');
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    protectedBombs: [[114, 214, 314]],
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: true,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('equal-turn plans shed the three-card body before the two-card body', () => {
  const { rankCleanPdkHints } = loadRanker();
  const hand = [113, 213, 313, 109, 209];
  const candidates = [
    { cards: [113, 213, 313], order: 0 },
    { cards: [109, 209], order: 1 },
  ];
  const ranked = rankCleanPdkHints(hand, candidates, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 0,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [113, 213, 313]);
});

test('multi-straight decomposition leads 4-to-J and retains 3-to-7', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [113, 111, 110, 210, 109, 108, 107, 207,
    106, 206, 105, 205, 305, 104, 204, 103];
  const expected = [104, 105, 106, 107, 108, 109, 110, 111];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  assert.ok(legal.some(({ cards }) => cards.length === expected.length
    && expected.every((card) => cards.some((candidate) => candidate % 100 === card % 100))),
  '4-to-J must enter the legal straight pool');
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual(ranked[0].map((card) => card % 100).sort((a, b) => a - b),
    expected.map((card) => card % 100).sort((a, b) => a - b));
});

test('equal-turn multi-straight decomposition sheds the longest connected straight', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [114, 113, 213, 112, 111, 110, 210, 109, 108, 107, 207,
    106, 206, 105, 205, 305, 104, 204, 103];
  const expectedRanks = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual(ranked[0].map((card) => card % 100).sort((a, b) => a - b), expectedRanks);
});

test('authoritative decomposition keeps two straights in A,J,1010,9,8,77,66,555,44,3', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [114, 111, 110, 210, 109, 108, 107, 207,
    106, 206, 105, 205, 305, 104, 204, 103];
  const expectedRanks = [4, 5, 6, 7, 8, 9, 10, 11];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    preserveScoringBombs: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual(ranked[0].map((card) => card % 100).sort((a, b) => a - b), expectedRanks);
});

test('full lead enumeration keeps pair fours intact when loose three and five can wing 777', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [113, 213, 112, 212, 111, 211, 311, 110, 210,
    107, 207, 307, 105, 104, 204, 103];
  const expected = [107, 207, 307, 103, 105];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  assert.ok(legal.some(({ cards }) => cards.length === 5
    && expected.every((card) => cards.includes(card))), '777+3+5 must enter the legal candidate pool');
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...expected].sort((a, b) => a - b));
});

test('minimum-turn priority leads 5-to-9 before the pair decomposition', () => {
  const rules = { ...regionalRules.CD201, compareTripleAttachments: false };
  const logic = createLogic(rules);
  const hand = [115, 112, 109, 209, 108, 107, 207, 106, 105, 205];
  const expected = [105, 106, 107, 108, 109];
  logic.OutPokerCard([...hand]);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    singleAttachmentCapacityPerTriple: 2,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
    maximumSingleRanks: [15],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), expected);
});

test('single-or-pair is a complete authoritative attachment mode, not a client fallback', () => {
  const { source } = loadLogic();
  assert.match(source, /value !== 'SINGLE_OR_PAIR'/);
  assert.match(source, /mode === 'SINGLE_OR_PAIR'/);
  assert.match(source, /AllowsTripleTwoSingles/);
  assert.match(source,
    /if\(this\.AllowsTripleTwoSingles\(\)\)\{\s*array\.push\.apply\(array, this\.GetSanDaiTip\(7,true\)\)/);
  assert.match(source,
    /if\(this\.AllowsTripleTwoSingles\(\)\)\{\s*array\.push\.apply\(array, this\.GetSanDaiFeiJiTip\(18,3,true\)\)/);

  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /oneSingle: mode === 'SINGLES' \|\| mode === 'SINGLE_OR_PAIR'/);
  assert.match(controller, /twoSingles: mode === 'EITHER'/);
  assert.match(controller, /tripleAttachmentMode: String\(rules\.tripleAttachmentMode/);
  assert.match(controller, /case 7:\s*case 18:\s*return triple === 'EITHER'/);

  const adapter = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkAuthoritativeViewAdapter.ts'), 'utf8');
  assert.match(adapter, /triple === 'SINGLE_OR_PAIR'.*patterns\.push\(1\)/);
  assert.match(adapter, /triple === 'SINGLE_OR_PAIR'.*patterns\.push\(2\)/);
  assert.match(adapter, /if \(triple === 'EITHER'\) patterns\.push\(3\)/);
});

test('whole-hand planner preserves exact authoritative triple attachment modes', () => {
  const { scorePdkRemainingHand } = loadRanker();
  const base = {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    maximumSingleRanks: [15],
  };
  const tripleWithPair = [103, 203, 303, 104, 204];
  const tripleWithTwoSingles = [103, 203, 303, 104, 105];

  assert.equal(scorePdkRemainingHand(tripleWithPair, {
    ...base, tripleAttachmentMode: 'PAIRS',
  }).turns, 1);
  assert.equal(scorePdkRemainingHand(tripleWithPair, {
    ...base, tripleAttachmentMode: 'SINGLE_OR_PAIR',
  }).turns, 1);
  assert.equal(scorePdkRemainingHand(tripleWithTwoSingles, {
    ...base, tripleAttachmentMode: 'PAIRS',
  }).turns, 3);
  assert.equal(scorePdkRemainingHand(tripleWithTwoSingles, {
    ...base, tripleAttachmentMode: 'EITHER',
  }).turns, 1);
});

test('Liangshan first-lead hand can hint AAA plus the required seven', () => {
  const logic = createLogic(regionalRules.LS201);
  logic.OutPokerCard([114, 214, 314, 113, 111, 211, 110, 107]);
  assert.deepEqual(logic.GetSanDaiTip(6)[0], [114, 214, 314, 107]);
});

test('later Liangshan rounds rank a complete AAA attachment before a loose seven', () => {
  const rules = {
    ...regionalRules.LS201,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    deckCards: [
      107, 207, 307, 407, 108, 208, 308, 408,
      109, 209, 309, 409, 110, 210, 310, 410,
      111, 211, 311, 411, 112, 212, 312, 412,
      113, 213, 313, 413, 114, 214, 314, 414,
    ],
    prioritizeMaximumWithOneOrdinaryPlay: true,
    prioritizeLargestLeadWithoutMaximum: true,
    prioritizeMaximumLeadUnlessConnectedRun: true,
    prioritizeMaximumResponseWithinThreePlays: true,
    prioritizeLargestLeadUnlessMaximumStraight: true,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
  };
  const logic = createLogic(rules);
  const hand = [114, 214, 314, 113, 110, 109, 108, 107];
  logic.OutPokerCard(hand);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    ...rules,
    protectedBombs: [],
    preserveScoringBombs: false,
    maximumSingleRanks: [14],
  }, true, true);
  assert.equal(ranked[0].length, 4);
  assert.deepEqual([...ranked[0]].filter((card) => card % 100 === 14).sort(), [114, 214, 314]);
  assert.notDeepEqual(ranked[0], [107]);
});

test('only Liangshan exposes and leads a three-card straight before a retained triple-with-pair', () => {
  const lsRules = {
    ...regionalRules.LS201,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    deckCards: [
      107, 207, 307, 407, 108, 208, 308, 408,
      109, 209, 309, 409, 110, 210, 310, 410,
      111, 211, 311, 411, 112, 212, 312, 412,
      113, 213, 313, 413, 114, 214, 314, 414,
    ],
    prioritizeMaximumWithOneOrdinaryPlay: true,
    prioritizeLargestLeadWithoutMaximum: true,
    prioritizeMaximumLeadUnlessConnectedRun: true,
    prioritizeMaximumResponseWithinThreePlays: true,
    prioritizeLargestLeadUnlessMaximumStraight: true,
    optimizeWholeHand: true,
    compareTripleAttachments: true,
  };
  const hand = [112, 212, 312, 111, 110, 109, 108, 208];
  const shortStraight = [111, 110, 109];
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const lsLogic = createLogic(lsRules);
  lsLogic.OutPokerCard(hand);
  lsLogic.ClearCardData();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      lsLogic.ChangeSelectCard(cards);
      return lsLogic.GetCardType() > 0;
    })
    .map((cards, order) => {
      const remaining = [...hand];
      for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
      lsLogic.ChangeSelectCard(remaining);
      return { cards, order, finishesInTwo: remaining.length > 0 && lsLogic.GetCardType() > 0 };
    });
  assert.ok(legal.some(({ cards }) => cards.length === shortStraight.length
    && shortStraight.every((card) => cards.includes(card))),
  'LS201 minimumStraightLength=3 must expose 9-10-J');
  const ranked = rankCleanPdkHints(hand, legal, {
    ...lsRules,
    protectedBombs: [],
    preserveScoringBombs: false,
    maximumSingleRanks: [14],
    // The stable LS201 policy identity, not an optional legacy hint flag,
    // owns this regional decomposition rule.
    prioritizeLargestLeadUnlessMaximumStraight: false,
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b), [...shortStraight].sort((a, b) => a - b));

  const commonRanked = rankCleanPdkHints(hand, legal, {
    ...lsRules,
    policyId: 'COMMON',
    protectedBombs: [],
    preserveScoringBombs: false,
    maximumSingleRanks: [14],
    prioritizeLargestLeadUnlessMaximumStraight: false,
  }, true, true);
  assert.notDeepEqual([...commonRanked[0]].sort((a, b) => a - b),
    [...shortStraight].sort((a, b) => a - b),
    'COMMON must retain its established ranking even when fed the same legal candidate pool');

  const commonLogic = createLogic(regionalRules.CD201);
  commonLogic.OutPokerCard(hand);
  commonLogic.ClearCardData();
  const commonLegal = enumeratePdkRankMultisetCandidates(hand).filter((cards) => {
    commonLogic.ChangeSelectCard(cards);
    return commonLogic.GetCardType() > 0;
  });
  assert.ok(!commonLegal.some((cards) => cards.length === shortStraight.length
    && shortStraight.every((card) => cards.includes(card))),
  'COMMON minimumStraightLength=5 must remain isolated from the LS201 strategy');
});

test('equal-turn straights lead the lower intact run and retain the higher recapture run', () => {
  const rules = {
    ...regionalRules.LS201,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
  };
  const logic = createLogic(rules);
  const hand = [114, 113, 112, 110, 210, 109, 108, 107];
  logic.OutPokerCard(hand);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    ...rules,
    protectedBombs: [],
    preserveScoringBombs: false,
    maximumSingleRanks: [14],
  }, true, true);
  assert.deepEqual(ranked[0], [109, 108, 107]);
});

test('connected-family ranking leads three consecutive pairs before a destructive straight', () => {
  const rules = {
    ...regionalRules.LS201,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    optimizeWholeHand: true,
    compareTripleAttachments: false,
  };
  const logic = createLogic(rules);
  const hand = [113, 213, 109, 209, 108, 208, 107, 207];
  logic.OutPokerCard(hand);
  logic.ClearCardData();
  const { enumeratePdkRankMultisetCandidates, rankCleanPdkHints } = loadRanker();
  const legal = enumeratePdkRankMultisetCandidates(hand)
    .filter((cards) => {
      logic.ChangeSelectCard(cards);
      return logic.GetCardType() > 0;
    })
    .map((cards, order) => ({ cards, order }));
  const ranked = rankCleanPdkHints(hand, legal, {
    ...rules,
    protectedBombs: [],
    preserveScoringBombs: false,
    maximumSingleRanks: [14],
  }, true, true);
  assert.deepEqual([...ranked[0]].sort((a, b) => a - b),
    [107, 207, 108, 208, 109, 209].sort((a, b) => a - b));
});

test('Liangshan JJJJKK can answer a lower triple-with-pair as either JJJKK or JJJJ bomb', () => {
  const logic = createLogic({ ...regionalRules.LS201, compareTripleAttachments: false });
  logic.OutPokerCard([111, 211, 311, 411, 113, 213]);
  logic.SetCardData(15, [110, 210, 310, 109, 209]);

  logic.ChangeSelectCard([111, 211, 311, 113, 213]);
  assert.equal(logic.GetCardType(), 15);
  assert.equal(logic.CheckCanOut(), true);

  logic.ChangeSelectCard([111, 211, 311, 411]);
  assert.equal(logic.GetCardType(), 11);
  assert.equal(logic.CheckCanOut(), true);
});

test('a lower triple body can never answer a higher triple body', () => {
  const logic = createLogic({ ...regionalRules.LS201, compareTripleAttachments: false });
  logic.OutPokerCard([105, 205, 305, 109, 209, 309, 113, 213]);
  logic.SetCardData(15, [108, 208, 308, 106, 206]);

  logic.ChangeSelectCard([105, 205, 305, 113, 213]);
  assert.equal(logic.GetCardType(), 0);
  assert.equal(logic.CheckCanOut(), false);

  logic.ChangeSelectCard([109, 209, 309, 113, 213]);
  assert.equal(logic.GetCardType(), 15);
  assert.equal(logic.CheckCanOut(), true);
});

test('attachment-comparison rule rejects a higher triple carrying a lower side card', () => {
  const logic = createLogic({
    ...regionalRules.LS201,
    compareTripleAttachments: true,
  });
  logic.OutPokerCard([112, 212, 312, 108, 114]);
  logic.SetCardData(6, [111, 211, 311, 112]);

  logic.ChangeSelectCard([112, 212, 312, 108]);
  assert.equal(logic.GetCardType(), 0, 'QQQ+8 cannot beat JJJ+Q when attachments compare');
  assert.equal(logic.CheckCanOut(), false);

  logic.ChangeSelectCard([112, 212, 312, 114]);
  assert.equal(logic.GetCardType(), 6, 'QQQ+A beats both the JJJ body and Q attachment');
  assert.equal(logic.CheckCanOut(), true);
});

test('body-only rooms do not inherit the attachment comparison rule', () => {
  const logic = createLogic({
    ...regionalRules.CD201,
    compareTripleAttachments: false,
  });
  logic.SetCardData(6, [111, 211, 311, 112]);
  logic.ChangeSelectCard([112, 212, 312, 108]);
  assert.equal(logic.GetCardType(), 6);
  assert.equal(logic.CheckCanOut(), true);
});

test('disabled four-with-three never classifies the seven-card whole hand', () => {
  const logic = createLogic(regionalRules.LS201);
  const hand = [111, 211, 311, 411, 113, 213, 107];
  logic.OutPokerCard(hand);
  logic.ClearCardData();
  logic.ChangeSelectCard(hand);
  assert.equal(logic.GetCardType(), 0);
  assert.equal(logic.CheckCanOut(), false);
});

test('Chengdu and Neijiang attachment behavior also comes from ruleOptions', () => {
  for (const gameCode of ['CD201', 'NJ201']) {
    const logic = createLogic(regionalRules[gameCode]);
    logic.ChangeSelectCard([103, 203, 303, 104, 205]);
    assert.equal(logic.GetCardType(), 7, gameCode);
  }
});

test('Chengdu compares triple-with-pair and arbitrary triple-with-two as one family', () => {
  const logic = createLogic({
    ...regionalRules.CD201,
    compareTripleAttachments: false,
  });
  logic.SetCardData(15, [110, 210, 310, 114, 214]);
  assert.equal(logic.GetLastCardType(), 15);

  logic.ChangeSelectCard([113, 213, 313, 115, 114]);
  assert.equal(logic.GetCardType(), 15);
  assert.equal(logic.CheckCanOut(), true);
});

test('pair-only mode rejects scattered attachments and accepts a higher triple with pair', () => {
  const logic = createLogic({
    minimumStraightLength: 3,
    tripleAttachmentMode: 'PAIRS',
    fourAttachmentMode: 'DISABLED',
    compareTripleAttachments: false,
  });
  logic.SetCardData(15, [110, 210, 310, 114, 214]);

  logic.ChangeSelectCard([113, 213, 313, 115, 114]);
  assert.equal(logic.GetCardType(), 0);
  logic.ChangeSelectCard([113, 213, 313, 112, 212]);
  assert.equal(logic.GetCardType(), 15);
  assert.equal(logic.CheckCanOut(), true);
});

test('four-with-two hint is generated only when authoritative four attachments allow it', () => {
  const hand = [114, 214, 113, 110, 210, 310, 410, 109];
  const enabled = createLogic({
    minimumStraightLength: 5,
    tripleAttachmentMode: 'EITHER',
    fourAttachmentMode: 'EITHER',
  });
  enabled.OutPokerCard([...hand]);
  const hint = enabled.GetSiDaiTip(9)[0];
  assert.equal(hint.length, 6);
  assert.deepEqual(hint.slice(0, 4), [110, 210, 310, 410]);
  enabled.ChangeSelectCard([110, 210, 310, 410, 114, 214]);
  assert.equal(enabled.GetCardType(), 9);
  enabled.OutPokerCard([114, 214, 113, 213, 110, 210, 310, 410, 109]);
  const pairHint = enabled.GetSiDaiTip(20)[0];
  assert.equal(pairHint.length, 8);
  enabled.ChangeSelectCard([110, 210, 310, 410, 114, 214, 113, 213]);
  assert.equal(enabled.GetCardType(), 20);

  const disabled = createLogic({
    minimumStraightLength: 5,
    tripleAttachmentMode: 'EITHER',
    fourAttachmentMode: 'DISABLED',
  });
  disabled.OutPokerCard([...hand]);
  disabled.ChangeSelectCard([110, 210, 310, 410, 114, 214]);
  assert.equal(disabled.GetCardType(), 0);

  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /private leadTipCandidates\(\): number\[\]\[\]/);
  assert.match(controller, /return enumeratePdkRankMultisetCandidates\(hand, required\)/);
  assert.match(controller, /deckCards: Array\.isArray\(rules\.deckCards\)/,
    'hint ranking must receive the authoritative regional deck for response maximums');
  assert.match(controller,
    /preserveScoringBombs: String\(rules\.bombScoreMode \?\? 'DISABLED'\) !== 'DISABLED'/,
    'public bomb preservation must come from the authoritative scoring mode');
});

test('common gameplay contains no regional branch or fixed five-card straight gate', () => {
  const { source } = loadLogic();
  const checkStraight = source.slice(source.indexOf('public CheckShunzi'),
    source.indexOf('//如果最后首发只有三带'));
  const straightTips = source.slice(source.indexOf('public GetShunziTip'),
    source.indexOf('public GetShunzi(isSelectCard'));
  assert.doesNotMatch(source, /\b(?:CD201|NJ201|LS201)\b/);
  assert.doesNotMatch(checkStraight, /pokers\.length\s*<\s*5/);
  assert.doesNotMatch(straightTips, /shunzi\.length\s*>=\s*5/);
  assert.doesNotMatch(source, /GetRoomPaiXing\('SanDai(?:Yi|Er|YiDui)'\)/);
  assert.match(source, /ruleOptions\.minimumStraightLength|minimumStraightLength/);
  assert.match(source, /ruleOptions\.tripleAttachmentMode|tripleAttachmentMode/);

  const runtime = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts'), 'utf8');
  const capabilities = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Regional/PdkGameplayCapabilities.ts'), 'utf8');
  const coordinator = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'), 'utf8');
  assert.match(runtime, /ruleOptions\.playedCardVisibility/);
  assert.match(runtime, /resolvePdkGameplayCapabilities\(this\.options\.gameCode\)/);
  assert.match(capabilities, /arrangementMode: 'disabled'/);
  assert.match(capabilities, /\[PDK_BUSINESS_CODES\.LIANGSHAN\][\s\S]*?arrangementMode: 'enabled'/);
  assert.doesNotMatch(capabilities, /CD201|NJ201|LS201/);
  assert.doesNotMatch(runtime, /arrangementMode\?:/);
  assert.doesNotMatch(coordinator, /gameCode\s*===\s*['"](?:CD201|NJ201|LS201)['"]/);
});

test('hint context trusts the authoritative round marker and never reconstructs opening rules', () => {
  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  const start = controller.indexOf('private activeRequiredFirstCard');
  const end = controller.indexOf('private authoritativePlayedCards', start);
  const method = controller.slice(start, end);
  assert.match(method, /setInfo\.roundNo \?\? setInfo\.setID/);
  assert.match(method, /setInfo\.activeRequiredFirstCard \?\? 0/);
  assert.doesNotMatch(method, /playedCards|playHistory|GetRoomProperty/);
  assert.doesNotMatch(controller, /liangshanHintCompatibility|liangshanLeadStrategy/);
});

test('missing or malformed authoritative rules fail closed', () => {
  const { CommonPdkGameLogic } = loadLogic();
  const missing = new CommonPdkGameLogic({ room: { GetRoomPaiXing: () => false } });
  missing.ChangeSelectCard([103, 104, 105]);
  assert.throws(() => missing.CheckShunzi(), /ruleOptions 缺失/);

  const malformed = createLogic({ minimumStraightLength: 2, tripleAttachmentMode: 'guess' });
  malformed.ChangeSelectCard([103, 104, 105]);
  assert.throws(() => malformed.CheckShunzi(), /minimumStraightLength 无效/);
});

test('authoritative recognition covers pair runs, all bomb families, and four with two pairs', () => {
  const base = {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    tripleAttachmentMode: 'EITHER',
    fourAttachmentMode: 'PAIRS',
    allowFourWithThree: false,
    allowFourBombWithOne: true,
    allowConsecutiveBomb: true,
    specialTripleBombRanks: [14],
    allowSpecialTripleBombWithOne: false,
    standardBombTier: 1,
    specialBombTier: 2,
    fourBombWithOneTier: 1,
  };
  const logic = createLogic(base);

  logic.ChangeSelectCard([105, 205, 106, 206]);
  assert.equal(logic.GetCardType(), 14, 'two consecutive pairs must be recognized');

  logic.ChangeSelectCard([103, 203, 303, 403, 104, 204, 304, 404]);
  assert.equal(logic.GetCardType(), 11, 'consecutive bomb must be recognized');

  logic.ChangeSelectCard([114, 214, 314]);
  assert.equal(logic.GetCardType(), 11, 'configured bare special triple bomb must be recognized');
  logic.ChangeSelectCard([114, 214, 314, 105]);
  assert.equal(logic.GetCardType(), 6, 'public PDK treats AAA with one as triple-with-one, not a bomb');

  logic.ChangeSelectCard([108, 208, 308, 408, 103, 203, 105, 205]);
  assert.equal(logic.GetCardType(), 20, 'four with two pairs must retain its distinct legacy type');

  logic.SetCardData(11, [109, 209, 309, 409]);
  logic.ChangeSelectCard([108, 208, 308, 408]);
  assert.equal(logic.GetCardType(), 0, 'a lower bomb must not beat a higher bomb');
  logic.ChangeSelectCard([110, 210, 310, 410]);
  assert.equal(logic.GetCardType(), 11, 'a higher bomb must beat a lower bomb');
});

test('Liangshan authoritative empty special-bomb ranks keep AAA available as an ordinary triple', () => {
  const { CommonPdkGameLogic } = loadLogic();
  const ruleOptions = {
    minimumStraightLength: 3,
    minimumPairRunLength: 2,
    tripleAttachmentMode: 'SINGLE_OR_PAIR',
    fourAttachmentMode: 'DISABLED',
    specialTripleBombRanks: [],
    allowSpecialTripleBombWithOne: false,
  };
  const logic = new CommonPdkGameLogic({
    room: {
      GetRoomConfig: () => ({ ruleOptions }),
      // A stale legacy room flag must not turn LS201 AAA into a bomb.
      GetRoomPaiXing: (name) => name === 'SanAZha',
    },
  });
  const aces = [114, 214, 314];
  logic.OutPokerCard([...aces, 109]);
  assert.deepEqual(logic.GetZhaDanTip(), []);
  logic.ChangeSelectCard([...aces, 109]);
  assert.equal(logic.GetCardType(), 6);
});

test('public maximum control includes K when every ace is in hand or already played', () => {
  const { effectivePdkMaximumSingleRanks } = loadRanker();
  const deck = [
    113, 213, 313, 413,
    114, 214, 314, 414,
  ];
  assert.deepEqual(effectivePdkMaximumSingleRanks(deck, [114], [214, 314, 414]), [13, 14]);
  assert.deepEqual(effectivePdkMaximumSingleRanks(deck, [114], [214, 314]), [14]);
});

test('pair-run recognition obeys authoritative minimumPairRunLength', () => {
  const logic = createLogic({
    minimumStraightLength: 5,
    minimumPairRunLength: 3,
    tripleAttachmentMode: 'EITHER',
    fourAttachmentMode: 'DISABLED',
  });
  logic.ChangeSelectCard([105, 205, 106, 206]);
  assert.equal(logic.GetCardType(), 0);
  logic.ChangeSelectCard([105, 205, 106, 206, 107, 207]);
  assert.equal(logic.GetCardType(), 14);
});

test('only LS201 opts into the complete arrangement-area capability', () => {
  const capabilities = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Regional/PdkGameplayCapabilities.ts'), 'utf8');
  const enabledMappings = [...capabilities.matchAll(/\[[^\]]+\]:\s*Object\.freeze\(\{[\s\S]*?arrangementMode:\s*'enabled',[\s\S]*?currentPlayArrow:\s*'enabled',[\s\S]*?\}\)/g)];
  assert.equal(enabledMappings.length, 1);
  assert.match(enabledMappings[0][0], /PDK_BUSINESS_CODES\.LIANGSHAN/);
  assert.match(capabilities, /DEFAULT_PDK_GAMEPLAY_CAPABILITIES[\s\S]*arrangementMode:\s*'disabled'/);
  assert.match(capabilities, /DEFAULT_PDK_GAMEPLAY_CAPABILITIES[\s\S]*currentPlayArrow:\s*'disabled'/);
});
