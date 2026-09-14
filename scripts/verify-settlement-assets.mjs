import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsRoot = join(clientRoot, 'assets');
const registryPath = join(assetsRoot, 'Games/Common/Config/SettlementPrefabRegistry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const bundles = [
  { family: 'LongCard', kind: 'BigSettle', path: 'Games/LongCard/Common/Prefab/BigSettle', bundleName: 'longcard-big-settle' },
  { family: 'LongCard', kind: 'SmallSettle', path: 'Games/LongCard/Common/Prefab/SmallSettle', bundleName: 'longcard-small-settle' },
  { family: 'Mahjong', kind: 'BigSettle', path: 'Games/Mahjong/Common/Prefab/BigSettle', bundleName: 'mahjong-big-settle' },
  { family: 'Mahjong', kind: 'SmallSettle', path: 'Games/Mahjong/Common/Prefab/SmallSettle', bundleName: 'mahjong-small-settle' },
  { family: 'WordCard', kind: 'BigSettle', path: 'Games/WordCard/Common/Prefab/BigSettle', bundleName: 'wordcard-big-settle' },
  { family: 'WordCard', kind: 'SmallSettle', path: 'Games/WordCard/Common/Prefab/SmallSettle', bundleName: 'wordcard-small-settle' },
];

function walk(root, visit) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'uiGame-001' || ['build', 'library', 'temp', 'work'].includes(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) walk(path, visit);
    else visit(path);
  }
}

const bundleNames = new Set();
for (const { family, kind, path, bundleName } of bundles) {
  const root = join(assetsRoot, path);
  assert.ok(existsSync(root), `missing canonical settlement directory: ${path}`);
  const meta = JSON.parse(readFileSync(`${root}.meta`, 'utf8'));
  assert.equal(meta.userData?.isBundle, true, `${path} must be a bundle`);
  assert.equal(meta.userData?.bundleName, bundleName, `${path} bundle name`);
  assert.equal(bundleNames.has(bundleName), false, `duplicate bundle name: ${bundleName}`);
  bundleNames.add(bundleName);
  const parentMeta = JSON.parse(readFileSync(join(dirname(root), '..', 'Prefab.meta'), 'utf8'));
  assert.notEqual(parentMeta.userData?.isBundle, true, `${family}/Common/Prefab cannot be a bundle`);
  const entries = readdirSync(root, { withFileTypes: true });
  assert.equal(entries.some((entry) => entry.isDirectory()), false, `${path} cannot contain child directories`);
  const prefabs = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.prefab'));
  assert.ok(prefabs.length > 0, `${path} has no templates`);
  for (const entry of prefabs) {
    const stem = basename(entry.name, '.prefab');
    const expected = family === 'Poker' && kind === 'SmallSettle'
      ? /^SmallSettleTpl_[a-z0-9_]+_\d{2}$/
      : new RegExp(`^${kind}Tpl_\\d{2,}$`);
    assert.match(stem, expected, `invalid settlement template name: ${path}/${entry.name}`);
    const prefabMeta = JSON.parse(readFileSync(join(root, `${entry.name}.meta`), 'utf8'));
    assert.notEqual(prefabMeta.userData?.isBundle, true, `prefab cannot be a bundle: ${entry.name}`);
  }
  if (!(family === 'Poker' && kind === 'SmallSettle')) {
    assert.ok(existsSync(join(root, `${kind}Tpl_00.prefab`)), `missing default template: ${path}`);
  }
}

const pokerCommonRoot = join(assetsRoot, 'Games/Poker/Common');
const pokerCommonMeta = JSON.parse(readFileSync(`${pokerCommonRoot}.meta`, 'utf8'));
assert.equal(pokerCommonMeta.userData?.isBundle, true, 'Poker/Common must be a bundle');
assert.equal(pokerCommonMeta.userData?.bundleName, 'poker-common', 'Poker/Common bundle name');
for (const kind of ['BigSettle', 'SmallSettle']) {
  const root = join(pokerCommonRoot, 'Prefab', kind);
  assert.ok(existsSync(root), `missing Poker settlement directory: ${kind}`);
  const meta = JSON.parse(readFileSync(`${root}.meta`, 'utf8'));
  assert.notEqual(meta.userData?.isBundle, true, `Poker/${kind} must inherit poker-common`);
}

for (const [family, template] of Object.entries(registry.pokerSmallDefaultTemplates ?? {})) {
  assert.match(family, /^[a-z0-9-]+$/);
  const defaultRoot = join(assetsRoot, 'Games/Poker/Common/Prefab/SmallSettle');
  assert.ok(existsSync(join(defaultRoot, `${template}.prefab`)),
    `missing Poker family default: ${family}/${template}`);
}

let checkedRegistryAssets = 0;
for (const game of Object.values(registry.games)) {
  for (const asset of game.assets) {
    if (!asset.bundle?.endsWith('-settle') && asset.bundle !== 'poker-common') continue;
    const prefabPath = join(assetsRoot, `${asset.template}.prefab`);
    assert.ok(existsSync(prefabPath), `registry template missing: ${asset.template}`);
    const meta = JSON.parse(readFileSync(`${prefabPath}.meta`, 'utf8'));
    assert.equal(meta.uuid, asset.uuid, `registry UUID mismatch: ${asset.template}`);
    assert.equal('source' in asset, false, `runtime registry retains migration source: ${asset.template}`);
    assert.equal('mergedInto' in asset, false, `runtime registry retains migration alias: ${asset.template}`);
    checkedRegistryAssets += 1;
  }
}

const forbidden = [];
walk(join(clientRoot, 'assets'), (path) => {
  const extension = extname(path);
  if (!['.ts', '.js', '.mjs', '.json', '.scene', '.prefab'].includes(extension)) return;
  const text = readFileSync(path, 'utf8');
  if (/Lobby\/Prefab\/uiGame(?!-001)/.test(text)
    || /Games\/(LongCard|Mahjong|Poker|WordCard)\/Prefab\/(BigSettle|SmallSettle)/.test(text)
    || /Games\/Poker\/Common\/Prefab\/SmallSettle\/SmallSettleTpl\d+/.test(text)
    || /settlement\/pdk|history\/pdk|poker-(?:small|big)-settle/.test(text)) {
    forbidden.push(relative(clientRoot, path));
  }
});
assert.deepEqual(forbidden, [], `old settlement runtime paths remain:\n${forbidden.join('\n')}`);

console.log(JSON.stringify({ bundles: bundleNames.size + 1, registryAssets: checkedRegistryAssets,
  pokerFamilyDefaults: Object.keys(registry.pokerSmallDefaultTemplates ?? {}).length }));
