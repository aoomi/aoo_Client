import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const asset = relative => fileURLToPath(new URL(`../../../assets/Games/Poker/CX/CD299/${relative}`, import.meta.url));
const source = relative => readFile(asset(`Code/${relative}`), 'utf8');
const prefab = async relative => JSON.parse(await readFile(asset(`Prefab/${relative}`), 'utf8'));
const clientAsset = relative => fileURLToPath(new URL(`../../../assets/${relative}`, import.meta.url));
const clientPrefab = async relative => JSON.parse(await readFile(clientAsset(relative), 'utf8'));

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
    assert.match(protocol, /requestId:this\.requests\.next\(\)/);
    assert.match(protocol, /sit\(seatId:number,carryScore:number\).*\{seatId,carryScore\}/);
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
    assert.match(state, /incoming\.stateVersion<current\.stateVersion/);
    assert.match(state, /incoming\.stateVersion===current\.stateVersion&&incoming\.viewerRole===current\.viewerRole/);
    assert.match(state, /Object\.freeze\(Object\.fromEntries/);
});

test('CD299 presenter derives turn actions and protects three-flower split state', async () => {
    const presenter = await source('CD299RoomPresenter.ts');
    assert.match(presenter, /snapshot\.currentSeat === localSeat/);
    assert.match(presenter, /snapshot\.viewerRole === 'SPECTATOR' && playerId === null/);
    assert.match(presenter, /snapshot\.rules\.maxPlayers/);
    assert.match(presenter, /snapshot\.phase === 'BETTING' && localTurn/);
    assert.match(presenter, /canAddCard: false/);
    assert.match(presenter, /snapshot\.phase === 'BETTING' && !localTurn/);
    assert.match(presenter, /!snapshot\.allInSeats\.includes\(localSeat\)/);
    assert.match(presenter, /snapshot\.viewerRole === 'SEATED' \? snapshot\.viewerSeat : -1/);
    assert.match(presenter, /\(authoritativeSeat - localSeat \+ seatLimit\) % seatLimit/);
    assert.match(presenter, /this\.view\.showSeat\(visualSeat, seat, playerId/);
    assert.match(presenter, /!snapshot\.splitSeats\.includes\(localSeat\)/);
    assert.match(presenter, /!snapshot\.threeFlowerSeats\.includes\(localSeat\)/);
    assert.match(presenter, /betActions: Object\.freeze\(\[\.\.\.snapshot\.allowedBetActions\]\)/);
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

test('CD299 schedules only the local authoritative deadline and cancels stale timers', async () => {
    const controller = await source('CD299RuntimeController.ts');
    assert.match(controller, /snapshot\.operationDeadline\?\.seatId === seat/);
    assert.match(controller, /Boolean\(snapshot\.operationDeadline\.operationId\)/);
    assert.match(controller, /snapshot\.splitDeadlineEpochMillis\?\.\[seat\]/);
    assert.match(controller, /current\.stateVersion !== stateVersion/);
    assert.match(controller, /currentBettingId !== operationId/);
    assert.match(controller, /currentSplitDeadline !== splitDeadline/);
    assert.match(controller, /void this\.timeout\(\)\.catch/);
    assert.match(controller, /public destroy\(\).*clearTimeout/s);
    const entry = await source('CD299GameRuntimeEntry.ts');
    assert.match(entry, /this\.controller\?\.destroy\(\)/);
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
    assert.match(entry, /Common\/Prefab\/CX_CommonRoom/);
    assert.match(entry, /COMMON_ROOM_BUNDLE = 'games-common'/);
    assert.match(entry, /COMMON_ROOM_PREFAB = 'Prefab\/CommonRoom'/);
    assert.match(entry, /view\.attachCommonRoom\(commonRoom, roomId\)/);
    assert.match(entry, /this\.configureCommonRoomLayout\(commonRoom, node\.layer\)/);
    assert.match(entry, /this\.setLayerRecursively\(commonRoom, gameLayer\)/);
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
    for (const forbidden of ['voice', 'gps', 'club', 'payment', 'replay', 'robot', 'chengdu-pdk', 'njpdk', 'lspdk']) {
        assert.ok(!all.includes(forbidden), forbidden);
    }
});

test('CD299 landscape composes the shared room shell and the XQP-derived eight-seat desk', async () => {
    const [common, game] = await Promise.all([
        clientPrefab('Games/Common/Prefab/CommonRoom.prefab'),
        clientPrefab('Games/Poker/CX/Common/Prefab/CX_CommonRoom.prefab'),
    ]);
    const commonNames = common.filter(item => item.__type__ === 'cc.Node').map(item => item._name);
    const gameNames = game.filter(item => item.__type__ === 'cc.Node').map(item => item._name);
    assert.equal(common[1]._name, 'CommonRoom');
    assert.equal(game[1]._name, 'CX_CommonRoom');
    for (const name of ['RoomInfo', 'Btn_Back', 'Btn_More', 'Btn_RoomRule', 'WaitingActions']) {
        assert.ok(commonNames.includes(name), name);
    }
    for (let seat = 0; seat < 8; seat += 1) assert.ok(gameNames.includes(`Seat_${seat}`));
    for (const name of ['Preset', 'Btn_Drop', 'Btn_Follow', 'Btn_Rest', 'Btn_Add', 'Btn_AllIn', 'Btn_AddCard', 'Btn_Ensure']) {
        assert.ok(gameNames.includes(name), name);
    }
    assert.ok(game.filter(item => item.__type__ === 'cc.Sprite').length >= 170);
    assert.ok(game.filter(item => item.__type__ === 'cc.Button').length >= 20);
});

test('CD299 landscape uses the same dynamic CommonHead framework as PDK', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    assert.match(view, /CommonHeadController/);
    assert.match(view, /bundle\.load\('Prefab\/CommonHead'/);
    assert.match(view, /controller\.showGamePlayer\(playerId !== null\)/);
    assert.match(view, /controller\.showPlayerAvatar\(playerId\)/);
    assert.match(view, /controller\.showReady/);
    assert.match(view, /Players\/Seat_\$\{index\}/);
});
