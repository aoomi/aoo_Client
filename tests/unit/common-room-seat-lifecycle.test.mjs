import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const perspective = read('assets/Common/Code/Runtime/state/SeatPerspective.ts');
const head = read('assets/Common/Code/UI/CommonHeadController.ts');
const entries = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
const entryContract = read('assets/Games/Common/Code/Runtime/GameRuntimeEntry.ts');
const pdkCoordinator = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts');
const prefab = JSON.parse(read('assets/Games/Common/Prefab/CommonRoom.prefab'));
const pdkPrefab = JSON.parse(read('assets/Games/Poker/PDK/Common/Prefab/PDK_CommonRoom.prefab'));

test('CommonRoom prefab has one stable SeatHost with four physical slots', () => {
    const nodes = prefab.map((value, index) => ({ value, index })).filter(item => item.value?.__type__ === 'cc.Node');
    const host = nodes.find(item => item.value._name === 'SeatHost');
    assert.ok(host);
    const children = host.value._children.map(ref => prefab[ref.__id__]);
    assert.deepEqual(children.map(node => node._name), ['self', 'right', 'opposite', 'left']);
    assert.deepEqual(children.map(node => [node._lpos.x, node._lpos.y]), [[800, 100], [1450, 450], [800, 780], [150, 450]]);
});

test('2 3 and 4 player layouts keep standard slots while 5 through 10 use indexed runtime slots', () => {
    assert.match(perspective, /playerCount === 2.*\['self', 'opposite'\]/);
    assert.match(perspective, /playerCount === 3.*\['self', 'right', 'left'\]/);
    assert.match(perspective, /playerCount === 4.*\['self', 'right', 'opposite', 'left'\]/);
    assert.match(perspective, /playerCount >= 5 && playerCount <= 10/);
    assert.match(perspective, /`indexed:\$\{index \+ 1\}`/);
    assert.match(perspective, /throw new Error\('common room playerCount must be 2\.\.10'\)/);
    assert.match(entries, /host\.active = enabled\.has\(slot\)/);
    assert.match(entries, /new Node\(slot\)/);
    assert.match(entries, /2 \* Math\.PI \* index/);
    assert.match(entries, /for \(const host of this\.dynamicHosts\.values\(\).*host\.destroy\(\)/);
});

test('vacancy clears public identity and transient state before occupied render', () => {
    assert.match(head, /renderPublicSeat/);
    assert.match(head, /this\.showGamePlayer\(player\.occupied\)/);
    assert.match(head, /if \(!player\.occupied\) return/);
    assert.match(head, /label\.string = ''/);
    assert.match(head, /this\.hideTransientEffects\(\)/);
    assert.match(entries, /occupied: false/);
    assert.match(entries, /for \(const head of this\.createdHeads\.values\(\)\).*head\.destroy\(\)/);
});

test('public seat ready is authority-backed and both true and false edges render', () => {
    assert.match(entryContract, /readonly ready\?: boolean/);
    assert.match(entryContract, /COMMON_ROOM_SEAT_READY_INVALID/);
    assert.match(entryContract, /COMMON_ROOM_VACANT_READY/);
    assert.match(entryContract, /ready: source\.ready === true/);
    assert.match(head, /this\.showReady\(player\.ready === true\)/);
    assert.match(head, /if \(!player\.occupied\) return/);
    assert.match(head, /this\.showReady\(false\)/);
});

test('mounted gameplay view cannot retain Common root ownership after destroy', () => {
    assert.match(entries, /const view: CommonRoomMountedView = Object\.freeze/);
    assert.match(entries, /this\.disposers\.push\(\(\) => \{\s*active = false/);
    assert.match(entries, /if \(!active \|\| this\.destroyed \|\| !this\.root\.isValid\)/);
    assert.doesNotMatch(entries, /mounted\(this\.root\)/);
});

test('typed per-snapshot seat layout is applied after hosts rebuild and before Common creates Heads', () => {
    assert.match(entryContract, /readonly seatLayout\?: CommonRoomSeatLayoutPort/);
    assert.match(entryContract, /seatCount: number/);
    assert.match(entryContract, /slots: readonly CommonRoomSeatSlot\[\]/);
    assert.match(entryContract, /readonly slot: CommonRoomSeatSlot/);
    assert.match(entryContract, /readonly x: number/);
    const requestType = entryContract.match(/export interface CommonRoomSeatLayoutRequest \{[\s\S]*?\n\}/)?.[0] ?? '';
    const positionType = entryContract.match(/export interface CommonRoomSeatPosition \{[\s\S]*?\n\}/)?.[0] ?? '';
    const portType = entryContract.match(/export type CommonRoomSeatLayoutPort =[\s\S]*?;\n/)?.[0] ?? '';
    assert.ok(requestType && positionType && portType);
    for (const contract of [requestType, positionType, portType]) {
        assert.doesNotMatch(contract, /\b(?:Node|root|event|destroy)\b/);
    }
    const rebuild = entries.indexOf('const hosts = this.seatHosts(snapshot.seatCount)');
    const apply = entries.indexOf('this.applySeatLayout(snapshot.seatCount, enabled, hosts)');
    const headLoad = entries.indexOf('const prefab = await this.loadCommonHead()');
    assert.ok(rebuild >= 0 && rebuild < apply && apply < headLoad);
});

test('seat layout override is exact, finite and fail-closed while default layout remains unchanged', () => {
    assert.match(entries, /if \(!this\.ports\.seatLayout\) return/);
    assert.match(entries, /COMMON_ROOM_SEAT_LAYOUT_RESULT_INVALID/);
    assert.match(entries, /COMMON_ROOM_SEAT_LAYOUT_SLOT_INVALID/);
    assert.match(entries, /COMMON_ROOM_SEAT_LAYOUT_SLOT_DUPLICATE/);
    assert.match(entries, /COMMON_ROOM_SEAT_LAYOUT_POSITION_INVALID/);
    assert.match(entries, /positions\.length !== slots\.length/);
    assert.match(entries, /host\.setPosition\(position\.x, position\.y, position\.z \?\? 0\)/);
    assert.match(entries, /800 \+ 650 \* Math\.cos\(angle\)/);
    assert.match(entries, /450 \+ 350 \* Math\.sin\(angle\)/);
});

test('family ports resolve only after gameplay commit so live room state reaches Common', () => {
    const prepare = entries.slice(entries.indexOf('const prepareCommonRoom'), entries.indexOf('const commitCommonRoom'));
    const commit = entries.slice(entries.indexOf('const commitCommonRoom'), entries.indexOf('const bindCommonRoom'));
    assert.doesNotMatch(prepare, /commonRoomPorts\?\.\(\)/);
    assert.match(commit, /entry\.commonRoomPorts\?\.\(\)/);
    assert.match(pdkCoordinator, /mounted: view => \{\s*const disposePlayMount = play\.bindCommonRoomMountedView\(view\)/);
});

test('PDK seat layout reads live instantiated Head nodes instead of duplicating coordinates', () => {
    assert.match(pdkCoordinator, /this\.gameplayRoomRoot = node/);
    assert.match(pdkCoordinator, /getChildByName\('Players'\)/);
    assert.match(pdkCoordinator, /getChildByName\(`Seat_\$\{index\}`\)\?\.getChildByName\('Head'\)/);
    assert.match(pdkCoordinator, /convertToNodeSpaceAR\(head\.worldPosition\)/);
    assert.doesNotMatch(pdkCoordinator, /self:\s*\{\s*x:\s*-530/);

    const nodes = pdkPrefab.map((value, index) => ({ value, index }))
        .filter(item => item.value?.__type__ === 'cc.Node');
    const position = (seatName) => {
        const seat = nodes.find(item => item.value._name === seatName
            && pdkPrefab[item.value._parent?.__id__]?._name === 'Players');
        assert.ok(seat, `${seatName} must exist below Players`);
        const head = nodes.find(item => item.value._name === 'Head'
            && item.value._parent?.__id__ === seat.index);
        assert.ok(head, `${seatName}/Head must exist`);
        return [seat.value._lpos.x + head.value._lpos.x, seat.value._lpos.y + head.value._lpos.y];
    };
    assert.deepEqual(['Seat_0', 'Seat_1', 'Seat_2', 'Seat_3'].map(position), [
        [-530, -220], [530, 100], [280, 280], [-530, 100],
    ]);
});
