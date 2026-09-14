import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const root = path.resolve(import.meta.dirname, '../..');

function compile(relativePath, dependencies = {}) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: relativePath })(
        specifier => dependencies[specifier] ?? (() => { throw new Error(`unexpected import ${specifier}`); })(),
        module, module.exports,
    );
    return module.exports;
}

const lifecycle = compile('assets/Common/Code/Runtime/core/LifecycleScope.ts');

test('LifecycleScope runs every cleanup and aggregates failures', () => {
    const scope = new lifecycle.LifecycleScope();
    const calls = [];
    scope.open();
    scope.own(() => calls.push('first'));
    scope.own(() => { calls.push('failure'); throw new Error('broken cleanup'); });
    scope.own(() => calls.push('last'));
    assert.throws(() => scope.close(), AggregateError);
    assert.deepEqual(calls, ['last', 'failure', 'first']);
    assert.doesNotThrow(() => scope.close());
});

test('ResettablePool caps retained views and destroys all leased views on clear', () => {
    const views = [];
    const pool = new lifecycle.ResettablePool(() => {
        const view = { reset() {}, release() {}, destroy() { this.destroyed = true; }, destroyed: false };
        views.push(view);
        return view;
    }, 1);
    const first = pool.acquire(1);
    const second = pool.acquire(2);
    pool.release(first);
    pool.release(second);
    assert.equal(views.filter(view => view.destroyed).length, 1);
    const leased = pool.acquire(3);
    pool.clear();
    assert.equal(leased.destroyed, true);
});

test('AssetLoader balances repeated references to the same cached asset', async () => {
    class Asset {
        refs = 0;
        addRef() { this.refs += 1; }
        decRef() { this.refs -= 1; }
    }
    const cached = new Asset();
    const cc = {
        Asset,
        AssetManager: class {}, AudioClip: class extends Asset {}, AudioSource: class {}, Node: class {},
        assetManager: {},
        resources: { load(_path, _type, callback) { callback(null, cached); } },
    };
    const infrastructure = compile('assets/Common/Code/UI/Infrastructure.ts', {
        cc,
        '../Runtime/core/LifecycleScope': lifecycle,
    });
    const loader = new infrastructure.AssetLoader();
    await loader.load('shared', Asset);
    await loader.load('shared', Asset);
    assert.equal(cached.refs, 2);
    loader.release(cached);
    assert.equal(cached.refs, 1);
    loader.releaseAll();
    assert.equal(cached.refs, 0);
});

test('NodePool enforces capacity and destroys borrowed nodes on clear', () => {
    class Node {
        isValid = true;
        active = false;
        addChild() {}
        removeFromParent() {}
        destroy() { this.isValid = false; }
    }
    class Component {}
    class Label {}
    const decorator = () => value => value;
    const presentation = compile('assets/Common/Code/UI/Presentation.ts', {
        cc: { _decorator: { ccclass: decorator, property: decorator }, Component, Label, Node },
    });
    const created = [];
    const pool = new presentation.NodePool(() => {
        const node = new Node();
        created.push(node);
        return node;
    }, () => undefined, 1);
    const first = pool.acquire();
    const second = pool.acquire();
    pool.release(first);
    pool.release(second);
    assert.equal(created.filter(node => !node.isValid).length, 1);
    const leased = pool.acquire();
    pool.clear();
    assert.equal(leased.isValid, false);
});
