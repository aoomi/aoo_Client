import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function compile(relative) {
    const output = ts.transpileModule(read(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: relative })((id) => { throw new Error(`unexpected dependency ${id}`); }, module, module.exports);
    return module.exports;
}

test('AppError maps scoped numeric and symbolic protocol failures without losing raw code', () => {
    const { AppError } = compile('assets/Common/Code/Runtime/core/AppError.ts');
    assert.equal(AppError.fromProtocol(3008, 'room conflict').code, 'ROOM_STATE_CONFLICT');
    assert.equal(AppError.fromProtocol('HALL_COST_POLICY_MISSING', 'cost').code, 'PRICING_POLICY_MISSING');
    const error = AppError.fromUnknown(new Error('3010: authority unavailable'));
    assert.equal(error.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(error.legacyCode, '3010');
});

test('Protocol clients construct AppError at every V2 failure boundary', () => {
    const ws = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');
    const http = read('assets/Common/Code/Runtime/network/ProtocolHttpClient.ts');
    assert.match(ws, /AppError\.fromProtocol\(response\.code/);
    assert.match(ws, /ClientErrorCorrelation\.enrich\(AppError\.fromUnknown\(error\)/);
    assert.match(http, /AppError\.fromProtocol\(code/);
    assert.match(http, /ClientErrorCorrelation\.enrich\(AppError\.fromUnknown\(error\)/);
});
