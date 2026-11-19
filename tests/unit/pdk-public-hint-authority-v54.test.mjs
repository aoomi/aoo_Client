import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const clientRoot = new URL('../..', import.meta.url).pathname;
const rankerPath = `${clientRoot}/assets/Games/Poker/PDK/Common/Code/Runtime/logic/PdkCleanHintRanker.ts`;
const logicPath = `${clientRoot}/assets/Games/Poker/PDK/Common/Code/Runtime/logic/PdkGameLogic.ts`;
const controllerPath = `${clientRoot}/assets/Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts`;
const hintControllerPath = `${clientRoot}/assets/Games/Poker/PDK/Common/Code/Runtime/PdkHintController.ts`;

function loadRanker() {
  const modules = new Map();
  const loadModule = (filename) => {
    const normalized = extname(filename) ? filename : `${filename}.ts`;
    if (modules.has(normalized)) return modules.get(normalized).exports;
    const module = { exports: {} };
    modules.set(normalized, module);
    const js = ts.transpileModule(readFileSync(normalized, 'utf8'), {
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
  return loadModule(rankerPath);
}

test('public prompt has one candidate owner and no deleted prompt helpers', () => {
  const logic = readFileSync(logicPath, 'utf8');
  const controller = readFileSync(controllerPath, 'utf8');
  const hints = readFileSync(hintControllerPath, 'utf8');
  for (const name of [
    'GetZhaDanTip', 'GetOneCard', 'GetDuiziTip', 'GetShunziTip',
    'GetSanDaiTip', 'GetSiDaiTip', 'GetSanDaiFeiJiTip', 'GetLianDuiTip',
    'GetZhaDan', 'GetZhaDanEx', 'GetDuizi', 'GetShunzi', 'GetSanDai',
    'GetSiDai', 'GetSanDaiFeiJi', 'GetFeiJi', 'GetLianDui', 'GetOtherCard',
    'GetOtherCardDui', 'PushTipCard',
    'exactSizeResponseSubsets', 'completeTripleWithSingleTipCandidates',
    'completePairRunTipCandidates', 'pdkSingleResponseCandidates',
  ]) {
    assert.doesNotMatch(logic, new RegExp(`(?:public|private)\\s+${name}\\s*\\(`), name);
    assert.doesNotMatch(`${controller}\n${hints}`, new RegExp(`(?:public|private)\\s+${name}\\s*\\(`), name);
  }
  assert.doesNotMatch(logic, /GetRealPlane|CheckSanDaiFeiJi|GetCardType|GetCardValue|GetDaiNum/);
  assert.match(hints, /pdkOperationTypeForCards\(/);
  assert.match(hints, /rankCleanPdkHints\(/);
});

test('four-family candidates keep a four-card body separate from triple families', () => {
  const { generatePdkFixedPlanCandidates } = loadRanker();
  const candidates = generatePdkFixedPlanCandidates([107, 207, 307, 407, 105, 106], {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    tripleAttachmentMode: 'EITHER',
    fourAttachmentMode: 'SINGLES',
    decompositionPlanMode: 'SELF',
  }).map((entry) => entry.cards);
  assert.ok(candidates.some((cards) => cards.length === 6
    && cards.filter((card) => card % 100 === 7).length === 4));
});

test('response bomb is a fallback after ordinary same-shape candidates', () => {
  const { rankCleanPdkHints } = loadRanker();
  const hand = [106, 206, 306, 406, 109, 209, 309, 114];
  const rules = {
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    tripleAttachmentMode: 'EITHER',
    preserveScoringBombs: false,
    decompositionPlanMode: 'RESPONSE',
    responseTargetType: 5,
    responseTargetCount: 3,
    responseTargetCards: [105, 205, 305],
  };
  const { generatePdkFixedPlanCandidates } = loadRanker();
  const candidates = generatePdkFixedPlanCandidates(hand, rules);
  const ranked = rankCleanPdkHints(hand, candidates, rules);
  assert.deepEqual(ranked[0].map((card) => card % 100).sort((a, b) => a - b), [6, 6, 6]);
  assert.equal(ranked[0].length, 3, 'ordinary same-shape response must precede the bomb fallback');
});

test('numeric opening-card authority is retained as a real constraint', () => {
  const { resolvePdkHintRulePlan } = loadRanker();
  const plan = resolvePdkHintRulePlan({
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    activeRequiredFirstCard: 105,
    requiredFirstCard: 103,
  }, { policyId: 'COMMON', workbookIdentity: 'test' }, {
    leading: true,
    previousType: 0,
    previousCardCount: 0,
    nextPlayerReportedSingle: false,
    nextPlayerReportedPair: false,
  });
  assert.equal(plan.rules.requiredFirstCard, 105);
  assert.equal(plan.rules.decompositionPlanMode, 'SELF');
});

test('empty hint diagnostics expose pipeline stages without writing hidden card values', () => {
  const hints = readFileSync(hintControllerPath, 'utf8');
  const cacheStart = hints.indexOf("this.host.traceOutCards('hint-cache'");
  const cacheEnd = hints.indexOf('\n        });', cacheStart);
  const cacheTrace = hints.slice(cacheStart, cacheEnd);
  assert.ok(cacheStart >= 0 && cacheEnd > cacheStart);
  assert.match(hints, /CommonRoomHintUnavailable/);
  assert.match(hints, /rootCandidateCount/);
  assert.match(hints, /emptyReason/);
  assert.match(cacheTrace, /candidateShapeCounts/);
  assert.doesNotMatch(cacheTrace, /targetCards|candidates:|finalSelection/);
  assert.doesNotMatch(hints, /cards: \[\.\.\.automatic\]|finalCards:|targetCards: \[\.\.\.lastCards\]/);
});
