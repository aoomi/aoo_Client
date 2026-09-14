import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const controller = fs.readFileSync(
    new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url),
    'utf8',
);
const prefab = JSON.parse(fs.readFileSync(
    new URL('../../assets/Club/Prefab/ClubDesk.prefab', import.meta.url),
    'utf8',
));
const detailPrefab = JSON.parse(fs.readFileSync(
    new URL('../../assets/Club/Prefab/ClubRoomJoin.prefab', import.meta.url),
    'utf8',
));

test('every migrated desk detail label receives a runtime Button', () => {
    const detailNodes = prefab.filter((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'Btn_Detail');
    assert.ok(detailNodes.length >= 3, 'ClubDesk variants must expose detail nodes');
    assert.ok(detailNodes.some((node) => !(node._components ?? [])
        .some((reference) => prefab[reference.__id__]?.__type__ === 'cc.Button')),
    'fixture must cover the migrated label-only detail variant');
    assert.match(controller,
        /detail\.getComponent\(Button\) \?\? detail\.addComponent\(Button\)/,
        'label-only detail nodes must be made clickable at runtime');
    assert.match(controller, /this\.findActiveDescendant\(node, 'Btn_Detail'\)/,
        'binding must target the selected desk variant rather than a hidden sibling');
    assert.match(controller, /private findActiveDescendant[\s\S]*if \(!root\.active\) return null/);
});

test('detail taps are excluded from the desk join surface', () => {
    assert.match(controller, /node\.on\(Node\.EventType\.TOUCH_END, listener\)/);
    assert.match(controller, /if \(target === detail\) return/,
        'a detail tap must never fall through to room joining');
    assert.match(controller, /detail\.on\(Button\.EventType\.CLICK, showDetail\)/);
    assert.match(controller, /union\.CUnionRoomInfoDetails/,
        'union desks must use the legacy union detail protocol');
});

test('2.2.2 room detail prefab is migrated and rendered by the Creator 3 controller', () => {
    const names = detailPrefab.filter((entry) => entry?.__type__ === 'cc.Node').map((entry) => entry._name);
    for (const name of ['ClubRoomJoin', 'wanfaScrollView', 'roominfo', 'join_list', 'join_list2']) {
        assert.ok(names.includes(name), `room detail prefab is missing ${name}`);
    }
    assert.ok(detailPrefab.every((entry) => !String(entry?.__type__ ?? '').startsWith('471584')),
        'the removed 2.2.2 controller must not remain serialized');
    const nodeCount = detailPrefab.filter((entry) => entry?.__type__ === 'cc.Node').length;
    const transformCount = detailPrefab.filter((entry) => entry?.__type__ === 'cc.UITransform').length;
    assert.equal(transformCount, nodeCount,
        'every migrated 2.2.2 node must own a Creator 3 UITransform');
    assert.match(controller, /this\.renderRoomDetail\(form, args\[0\]\)/);
    assert.match(controller, /private renderRoomDetail\(/);
});
