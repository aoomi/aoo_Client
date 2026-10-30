import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const asset = relative => fileURLToPath(new URL(`../../../assets/Games/Poker/NN/${relative}`, import.meta.url));
const source = relative => readFile(asset(`Common/Code/${relative}`), 'utf8');
const prefab = async relative => JSON.parse(await readFile(asset(`Prefab/${relative}`), 'utf8'));

const messages = ['state', 'sit', 'start', 'rob', 'bet', 'split', 'continue', 'timeout']
    .map(name => `poker.quanguo2998.${name}_req`);

test('NN uses one canonical identity and complete command surface', async () => {
    const protocol = await source('NnProtocol.ts');
    const rules = await source('NnRules.ts');
    for (const message of messages) assert.ok(protocol.includes(`'${message}'`), message);
    assert.doesNotMatch(protocol, /poker\.quanguo2998\.ready_req/);
    assert.match(rules, /NN_GAME_CODE = 'quanguo2998'/);
    assert.match(rules, /NN_FAMILY = 'poker:betting'/);
    assert.match(rules, /NN_PLAY_VERSION = 'nn-v1\.0\.0'/);
    assert.match(protocol, /gameCode: NN_GAME_CODE, family: NN_FAMILY/);
    assert.match(protocol, /stateVersion: this\.stateVersion\(\), body:/);
});

test('NN request IDs remain unique across browser refresh and reconnect', async () => {
    const protocol = await source('NnProtocol.ts');
    assert.match(protocol, /GameRequestIdentity/);
    assert.match(protocol, /this\.requests\.next\(\)/);
    assert.doesNotMatch(protocol, /const requestId = `\$\{this\.requestPrefix\}-\$\{\+\+this\.sequence\}`/);
});

test('NN accepts only newer authoritative snapshots from one room', async () => {
    const state = await source('NnRoomState.ts');
    assert.match(state, /incoming\.gameCode !== NN_GAME_CODE/);
    assert.match(state, /current && current\.roomId !== incoming\.roomId/);
    assert.match(state, /incoming\.stateVersion <= current\.stateVersion/);
    assert.match(state, /Object\.freeze\(Object\.fromEntries/);
    assert.match(state, /viewerStatus: 'SPECTATOR' \| 'SEATED'/);
    assert.match(state, /pendingSeats: readonly number\[\]/);
    for (const field of ['roundSettlement', 'playerStats', 'finalSettlement']) {
        assert.match(state, new RegExp(`${field}: Readonly`));
    }
    assert.match(state, /observers: readonly NnObserver\[\]/);
    assert.match(state, /historyRecords: readonly NnHistoryRecord\[\]/);
    for (const field of ['settledAtEpochMillis', 'handTypes', 'multipliers']) assert.match(state, new RegExp(field));
});

test('NN seat projection uses the selected empty seat and never emits ready', async () => {
    const presenter = await source('NnRoomPresenter.ts');
    const view = await source('NnRoomViewComponent.ts');
    const entry = await source('NnRuntimeEntry.ts');
    assert.match(presenter, /seat < snapshot\.maxPlayers/);
    assert.match(presenter, /snapshot\.viewerStatus === 'SPECTATOR'/);
    assert.match(view, /Node\.EventType\.TOUCH_END/);
    assert.match(view, /actions\.sit\(\)/);
    assert.doesNotMatch(view, /readyButton|actions\.ready/);
    assert.doesNotMatch(entry, /ready:/);
});

test('NN production controller uses the shared authoritative dispatch envelope', async () => {
    const controller = await source('NnRuntimeController.ts');
    const entry = await source('NnRuntimeEntry.ts');
    assert.match(controller, /NN_DISPATCH = 'poker\.quanguo2998\.dispatch'/);
    assert.match(controller, /NN_STATE_PUSH = 'poker\.quanguo2998\.state_push'/);
    assert.match(controller, /COMMON_ROOM_STATE_PUSH = 'common\.room\.state_push'/);
    assert.match(controller, /client\.on\(NN_STATE_PUSH, body => this\.applyAuthoritativeSnapshot\(body, 'push'\)\)/);
    assert.match(controller, /client\.on\(COMMON_ROOM_STATE_PUSH, body => this\.applyAuthoritativeSnapshot\(body, 'common-push'\)\)/);
    assert.match(controller, /playVersion: NN_PLAY_VERSION/);
    assert.match(controller, /expectedStateVersion: command\.stateVersion/);
    assert.match(controller, /operationId: command\.requestId/);
    assert.match(controller, /action: command\.msgId, payload: command\.body/);
    for (const method of ['state', 'sit', 'start', 'rob', 'bet', 'split', 'continueRound', 'timeout']) {
        assert.match(controller, new RegExp(`public ${method}\\(`), method);
    }
    assert.doesNotMatch(controller, /public ready\(/);
    assert.match(entry, /await controller\.state\(\)/);
    assert.match(controller, /snapshot\?\.viewerStatus === 'SEATED' \? snapshot\.viewerSeat : -1/);
    assert.match(controller, /wrapper\.payload && typeof wrapper\.payload === 'object'/);
    assert.match(controller, /\[NN\] authoritative snapshot applied/);
    assert.match(controller, /\[NN\] dispatch failed/);
});

test('NN start and continue share one prefab button without sharing action semantics', async () => {
    const presenter = await source('NnRoomPresenter.ts');
    const view = await source('NnRoomViewComponent.ts');
    assert.match(presenter, /snapshot\.players\[localSeat\] === snapshot\.ownerPlayerId/);
    assert.match(presenter, /Object\.keys\(snapshot\.players\)\.length >= snapshot\.startPlayers/);
    assert.match(view, /this\.continueIsStart \? actions\.start\(\) : actions\.continueRound\(\)/);
    assert.match(view, /actions\.canStart \? '开始游戏' : '继续游戏'/);
    assert.match(view, /actions\.canStart \|\| actions\.canContinue/);
    assert.match(presenter, /snapshot\.pendingSeats\.includes\(localSeat\)/);
    assert.match(presenter, /snapshot\.viewerStatus === 'SEATED'.*snapshot\.viewerSeat/s);
});

test('NN split is driven by five-card UI touch selection and submits exactly three owned cards', async () => {
    const presenter = await source('NnRoomPresenter.ts');
    const view = await source('NnRoomViewComponent.ts');
    const controller = await source('NnRuntimeController.ts');
    const entry = await source('NnRuntimeEntry.ts');
    assert.match(view, /Node\.EventType\.TOUCH_END/);
    assert.match(view, /event\.getUILocation\(\)/);
    assert.match(view, /convertToNodeSpaceAR/);
    assert.match(view, /actions\.toggleSplitCard\(seat, index\)/);
    assert.match(view, /`Players\/\$\{seat\}\/HandPoker`/);
    assert.match(view, /`▲\$\{this\.formatCard\(card\)\}`/);
    assert.match(presenter, /this\.selectedSplitCards\.size === 3/);
    assert.match(presenter, /this\.selectedSplitCards\.clear\(\)/);
    assert.match(presenter, /this\.selectedSplitCards\.values\(\)\.next\(\)\.value/);
    assert.match(controller, /exactly three split cards are required/);
    assert.match(controller, /new Set\(selected\)\.size !== 3/);
    assert.match(controller, /selected\.some\(card => !hand\.includes\(card\)\)/);
    assert.match(entry, /toggleSplitCard: \(seat, cardIndex\) => controller\.toggleSplitCard/);
    assert.doesNotMatch(entry, /selectedSplitCards/);
});

test('NN view keeps hidden prefab actions bound and safely detaches them on destroy', async () => {
    const view = await source('NnRoomViewComponent.ts');
    assert.doesNotMatch(view, /protected onDisable\(\): void \{ this\.unbindActions\(\); \}/);
    assert.match(view, /protected onDestroy\(\): void \{/);
    assert.match(view, /this\.unbindActions\(\);/);
    assert.match(view, /removeNodeListener\(node: Node/);
    assert.match(view, /if \(!node\.isValid\) return;/);
    assert.match(view, /this\.setButtonGroup\(this\.robButtons, actions\.canRob\)/);
    assert.match(view, /this\.setButtonGroup\(this\.betButtons, actions\.canBet\)/);
    assert.match(view, /parent\.active = active/);
});

test('NN landscape seats bind the preserved Head button hit target', async () => {
    const view = await source('NnRoomViewComponent.ts');
    assert.match(view, /seatNode\.getChildByName\('Head'\)\?\.getComponent\(Button\)/);
    assert.match(view, /headButton \? Button\.EventType\.CLICK : Node\.EventType\.TOUCH_END/);
    assert.match(view, /\[NnSeatInput\] activate/);
});

test('NN exports its own live-only GameRuntimeEntry factory', async () => {
    const entry = await source('NnRuntimeEntry.ts');
    assert.match(entry, /canonicalGameCodes = Object\.freeze\(\['quanguo2998'\]\)/);
    assert.match(entry, /families = Object\.freeze\(\['poker-betting'\]\)/);
    assert.match(entry, /createOwnedGameClient\(\)/);
    assert.match(entry, /bindRoomAuthority\(roomId, NN_PLAY_VERSION\)/);
    assert.match(entry, /PREFAB_PATH = 'Prefab\/NN_CommonRoom'/);
    assert.match(entry, /SMALL_SETTLEMENT_PREFAB_PATH = 'Prefab\/SmallSettlement'/);
    assert.match(entry, /BIG_SETTLEMENT_PREFAB_PATH = 'Prefab\/BigSettlement_0'/);
    assert.match(entry, /REAL_TIME_RECORD_PREFAB = 'Prefab\/RealTimeRecord'/);
    assert.match(entry, /new NnRuntimeController/);
    assert.match(entry, /await controller\.state\(\)/);
    assert.match(entry, /this\.gameClient\?\.close\(\)/);
    assert.doesNotMatch(entry, /enterReplay/);
});

for (const [relative, rootName] of [['NN_CommonRoom.prefab', 'NN_CommonRoom']]) {
    test(`${rootName} is a native and fully bound gameplay prefab`, async () => {
        const data = await prefab(relative);
        const root = data[1];
        assert.equal(root.__type__, 'cc.Node');
        assert.equal(root._name, rootName);
        const nodes = data.filter(item => item.__type__ === 'cc.Node');
        assert.equal(nodes.filter(item => /^[0-9]$/.test(item._name)).length >= 10, true);
        assert.equal(data.filter(item => item.__type__ === 'cc.Button').length >= 12, true);
        const transform = root._components.map(ref => data[ref.__id__])
            .find(component => component.__type__ === 'cc.UITransform');
        assert.deepEqual(transform._contentSize, { __type__: 'cc.Size', width: 1280, height: 720 });
        for (const required of ['Middle', 'OperateBtn', 'Players-001']) {
            assert.ok(nodes.some(item => item._name === required), required);
        }
    });
}
