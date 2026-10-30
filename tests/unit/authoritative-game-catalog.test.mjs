import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const read = (relative) => readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const [catalog, selector, gateway, screen, club, union] = await Promise.all([
  read('../../assets/Games/Common/Code/Catalog/CatalogFamilyBindings.ts'),
  read('../../assets/Modules/CreateRoom/Code/PlaySelectorController.ts'),
  read('../../assets/Lobby/Code/HallRoomGateway.ts'),
  read('../../assets/Lobby/Code/LobbyScreenController.ts'),
  read('../../assets/Club/Code/Runtime/LegacyClubMainController.ts'),
  read('../../assets/Club/Code/Runtime/LegacyUnionManagerController.ts'),
]);
test('lobby and club consume the authoritative catalog without retired resource paths', () => {
  const production = [catalog, selector, gateway, screen, club, union].join('\n');
  assert.doesNotMatch(production, /legacy-data\/gametype|legacy-data\/selectCity|hall\.regions|CBaseGameIdList|UISelectCity|UIMoreGame|UICreatRoom/);
  assert.match(selector, /CATALOG_GAME_METADATA/);
  assert.match(selector, /implementedFamilies\.has\(this\.runtimeFamily\(game\.familyCode\)\)/);
  assert.match(selector, /parts\[0\] === 'long' \|\| parts\[0\] === 'word'/);
  assert.match(gateway, /\/api\/v2\/hall\/play-filters/);
  assert.match(gateway, /\/api\/v2\/hall\/catalog/);
  assert.match(gateway, /\/api\/v2\/hall\/configuration/);
  assert.match(screen, /hallRoomGateway\.catalog\('ALL'\)/);
  assert.doesNotMatch(union, /hall\.catalog|请先选择地区/);
  const bindings = catalog.match(/\{code:"[^"]+",family:"[^"]+",regionConfig:"[^"]+"\}/g) || [];
  const metadata = catalog.match(/gameId:\d+,displayName:"[^"]*",category:"(?:MAHJONG|POKER|LONG_CARD|WORD_CARD)",enabled:(?:true|false)/g) || [];
  assert.equal(bindings.length, metadata.length);
  assert.ok(bindings.length >= 32);
});

test('region is a display filter and never enters authoritative room creation', () => {
  assert.match(gateway, /catalog\(regionCode = 'ALL'\)/);
  assert.doesNotMatch(selector, /myCityID|请先选择地区/);
  assert.doesNotMatch(gateway, /clientVersion: '3\.8\.8', rules,\s*regionCode/);
});

test('chengdu blood-battle mahjong stays visible in the Mahjong category with its canonical identity', () => {
  assert.match(catalog, /\{code:"chengdu1001",family:"mahjong:xue-zhan",regionConfig:"CONFIG:chengdu1001@SC\/CD"\}/);
  assert.match(catalog, /"chengdu1001":\{gameId:1001,displayName:"成都麻将",category:"MAHJONG",enabled:true\}/);
  assert.match(selector, /if \(family\.startsWith\('mahjong:'\)\) return 'MAHJONG';/);
  assert.match(selector, /if \(category === 'MAHJONG' \|\| category === 'POKER' \|\| category === 'LONG_CARD'\)/);
  assert.match(selector, /category === 'WORD_CARD'\) return 'LONG_CARD'/);
});

test('special poker metadata uses the published game ids used by Hall and authority', () => {
  assert.match(catalog, /"quanguo2998":\{gameId:5,displayName:"全国牛牛",category:"POKER",enabled:true\}/);
  assert.match(catalog, /"quanguo2997":\{gameId:9,displayName:"全国金花",category:"POKER",enabled:true\}/);
  assert.match(catalog, /"chengdu2999":\{gameId:630,displayName:"成都扯旋",category:"POKER",enabled:true\}/);
});
