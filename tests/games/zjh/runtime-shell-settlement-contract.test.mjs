import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = relative => fileURLToPath(new URL(`../../../assets/${relative}`, import.meta.url));
const read = relative => readFile(root(relative), 'utf8');
const prefab = async relative => JSON.parse(await read(relative));

test('ZJH production entry owns the five authoritative UI assets', async () => {
    const source = await read('Games/Poker/ZJH/Common/Code/ZjhGameRuntimeEntry.ts');
    for (const value of [
        "bundle: 'poker-zjh', path: 'Prefab/ZJH_CommonRoom'",
        "bundle: 'games-common', path: 'Prefab/CommonRoom'",
        "bundle: 'poker-common', path: 'Prefab/RealTimeRecord'",
        "bundle: 'poker-zjh', path: 'Prefab/SmallSettlement'",
        "bundle: 'poker-zjh', path: 'Prefab/BigSettlement_0'",
    ]) assert.ok(source.includes(value), value);
    assert.doesNotMatch(source, /ZjhRoomLandscape|isPortrait|loadAndMountPrefab/);
    assert.match(source, /Promise\.all\(Object\.entries\(ZJH_RUNTIME_ASSETS\)/);
});

test('ZJH binds authoritative exit, realtime record and settlement lifecycle', async () => {
    const source = await read('Games/Poker/ZJH/Common/Code/ZjhGameRuntimeEntry.ts');
    const controller = await read('Games/Poker/ZJH/Common/Code/ZjhRoomController.ts');
    const composition = await read('Games/Common/Code/Runtime/GameRuntimeEntries.ts');
    assert.match(composition, /createZjhGameRuntimeEntry\(\{[\s\S]*requestRoomExit: options\.requestRoomExit/);
    assert.match(composition, /createZjhGameRuntimeEntry\(\{\s*playerId: options\.accountId,/);
    assert.doesNotMatch(composition, /createZjhHost/);
    assert.match(source, /this\.options\.requestRoomExit\(this\.roomId\)\.then\(\(\) => this\.destroy\(\)\)/);
    assert.match(source, /button\.interactable = false/);
    assert.match(source, /button\?\.node\.isValid[\s\S]*button\.interactable = true/);
    assert.match(source, /Btn\/RealTimeRecord/);
    assert.match(source, /record\.active = true/);
    assert.match(source, /this\.recordNode\.active = !this\.recordNode\.active/);
    assert.match(source, /settlement\.final \? this\.assets\?\.bigSettlement : this\.assets\?\.smallSettlement/);
    assert.match(controller, /this\.settlementObserver\?\.\(snapshot\.roundNo, settlement\)/);
    assert.match(controller, /poker\.quanguo2997\.state_push/);
    assert.match(controller, /common\.room\.state_push/);
    assert.match(controller, /pushDisposers\.splice\(0\)/);
});

test('ZJH settlement and realtime record render authoritative scores into real prefab nodes', async () => {
    const source = await read('Games/Poker/ZJH/Common/Code/ZjhGameRuntimeEntry.ts');
    for (const path of [
        'Score/Players/View/Content',
        'Small/Players/View/Content',
        'Small/Bottom/Btns/Goon',
        'FinalSettlementPanel/PlayerList/PlayerListView/PlayerListContent',
        'FinalSettlementPanel/BottomBar/FinishedActions/Btn_ReturnLobby',
    ]) assert.ok(source.includes(path), path);
    assert.match(source, /settlement\.cumulativeEntries\?\.find/);
    assert.match(source, /this\.controller\?\.invoke\('continue'\)/);
});

test('ZJH publishes the authored seat information branch before accepting visible seat input', async () => {
    const source = await read('Games/Poker/ZJH/Common/Code/ZjhRoomViewAdapter.ts');
    assert.equal((source.match(/this\.require\(`\$\{path\}\/ZjhInfo`\)\.active = true/g) ?? []).length, 2);
    assert.match(source, /showEmptySeat[\s\S]*ZjhInfo[\s\S]*sittableSeats\.add/);
});

test('RealTimeRecord serializes the Aoo StaticList instead of the removed XQP CycleList', async () => {
    const source = await read('Games/Poker/Common/Prefab/RealTimeRecord.prefab');
    assert.doesNotMatch(source, /11aaeiWfOxLE4MhuZbjVQdy/);
    assert.match(source, /9cc261msHNJS5QKIoyVxCeT/);
});

for (const [relative, rootName, nodes] of [
    ['Games/Poker/ZJH/Prefab/ZJH_CommonRoom.prefab', 'ZJH_CommonRoom', ['ZjhContract', 'Players', 'OperateBtn']],
    ['Games/Common/Prefab/CommonRoom.prefab', 'CommonRoom', ['Btn_Back', 'RealTimeRecord']],
    ['Games/Poker/Common/Prefab/RealTimeRecord.prefab', 'RealTimeRecord', ['Players', 'Clone']],
    ['Games/Poker/ZJH/Prefab/SmallSettlement.prefab', 'SmallSettlement', ['Goon', 'BigSettlement']],
    ['Games/Poker/ZJH/Prefab/BigSettlement_0.prefab', 'BigSettlement_0', ['PlayerItemTemplate', 'FinishedActions']],
]) {
    test(`${rootName} keeps the runtime node contract`, async () => {
        const data = await prefab(relative);
        const names = data.filter(item => item?.__type__ === 'cc.Node').map(item => item._name);
        assert.ok(names.includes(rootName));
        for (const name of nodes) assert.ok(names.includes(name), `${rootName}/${name}`);
    });
}
