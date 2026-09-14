import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('legacy region-selection and client room-create data stay deleted', () => {
  const deleted = [
    'assets/Common/Code/Runtime/config/LegacySystemDataService.ts',
    'assets/Common/Code/Runtime/CompatibilityApp/config/LegacySystemDataService.ts',
    'assets/Common/Config/Legacy/assets/jsonData/gameCreate.json',
    'assets/Games/Poker/Common/Config/Legacy/assets/njpdk/jsonData/gameCreate.json',
    'assets/Games/Mahjong/Packs/Config/Legacy/hzmj-source/jsonData/gameCreate.json',
    'assets/Games/Other/resources/legacy-ui/aydss-source/jsonData/gameCreate.json',
    'assets/Games/Other/resources/legacy-ui/subgames/a3pk-source/resources/jsonData/gameCreate.json',
  ];
  for (const path of deleted) assert.equal(existsSync(new URL(path, root)), false, path);
  assert.doesNotMatch(read('assets/Lobby/Prefab/Store.prefab'), /btn_selectCity|UISelectCity|legacy-data\/selectCity/);
});

test('region is a catalog filter and never a room authority input', () => {
  const selector = read('assets/Modules/CreateRoom/Code/PlaySelectorController.ts');
  const gateway = read('assets/Lobby/Code/HallRoomGateway.ts');
  assert.doesNotMatch(selector, /activeProvince|activeCategory|selectCity|selectRegion/);
  const createBody = gateway.match(/'POST', '\/api\/v2\/hall\/rooms', \{([\s\S]*?)\}, operation\);/);
  assert.ok(createBody, 'canonical Hall room-create request is missing');
  assert.doesNotMatch(createBody[1], /regionCode/);
});
