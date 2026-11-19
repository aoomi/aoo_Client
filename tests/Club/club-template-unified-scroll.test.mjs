import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('club template desks use the same UnifiedScroll policy as ClubList', async () => {
    const prefab = JSON.parse(await read('assets/Club/Prefab/ClubMain.prefab'));
    const marks = prefab.map((item, index) => ({ item, index }))
        .filter(({ item }) => item?.__type__ === 'cc.Node' && item._name === 'mark');
    const mark = marks.find(({ item }) => item._children
        .map((entry) => prefab[entry.__id__]?._name).includes('view'));
    assert.ok(mark, 'RoomList mark must retain its view child');
    const view = mark.item._children.map((entry) => prefab[entry.__id__]).find((node) => node?._name === 'view');
    assert.deepEqual(view._children.map((entry) => prefab[entry.__id__]?._name), ['layout']);
    const components = mark.item._components.map((entry) => prefab[entry.__id__]);
    const native = components.filter((item) => item?.__type__ === 'cc.ScrollView');
    assert.equal(native.length, 1);
    assert.deepEqual(
        [native[0].horizontal, native[0].vertical, native[0].inertia, native[0].brake,
            native[0].elastic, native[0].bounceDuration, native[0].cancelInnerEvents],
        [true, false, true, 0.32, true, 0.65, true],
    );
    assert.equal(native[0]._horizontalScrollBar, null,
        'RoomList must not activate the detached legacy ScrollBar whose component node is null');
    assert.equal(components.filter((item) => item?.__type__ === 'cc.Button').length, 0,
        'the viewport must not compete as a button');
    const unified = components.filter((item) => item?.__type__ === 'ef215DR9B1D24JQ689jnf3m');
    assert.equal(unified.length, 1);
    assert.equal(unified[0]._enabled, true);
    assert.equal(unified[0].direction, 0);
    assert.equal(unified[0].brake, 0.32);
    assert.equal(unified[0].bounceDuration, 0.65);
    assert.equal(unified[0].underfilledBounceDuration, 0.65);
});

test('club desks and page buttons route through the ClubList UnifiedScroll component', async () => {
    const [controller, scroll] = await Promise.all([
        read('assets/Club/Code/Runtime/LegacyClubMainController.ts'),
        read('assets/Common/Code/UI/UnifiedScroll.ts'),
    ]);
    assert.match(controller, /UnifiedScroll\.ensure\(mark, UnifiedScrollDirection\.Horizontal\)/);
    assert.match(controller, /unifiedScroll\.scrollByPage\(delta\)/);
    assert.match(controller, /unifiedScroll\?\.shouldSuppressClick\(\)/);
    assert.doesNotMatch(controller, /layout\.setPosition\(layout\.position\.x - delta/);
    assert.doesNotMatch(controller, /node\.on\(Node\.EventType\.(?:TOUCH_MOVE|MOUSE_MOVE)/);
    assert.match(scroll, /event\.getUILocation\(this\.pointerNow\)/);
    assert.match(scroll, /public lateUpdate\(\): void/);
    assert.match(scroll, /this\.pendingPosition = true/);
    assert.doesNotMatch(scroll, /getUILocation\(\)\.subtract|\[\.\.\.UnifiedScroll\.instances\]/);
    assert.equal((scroll.match(/node\.on\(Node\.EventType\.TOUCH_MOVE/g) ?? []).length, 1,
        'unified component must register one MOVE listener');
    assert.match(scroll, /const HORIZONTAL_SCROLL_POLICY/);
    assert.match(scroll, /brake: 0\.32/);
    assert.match(scroll, /buttonDuration: 0\.16/);
});

test('empty club desks do not depend on the optional common-head prefab', async () => {
    const source = await read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    assert.match(source, /if \(!prefab\) \{\s*this\.setCollectionState\(mark, 'error'\)/);
    assert.match(source, /commonHeadPrefab: Prefab \| null/);
    assert.match(source, /playerAnchor && !commonHead && commonHeadPrefab/);
    assert.doesNotMatch(source, /if \(!prefab \|\| !commonHeadPrefab\)/);
    assert.match(source, /this\.loadClubDeskPrefab\(\)\.then\(\(prefab\)/);
});

test('legacy template response wrappers and nested rule player counts remain renderable', async () => {
    const source = await read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    assert.match(source, /packet\.data \?\? packet\.result/);
    assert.match(source, /JSON\.parse\(room\.rules\)/);
    assert.match(source, /rules\.playerNum \?\? rules\.playerCount \?\? rules\.renshu/);
});

test('active-room projection failure cannot blank permanent template desks', async () => {
    const source = await read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    assert.match(source, /let result = await this\.client\.request<unknown>\(packet, scope\)/);
    assert.match(source, /request<unknown>\(roomPacket, scope\)\.catch\(\(\) => \[\]\)/);
    assert.doesNotMatch(source, /Promise\.all\(\[\s*this\.client\.request<unknown>\(packet, scope\),\s*this\.client\.request<unknown>\(roomPacket, scope\)/);
});

test('empty lightweight template projection falls back to the 2.2.2 management protocol', async () => {
    const source = await read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
    assert.match(source, /if \(this\.templateRoomArray\(result\)\.length === 0\)/);
    assert.match(source, /'union\.CUnionRoomCfgList' : 'club\.CClubGetCreateGameSet'/);
    assert.match(source, /const templates = this\.templateRoomArray\(result\)/);
    assert.doesNotMatch(source, /filter\(\(room\) => !\[1, 2\]\.includes\(Number\(room\.status/,
        'status 1/2 is not a shared hidden/disabled flag and must not remove valid templates');
});
