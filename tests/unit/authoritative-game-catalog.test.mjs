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
  assert.equal((catalog.match(/\{code:"[^"]+",family:"[^"]+",regionConfig:"[^"]+"\}/g) || []).length, 531);
  assert.equal((catalog.match(/gameId:\d+,displayName:"[^"]*",category:"(?:MAHJONG|POKER|LONG_CARD|WORD_CARD)",enabled:(?:true|false)/g) || []).length, 531);
});

test('region is a display filter and never enters authoritative room creation', () => {
  assert.match(gateway, /catalog\(regionCode = 'ALL'\)/);
  assert.doesNotMatch(selector, /myCityID|请先选择地区/);
  assert.doesNotMatch(gateway, /clientVersion: '3\.8\.8', rules,\s*regionCode/);
});
