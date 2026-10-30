import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prefabUrl = new URL('../../../assets/Games/Poker/NN/Prefab/NN_CommonRoom.prefab', import.meta.url);
const viewUrl = new URL('../../../assets/Games/Poker/NN/Common/Code/NnRoomViewComponent.ts', import.meta.url);

test('NN common room keeps the authoritative seat input layer active', async () => {
    const data = JSON.parse(await readFile(prefabUrl, 'utf8'));
    const seatLayer = data.find(item => item?.__type__ === 'cc.Node' && item._name === 'Players-001');
    assert.ok(seatLayer, 'Players-001');
    assert.equal(seatLayer._active, false, 'imported skin stays serialization-readonly');
    const view = await readFile(viewUrl, 'utf8');
    assert.match(view, /getChildByName\('Players-001'\)/);
    assert.match(view, /seatInputLayer\.active = true/);
});
