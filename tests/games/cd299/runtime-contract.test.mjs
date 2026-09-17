import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const asset = relative => fileURLToPath(new URL(`../../../assets/Games/Poker/CX/CD299/${relative}`, import.meta.url));
const source = relative => readFile(asset(`Code/${relative}`), 'utf8');
const prefab = async relative => JSON.parse(await readFile(asset(`Prefab/${relative}`), 'utf8'));

const expectedMessages = [
    'poker.cd299.state_req',
    'poker.cd299.sit_req',
    'poker.cd299.preset_req',
    'poker.cd299.bet_req',
    'poker.cd299.add_card_req',
    'poker.cd299.split_req',
    'poker.cd299.continue_req',
    'poker.cd299.timeout_req',
];

test('CD299 protocol keeps one canonical identity and the complete command surface', async () => {
    const protocol = await source('CD299Protocol.ts');
    const rules = await source('CD299Rules.ts');
    for (const message of expectedMessages) assert.ok(protocol.includes(`'${message}'`), message);
    assert.match(protocol, /gameCode:'CD299',family:'poker:cd299',playVersion:CD299_PLAY_VERSION/);
    assert.match(rules, /CD299_GAME_CODE = 'CD299'/);
    assert.match(rules, /CD299_PLAY_VERSION = 'cd299-v1\.0\.0'/);
    const playVersion = rules.match(/CD299_PLAY_VERSION = '([^']+)'/)?.[1];
    assert.match(playVersion, /^[a-z][a-z0-9._-]*$/);
    assert.match(protocol, /roomId:this\.roomId,stateVersion:this\.version\(\)/);
    assert.match(protocol, /requestId:`\$\{this\.prefix\}-\$\{\+\+this\.sequence\}`/);
    assert.match(protocol, /sit\(seatId:number\).*\{seatId\}/);
    assert.doesNotMatch(protocol, /poker\.cd299\.ready_req|\bready\s*\(/);
});

test('CD299 create payload carries every workbook rule and exact defaults', async () => {
    const protocol = await source('CD299Protocol.ts');
    const rules = await source('CD299Rules.ts');
    for (const field of ['roomDurationMinutes','startPlayers','operationSeconds','standPolicy','mangoFlipMode','mangoRaise','mangoScore','openingBet','restMango','beatMango','everyHandMango','firstRoundCanRest','eachPlayerMustFollow','earthNineKing','fireproofCard','bigHeadKeepsBase']) {
        assert.ok(rules.includes(field), field);
    }
    for (const enabled of ['restMango','beatMango','everyHandMango','firstRoundCanRest','earthNineKing','fireproofCard']) assert.match(rules, new RegExp(`${enabled}:true`));
    for (const disabled of ['eachPlayerMustFollow','bigHeadKeepsBase']) assert.match(rules, new RegExp(`${disabled}:false`));
    assert.match(rules, /roomDurationMinutes:30,maxPlayers:8,startPlayers:2,operationSeconds:10/);
    assert.match(rules, /standPolicy:'LOSER_ONLY',mangoFlipMode:'LADDER',mangoRaise:3,mangoScore:3,openingBet:3/);
    assert.match(protocol, /\.\.\.validateCD299Rules\(rules\)/);
});

test('CD299 accepts only newer authoritative snapshots from the same room', async () => {
    const state = await source('CD299RoomState.ts');
    assert.match(state, /incoming\.gameCode!==CD299_GAME_CODE/);
    assert.match(state, /current&&current\.roomId!==incoming\.roomId/);
    assert.match(state, /incoming\.stateVersion<=current\.stateVersion\?current:freeze\(incoming\)/);
    assert.match(state, /Object\.freeze\(Object\.fromEntries/);
});

test('CD299 presenter derives turn actions and protects three-flower split state', async () => {
    const presenter = await source('CD299RoomPresenter.ts');
    assert.match(presenter, /snapshot\.currentSeat === localSeat/);
    assert.match(presenter, /snapshot\.viewerRole === 'SPECTATOR' && playerId === null/);
    assert.match(presenter, /snapshot\.rules\.maxPlayers/);
    assert.match(presenter, /snapshot\.phase === 'BETTING' && localTurn/);
    assert.match(presenter, /snapshot\.phase === 'ADD_CARD' && localTurn/);
    assert.match(presenter, /!snapshot\.splitSeats\.includes\(localSeat\)/);
    assert.match(presenter, /!snapshot\.threeFlowerSeats\.includes\(localSeat\)/);
    for (const action of ['DROP', 'FOLLOW', 'REST', 'RAISE', 'ALL_IN']) {
        assert.ok(presenter.includes(`'${action}'`), action);
    }
});

test('CD299 production controller uses shared dispatch authority frames', async () => {
    const controller = await source('CD299RuntimeController.ts');
    assert.match(controller, /CD299_DISPATCH = 'poker\.CD299\.dispatch'/);
    assert.match(controller, /this\.client\.request<CD299Snapshot>\(CD299_DISPATCH/);
    assert.match(controller, /playVersion: CD299_PLAY_VERSION/);
    assert.match(controller, /expectedStateVersion: command\.stateVersion/);
    assert.match(controller, /operationId: command\.requestId/);
    assert.match(controller, /action: command\.msgId, payload: command\.body/);
    for (const method of ['state', 'sit', 'preset', 'bet', 'addCard', 'split', 'continueRound', 'timeout']) {
        assert.match(controller, new RegExp(`public ${method}\\(`), method);
    }
    assert.match(controller, /\[CD299\] dispatch failed/);
    assert.doesNotMatch(controller, /\bready\s*\(/);
});

test('CD299 exports a feature-owned GameRuntimeEntry without replay', async () => {
    const entry = await source('CD299GameRuntimeEntry.ts');
    assert.match(entry, /implements GameRuntimeEntry/);
    assert.match(entry, /canonicalGameCodes = Object\.freeze\(\['CD299'\]\)/);
    assert.match(entry, /families = Object\.freeze\(\['poker-cd299'\]\)/);
    assert.doesNotMatch(entry, /enterReplay\s*\(/);
    assert.match(entry, /createOwnedGameClient\(\)/);
    assert.match(entry, /bindRoomAuthority\(roomId, CD299_PLAY_VERSION\)/);
    assert.match(entry, /await client\.connect\(authorityRoute\)/);
    assert.match(entry, /CD299\/Prefab\/Landscape\/CD299RoomLandscape/);
    assert.match(entry, /CD299\/Prefab\/Portrait\/CD299RoomPortrait/);
    assert.match(entry, /new CD299RuntimeController/);
    assert.match(entry, /view\.bindController\(controller\)/);
    assert.match(entry, /await controller\.state\(\)/);
    assert.match(entry, /this\.host\?\.destroy\(\)/);
    assert.match(entry, /this\.client\?\.close\(\)/);
    assert.match(entry, /export function createCD299GameRuntimeEntry/);
});

test('CD299 gameplay code excludes out-of-scope social, robot and legacy aliases', async () => {
    const all = (await Promise.all([
        source('CD299Protocol.ts'),
        source('CD299RoomState.ts'),
        source('CD299RoomPresenter.ts'),
        source('CD299RoomViewComponent.ts'),
        source('CD299Rules.ts'),
        source('CD299RuntimeController.ts'),
        source('CD299GameRuntimeEntry.ts'),
    ])).join('\n').toLowerCase();
    for (const forbidden of ['voice', 'gps', 'distance', 'club', 'payment', 'replay', 'robot', 'chengdu-pdk', 'njpdk', 'lspdk', 'xqp']) {
        assert.ok(!all.includes(forbidden), forbidden);
    }
});

for (const [relative, rootName, width] of [
    ['Landscape/CD299RoomLandscape.prefab', 'CD299RoomLandscape', 1280],
    ['Portrait/CD299RoomPortrait.prefab', 'CD299RoomPortrait', 720],
]) {
    test(`${rootName} is a native, fully bound gameplay prefab`, async () => {
        const data = await prefab(relative);
        const root = data[1];
        assert.equal(root.__type__, 'cc.Node');
        assert.equal(root._name, rootName);
        assert.equal(data.filter(item => item.__type__ === 'cc.Node').length, 104);
        assert.equal(data.filter(item => item.__type__ === 'cc.PrefabInfo').length, 104);
        assert.equal(data.filter(item => item.__type__ === 'cc.Button').length, 9);
        assert.equal(data.filter(item => item.__type__ === 'sp.Skeleton').length, 4);

        const rootComponents = root._components.map(ref => data[ref.__id__]);
        const transform = rootComponents.find(component => component.__type__ === 'cc.UITransform');
        assert.deepEqual(transform._contentSize, { __type__: 'cc.Size', width, height: 720 });

        const view = rootComponents.find(component => Object.hasOwn(component, 'phaseLabel'));
        assert.ok(view, 'CD299RoomViewComponent');
        for (const field of ['handLabels', 'committedLabels', 'scoreLabels', 'droppedMarks', 'threeFlowerMarks', 'splitMarks']) {
            assert.equal(view[field].length, 6, field);
            assert.ok(view[field].every(ref => Number.isInteger(ref.__id__)), field);
        }
        assert.equal(view.betButtons.length, 5);
        for (const field of ['presetButton', 'addCardButton', 'splitButton', 'continueButton']) {
            assert.ok(Number.isInteger(view[field].__id__), field);
        }

        const skeletons = data.filter(item => item.__type__ === 'sp.Skeleton');
        assert.ok(skeletons.every(item => typeof item._skeletonData?.__uuid__ === 'string'));
        const spriteFrames = data.filter(item => item.__type__ === 'cc.Sprite' && item._spriteFrame?.__uuid__);
        assert.equal(spriteFrames.length, 9);
    });
}
