import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('active PDK variants use the PDK-owned small settlement default', () => {
  for (const gameCode of ['cd201', 'nj201', 'ls201']) {
    const gameAssets = registry.games[gameCode].assets;
    assert.equal(gameAssets.find((asset) => asset.settlement === 'SmallSettle').template,
      pdkTemplatePath);
    assert.equal(gameAssets.find((asset) => asset.settlement === 'BigSettle').template,
      pdkFinalTemplatePath);
  }
  assert.equal(existsSync(join(pokerBig, 'BigSettlement_0.prefab')), true);
});

test('CD201, NJ201, and LS201 register the Poker public settlement defaults', () => {
  for (const gameCode of ['cd201', 'nj201', 'ls201']) {
    const assets = registry.games[gameCode].assets;
    const small = assets.find((asset) => asset.settlement === 'SmallSettle');
    const big = assets.find((asset) => asset.settlement === 'BigSettle');
    assert.deepEqual(small, {
      settlement: 'SmallSettle', template: pdkTemplatePath,
      uuid: pdkTemplateUuid, bundle: 'paodekuai-common',
    }, gameCode);
    assert.deepEqual(big, {
      settlement: 'BigSettle', template: pdkFinalTemplatePath,
      uuid: pdkFinalTemplateUuid, bundle: 'poker-common',
    }, gameCode);
  }
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

test('the one resolver owns default selection and PDK preloading order', () => {
  const resolver = readFileSync(join(assets, 'Games/Common/Code/Settlement/SettlementTemplateResolver.ts'), 'utf8');
  const preloader = readFileSync(join(assets, 'Games/Common/Code/Settlement/SettlementBundlePreloader.ts'), 'utf8');
  const coordinator = readFileSync(join(assets, 'Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'), 'utf8');
  assert.match(resolver, /const defaultTemplateId = 'SmallSettlement'/);
  assert.match(resolver, /bundleName: 'paodekuai-common'/);
  assert.match(resolver, /assetPath: 'Prefab\/SmallSettlement'/);
  assert.match(resolver, /const defaultTemplateId = 'BigSettlement'/);
  assert.match(resolver, /assetPath: isDefault \? 'Prefab\/BigSettlement_0'/);
  assert.match(resolver, /bundleFor\('Poker', kind\)/);
  assert.match(resolver, /\$\{kind\}Tpl_00/);
  assert.match(preloader, /await this\.load\(category, 'SmallSettle'\);\s*await this\.load\(category, 'BigSettle'\);/s);
  assert.match(preloader, /isPdkFamily\(playFamily\)/);
  assert.match(preloader, /this\.loadBundle\('poker-common'\)/);
  assert.match(preloader, /categoryForFamily\(playFamily\)/);
  assert.match(resolver, /categoryByGameId\.get\(gameId\) \?\? categoryForFamily\(family\)/);
  assert.match(coordinator, /settlementTemplateResolver\.resolve/);
  assert.match(coordinator, /settlementBundlePreloader\.preloadForGame/);
  assert.match(coordinator, /settlement\/poker\/BigSettlement/);
  assert.doesNotMatch(coordinator, /Lobby\/Prefab\/uiGame|resources\.load/);
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
