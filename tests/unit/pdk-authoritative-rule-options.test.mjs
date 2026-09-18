import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const clientRoot = new URL('../..', import.meta.url).pathname;
const logicPath = join(clientRoot,
  'assets/Games/Poker/PDK/Common/Code/Runtime/logic/CommonPdkGameLogic.ts');

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
  return new CommonPdkGameLogic({
    room: {
      GetRoomConfig: () => ({ ruleOptions }),
      GetRoomPaiXing: (name) => {
        const four = String(ruleOptions.fourAttachmentMode ?? 'DISABLED');
        if (name === 'SiDaiEr') return four === 'SINGLES' || four === 'EITHER';
        if (name === 'SiDaiYi') return ruleOptions.allowFourBombWithOne === true;
        if (name === 'SiDaiSan') return ruleOptions.allowFourWithThree === true;
        return false;
      },
    },
  });
}

const regionalRules = {
  CD201: { minimumStraightLength: 5, tripleAttachmentMode: 'EITHER', fourAttachmentMode: 'DISABLED' },
  NJ201: { minimumStraightLength: 5, tripleAttachmentMode: 'EITHER', fourAttachmentMode: 'DISABLED' },
  LS201: { minimumStraightLength: 3, tripleAttachmentMode: 'SINGLE_OR_PAIR', fourAttachmentMode: 'DISABLED' },
};

test('three regional clients derive straight length from the authoritative snapshot', () => {
  for (const [gameCode, rules] of Object.entries(regionalRules)) {
    const logic = createLogic(rules);
    logic.ChangeSelectCard([103, 104, 105]);
    assert.equal(logic.CheckShunzi(), gameCode === 'LS201', gameCode);
  }
});

test('Liangshan XQP rule accepts triple with one card or one pair but rejects two loose cards', () => {
  const logic = createLogic(regionalRules.LS201);
  logic.ChangeSelectCard([103, 203, 303, 104]);
  assert.equal(logic.GetCardType(), 6);

  logic.ChangeSelectCard([103, 203, 303, 104, 204]);
  assert.equal(logic.GetCardType(), 15);

  logic.ChangeSelectCard([103, 203, 303, 104, 205]);
  assert.equal(logic.GetCardType(), 0);
});

test('single-or-pair is a complete authoritative attachment mode, not a client fallback', () => {
  const { source } = loadLogic();
  assert.match(source, /value !== 'SINGLE_OR_PAIR'/);
  assert.match(source, /mode === 'SINGLE_OR_PAIR'/);
  assert.match(source, /AllowsTripleTwoSingles/);

  const controller = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
  assert.match(controller, /'SINGLE_OR_PAIR', 'EITHER'/);
  assert.match(controller, /twoSingles: mode === 'EITHER'/);
});

test('Liangshan first-lead hand can hint AAA plus the required seven', () => {
  const logic = createLogic(regionalRules.LS201);
  logic.OutPokerCard([114, 214, 314, 113, 111, 211, 110, 107]);
  assert.deepEqual(logic.GetSanDaiTip(6)[0], [114, 214, 314, 107]);
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
  assert.match(controller, /const four = this\.fourAttachmentPermissions\(\)/);
  assert.match(controller, /if \(four\.singles\) this\.pushTipCandidates\(candidates, this\.logic\.GetSiDaiTip\(9\)\)/);
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
  assert.match(capabilities, /\[PDK_BUSINESS_CODES\.LIANGSHAN\].*arrangementMode: 'enabled'/);
  assert.doesNotMatch(capabilities, /CD201|NJ201|LS201/);
  assert.doesNotMatch(runtime, /arrangementMode\?:/);
  assert.doesNotMatch(coordinator, /gameCode\s*===\s*['"](?:CD201|NJ201|LS201)['"]/);
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

test('only LS201 opts into the complete arrangement-area capability', () => {
  const capabilities = readFileSync(join(clientRoot,
    'assets/Games/Poker/PDK/Common/Code/Regional/PdkGameplayCapabilities.ts'), 'utf8');
  const enabledMappings = [...capabilities.matchAll(/\[[^\]]+\]:\s*Object\.freeze\(\{[\s\S]*?arrangementMode:\s*'enabled',[\s\S]*?currentPlayArrow:\s*'enabled',[\s\S]*?\}\)/g)];
  assert.equal(enabledMappings.length, 1);
  assert.match(enabledMappings[0][0], /PDK_BUSINESS_CODES\.LIANGSHAN/);
  assert.match(capabilities, /DEFAULT_PDK_GAMEPLAY_CAPABILITIES[\s\S]*arrangementMode:\s*'disabled'/);
  assert.match(capabilities, /DEFAULT_PDK_GAMEPLAY_CAPABILITIES[\s\S]*currentPlayArrow:\s*'disabled'/);
});
