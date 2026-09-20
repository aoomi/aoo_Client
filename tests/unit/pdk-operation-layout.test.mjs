import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const prefabPath = new URL('../../assets/Games/Poker/PDK/Common/Prefab/PDK_CommonRoom.prefab', import.meta.url);
const presenterPath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/Room/OperationPresenter.ts', import.meta.url);
const controllerPath = new URL('../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts', import.meta.url);

test('PDK operation button adaptation is owned only by the prefab', () => {
    const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const buttonContainerIndex = prefab.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'Btn');
    const layout = prefab.find((entry) => entry?.__type__ === 'cc.Layout' && entry.node?.__id__ === buttonContainerIndex);
    const widget = prefab.find((entry) => entry?.__type__ === 'cc.Widget' && entry.node?.__id__ === buttonContainerIndex);
    assert.ok(layout, 'Btn must own a Layout component');
    assert.ok(widget, 'Btn must own its viewport adaptation Widget in the prefab');
    assert.equal(widget._alignFlags, 20, 'Btn must stay horizontally centred and bottom-aligned');
    assert.equal(widget._horizontalCenter, 0);
    assert.equal(widget._bottom, 220);
    assert.equal(layout._enabled, true);
    assert.equal(layout._resizeMode, 1, 'the centred container must resize whenever visible buttons change');
    assert.equal(layout._affectedByScale, true, 'button scale must participate in spacing calculations');

    assert.equal(prefab[buttonContainerIndex]._lpos.x, 0, 'the operation group origin must stay at the screen centre');

    const presenter = fs.readFileSync(presenterPath, 'utf8');
    assert.doesNotMatch(presenter, /Layout|updateLayout|setPosition|syncLayout|centerVisibleButtons/);

    const controller = fs.readFileSync(controllerPath, 'utf8');
    assert.doesNotMatch(controller, /syncCommonButtonLayout|syncOperationButtonLayout|centerOperationButtons/);
    assert.doesNotMatch(controller, /commonMoreWidgetStates|commonMoreMenuPosition|commonMoreMenuScale/);
    for (const runtimeOnlyButton of ['keepRoomOpenButton', 'closeRoomButton', 'noGrabButton', 'grabDealerButton']) {
        assert.match(controller, new RegExp(`this\\.view\\.visible\\(PdkRoomNodePath\\.${runtimeOnlyButton}, false\\)`));
    }
});

test('PDK four play areas adapt against the room boundary without changing authored coordinates', () => {
    const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const roomIndex = prefab.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'PDK_CommonRoom');
    const expected = {
        Play_0: { position: [0, 0], flags: 20, horizontalCenter: 0, bottom: 320 },
        Play_1: { position: [530, 100], flags: 34, right: 70, verticalCenter: 100 },
        Play_2: { position: [280, 280], flags: 33, right: 320, top: 40 },
        Play_3: { position: [-530, 100], flags: 10, left: 70, verticalCenter: 100 },
    };

    for (const [name, rule] of Object.entries(expected)) {
        const nodeIndex = prefab.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
        const node = prefab[nodeIndex];
        const widget = prefab.find((entry) => entry?.__type__ === 'cc.Widget' && entry.node?.__id__ === nodeIndex);
        assert.deepEqual([node._lpos.x, node._lpos.y], rule.position, `${name} authored coordinates must stay unchanged`);
        assert.ok(widget, `${name} must own a Widget`);
        assert.equal(widget._alignFlags, rule.flags);
        assert.equal(widget._target?.__id__, roomIndex, `${name} must adapt against PDK_CommonRoom, not the 100x100 Players node`);
        if ('horizontalCenter' in rule) assert.equal(widget._horizontalCenter, rule.horizontalCenter);
        if ('verticalCenter' in rule) assert.equal(widget._verticalCenter, rule.verticalCenter);
        if ('right' in rule) assert.equal(widget._right, rule.right);
        if ('left' in rule) assert.equal(widget._left, rule.left);
        if ('top' in rule) assert.equal(widget._top, rule.top);
        if ('bottom' in rule) assert.equal(widget._bottom, rule.bottom);
    }
});

test('local player head keeps its authored position and adapts to the room left-bottom edges', () => {
    const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    const roomIndex = prefab.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'PDK_CommonRoom');
    const headIndex = prefab.findIndex((entry, index) => {
        if (entry?.__type__ !== 'cc.Node' || entry._name !== 'Head') return false;
        const play = prefab[entry._parent?.__id__];
        const players = prefab[play?._parent?.__id__];
        return play?._name === 'Play_0' && players?._name === 'Players' && index > 0;
    });
    const head = prefab[headIndex];
    const widget = prefab.find((entry) => entry?.__type__ === 'cc.Widget' && entry.node?.__id__ === headIndex);

    assert.deepEqual([head._lpos.x, head._lpos.y], [-530, -220], 'Play_0/Head authored coordinates must stay unchanged');
    assert.ok(widget, 'Play_0/Head must own a Widget');
    assert.equal(widget._alignFlags, 12, 'Play_0/Head must align left and bottom');
    assert.equal(widget._target?.__id__, roomIndex, 'Play_0/Head must adapt against PDK_CommonRoom');
    assert.equal(widget._left, 60);
    assert.equal(widget._bottom, 90);
});
