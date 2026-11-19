import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (relative) => readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const [catalog, registry, manifestText] = await Promise.all([
  read('../../assets/Games/Common/Code/Catalog/CatalogFamilyBindings.ts'),
  read('../../assets/Games/Common/Code/Catalog/FamilyRuntimeRegistry.ts'),
  read('../../../Server/release-input/runtime-metadata-canonical-manifest-cd2999-current-20261012.json'),
]);
const canonicalManifest = JSON.parse(manifestText);
const canonicalCd2999 = canonicalManifest.rows.find((row) => row.gameCode === 'chengdu2999');

test('catalog exposes one typed capability model with safe-disabled fallback', () => {
  for (const capability of ['supportsSettings', 'supportsChat', 'supportsVoice', 'supportsDissolve']) {
    assert.match(registry, new RegExp(`readonly ${capability}:boolean`));
  }
  assert.match(catalog, /DISABLED_GAME_CAPABILITIES[^\n]+supportsSettings:false,supportsChat:false,supportsVoice:false,supportsDissolve:false/);
  assert.match(catalog, /getGameCapabilities\(gameCode:string\):GameCapabilities\{return CATALOG_GAME_CAPABILITIES\[gameCode\]\?\?DISABLED_GAME_CAPABILITIES;\}/);
  assert.doesNotMatch(catalog, /gameId\s*[<>=]|displayName.*supports|toLowerCase\(\).*CAPABILIT/);
});

test('only confirmed stable poker codes opt in to all room capabilities', () => {
  assert.match(catalog, /CATALOG_GAME_CAPABILITIES[^\n]+chengdu2001:PDK_GAME_CAPABILITIES/);
  assert.match(catalog, /CATALOG_GAME_CAPABILITIES[^\n]+chengdu2999:PDK_GAME_CAPABILITIES/);
  assert.match(catalog, /PDK_GAME_CAPABILITIES[^\n]+supportsSettings:true,supportsChat:true,supportsVoice:true,supportsDissolve:true/);
  assert.equal((catalog.match(/:PDK_GAME_CAPABILITIES/g) || []).length, 29);
  assert.match(catalog, /\{code:"chengdu2999",family:"poker:cd299",regionConfig:"CONFIG:chengdu2999@sichuan\/chengdu"\}/);
  assert.ok(canonicalCd2999, 'canonical current chengdu2999 row must exist');
  assert.equal(canonicalCd2999.gameId, 2999);
  assert.match(catalog, /"chengdu2999":\{gameId:2999,displayName:"成都扯旋",category:"POKER",enabled:true\}/);
  assert.doesNotMatch(catalog, /"chengdu2999":\{gameId:630,/);
});

test('metadata and capabilities are queried by exact stable game code', () => {
  assert.match(catalog, /getCatalogGameMetadata\(gameCode:string\):CatalogGameMetadata\|undefined\{return CATALOG_GAME_METADATA\[gameCode\];\}/);
  assert.doesNotMatch(catalog, /pdk_bak:PDK_GAME_CAPABILITIES|aypdk:PDK_GAME_CAPABILITIES|wnpdk:PDK_GAME_CAPABILITIES/);
});
