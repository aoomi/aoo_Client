import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const prefabPath = new URL('../../assets/Games/Poker/PDK/Common/Prefab/PDK_CommonRoom.prefab', import.meta.url);
const presenterPath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/Room/OperationPresenter.ts', import.meta.url);
const controllerPath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url);

test('PDK operation buttons use one scale-aware centred layout', () => {
    const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const buttonContainerIndex = prefab.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'Btn');
    const layout = prefab.find((entry) => entry?.__type__ === 'cc.Layout' && entry.node?.__id__ === buttonContainerIndex);
    assert.ok(layout, 'Btn must own a Layout component');
    assert.equal(layout._enabled, true);
    assert.equal(layout._resizeMode, 1, 'the centred container must resize whenever visible buttons change');
    assert.equal(layout._affectedByScale, true, 'button scale must participate in spacing calculations');

    assert.equal(prefab[buttonContainerIndex]._lpos.x, 0, 'the operation group origin must stay at the screen centre');

    const presenter = fs.readFileSync(presenterPath, 'utf8');
    assert.match(presenter, /layout\.resizeMode = Layout\.ResizeMode\.CONTAINER/);
    assert.match(presenter, /layout\.affectedByScale = true/);
    assert.match(presenter, /layout\.paddingLeft = 0/);
    assert.match(presenter, /layout\.paddingRight = 0/);
    assert.doesNotMatch(presenter, /child\.setPosition/);

    const controller = fs.readFileSync(controllerPath, 'utf8');
    for (const runtimeOnlyButton of ['keepRoomOpenButton', 'closeRoomButton', 'noGrabButton', 'grabDealerButton']) {
        assert.match(controller, new RegExp(`this\\.view\\.visible\\(PdkRoomNodePath\\.${runtimeOnlyButton}, false\\)`));
    }
});
