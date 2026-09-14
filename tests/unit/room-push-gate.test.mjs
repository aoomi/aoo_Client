import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/Common/Code/Runtime/state/RoomPushGate.ts'), 'utf8');
const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInThisContext(`(function(module,exports){${output}\n})`)(module, module.exports);
const { RoomPushGate } = module.exports;

test('room push gate rejects another room or play version', () => {
    const gate = new RoomPushGate();
    gate.bind('100001', 'v1');
    assert.equal(gate.accepts({ roomId: 100002, playVersion: 'v1' }, {}), false);
    assert.equal(gate.accepts({ roomId: 100001, playVersion: 'v2' }, {}), false);
    assert.equal(gate.accepts({ roomId: 100001, playVersion: 'v1' }, {}), true);
});

test('room push gate accepts nested authority and rejects state regression', () => {
    const gate = new RoomPushGate();
    gate.bind('100001', 'v1');
    assert.equal(gate.accepts({ stateVersion: 8, payload: { roomId: 100001, playVersion: 'v1' } }, {}), true);
    assert.equal(gate.accepts({ stateVersion: 7, payload: { roomId: 100001, playVersion: 'v1' } }, {}), false);
    assert.equal(gate.accepts({}, { roomId: '100001', playVersion: 'v1', stateVersion: 9 }), true);
});

test('rebinding a room resets the monotonic version fence', () => {
    const gate = new RoomPushGate();
    gate.bind('100001', 'v1');
    assert.equal(gate.accepts({ roomId: 100001, playVersion: 'v1', stateVersion: 20 }, {}), true);
    gate.bind('100002', 'v1');
    assert.equal(gate.accepts({ roomId: 100002, playVersion: 'v1', stateVersion: 1 }, {}), true);
});
