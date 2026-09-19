import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const asset = relative => fileURLToPath(new URL(`../../../assets/Games/Poker/NN/${relative}`, import.meta.url));
const source = relative => readFile(asset(`Common/Code/${relative}`), 'utf8');
const prefab = async relative => JSON.parse(await readFile(asset(`Prefab/${relative}`), 'utf8'));

const messages = ['state', 'sit', 'start', 'rob', 'bet', 'split', 'continue', 'timeout']
    .map(name => `poker.cn298.${name}_req`);

test('CN298 uses one canonical identity and complete command surface', async () => {
    const protocol = await source('CN298Protocol.ts');
    const rules = await source('CN298Rules.ts');
    for (const message of messages) assert.ok(protocol.includes(`'${message}'`), message);
    assert.doesNotMatch(protocol, /poker\.cn298\.ready_req/);
    assert.match(rules, /CN298_GAME_CODE = 'CN298'/);
    assert.match(rules, /CN298_FAMILY = 'poker:betting'/);
    assert.match(rules, /CN298_PLAY_VERSION = 'cn298-v1\.0\.0'/);
    assert.match(protocol, /gameCode: CN298_GAME_CODE, family: CN298_FAMILY/);
    assert.match(protocol, /stateVersion: this\.stateVersion\(\), body:/);
});

test('CN298 request IDs remain unique across browser refresh and reconnect', async () => {
    const protocol = await source('CN298Protocol.ts');
    assert.match(protocol, /GameRequestIdentity/);
    assert.match(protocol, /this\.requests\.next\(\)/);
    assert.doesNotMatch(protocol, /const requestId = `\$\{this\.requestPrefix\}-\$\{\+\+this\.sequence\}`/);
});

test('CN298 accepts only newer authoritative snapshots from one room', async () => {
    const state = await source('CN298RoomState.ts');
    assert.match(state, /incoming\.gameCode !== CN298_GAME_CODE/);
    assert.match(state, /current && current\.roomId !== incoming\.roomId/);
    assert.match(state, /incoming\.stateVersion <= current\.stateVersion/);
    assert.match(state, /Object\.freeze\(Object\.fromEntries/);
    assert.match(state, /viewerStatus: 'SPECTATOR' \| 'SEATED'/);
    assert.match(state, /pendingSeats: readonly number\[\]/);
    for (const field of ['roundSettlement', 'playerStats', 'finalSettlement']) {
        assert.match(state, new RegExp(`${field}: Readonly`));
    }
});

test('CN298 seat projection uses the selected empty seat and never emits ready', async () => {
    const presenter = await source('CN298RoomPresenter.ts');
    const view = await source('CN298RoomViewComponent.ts');
    const entry = await source('CN298RuntimeEntry.ts');
    assert.match(presenter, /seat < snapshot\.maxPlayers/);
    assert.match(presenter, /snapshot\.viewerStatus === 'SPECTATOR'/);
    assert.match(view, /Node\.EventType\.TOUCH_END/);
    assert.match(view, /actions\.sit\(seat\)/);
    assert.doesNotMatch(view, /readyButton|actions\.ready/);
    assert.doesNotMatch(entry, /ready:/);
});

test('CN298 production controller uses the shared authoritative dispatch envelope', async () => {
    const controller = await source('CN298RuntimeController.ts');
    assert.match(controller, /CN298_DISPATCH = 'poker\.CN298\.dispatch'/);
    assert.match(controller, /CN298_STATE_PUSH = 'poker\.CN298\.state_push'/);
    assert.match(controller, /COMMON_ROOM_STATE_PUSH = 'common\.room\.state_push'/);
    assert.match(controller, /client\.on\(CN298_STATE_PUSH, body => this\.applyAuthoritativeSnapshot\(body, 'push'\)\)/);
    assert.match(controller, /client\.on\(COMMON_ROOM_STATE_PUSH, body => this\.applyAuthoritativeSnapshot\(body, 'common-push'\)\)/);
    assert.match(controller, /playVersion: CN298_PLAY_VERSION/);
    assert.match(controller, /expectedStateVersion: command\.stateVersion/);
    assert.match(controller, /operationId: command\.requestId/);
    assert.match(controller, /action: command\.msgId, payload: command\.body/);
    for (const method of ['state', 'sit', 'start', 'rob', 'bet', 'split', 'continueRound', 'timeout']) {
        assert.match(controller, new RegExp(`public ${method}\\(`), method);
    }
    assert.doesNotMatch(controller, /public ready\(/);
    assert.match(controller, /await this\.state\(\)/);
    assert.match(controller, /snapshot\?\.viewerStatus === 'SEATED' \? snapshot\.viewerSeat : -1/);
    assert.match(controller, /wrapper\.payload && typeof wrapper\.payload === 'object'/);
    assert.match(controller, /\[CN298\] authoritative snapshot applied/);
    assert.match(controller, /\[CN298\] dispatch failed/);
});

test('CN298 start and continue share one prefab button without sharing action semantics', async () => {
    const presenter = await source('CN298RoomPresenter.ts');
    const view = await source('CN298RoomViewComponent.ts');
    assert.match(presenter, /snapshot\.players\[localSeat\] === snapshot\.ownerPlayerId/);
    assert.match(presenter, /Object\.keys\(snapshot\.players\)\.length >= snapshot\.startPlayers/);
    assert.match(view, /this\.continueIsStart \? actions\.start\(\) : actions\.continueRound\(\)/);
    assert.match(view, /actions\.canStart \? '开始游戏' : '继续游戏'/);
    assert.match(view, /actions\.canStart \|\| actions\.canContinue/);
    assert.match(presenter, /snapshot\.pendingSeats\.includes\(localSeat\)/);
    assert.match(presenter, /snapshot\.viewerStatus === 'SEATED'.*snapshot\.viewerSeat/s);
});

test('CN298 split is driven by five-card UI touch selection and submits exactly three owned cards', async () => {
    const presenter = await source('CN298RoomPresenter.ts');
    const view = await source('CN298RoomViewComponent.ts');
    const controller = await source('CN298RuntimeController.ts');
    const entry = await source('CN298RuntimeEntry.ts');
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

test('CN298 view keeps hidden prefab actions bound and safely detaches them on destroy', async () => {
    const view = await source('CN298RoomViewComponent.ts');
    assert.doesNotMatch(view, /protected onDisable\(\): void \{ this\.unbindActions\(\); \}/);
    assert.match(view, /protected onDestroy\(\): void \{ this\.unbindActions\(\); \}/);
    assert.match(view, /removeNodeListener\(node: Node/);
    assert.match(view, /if \(!node\.isValid\) return;/);
    assert.match(view, /this\.setButtonGroup\(this\.robButtons, actions\.canRob\)/);
    assert.match(view, /this\.setButtonGroup\(this\.betButtons, actions\.canBet\)/);
    assert.match(view, /parent\.active = active/);
});

test('CN298 landscape seats bind the preserved Head button hit target', async () => {
    const view = await source('CN298RoomViewComponent.ts');
    assert.match(view, /seatNode\.getChildByName\('Head'\)\?\.getComponent\(Button\)/);
    assert.match(view, /headButton \? Button\.EventType\.CLICK : Node\.EventType\.TOUCH_END/);
    assert.match(view, /\[CN298SeatInput\] activate/);
});

test('CN298 exports its own live-only GameRuntimeEntry factory', async () => {
    const entry = await source('CN298RuntimeEntry.ts');
    assert.match(entry, /canonicalGameCodes = Object\.freeze\(\['CN298'\]\)/);
    assert.match(entry, /families = Object\.freeze\(\['poker-betting'\]\)/);
    assert.match(entry, /createOwnedGameClient\(\)/);
    assert.match(entry, /bindRoomAuthority\(roomId, CN298_PLAY_VERSION\)/);
    assert.match(entry, /`\$\{PREFAB_PATH\}\$\{orientation\}`/);
    assert.match(entry, /new CN298RuntimeController/);
    assert.match(entry, /await controller\.state\(\)/);
    assert.match(entry, /this\.gameClient\?\.close\(\)/);
    assert.doesNotMatch(entry, /enterReplay/);
});

for (const [relative, rootName] of [
    ['CN298RoomLandscape.prefab', 'CN298RoomLandscape'],
    ['CN298RoomPortrait.prefab', 'CN298RoomPortrait'],
]) {
    test(`${rootName} is a native and fully bound gameplay prefab`, async () => {
        const data = await prefab(relative);
        const root = data[1];
        assert.equal(root.__type__, 'cc.Node');
        assert.equal(root._name, rootName);
        const nodes = data.filter(item => item.__type__ === 'cc.Node');
        const legacyLandscape = rootName === 'CN298RoomLandscape';
        assert.equal(nodes.filter(item => legacyLandscape ? /^[0-9]$/.test(item._name)
            : /^Seat_[0-9]$/.test(item._name)).length >= 10, true);
        assert.equal(data.filter(item => item.__type__ === 'cc.Button').length >= 12, true);
        const transform = root._components.map(ref => data[ref.__id__])
            .find(component => component.__type__ === 'cc.UITransform');
        assert.deepEqual(transform._contentSize, { __type__: 'cc.Size', width: 1280, height: 720 });
        const view = root._components.map(ref => data[ref.__id__])
            .find(component => Object.hasOwn(component, 'phaseLabel'));
        assert.ok(view, 'CN298RoomViewComponent');
        if (legacyLandscape) {
            for (const required of ['Middle', 'OperateBtn', 'Players-001']) {
                assert.ok(nodes.some(item => item._name === required), required);
            }
        } else {
            for (const field of ['handLabels', 'robLabels', 'betLabels', 'scoreLabels', 'bankerMarks', 'splitMarks']) {
                assert.equal(view[field].length, 10, field);
                assert.ok(view[field].every(ref => Number.isInteger(ref.__id__)), field);
            }
            assert.equal(view.robButtons.length, 5);
            assert.equal(view.betButtons.length, 5);
            for (const field of ['splitButton', 'continueButton']) {
                assert.ok(Number.isInteger(view[field].__id__), field);
            }
        }
        assert.equal(view.readyButton, undefined);
    });
}
