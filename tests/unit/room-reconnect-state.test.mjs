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

test('reconnect restores every event after lastSeq and updates the UI once complete', async () => {
    const store = new stores.AuthoritativeRoomStore();
    store.replaceSnapshot({ roomId: 7, playVersion: 'v1', eventSeq: 3, stateVersion: 3, score: 1 });
    const requests = [];
    const client = { request: async (_id, body) => {
        requests.push(body);
        return { viewerSnapshot: { score: 1 }, events: [
            { sequence: 4, messageId: 'score', payload: { score: 2 } },
            { sequence: 5, messageId: 'score', payload: { score: 3 } },
        ], serverSeq: 5, stateVersion: 5, playVersion: 'v1', hasMore: false };
    } };
    const calls = [];
    const controller = new reconnect.RoomReconnectController(client, store, {
        recovering: () => calls.push('recovering'), recovered: () => calls.push('recovered'),
        recoveryFailed: () => calls.push('failed'),
    }, (state, event) => ({ ...state, eventSeq: event.sequence, stateVersion: event.sequence, score: event.payload.score }),
    { roomId: 7, playVersion: 'v1', reconnectToken: 'secret' });
    assert.equal((await controller.reconnect()).score, 3);
    assert.equal(requests[0].lastServerSeq, 3);
    assert.deepEqual(calls, ['recovering', 'recovered']);
});

test('non-monotonic sequences and play-version conflicts are rejected without recovered callback', async () => {
    for (const response of [
        { viewerSnapshot: {}, events: [{ sequence: 2, messageId: 'x', payload: {} }, { sequence: 2, messageId: 'x', payload: {} }], serverSeq: 2, stateVersion: 2, playVersion: 'v1', hasMore: false },
        { viewerSnapshot: {}, events: [], serverSeq: 0, stateVersion: 0, playVersion: 'v2', hasMore: false },
    ]) {
        const store = new stores.AuthoritativeRoomStore();
        let failed = 0;
        const controller = new reconnect.RoomReconnectController({ request: async () => response }, store, {
            recovering() {}, recovered() { assert.fail('must not recover'); }, recoveryFailed() { failed += 1; },
        }, (state) => state, { roomId: 7, playVersion: 'v1', reconnectToken: 'secret' });
        await assert.rejects(controller.reconnect());
        assert.equal(failed, 1);
    }
});

test('store rejects stale state versions', () => {
    const store = new stores.AuthoritativeRoomStore();
    store.replaceSnapshot({ roomId: 1, playVersion: 'v1', eventSeq: 4, stateVersion: 8 });
    assert.throws(() => store.replaceSnapshot({ roomId: 1, playVersion: 'v1', eventSeq: 4, stateVersion: 7 }), /stale room state version/);
});
