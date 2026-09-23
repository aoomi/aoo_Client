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
    for (const field of ['roomDurationMinutes','roundLimit','startPlayers','operationSeconds','standPolicy','mangoFlipMode','mangoRaise','mangoScore','openingBet','restMango','beatMango','everyHandMango','firstRoundCanRest','eachPlayerMustFollow','earthNineKing','fireproofCard','bigHeadKeepsBase']) {
        assert.ok(rules.includes(field), field);
    }
    for (const enabled of ['restMango','beatMango','everyHandMango','firstRoundCanRest','earthNineKing','fireproofCard']) assert.match(rules, new RegExp(`${enabled}:\\s*true`));
    for (const disabled of ['eachPlayerMustFollow','bigHeadKeepsBase']) assert.match(rules, new RegExp(`${disabled}:\\s*false`));
    assert.match(rules, /roomDurationMinutes: 30, roundLimit: 10, maxPlayers: 8, startPlayers: 2/);
    assert.match(rules, /standPolicy: 'LOSER_ONLY', mangoFlipMode: 'LADDER'/);
    assert.match(protocol, /\.\.\.validateCD299Rules\(rules\)/);
});

test('CD299 accepts only newer authoritative snapshots from the same room', async () => {
    const state = await source('CD299RoomState.ts');
    assert.match(state, /incoming\.gameCode!==CD299_GAME_CODE/);
    assert.match(state, /current&&current\.roomId!==incoming\.roomId/);
    assert.match(state, /incoming\.stateVersion<current\.stateVersion/);
    assert.match(state, /incoming\.stateVersion===current\.stateVersion&&incoming\.viewerRole===current\.viewerRole/);
    assert.match(state, /Object\.freeze\(Object\.fromEntries/);
    assert.match(state, /terminalBankerMayHaveStood=incoming\.phase==='FINISHED'/);
    assert.match(state, /incoming\.players\[incoming\.bankerSeat\]===undefined&&!terminalBankerMayHaveStood/);
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
    assert.match(presenter, /showReady\(visualSeat, false\)/);
    assert.match(presenter, /!snapshot\.splitSeats\.includes\(localSeat\)/);
    assert.match(presenter, /!snapshot\.threeFlowerSeats\.includes\(localSeat\)/);
    assert.match(presenter, /betActions: Object\.freeze\(\[\.\.\.snapshot\.allowedBetActions\]\)/);
    assert.match(presenter, /this\.view\.showTotals/);
    assert.match(presenter, /snapshot\.lastBetActions\[seat\]/);
    assert.match(presenter, /snapshot\.lastDelta\[playerId\]/);
});

test('CD299 landscape projects authoritative totals, action feedback and deadlines', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    assert.match(view, /CD299\/Art\/XqpRoomBackground\/spriteFrame/);
    assert.match(view, /background\.setSiblingIndex\(0\)/);
    assert.match(view, /commonPosition\('Btn\/Btn_Back', -550, 280\)/);
    assert.match(view, /commonPosition\('Btn\/Btn_Chat', 552, -236\)/);
    assert.match(view, /commonVisible\('Btn\/Btn_Voice', false\)/);
    assert.match(view, /widget\.enabled = false/);
    assert.match(view, /Middle\/TotalCent\/MangoNum/);
    assert.match(view, /Middle\/TotalCent\/BetNum/);
    assert.match(view, /DROP: 'Drop', FOLLOW: 'Follow', REST: 'Check', RAISE: 'Add', ALL_IN: 'Allin'/);
    assert.match(view, /\.to\(0\.15, \{ scale: target \}\)/);
    assert.match(view, /this\.path\('Clock'\)/);
    assert.match(view, /Math\.ceil\(\(deadline - Date\.now\(\)\) \/ 1000\)/);
    assert.match(view, /settlementTemplateResolver\.load/);
    assert.match(view, /playFamily: 'poker:cd299'/);
    assert.match(view, /settlementType: 'LOOP_BIG'/);
    assert.match(view, /站起离桌/);
    assert.match(view, /继续游戏/);
    assert.match(view, /controller\?\.restart\(carryScore\)/);
    assert.match(view, /controller\?\.stand\(\)/);
    assert.doesNotMatch(view, /controller\?\.stand\(\)\.then[\s\S]{0,180}Btn\/Btn_Back/);
    assert.match(view, /CD299FinalSettlement/);
    assert.match(view, /remaining <= 0\) this\.handleTerminalExpiry\(snapshot\)/);
    assert.match(view, /terminal retention expired; returning through room exit/);
    assert.match(view, /continueGame\.interactable = false/);
    assert.match(view, /Btn\/Btn_Back.*emit\(Button\.EventType\.CLICK\)/s);
    assert.ok(view.indexOf('this.terminalCountdownTimer = setInterval(renderCountdown, 1000)')
        < view.indexOf('renderCountdown();'));
});

test('CD299 keeps the local two, three and four-card hand centred on one authored origin', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    assert.match(view, /const centeredX = \(index - \(cards\.length - 1\) \/ 2\) \* 96/);
    assert.match(view, /card\.setPosition\(centeredX, 0, index\)/);
    assert.doesNotMatch(view, /card\.setPosition\(index \* 96, 0, index\)/);
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

test('CD299 hides manual start and schedules the authority-elected next round', async () => {
    const [controller, presenter] = await Promise.all([
        source('CD299RuntimeController.ts'),
        source('CD299RoomPresenter.ts'),
    ]);
    assert.match(presenter, /snapshot\.phase === 'ROUND_SETTLEMENT' \|\| snapshot\.phase === 'FINISHED'/);
    assert.match(presenter, /canContinue: false/);
    assert.match(controller, /snapshot\.roundSettlementTriggerSeat === seat/);
    assert.match(controller, /snapshot\.roundSettlementDeadlineEpochMillis/);
    assert.match(controller, /Math\.min\(\.\.\.candidates\)/);
});

test('CD299 projects authoritative clock, depleted-seat retention and back-to-stand semantics', async () => {
    const [view, presenter, controller, protocol, entry] = await Promise.all([
        source('CD299LandscapeRoomViewComponent.ts'),
        source('CD299RoomPresenter.ts'),
        source('CD299RuntimeController.ts'),
        source('CD299Protocol.ts'),
        source('CD299GameRuntimeEntry.ts'),
    ]);
    assert.match(view, /pointer\.angle = Math\.atan2\(target\.y - origin\.y, target\.x - origin\.x\)/);
    assert.match(presenter, /showSeatRetention\(visualSeat/);
    assert.match(view, /openRebuyCarryWindow\(seat\)/);
    assert.match(controller, /seatRetentionDeadlineEpochMillis/);
    assert.match(protocol, /rebuy:'poker\.cd299\.rebuy_req'/);
    assert.match(entry, /controller\.isSeated\(\)[\s\S]*controller\.stand\(\)/);
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
        clientPrefab('Games/Poker/CX/CD299/Prefab/Landscape/CD299RoomLandscape.prefab'),
    ]);
    const commonNames = common.filter(item => item.__type__ === 'cc.Node').map(item => item._name);
    const gameNames = game.filter(item => item.__type__ === 'cc.Node').map(item => item._name);
    assert.equal(common[1]._name, 'CommonRoom');
    assert.equal(game[1]._name, 'CD299RoomLandscape');
    for (const name of ['RoomInfo', 'Btn_Back', 'Btn_More', 'Btn_RoomRule', 'WaitingActions']) {
        assert.ok(commonNames.includes(name), name);
    }
    for (let seat = 0; seat < 8; seat += 1) assert.ok(gameNames.includes(String(seat)));
    for (const name of ['PresetBet', 'Drop', 'Follow', 'Check', 'Add', 'AllIn', 'SplitPoker', 'Ensure']) {
        assert.ok(gameNames.includes(name), name);
    }
    assert.ok(game.filter(item => item.__type__ === 'cc.Sprite').length >= 170);
    assert.ok(game.filter(item => item.__type__ === 'cc.Button').length >= 20);
});

test('CD299 landscape uses the same dynamic CommonHead framework as PDK', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    assert.match(view, /CommonHeadController/);
    assert.match(view, /bundle\.load\('Prefab\/CommonHead'/);
    assert.match(view, /controller\.showGamePlayer\(occupied\)/);
    assert.match(view, /controller\.showPlayerAvatar\(playerId!\)/);
    assert.match(view, /controller\.showReady\(false\)/);
    assert.match(view, /TOUCH_MOVE/);
    assert.match(view, /convertToNodeSpaceAR/);
    assert.match(view, /Players\/\$\{index\}/);
});

test('CD299 deal and add-card animation keeps the XQP cadence and flight geometry', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    const presenter = await source('CD299RoomPresenter.ts');
    assert.match(view, /index >= previousCount/);
    assert.match(view, /this\.path\('Deal'\) \?\? this\.path\('DealPos'\)/);
    assert.match(view, /\(newCardIndex \* dealCycleSize \+ dealOrder\) \* 0\.08/);
    assert.match(presenter, /filter\(candidate => snapshot\.players\[candidate\] !== undefined\)/);
    assert.match(presenter, /Math\.max\(1, occupiedDealOrder\.length\)/);
    assert.match(view, /\.to\(0\.2, \{ worldPosition: targetWorld, scale: targetScale \}\)/);
    assert.match(view, /targetScale\.x \* 0\.2, targetScale\.y \* 0\.2/);
    assert.match(view, /authoredLayout\.enabled = false/);
    assert.match(view, /card\.setPosition\(centeredX, 0, index\)/);
    assert.match(view, /controller\.useSkin\('XQP_CIRCULAR'\)/);
    assert.match(view, /playerId !== null && playerId > 0/);
    assert.match(view, /const overlap = seat >= 5 \? 5 : -5/);
});

test('CD299 projects the authoritative counterclockwise banker and deal origin', async () => {
    const state = await source('CD299RoomState.ts');
    const presenter = await source('CD299RoomPresenter.ts');
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    assert.match(state, /bankerSeat:number/);
    assert.match(presenter, /Math\.max\(-1, snapshot\.bankerSeat\) \+ 1 \+ offset/);
    assert.match(presenter, /occupiedDealOrder\.indexOf\(seat\)/);
    assert.match(presenter, /showBanker\(visualSeat, seat === snapshot\.bankerSeat\)/);
    assert.match(view, /node\.name === 'Icon_Banker'/);
    assert.match(view, /CD299\/Art\/CxCommonStatic/);
    assert.match(view, /icon_zhuang/);
    assert.match(view, /node\.setPosition\(-43, -27/);
    assert.match(view, /setContentSize\(30, 30\)/);
});

test('CD299 XQP operation slots never expose overlapping actions', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    assert.match(view, /const canRest = actions\.canBet && actions\.betActions\.includes\('REST'\)/);
    assert.match(view, /actions\.betActions\.includes\('FOLLOW'\) && !canRest/);
    assert.match(view, /const canRaise = actions\.canBet && actions\.betActions\.includes\('RAISE'\)/);
    assert.match(view, /actions\.betActions\.includes\('ALL_IN'\) && !canRaise/);
    assert.match(view, /target - actions\.currentBet > actions\.availableScore \? 'ALL_IN' : 'RAISE'/);
});

test('CD299 split cards and quick raises bind the physical hit targets', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    for (const index of [1, 2, 3]) {
        assert.ok(view.includes(`OperateBtn/Bet/Add/Add/Fast/${index}/Mask`));
    }
    assert.match(view, /node\.active = !this\.selectedSplitCards\.includes\(cardValue\)/);
    assert.match(view, /card\.on\(Node\.EventType\.MOUSE_UP, returnCard, this\)/);
    assert.match(view, /card\.on\(Node\.EventType\.TOUCH_END, returnCard, this\)/);
    assert.match(view, /generation !== this\.splitRenderGeneration/);
});

test('CD299 split labels use the authoritative pair catalog and room rule', async () => {
    const { cd299PairTypeLabel } = await import(asset('Code/CD299PairTypeLabels.ts'));
    assert.equal(cd299PairTypeLabel([203, 506], true), '丁二皇');
    assert.equal(cd299PairTypeLabel([212, 412], true), '天牌');
    assert.equal(cd299PairTypeLabel([202, 309], true), '地九王');
    assert.equal(cd299PairTypeLabel([202, 309], false), '1点');
    assert.equal(cd299PairTypeLabel([404, 408], true), '2点');
    assert.throws(() => cd299PairTypeLabel([404, 404], true));

    const [presenter, view, state] = await Promise.all([
        source('CD299RoomPresenter.ts'),
        source('CD299LandscapeRoomViewComponent.ts'),
        source('CD299RoomState.ts'),
    ]);
    assert.match(state, /earthNineKing:boolean/);
    assert.match(presenter, /snapshot\.rules\.earthNineKing/);
    assert.match(view, /this\.visible\('OperateBtn\/SplitPoker\/TopType', complete\)/);
    assert.match(view, /this\.visible\('OperateBtn\/SplitPoker\/DownType', complete\)/);
    assert.match(view, /cd299PairTypeLabel\(this\.selectedSplitCards, this\.earthNineKing\)/);
    assert.match(view, /cd299PairTypeLabel\(tail, this\.earthNineKing\)/);
});

test('CD299 card faces cover every authoritative deck value without the common poker codec', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    const atlas = await readFile(asset('Art/PokerFront_0Trends.plist'), 'utf8');
    const deck = [202, 402, 203, 104, 204, 304, 404, 105, 305, 106, 206, 306, 406,
        107, 207, 307, 407, 108, 208, 308, 408, 109, 309, 110, 210, 310, 410,
        111, 311, 212, 412, 506];
    for (const card of deck) assert.ok(atlas.includes(`<key>${card}.png</key>`), `missing ${card}`);
    assert.match(view, /atlas\.getSpriteFrame\(String\(rawCard\)\)/);
    assert.match(view, /if \(!revealed\) return this\.cardFactory\.create/);
    assert.doesNotMatch(view, /cardFactory\.create\(parent, rawCard, Poker_Card_Face\.Front\)/);
});

test('CD299 loop settlement projects the XQP single-player geometry', async () => {
    const view = await source('CD299LandscapeRoomViewComponent.ts');
    assert.match(view, /topBar\?\.setPosition\(-50, 200\)/);
    assert.match(view, /winner\?\.setPosition\(-50, 30\)/);
    assert.match(view, /winnerHead\?\.setPosition\(0, 50\)/);
    assert.match(view, /winnerScore\?\.setPosition\(0, -30\)/);
    assert.match(view, /bottomBar\?\.setPosition\(-50, -190\)/);
    assert.match(view, /countdown\.setPosition\(0, -100\)/);
    assert.match(view, /WinnerLogo/);
    assert.match(view, /RoundAvatar\/Mask\/Img_Avatar/);
});

test('CD299 plays migrated XQP room audio through shared sound settings', async () => {
    const [audio, view] = await Promise.all([
        source('CD299RoomAudioPresenter.ts'),
        source('CD299LandscapeRoomViewComponent.ts'),
    ]);
    for (const [event, clip] of Object.entries({
        DROP: 'diu', FOLLOW: 'gen', REST: 'xiu', RAISE: 'da', ALL_IN: 'qiao',
        deal: 'fapai', select: 'xuanpai',
    })) {
        assert.ok(audio.includes(`${event}: 'CD299/Audio/${clip}'`), `missing ${event} sound`);
    }
    assert.match(audio, /legacyAudioService\.onSettingsChanged/);
    assert.match(audio, /legacyLocalDataStore\.get\('SysSetting', 'BackMusic'/);
    assert.match(audio, /legacyLocalDataStore\.get\('SysSetting', 'SpSound'/);
    assert.match(view, /this\.currentRound !== this\.lastDealSoundRound/);
    assert.match(view, /this\.audio\?\.play\('deal'\)/);
    assert.match(view, /this\.audio\?\.play\(action\)/);
    assert.match(view, /this\.audio\?\.play\('select'\)/);
    assert.match(view, /this\.audio\?\.destroy\(\)/);
});
