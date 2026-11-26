import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const filename = path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/PdkRuntime.ts');
const source = fs.readFileSync(filename, 'utf8');
const javascript = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
}).outputText;

const module = { exports: {} };
const context = vm.createContext({
    module,
    exports: module.exports,
    require(specifier) {
        if (specifier === '../../../../../../Common/Code/Runtime/network/ProtocolClient') return {};
        if (specifier === './model/index') return {};
        if (specifier === './PdkAuthoritativeViewAdapter') {
            return { projectPdkAuthoritativeView: () => ({}) };
        }
        if (specifier === '../Regional/PdkGameplayCapabilities') {
            return { resolvePdkGameplayCapabilities: () => ({}) };
        }
        throw new Error(`unexpected dependency: ${specifier}`);
    },
    console,
    globalThis: {},
    Map,
    Set,
    Promise,
    Error,
    Number,
    String,
    Array,
    Object,
});
new vm.Script(javascript, { filename }).runInContext(context);
const { PdkRuntime } = module.exports;

function runtimeProbe(gameCode, response = { accepted: true }) {
    const calls = [];
    const applied = [];
    const runtime = Object.create(PdkRuntime.prototype);
    runtime.options = { gameCode, playerId: 99 };
    runtime.client = {
        request(event, body) {
            calls.push({ event, body });
            return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
        },
    };
    runtime.roomSet = { GetRoomSetProperty: () => 1 };
    runtime.room = {
        GetRoomProperty: () => 1,
        GetRoomConfigByProperty: () => 'cx-v1.0.0',
    };
    runtime.applyAuthoritativePacket = (packet, force) => applied.push({ packet, force });
    runtime.unwrapDispatchPayload = (packet) => packet;
    return { runtime, calls, applied };
}

for (const gameCode of ['liangshan2003', 'chengdu2001']) {
    test(`${gameCode} sends canonical ready without regional wrapping`, async () => {
        const authoritativePacket = { roomId: 284790, stateVersion: 1, seats: { 0: { ready: true } } };
        const { runtime, calls, applied } = runtimeProbe(gameCode, authoritativePacket);
        await runtime.request('common.room.ready_req', {
            roomID: 284790,
            posIndex: 0,
            idempotencyKey: `ready-${gameCode}`,
        });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].event, 'common.room.ready_req');
        assert.equal(calls[0].body.roomID, 284790);
        assert.equal(calls[0].body.posIndex, 0);
        assert.equal(calls[0].body.idempotencyKey, `ready-${gameCode}`);
        assert.equal(calls[0].body.action, undefined);
        assert.equal(calls[0].body.payload, undefined);
        assert.deepEqual(applied, [{ packet: authoritativePacket, force: false }]);
    });

    test(`${gameCode} does not project a rejected canonical ready`, async () => {
        const failure = new Error('stale stateVersion');
        const { runtime, applied } = runtimeProbe(gameCode, failure);
        await assert.rejects(
            runtime.request('common.room.ready_req', { roomID: 284790, posIndex: 0 }),
            failure,
        );
        assert.deepEqual(applied, []);
    });

    test(`${gameCode} keeps a regional action on its gameplay dispatch`, async () => {
        const { runtime, calls, applied } = runtimeProbe(gameCode);
        await runtime.request('poker.show_cards_req', { cards: [3, 4, 5] });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].event, `poker.${gameCode}.dispatch`);
        assert.equal(calls[0].body.action, 'poker.show_cards_req');
        assert.deepEqual(calls[0].body.payload, { cards: [3, 4, 5] });
        assert.deepEqual(applied, []);
    });
}
