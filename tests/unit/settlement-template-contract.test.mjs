import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const clientRoot = new URL('../..', import.meta.url).pathname;
const assets = join(clientRoot, 'assets');
const pokerSmall = join(assets, 'Games/Poker/PDK/Common/Prefab');
const pokerBig = join(assets, 'Games/Poker/Common/Prefab');
const registry = JSON.parse(readFileSync(join(assets, 'Games/Common/Config/SettlementPrefabRegistry.json'), 'utf8'));
const pdkTemplatePath = 'Games/Poker/PDK/Common/Prefab/SmallSettlement';
const pdkTemplateUuid = 'af823342-845f-4b26-9343-c2c95712a829';
const pdkFinalTemplatePath = 'Games/Poker/Common/Prefab/BigSettlement_0';
const pdkFinalTemplateUuid = '997768e2-c9b5-4e2b-addb-6f22cd54c0fc';
const require = createRequire(import.meta.url);

let settlementRuntime;

function loadSettlementRuntime() {
  if (settlementRuntime) return settlementRuntime;
  const typescript = require('typescript');
  const moduleApi = require('node:module');
  const originalTsLoader = require.extensions['.ts'];
  const originalLoad = moduleApi._load;
  require.extensions['.ts'] = (module, filename) => module._compile(typescript.transpileModule(
    readFileSync(filename, 'utf8'),
    { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 }, fileName: filename },
  ).outputText, filename);
  moduleApi._load = (request, parent, isMain) => request === 'cc' ? {} : originalLoad(request, parent, isMain);
  try {
    settlementRuntime = {
      service: require(join(assets, 'Games/Common/Code/Settlement/SettlementAssetService.ts')),
      SettlementTemplateResolver: require(join(assets, 'Games/Common/Code/Settlement/SettlementTemplateResolver.ts')).SettlementTemplateResolver,
    };
  } finally {
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
    moduleApi._load = originalLoad;
  }
  return settlementRuntime;
}

function nodeNames(prefabPath) {
  return JSON.parse(readFileSync(prefabPath, 'utf8'))
    .filter((item) => item?.__type__ === 'cc.Node')
    .map((item) => item._name);
}

test('Poker owns one complete family-default small settlement template', () => {
  const authority = join(pokerSmall, 'SmallSettlement.prefab');
  assert.equal(existsSync(authority), true);
  const names = nodeNames(authority);
  for (const required of ['SmallSettlement', 'Lb_RoomId', 'Lb_Time', 'PlayerList',
    'Btn_Continue', 'Btn_Final', 'Btn_Return', 'Btn_Replay']) {
    assert.ok(names.includes(required), `missing Poker settlement node ${required}`);
  }
  assert.equal(names.includes('Btn_'), false, 'unnamed replay button must be migrated');
});

test('PDK small-settlement list content contains only the player item template', () => {
  const prefab = JSON.parse(readFileSync(join(pokerSmall, 'SmallSettlement.prefab'), 'utf8'));
  const node = (name) => prefab.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
  const contentIndex = node('Content');
  const itemIndex = node('Item');
  const specialHandsIndex = node('SpecialHands');
  assert.deepEqual(prefab[contentIndex]._children.map((entry) => entry.__id__), [itemIndex]);
  assert.equal(prefab[itemIndex]._children.some((entry) => entry.__id__ === specialHandsIndex), true);
  assert.equal(prefab[specialHandsIndex]._parent.__id__, itemIndex);
  const itemTransform = prefab[prefab[itemIndex]._components
    .map((entry) => entry.__id__)
    .find((id) => prefab[id]?.__type__ === 'cc.UITransform')];
  const specialHandsTransform = prefab[prefab[specialHandsIndex]._components
    .map((entry) => entry.__id__)
    .find((id) => prefab[id]?.__type__ === 'cc.UITransform')];
  assert.ok(Math.abs(prefab[specialHandsIndex]._lpos.y) <= itemTransform._contentSize.height / 2,
    'SpecialHands must remain inside the player item instead of inheriting Content coordinates');
  assert.equal(specialHandsTransform._contentSize.height, 50);
});

test('Poker small settlements use stable family aliases and one family default', () => {
  const files = Array.from(new Set(Object.values(registry.pokerSmallDefaultTemplates ?? {})));
  assert.deepEqual(Object.keys(registry.pokerSmallFamilyAliases ?? {}).sort(),
    ['510k', 'betting', 'climbing', 'compare-hand', 'generic-card-round', 'landlord', 'pao-de-kuai', 'trick-taking']);
  assert.deepEqual(files, ['SmallSettlement']);
  assert.equal(existsSync(join(pokerSmall, 'SmallSettlement.prefab')), true);
  const physical = new Set(
    Object.values(registry.games).flatMap((game) => game.assets)
      .filter((asset) => asset.bundle === 'poker-common' && asset.settlement === 'SmallSettle')
      .map((asset) => asset.template.split('/').at(-1)),
  );
  for (const template of physical) assert.match(template, /^(SmallSettlement|SmallSettleTpl_[a-z0-9_]+_\d{2})$/);
});

test('every PDK small-settlement registry entry points at the canonical SmallSettlement asset', () => {
  const pdkGameIds = [];
  for (const [gameId, game] of Object.entries(registry.games)) {
    const small = game.assets.find((asset) => asset.settlement === 'SmallSettle');
    if (!small || small.template !== pdkTemplatePath) continue;
    pdkGameIds.push(gameId);
    assert.equal(small.uuid, pdkTemplateUuid, gameId);
    assert.equal(small.bundle, 'paodekuai-common', gameId);
  }
  assert.ok(pdkGameIds.length >= 3, `expected active PDK variants, got ${pdkGameIds.length}`);
});

test('every PDK big-settlement registry entry points at the canonical Poker public asset', () => {
  const pdkGameIds = [];
  for (const [gameId, game] of Object.entries(registry.games)) {
    const small = game.assets.find((asset) => asset.settlement === 'SmallSettle');
    if (!small || small.template !== pdkTemplatePath) continue;
    const big = game.assets.find((asset) => asset.settlement === 'BigSettle');
    pdkGameIds.push(gameId);
    assert.equal(big.template, pdkFinalTemplatePath, gameId);
    assert.equal(big.uuid, pdkFinalTemplateUuid, gameId);
    assert.equal(big.bundle, 'poker-common', gameId);
  }
  assert.ok(pdkGameIds.length >= 3, `expected active PDK variants, got ${pdkGameIds.length}`);
});

test('settlement service and resolver honor Catalog identity and public settlement routes', () => {
  const { service, SettlementTemplateResolver } = loadSettlementRuntime();
  assert.equal(service.settlementFamilyForGame('ChengDu2001'), 'poker:pao-de-kuai');
  assert.equal(service.settlementCategoryForGame('ChengDu2001', 'poker:landlord'), 'Poker');
  assert.equal(service.isPdkSettlementGame('ChengDu2001', 'poker:landlord'), true);
  assert.deepEqual(service.settlementPreloadBundleNames('ChengDu2001'), ['paodekuai-common', 'poker-common']);
  assert.equal(service.settlementCategoryForGame('HZMJ'), 'Mahjong');
  assert.equal(service.settlementCategoryForGame('unknown'), null);

  const resolver = new SettlementTemplateResolver();
  const pdkSmall = resolver.resolve({ gameId: 'ChengDu2001', playFamily: 'poker:landlord', settlementType: 'SMALL' });
  assert.deepEqual(pdkSmall, {
    category: 'Poker', kind: 'SmallSettle', bundleName: 'paodekuai-common',
    templateId: 'SmallSettlement', defaultTemplateId: 'SmallSettlement', isDefault: true,
    assetPath: 'Prefab/SmallSettlement',
  });
  const pdkBig = resolver.resolve({ gameId: 'ChengDu2001', settlementType: 'BIG' });
  assert.equal(pdkBig.bundleName, 'poker-common');
  assert.equal(pdkBig.assetPath, 'Prefab/BigSettlement_0');

  const cd299 = resolver.resolve({ gameId: 'chengdu2999', settlementType: 'LOOP_BIG' });
  assert.equal(cd299.bundleName, 'poker-common');
  assert.equal(cd299.assetPath, 'Prefab/BigSettlement_0');
  assert.throws(() => resolver.resolve({ gameId: 'ChengDu2001', settlementType: 'LOOP_BIG' }), /循环大结算仅允许 CD299/);
});

test('PDK final settlement uses the active poker-common bundle root', () => {
  const pokerRoot = join(assets, 'Games/Poker/Common');
  const pokerMeta = JSON.parse(readFileSync(`${pokerRoot}.meta`, 'utf8'));
  assert.equal(pokerMeta.userData?.isBundle, true);
  assert.equal(pokerMeta.userData?.bundleName, 'poker-common');
  assert.equal(existsSync(join(pokerRoot, 'Prefab/BigSettlement_0.prefab')), true);
  const finalMeta = JSON.parse(readFileSync(join(pokerRoot, 'Prefab/BigSettlement_0.prefab.meta'), 'utf8'));
  assert.equal(finalMeta.uuid, pdkFinalTemplateUuid);
});
