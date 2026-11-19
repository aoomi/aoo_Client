import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function compile(file, dependencies = {}) {
    const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: file })(
        (name) => dependencies[name] ?? (() => { throw new Error(`unexpected dependency ${name}`); })(), module, module.exports,
    );
    return module.exports;
}

const stores = compile('assets/Common/Code/Runtime/state/AuthoritativeRoomStore.ts');
const reconnect = compile('assets/Games/Common/Code/Room/RoomReconnectController.ts', {
    '../../../Common/Code/Runtime/state/AuthoritativeRoomStore': stores,
    '../../../Common/Code/Runtime/network/ProtocolClient': {},
});

const runtimeContext = (overrides = {}) => ({
    gameId: 2003,
    gameCode: 'liangshan2003',
    ownerId: '17',
    roomInstanceId: 'instance-7',
    lifecycleEpoch: '9007199254740992',
    fencingToken: '11',
    sessionId: 'session-7',
    stateVersion: 3,
    eventSequence: '3',
    eventId: 'reconnect-7',
    connectionGeneration: '1',
    releaseId: '19',
    indexGeneration: '4',
    regionCode: 'LS',
    sourceHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    ruleContentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    componentContentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    cardCodecVersion: 'card-v1',
    eventInterpreterVersion: 'events-v1',
    protocolVersion: 'protocol-v2',
    snapshotSchemaVersion: 'snapshot-v1',
    ...overrides,
});

const reconnectResponse = (context, overrides = {}) => ({
    viewerSnapshot: {}, events: [], serverSeq: 0, stateVersion: 0,
    playVersion: 'v1', hasMore: false,
    roomInstanceId: context.roomInstanceId,
    lifecycleEpoch: context.lifecycleEpoch,
    sessionId: context.sessionId,
    eventSequence: context.eventSequence,
    eventId: context.eventId,
    ...overrides,
});

test('reconnect restores every event after lastSeq and updates the UI once complete', async () => {
    const store = new stores.AuthoritativeRoomStore();
    store.replaceSnapshot({ roomId: 7, playVersion: 'v1', eventSeq: 3, stateVersion: 3, score: 1 });
    const requests = [];
    const client = { request: async (_id, body) => {
        requests.push(body);
        return { viewerSnapshot: { score: 1 }, events: [
            { sequence: 4, messageId: 'score', payload: { score: 2 } },
            { sequence: 5, messageId: 'score', payload: { score: 3 } },
        ], serverSeq: 5, stateVersion: 5, playVersion: 'v1', hasMore: false,
        roomInstanceId: 'instance-7', lifecycleEpoch: '9007199254740992',
        sessionId: 'session-7', eventSequence: '3', eventId: 'reconnect-7' };
    } };
    const calls = [];
    const controller = new reconnect.RoomReconnectController(client, store, {
        recovering: () => calls.push('recovering'), recovered: () => calls.push('recovered'),
        recoveryFailed: () => calls.push('failed'),
    }, (state, event) => ({ ...state, eventSeq: event.sequence, stateVersion: event.sequence, score: event.payload.score }),
    { roomId: 7, playVersion: 'v1', reconnectToken: 'secret', ...runtimeContext() });
    assert.equal((await controller.reconnect()).score, 3);
    assert.equal(requests[0].lastServerSeq, 3);
    assert.deepEqual(calls, ['recovering', 'recovered']);
});

test('non-monotonic sequences and play-version conflicts are rejected without recovered callback', async () => {
    for (const response of [
        reconnectResponse(runtimeContext({ eventSequence: '0', eventId: 'cursor-0', stateVersion: 0 }),
            { events: [{ sequence: 2, messageId: 'x', payload: {} }, { sequence: 2, messageId: 'x', payload: {} }], serverSeq: 2, stateVersion: 2 }),
        reconnectResponse(runtimeContext({ eventSequence: '0', eventId: 'cursor-0', stateVersion: 0 }),
            { serverSeq: 0, stateVersion: 0, playVersion: 'v2' }),
    ]) {
        const store = new stores.AuthoritativeRoomStore();
        let failed = 0;
        const controller = new reconnect.RoomReconnectController({ request: async () => response }, store, {
            recovering() {}, recovered() { assert.fail('must not recover'); }, recoveryFailed() { failed += 1; },
        }, (state) => state, { roomId: 7, playVersion: 'v1', reconnectToken: 'secret',
            ...runtimeContext({ eventSequence: '0', eventId: 'cursor-0', stateVersion: 0 }) });
        await assert.rejects(controller.reconnect());
        assert.equal(failed, 1);
    }
});

test('rejects old-generation, out-of-order, duplicate, and post-destroy recovery results', async () => {
    const base = runtimeContext({ eventSequence: '0', eventId: 'cursor-0', stateVersion: 0 });
    const cases = [
        ['old-generation', reconnectResponse(base, { lifecycleEpoch: '9007199254740991' })],
        ['out-of-order', reconnectResponse(base, {
            events: [{ sequence: 2, messageId: 'x', payload: {} }, { sequence: 1, messageId: 'x', payload: {} }],
            serverSeq: 2, stateVersion: 2,
        })],
        ['duplicate', reconnectResponse(base, {
            events: [{ sequence: 1, messageId: 'x', payload: {} }, { sequence: 1, messageId: 'x', payload: {} }],
            serverSeq: 1, stateVersion: 1,
        })],
    ];
    for (const [name, response] of cases) {
        const controller = new reconnect.RoomReconnectController(
            { request: async () => response }, new stores.AuthoritativeRoomStore(),
            { recovering() {}, recovered() { assert.fail(`${name} must not recover`); }, recoveryFailed() {} },
            (state) => state, { roomId: 7, playVersion: 'v1', reconnectToken: 'secret', ...base },
        );
        await assert.rejects(controller.reconnect(), name === 'old-generation'
            ? /ROOM_RECOVERY_RUNTIME_IDENTITY_CONFLICT/
            : /ROOM_RECOVERY_EVENT_GAP/);
    }

    const destroyed = new reconnect.RoomReconnectController(
        { request: async () => { throw new Error('ROOM_ORCHESTRATOR_RECONNECT_ROOM_DESTROYED'); } },
        new stores.AuthoritativeRoomStore(),
        { recovering() {}, recovered() { assert.fail('destroyed room must not recover'); }, recoveryFailed() {} },
        (state) => state, { roomId: 7, playVersion: 'v1', reconnectToken: 'secret', ...base },
    );
    await assert.rejects(destroyed.reconnect(), /ROOM_ORCHESTRATOR_RECONNECT_ROOM_DESTROYED/);
});

test('store rejects stale state versions', () => {
    const store = new stores.AuthoritativeRoomStore();
    store.replaceSnapshot({ roomId: 1, playVersion: 'v1', eventSeq: 4, stateVersion: 8 });
    assert.throws(() => store.replaceSnapshot({ roomId: 1, playVersion: 'v1', eventSeq: 4, stateVersion: 7 }), /stale room state version/);
});

test('preserves a 19-digit lifecycle epoch as a decimal string across reconnect and handoff', async () => {
    const lifecycleEpoch = '9223372036854775807';
    const context = runtimeContext({ lifecycleEpoch, eventSequence: '0', eventId: 'cursor-0', stateVersion: 0 });
    const requests = [];
    const client = { request: async (action, body) => {
        requests.push({ action, body });
        return action === 'room.reconnect'
            ? reconnectResponse(context, { serverSeq: 0, stateVersion: 0 })
            : { accepted: true, roomInstanceId: context.roomInstanceId, lifecycleEpoch,
                sessionId: 'session-8', stateVersion: 0, eventSequence: '0', eventId: 'cursor-0',
                connectionGeneration: '2' };
    } };
    const controller = new reconnect.RoomReconnectController(client, new stores.AuthoritativeRoomStore(), {
        recovering() {}, recovered() {}, recoveryFailed: assert.fail,
    }, (state) => state, { roomId: 7, playVersion: 'v1', reconnectToken: 'secret', ...context });

    await controller.reconnect();
    await controller.handoff('session-8', '2');
    assert.equal(requests[0].body.payload.lifecycleEpoch, lifecycleEpoch);
    assert.equal(requests[1].body.payload.lifecycleEpoch, lifecycleEpoch);
    assert.equal(requests[1].body.payload.stateVersion, '0');
});

test('rejects a stale handoff response after transport without committing identity', async () => {
    const lifecycleEpoch = '9223372036854775807';
    const context = runtimeContext({ lifecycleEpoch, eventSequence: '0', eventId: 'cursor-0', stateVersion: 4 });
    const controller = new reconnect.RoomReconnectController({
        request: async () => ({ accepted: true, roomInstanceId: context.roomInstanceId,
            lifecycleEpoch: '9223372036854775806', sessionId: 'session-8', stateVersion: 4,
            eventSequence: '0', eventId: 'cursor-0', connectionGeneration: '2' }),
    }, new stores.AuthoritativeRoomStore(), {
        recovering() {}, recovered() {}, recoveryFailed() {},
    }, (state) => state, { roomId: 7, playVersion: 'v1', reconnectToken: 'secret', ...context });

    await assert.rejects(controller.handoff('session-8', '2'), /ROOM_HANDOFF_RUNTIME_IDENTITY_CONFLICT/);
});

test('fails closed before transport when lifecycle epoch is not a decimal string', async () => {
    const requests = [];
    const client = { request: async (...args) => { requests.push(args); return {}; } };
    const numericLifecycleEpoch = 9223372036854775807;
    const controller = new reconnect.RoomReconnectController(client, new stores.AuthoritativeRoomStore(), {
        recovering: assert.fail, recovered: assert.fail, recoveryFailed() {},
    }, (state) => state, { roomId: 7, playVersion: 'v1', reconnectToken: 'secret',
        ...runtimeContext({ lifecycleEpoch: numericLifecycleEpoch }) });

    await assert.rejects(controller.reconnect(), /ROOM_RUNTIME_LIFECYCLE_EPOCH_INVALID/);
    await assert.rejects(controller.handoff('session-8', '2'), /ROOM_RUNTIME_LIFECYCLE_EPOCH_INVALID/);
    assert.equal(requests.length, 0);
});
