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
      GetRoomPaiXing: () => false,
    },
  });
}

const regionalRules = {
  CD201: { minimumStraightLength: 5, tripleAttachmentMode: 'EITHER' },
  NJ201: { minimumStraightLength: 5, tripleAttachmentMode: 'EITHER' },
  LS201: { minimumStraightLength: 3, tripleAttachmentMode: 'PAIRS' },
};

test('three regional clients derive straight length from the authoritative snapshot', () => {
  for (const [gameCode, rules] of Object.entries(regionalRules)) {
    const logic = createLogic(rules);
    logic.ChangeSelectCard([103, 104, 105]);
    assert.equal(logic.CheckShunzi(), gameCode === 'LS201', gameCode);
  }
});

test('Liangshan accepts triple-with-pair and rejects two scattered attachments', () => {
  const logic = createLogic(regionalRules.LS201);
  logic.ChangeSelectCard([103, 203, 303, 104, 204]);
  assert.equal(logic.GetCardType(), 15);

  logic.ChangeSelectCard([103, 203, 303, 104, 205]);
  assert.equal(logic.GetCardType(), 0);
});

test('Chengdu and Neijiang attachment behavior also comes from ruleOptions', () => {
  for (const gameCode of ['CD201', 'NJ201']) {
    const logic = createLogic(regionalRules[gameCode]);
    logic.ChangeSelectCard([103, 203, 303, 104, 205]);
    assert.equal(logic.GetCardType(), 7, gameCode);
  }
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
  assert.match(capabilities, /retainPlayedCardsOnTable: false/);
  assert.match(capabilities, /\[PDK_BUSINESS_CODES\.LIANGSHAN\].*retainPlayedCardsOnTable: true/);
  assert.doesNotMatch(capabilities, /CD201|NJ201|LS201/);
  assert.doesNotMatch(runtime, /retainPlayedCardsOnTable\?:/);
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
