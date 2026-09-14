import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Games/Common/Code/Room/RoomController.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${output}\n})`) (
    () => ({}), module, module.exports,
);
const { RoomController, canLeaveRoom } = module.exports;

test('common exit policy ignores ready/pre-deal phases and blocks only dealt play', () => {
    assert.equal(canLeaveRoom({ cardsDealt: false, phase: 'COMPETE_DEALER', legacyState: 1 }), true);
    assert.equal(canLeaveRoom({ cardsDealt: false, phase: 'WAITING_EX' }), true);
    assert.equal(canLeaveRoom({ cardsDealt: true, phase: 'PLAYING' }), false);
    assert.equal(canLeaveRoom({ phase: 'FINISHED' }), true);
    assert.equal(canLeaveRoom({ legacyState: 1 }), false);
});

test('common room operations use only canonical V2 room requests and carry authority context', async () => {
    const calls = [];
    let version = 10;
    const client = { request: async (event, body) => {
        calls.push({ event, body });
        if (['room.state', 'room.invite', 'room.heartbeat', 'room.reconnect', 'room.join', 'room.leave'].includes(event)) return {};
        version += 1;
        return { accepted: true, stateVersion: version, authorityCommitted: event === 'room.kick' };
    } };
    const room = new RoomController(client, { roomId: '42', seatId: 1, playVersion: 'v3', stateVersion: 10 });
    await room.ready();
    await room.start();
    await room.updateSettings({ sound: false });
    await room.sendText(8);
    await room.sendVoice(99);
    await room.sendMagicExpression(3, 2);
    await room.invite();
    await room.requestDismiss();
    await room.voteDismiss('vote-1', true);
    await room.shuffle();
    await room.kick(2);
    await room.exit();
    assert.deepEqual(calls.map(call => call.event), [
        'room.ready', 'room.start', 'room.settings', 'room.quick_text', 'room.voice', 'room.magic_expression',
        'room.invite', 'room.dissolve_apply', 'room.dissolve_vote', 'room.shuffle', 'room.kick', 'room.leave',
    ]);
    assert.ok(calls.every(call => call.body.roomId === '42' && call.body.seatId === 1 && call.body.playVersion === 'v3'));
    assert.equal(calls.at(-1).body.expectedStateVersion, 20);
});

test('concurrent common-room writes are serialized on authoritative stateVersion', async () => {
    const expected = [];
    const room = new RoomController({ request: async (_event, body) => {
        expected.push(body.expectedStateVersion);
        await new Promise(resolve => setTimeout(resolve, 1));
        return { accepted: true, stateVersion: body.expectedStateVersion + 1 };
    } }, { roomId: '8', seatId: 1, playVersion: 'v1', stateVersion: 6 });
    await Promise.all([room.ready(), room.setTrusteeship(true), room.sendText(2)]);
    assert.deepEqual(expected, [6, 7, 8]);
});

test('authority version is monotonic and invalid input never reaches transport', async () => {
    let calls = 0;
    const room = new RoomController({ request: async () => { calls += 1; return { accepted: true, stateVersion: 4 }; } },
        { roomId: '7', seatId: 0, playVersion: 'v1', stateVersion: 4 });
    await assert.rejects(room.shuffle(), /ROOM_AUTHORITY_RESULT_INVALID/);
    assert.throws(() => room.sendVoice(0), /ROOM_ASSETID_INVALID/);
    assert.throws(() => room.sendMagicExpression(1, 100), /ROOM_TARGETSEATID_INVALID/);
    assert.throws(() => room.voteDismiss(' ', true), /ROOM_VOTEID_INVALID/);
    assert.equal(calls, 1);
});
