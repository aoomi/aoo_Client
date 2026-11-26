import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const mountUrl = new URL('../../assets/Games/Common/Code/Room/CommonRoomShellMount.ts', import.meta.url);
const entriesUrl = new URL('../../assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts', import.meta.url);

class MockNode {
    constructor(name, ui = false) {
        this.name = name;
        this.ui = ui;
        this.isValid = true;
        this.active = true;
        this.activeInHierarchy = true;
        this.children = [];
        this.parent = null;
        this.layer = 1;
    }
    addChild(child) { child.parent = this; this.children.push(child); }
    destroy() {
        this.isValid = false;
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    }
    getComponent(type) { return type === UITransform && this.ui ? {} : null; }
    setSiblingIndex(index) {
        if (!this.parent) return;
        const siblings = this.parent.children.filter(child => child !== this);
        siblings.splice(index, 0, this);
        this.parent.children = siblings;
    }
}
class UITransform {}
class Prefab {}

function compileModule(source, require) {
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(`(function(require,module,exports){${output}\n})(require,module,module.exports);`, {
        require, module, console, Promise, WeakMap, Error,
    });
    return module.exports;
}

test('concurrent mounts share one shell and a destroyed owner can mount a fresh shell', async () => {
    const scene = new MockNode('Scene');
    const canvas = new MockNode('Canvas', true);
    scene.addChild(canvas);
    const callbacks = [];
    const bundle = { load: (_path, _type, callback) => callbacks.push(callback) };
    const cc = {
        assetManager: { getBundle: () => bundle, loadBundle: () => assert.fail('bundle already exists') },
        director: { getScene: () => scene },
        instantiate: () => new MockNode('CommonRoom', true),
        Node: MockNode,
        Prefab,
        UITransform,
    };
    const { mountCommonRoomShell } = compileModule(readFileSync(mountUrl, 'utf8'), specifier => {
        assert.equal(specifier, 'cc');
        return cc;
    });

    const first = mountCommonRoomShell(canvas);
    const second = mountCommonRoomShell(canvas);
    assert.equal(callbacks.length, 1, 'one in-flight bundle load per host');
    callbacks[0](null, new Prefab());
    const [firstRoot, secondRoot] = await Promise.all([first, second]);
    assert.equal(firstRoot, secondRoot);
    assert.equal(canvas.children.filter(child => child.name === 'CommonRoom').length, 1);

    firstRoot.destroy();
    const remounted = mountCommonRoomShell(canvas);
    assert.equal(callbacks.length, 2);
    callbacks[1](null, new Prefab());
    const replacement = await remounted;
    assert.notEqual(replacement, firstRoot);
    assert.equal(canvas.children.filter(child => child.name === 'CommonRoom').length, 1);
});

test('an aborted waiter rejects without destroying the root received by a live waiter', async () => {
    const source = readFileSync(entriesUrl, 'utf8');
    const start = source.indexOf('function mountCommonRoomShellCancellable');
    const end = source.indexOf('\nclass CommonRoomRuntimeLifecycle', start);
    assert.ok(start >= 0 && end > start);
    const functionSource = source.slice(start, end);
    let resolveMount;
    const root = { isValid: true, destroy() { this.isValid = false; } };
    const mounted = new Promise(resolve => { resolveMount = resolve; });
    const javascript = ts.transpileModule(`${functionSource}\nexports.mountCommonRoomShellCancellable = mountCommonRoomShellCancellable;`, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(`(function(module,exports,mountCommonRoomShell){${javascript}\n})(module,module.exports,mountCommonRoomShell);`, {
        module, mountCommonRoomShell: () => mounted, Promise, Error,
    });
    const mount = module.exports.mountCommonRoomShellCancellable;
    const abortedController = new AbortController();
    const liveController = new AbortController();
    const aborted = mount({}, abortedController.signal);
    const live = mount({}, liveController.signal);
    abortedController.abort();
    resolveMount(root);

    await assert.rejects(aborted, /ROOM_ORCHESTRATOR_ABORTED/);
    assert.equal(await live, root);
    assert.equal(root.isValid, true);
});
