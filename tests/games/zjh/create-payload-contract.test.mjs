import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = relative => readFile(fileURLToPath(new URL(
    `../../../assets/Games/Poker/ZJH/Common/Code/${relative}`, import.meta.url)), 'utf8');

test('ZJH create payload uses its canonical identity and workbook defaults', async () => {
    const rules = await source('ZjhRules.ts');
    const protocol = await source('ZjhProtocol.ts');
    assert.match(rules, /ZJH_GAME_CODE = 'quanguo2997'/);
    assert.match(rules, /ZJH_FAMILY = 'poker:compare-hand'/);
    assert.match(rules, /ZJH_PLAY_VERSION = 'zjh-v1\.0\.0'/);
    for (const expected of [
        'totalRounds: 10', 'seatLimit: 8', 'minimumPlayers: 2', 'operationSeconds: 10',
        'compareStartRound: 5', 'maximumBet: 50', 'mustBlindRounds: 1', 'baseBet: 1',
        'aaaBonus: 20', 'leopardBonus: 10', 'straightFlushBonus: 5',
    ]) assert.ok(rules.includes(expected), expected);
    assert.match(protocol, /createZjhRoomBody\(rules: ZjhRoomRules = ZJH_DEFAULT_RULES\)/);
    assert.match(protocol, /gameCode: ZJH_GAME_CODE, playVersion: ZJH_PLAY_VERSION/);
    assert.match(protocol, /family: ZJH_FAMILY, \.\.\.validateZjhRules\(rules\)/);
});

test('ZJH validation mirrors every discrete workbook option', async () => {
    const rules = await source('ZjhRules.ts');
    for (const options of [
        '[10, 20, 30].includes(value.totalRounds)', '[8, 10].includes(value.seatLimit)',
        '[2, 4, 6].includes(value.minimumPlayers)', '[10, 15, 20].includes(value.operationSeconds)',
        '[1, 3, 5].includes(value.compareStartRound)', '[10, 20, 50].includes(value.maximumBet)',
        '[0, 1, 2].includes(value.mustBlindRounds)', '[1, 2, 5, 10].includes(value.baseBet)',
    ]) assert.ok(rules.includes(options), options);
});

test('ZJH empty seats write their selected seatId but UI never joins or readies', async () => {
    const protocol = await source('ZjhProtocol.ts');
    const presenter = await source('ZjhRoomPresenter.ts');
    const view = await source('ZjhRoomViewAdapter.ts');
    const controller = await source('ZjhRoomController.ts');
    assert.match(protocol, /sit: 'poker\.quanguo2997\.sit_req'/);
    assert.match(protocol, /sit\(seatId: number\)/);
    assert.doesNotMatch(protocol, /join_req|ready_req|\bready\(/);
    assert.match(presenter, /snapshot\.state === 'WAITING' && snapshot\.viewerRole === 'SPECTATOR'/);
    assert.match(presenter, /canStart: snapshot\.state === 'WAITING' && snapshot\.viewerRole === 'SEATED'/);
    assert.match(presenter, /canContinue: snapshot\.state === 'ROUND_FINISHED' && snapshot\.viewerRole === 'SEATED'/);
    assert.match(view, /phase === 'WAITING' \? '已坐下'/);
    assert.match(view, /this\.actionSink\.sit\(seat\)/);
    assert.match(view, /this\.sittableSeats\.has\(seat\)/);
    assert.doesNotMatch(view, /Btn_(Ready|Sit)|canReady|'ready'/);
    assert.match(controller, /snapshot\.state !== 'WAITING' \|\| snapshot\.viewerRole !== 'SPECTATOR'/);
    assert.match(controller, /!snapshot \|\| snapshot\.viewerRole !== 'SEATED'/);
    assert.match(controller, /return this\.protocol\.state\(\)\.then\(value => this\.accept\(value\)\)/);
});

test('ZJH websocket snapshots advance the next command authority cursor', async () => {
    const protocol = await source('ZjhProtocol.ts');
    const controller = await source('ZjhRoomController.ts');
    assert.match(protocol, /observe\(snapshot: ZjhSnapshot\): void \{ this\.observeAuthority\(snapshot\); \}/);
    assert.match(protocol, /stateVersion >= this\.acceptedStateVersion/,
        'late snapshots must not move the protocol cursor backwards');
    assert.match(controller, /if \(!this\.presenter\.applySnapshot\(snapshot\)\) return;/,
        'only snapshots accepted by the presenter may advance the protocol cursor');
    assert.match(controller, /this\.snapshot = snapshot;\s*this\.snapshotObserver\?\.\(snapshot\);\s*this\.protocol\.observe\(snapshot\);/);
});

test('ZJH finished rounds fetch and render authoritative settlement before continue', async () => {
    const protocol = await source('ZjhProtocol.ts');
    const presenter = await source('ZjhRoomPresenter.ts');
    const view = await source('ZjhRoomViewAdapter.ts');
    const controller = await source('ZjhRoomController.ts');
    assert.match(protocol, /settle: 'poker\.quanguo2997\.settle_req'/);
    assert.match(protocol, /interface ZjhSettlementEntry/);
    assert.match(protocol, /settle\(\).*ZjhSettlementResult/);
    assert.match(controller, /await this\.settleIfFinished\(response\)/);
    assert.match(controller, /this\.settledRound !== snapshot\.roundNo/);
    assert.match(controller, /round settlement is not confirmed/);
    assert.match(controller, /const settlement = await this\.protocol\.settle\(\)/);
    assert.match(controller, /this\.presenter\.applySettlement\(snapshot\.roundNo, settlement\)/);
    assert.match(presenter, /this\.view\.showSettlement\(roundNo, settlement\)/);
    assert.match(view, /for \(const entry of settlement\.entries\)/);
    assert.match(view, /entry\.scoreDelta >= 0/);
});

test('ZJH betting and compare require explicit legal UI selections', async () => {
    const controller = await source('ZjhRoomController.ts');
    const view = await source('ZjhRoomViewAdapter.ts');
    assert.match(controller, /showBetOptions\(this\.betOptions\(\), false\)/);
    assert.match(controller, /showBetOptions\(this\.betOptions\(\), true\)/);
    assert.match(controller, /\[minimum, minimum \* 2, minimum \* 5, maximum\]/);
    assert.match(controller, /amount <= maximum/);
    assert.match(controller, /showCompareTargets\(this\.compareTargets\(\)\)/);
    assert.match(controller, /filter\(\(\[seat, state\]\) => Number\(seat\) !== localSeat && state\.active\)/);
    assert.match(view, /this\.actionSink\.bet\(amount, queued\)/);
    assert.match(view, /this\.actionSink\.compare\(seat\)/);
    assert.match(view, /取消比牌/);
    assert.match(view, /now - lastInvokeAt < 180/);
});

test('ZJH settlement UI distinguishes small and final settlement and gates continuation', async () => {
    const protocol = await source('ZjhProtocol.ts');
    const presenter = await source('ZjhRoomPresenter.ts');
    const view = await source('ZjhRoomViewAdapter.ts');
    const entry = await source('ZjhGameRuntimeEntry.ts');
    assert.match(protocol, /roundNo: number; final: boolean/);
    assert.match(entry, /settlement\.final \? this\.assets\?\.bigSettlement : this\.assets\?\.smallSettlement/);
    assert.match(entry, /settlement\.cumulativeEntries/);
    assert.match(view, /this\.require\('ZjhContract'\)\.active = true/,
        'the inactive contract parent must be enabled before its action buttons can render');
    assert.match(view, /this\.require\('ZjhContract\/Settlement'\)\.active = false/,
        'the settlement parent must be cleared between rounds');
    assert.match(presenter, /canContinue: snapshot\.state === 'ROUND_FINISHED'/);
    assert.doesNotMatch(presenter, /canContinue: snapshot\.state === 'FINISHED'/);
});

test('ZJH all action buttons are gated by authoritative state and published rules', async () => {
    const presenter = await source('ZjhRoomPresenter.ts');
    const state = await source('ZjhRoomState.ts');
    assert.match(state, /minimumPlayers: number/);
    assert.match(state, /mustBlindRounds: number/);
    assert.match(state, /minimumBet: number/);
    assert.match(presenter, /Object\.keys\(snapshot\.seats\)\.length >= snapshot\.minimumPlayers/);
    assert.match(presenter, /snapshot\.bettingRound > snapshot\.mustBlindRounds/);
    assert.match(presenter, /canBet: ownTurn && !!local\?\.active/);
    assert.match(presenter, /canPreBet: snapshot\.state === 'PLAYING' && !!local\?\.active && !ownTurn/);
    assert.match(presenter, /activeOpponentCount > 0/);
    assert.match(presenter, /snapshot\.bettingRound >= snapshot\.compareStartRound/);
    const view = await source('ZjhRoomViewAdapter.ts');
    assert.match(view, /Any authoritative render invalidates local choices/);
    assert.match(view, /if \(this\.hasSelection\(\)\) this\.clearSelection\(\)/);
});

test('ZJH dynamically mounted room inherits the UI camera layer', async () => {
    const entry = await source('ZjhGameRuntimeEntry.ts');
    assert.match(entry, /this\.applyUiLayer\(room\)/);
    assert.match(entry, /Layers\.Enum\.UI_2D/);
    assert.match(entry, /node\.children\.forEach\(child => this\.setLayerRecursively\(child, layer\)\)/);
    assert.match(entry, /root\.addComponent\(RenderRoot2D\)/);
});
