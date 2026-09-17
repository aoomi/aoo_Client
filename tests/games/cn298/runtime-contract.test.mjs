import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const asset = relative => fileURLToPath(new URL(`../../../assets/Games/Poker/NN/${relative}`, import.meta.url));
const source = relative => readFile(asset(`Common/Code/${relative}`), 'utf8');
const prefab = async relative => JSON.parse(await readFile(asset(`Prefab/${relative}`), 'utf8'));

const messages = ['state', 'sit', 'rob', 'bet', 'split', 'continue', 'timeout']
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

test('CN298 accepts only newer authoritative snapshots from one room', async () => {
    const state = await source('CN298RoomState.ts');
    assert.match(state, /incoming\.gameCode !== CN298_GAME_CODE/);
    assert.match(state, /current && current\.roomId !== incoming\.roomId/);
    assert.match(state, /incoming\.stateVersion <= current\.stateVersion/);
    assert.match(state, /Object\.freeze\(Object\.fromEntries/);
    assert.match(state, /viewerStatus: 'SPECTATOR' \| 'SEATED'/);
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
    assert.match(controller, /playVersion: CN298_PLAY_VERSION/);
    assert.match(controller, /expectedStateVersion: command\.stateVersion/);
    assert.match(controller, /operationId: command\.requestId/);
    assert.match(controller, /action: command\.msgId, payload: command\.body/);
    for (const method of ['state', 'sit', 'rob', 'bet', 'split', 'continueRound', 'timeout']) {
        assert.match(controller, new RegExp(`public ${method}\\(`), method);
    }
    assert.doesNotMatch(controller, /public ready\(/);
    assert.match(controller, /await this\.state\(\)/);
    assert.match(controller, /\[CN298\] dispatch failed/);
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
        assert.equal(nodes.filter(item => /^Seat_[0-9]$/.test(item._name)).length, 10);
        assert.equal(data.filter(item => item.__type__ === 'cc.Button').length, 12);
        const transform = root._components.map(ref => data[ref.__id__])
            .find(component => component.__type__ === 'cc.UITransform');
        assert.deepEqual(transform._contentSize, { __type__: 'cc.Size', width: 1280, height: 720 });
        const view = root._components.map(ref => data[ref.__id__])
            .find(component => Object.hasOwn(component, 'phaseLabel'));
        assert.ok(view, 'CN298RoomViewComponent');
        for (const field of ['handLabels', 'robLabels', 'betLabels', 'scoreLabels', 'bankerMarks', 'splitMarks']) {
            assert.equal(view[field].length, 10, field);
            assert.ok(view[field].every(ref => Number.isInteger(ref.__id__)), field);
        }
        assert.equal(view.robButtons.length, 5);
        assert.equal(view.betButtons.length, 5);
        for (const field of ['splitButton', 'continueButton']) {
            assert.ok(Number.isInteger(view[field].__id__), field);
        }
        assert.equal(view.readyButton, undefined);
    });
}
