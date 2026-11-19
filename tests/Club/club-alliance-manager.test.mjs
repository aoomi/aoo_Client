import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
class Button {}
class Node {
    constructor(name) { this.name = name; this.children = []; this.parent = null; this.active = false; this.button = false; }
    getComponent(type) { return type === Button && this.button ? {} : null; }
    getPathInHierarchy() { return `${this.parent ? this.parent.getPathInHierarchy() + '/' : ''}${this.name}`; }
    add(child) { if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1); this.children.push(child); child.parent = this; return child; }
    setSiblingIndex() {}
}
const errors = [], warnings = [];
function load(path, cc = {}) {
    const result = ts.transpileModule(read(path), { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    assert.equal(result.diagnostics?.length ?? 0, 0);
    const module = { exports: {} };
    vm.runInNewContext(`(function(require,module,exports){${result.outputText}\n})(require,module,module.exports)`, {
        module, require: name => name === 'cc' ? cc : {}, console: { error: (...args) => errors.push(args), warn: (...args) => warnings.push(args) },
    });
    return module.exports;
}
const Main = load('assets/Club/Code/Runtime/LegacyClubMainController.ts', { Node, Button }).LegacyClubMainController;
function fixture() {
    const data = JSON.parse(read('assets/Club/Prefab/ClubMain.prefab'));
    const nodes = new Map(data.flatMap((row, index) => row.__type__ === 'cc.Node' ? [[index, new Node(row._name)]] : []));
    for (const [index, node] of nodes) {
        for (const child of data[index]._children ?? []) node.add(nodes.get(child.__id__));
        node.button = (data[index]._components ?? []).some(ref => data[ref.__id__].__type__ === 'cc.Button');
    }
    return { node: [...nodes.values()].find(node => !node.parent), controller: Object.create(Main.prototype) };
}
test('saved ClubMain buttons bind by name and Button after arbitrary nesting; duplicates list every path', () => {
    const { node, controller: c } = fixture(); const form = { node };
    for (const name of ['Btn_Event', 'Btn_Invite', 'Btn_More', 'Btn_ShowPlayFilter', 'Btn_ClubList', 'Btn_Record', 'Btn_FindRoom', 'Btn_Member']) {
        const control = c.findMainNode(form, name); assert.ok(control, name);
        node.add(new Node(`moved_${name}`)).add(new Node('nested')).add(control);
        assert.equal(c.findMainNode(form, name), control);
    }
    const decoy = node.add(new Node('Btn_Event')); assert.equal(c.findMainNode(form, 'Btn_Event').button, true);
    decoy.button = true; errors.length = 0;
    assert.equal(c.findMainNode(form, 'Btn_Event'), null);
    assert.equal(errors[0][2].length, 2); assert.ok(errors[0][2].every(path => path.includes('Btn_Event')));
    assert.equal(c.findMainNode(form, 'Btn_Wechat'), null);
});
test('Btn_Event route opens current manager for joined club and retains unjoined flow; registry resolves current manager', async () => {
    const c = Object.create(Main.prototype), calls = [];
    c.clubId = () => 7; c.refreshCurrentClub = async () => ({ id: 7 }); c.handleUnionDissolved = () => {};
    c.forms = { show: (...args) => calls.push(args) }; c.currentClubContext = () => ({ unionId: 9 });
    await c.openUnionEntry(); assert.equal(calls.at(-1)[0], 'ui/club/ClubAllianceManager');
    c.currentClubContext = () => ({ unionId: 0 }); await c.openUnionEntry(); assert.equal(calls.at(-1)[0], 'ui/club/UIUnionNone');
    const registry = load('assets/Common/Code/Runtime/ui/ModulePrefabRegistry.ts');
    assert.equal(registry.resolveModulePrefabAsset('ui/club/ClubAllianceManager').asset, 'Prefab/ClubAllianceManager');
    assert.equal(registry.resolveModulePrefabAsset('ui/club_2/UIUnionManager_2').asset, 'Prefab/ClubAllianceManager');
    assert.equal(registry.resolveModulePrefabAsset('ui/club/UIUnionManager').asset, 'Prefab/ClubAllianceManager');
    assert.equal(registry.resolveModulePrefabAsset('ui/club/UIUnionManager').bundle, 'club');
});
test('More toggles saved MoreMenu after moving it to a different parent', () => {
    const { node, controller: c } = fixture(), form = { node }; const menu = c.findMainNode(form, 'MoreMenu');
    node.add(new Node('moved')).add(menu); let refreshes = 0; c.refreshMoreMenuLayout = () => refreshes++;
    c.togglePanel(form, 'MoreMenu'); assert.equal(menu.active, true); assert.equal(refreshes, 1);
    c.togglePanel(form, 'MoreMenu'); assert.equal(menu.active, false);
});
test('missing required button stops initialization before listeners bind', () => {
    const { node, controller: c } = fixture(); c.blockInput = () => {};
    const invite = c.findMainNode({ node }, 'Btn_Invite'); invite.button = false;
    assert.throws(() => c.bind({ node }, 'ui/club/ClubMain'), /required controls missing.*Btn_Invite/);
});
