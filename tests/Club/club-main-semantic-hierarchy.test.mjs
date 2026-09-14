import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('ClubMain uses lobby-style positional folders and stable semantic node names', async () => {
    const prefab = JSON.parse(await read('assets/Club/Prefab/ClubMain.prefab'));
    const controller = await read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    const rootNode = prefab[prefab[0].data.__id__];
    const childNames = rootNode._children.map(({ __id__ }) => prefab[__id__]?._name);
    assert.deepEqual(childNames, ['Bg', 'Top', 'Bottom', 'Left', 'Right', 'Middle']);

    const nodes = prefab.filter((item) => item?.__type__ === 'cc.Node');
    const names = new Set(nodes.map((node) => node._name));
    for (const name of [
        'RoomList', 'RoomFilter', 'PlayFilter', 'ClubSwitcher', 'LockTip',
        'Btn_ShowPlayFilter', 'Btn_ShowClubList', 'Btn_HideClubList',
        'Btn_Back', 'Btn_QuickJoin', 'Btn_Join', 'Btn_Modify', 'Lb_RoomName',
        'Lb_ClubName', 'Icon_Notice',
    ]) assert.ok(names.has(name), `missing semantic node: ${name}`);
    for (const legacyName of ['right_main', 'left_wanfa', 'left_main', 'Center']) {
        assert.ok(!names.has(legacyName), `legacy structural name remains: ${legacyName}`);
    }

    const middle = nodes.find((node) => node._name === 'Middle');
    assert.deepEqual(middle._children.map(({ __id__ }) => prefab[__id__]?._name), ['RoomList', 'LockTip']);
    const middleTransform = middle._components
        .map(({ __id__ }) => prefab[__id__])
        .find((component) => component?.__type__ === 'cc.UITransform');
    assert.deepEqual(
        [middleTransform?._contentSize?.width, middleTransform?._contentSize?.height],
        [1280, 720],
        'Middle must preserve the full design canvas so RoomList widgets are not clipped to 100px',
    );

    const roomList = nodes.find((node) => node._name === 'RoomList');
    const roomListIds = new Set();
    const collect = (node) => {
        roomListIds.add(prefab.indexOf(node));
        for (const child of node._children ?? []) collect(prefab[child.__id__]);
    };
    collect(roomList);
    for (const [index, node] of prefab.entries()) {
        if (node?.__type__ !== 'cc.Node' || roomListIds.has(index)) continue;
        const valid = node._name.includes('_')
            ? /^(?:Btn|Lb|Icon|Bg)_[A-Z][A-Za-z]*(?:_[0-9]+)?$/.test(node._name)
            : /^[A-Z][A-Za-z0-9]*$/.test(node._name);
        assert.ok(valid, `non-standard ClubMain node name: ${node._name}`);
    }
    assert.match(controller, /findDescendant\(form\.node, semanticName\)/);
    assert.match(controller, /onClick\(node\('Btn_Join'\), \(\) => this\.startQuickJoin\(\)\)/);
    assert.doesNotMatch(controller, /show\('Btn_Join', 'ui\/club\/UIJoinClub'\)/);
    assert.match(controller, /findDescendant\(clubSwitcher, 'Btn_Join'\)/);
    assert.match(controller, /onClick\(node\('Btn_Modify'\), \(\) => \{ void this\.forms\.show\('ui\/club\/UIQuickJoinRoom'\); \}\)/);
    assert.match(controller, /this\.emitQuickJoin\(config, clubId, unionId\)/);
    assert.match(controller, /this\.occupiedRoomSeats\(right\) - this\.occupiedRoomSeats\(left\)/);
    assert.match(controller, /entity \?\? template/);
    assert.match(controller, /this\.rooms\.filter\(\(room\) => this\.sameRoomTemplate\(room, this\.selectedRoomFilter as ClubRoom\)\)/);
    assert.match(controller, /findMainNode\(form, 'RoomFilter'\)/);
    assert.doesNotMatch(controller, /'PlaySelect'/);
    assert.doesNotMatch(controller, /(?:activeForm\?\.|activeForm\.|form\.)find\('(right_main|left_main|left_wanfa|top|bottom)(?:\/|')/);
});

test('QuickJoinRoom keeps generated play cards inside the visible mask', async () => {
    const prefab = JSON.parse(await read('assets/Club/Prefab/QuickJoinRoom.prefab'));
    const nodes = prefab.filter((item) => item?.__type__ === 'cc.Node');
    const layoutNode = nodes.find((node) => node._name === 'layout');
    assert.ok(layoutNode, 'missing QuickJoinRoom layout');
    const layout = layoutNode._components
        .map(({ __id__ }) => prefab[__id__])
        .find((component) => component?.__type__ === 'cc.Layout');
    assert.ok(layout, 'missing QuickJoinRoom Layout component');
    assert.ok(layout._paddingTop >= 0, 'negative top padding pushes play cards outside the mask');
});
