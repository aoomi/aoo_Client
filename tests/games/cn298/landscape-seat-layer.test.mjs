import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prefabUrl = new URL('../../../assets/Games/Poker/NN/Prefab/CN298RoomLandscape.prefab', import.meta.url);

test('CN298 landscape keeps the authoritative seat input layer active', async () => {
    const data = JSON.parse(await readFile(prefabUrl, 'utf8'));
    const seatLayer = data.find(item => item?.__type__ === 'cc.Node' && item._name === 'Players-001');
    assert.ok(seatLayer, 'Players-001');
    assert.equal(seatLayer._active, true);
});
