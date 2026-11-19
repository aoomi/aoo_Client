import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
const source = readFileSync(new URL('../../assets/Club/Code/Runtime/LegacyUnionManagerController.ts', import.meta.url), 'utf8');
class EditBox {}
class Node {
 constructor(name, edit = false) { this.name = name; this.children = []; this.active = true; this.edit = edit ? { string: '', enabled: true, node: this } : null; }
 add(node) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; this.children.push(node); return node; }
 getComponent(type) { return type === EditBox ? this.edit : null; }
}
const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
assert.equal(compiled.diagnostics.length, 0);
const module = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})(require,module,module.exports)`, { module, require: name => name === 'cc' ? { EditBox } : { parseUnionTotalScore: value => Number(value) }, console });
const Controller = module.exports.LegacyUnionManagerController;
function fixture(name = 'ClubAllianceManager', permission = { unionPostType: 3 }) {
 const root = new Node(name); const admin = root.add(new Node('AdminRoomCardTip')); admin.add(new Node('EditBox', true)); const all = root.add(new Node('PlayRoomCardTip')); all.add(new Node('EditBox', true));
 const c = Object.create(Controller.prototype); Object.assign(c, { form: { node: root }, context: { id: 7, unionId: 9, ...permission }, roomCardFields: new WeakMap(), settingSession: 1, settingLoad: 0, settingSaving: false, disposers: [], rowDisposers: [], tips: [], calls: [] });
 c.desc = () => root; c.active = () => {}; c.edit = () => {}; c.check = () => {}; c.tip = async value => c.tips.push(value); c.editValue = (_, name) => name === 'NameEditBox' ? '联盟' : '2000'; c.numberValue = () => 0; c.checked = () => 1; c.isAlternateSkin = () => false;
 c.client = { request: async (route, packet) => { c.calls.push({ route, packet }); return { unionDiamondsAttentionMinister: 500, unionDiamondsAttentionAll: 0 }; } };
 c.bindRoomCardFields(root); return { c, root, admin, all };
}
test('saved merged prefab has distinct empty EditBoxes; old independent load and alias are absent', () => {
 const data = JSON.parse(readFileSync(new URL('../../assets/Club/Prefab/ClubAllianceManager.prefab', import.meta.url), 'utf8'));
 for (const name of ['AdminRoomCardTip', 'PlayRoomCardTip']) {
  const matches = data.filter(row => row.__type__ === 'cc.Node' && row._name === name); assert.equal(matches.length, 1);
  const edits = []; const visit = row => { for (const ref of row._components ?? []) if (data[ref.__id__].__type__ === 'cc.EditBox') edits.push(data[ref.__id__]); for (const ref of row._children ?? []) visit(data[ref.__id__]); }; visit(matches[0]); assert.equal(edits.length, 1); assert.equal(edits[0]._string, '');
 }
 assert.doesNotMatch(source, /UIClubDiamond|Prefab\/ClubDiamond/);
 assert.doesNotMatch(source, /this\.click\([^\n]*['"]btn_diamond['"]/);
 assert.match(source, /this\.active\(root, 'btn_diamond', false\)/);
});
test('reminder binding survives arbitrary nesting and rejects all duplicate candidate paths or missing inputs', () => {
 const { c, root, admin } = fixture(); root.add(new Node('Moved')).add(admin); admin.add(new Node('Inner')).add(admin.children[0]); c.bindRoomCardFields(root);
 const dup = admin.add(new Node('Other')); dup.add(new Node('EditBox', true)); assert.throws(() => c.bindRoomCardFields(root), error => /Inner\/EditBox/.test(error.message) && /Other\/EditBox/.test(error.message));
 dup.children = []; admin.children = []; assert.throws(() => c.bindRoomCardFields(root), /found 0/);
});
test('server fields map independently, preserve zero, and save original raw strings exactly once', async () => {
 const { c, root } = fixture(); await c.loadSetting(); const fields = c.roomCardFields.get(root); assert.equal(fields.admin.string, '500'); assert.equal(fields.all.string, '0');
 fields.admin.string = '0500'; fields.all.string = '100'; let finish; c.client.request = (route, packet) => { c.calls.push({ route, packet }); return route === 'union.CUnionSetConfig' ? new Promise(resolve => finish = resolve) : Promise.resolve(); };
 const save = c.saveSetting(); await c.saveSetting(); assert.equal(c.calls.filter(x => x.route === 'union.CUnionSetConfig').length, 1); finish(); await save;
 const packet = c.calls.find(x => x.route === 'union.CUnionChangeDimondsAttention').packet; assert.equal(packet.unionDiamondsAttentionMinister, '0500'); assert.equal(packet.unionDiamondsAttentionAll, '100'); assert.equal(packet.clubId, 7); assert.equal(packet.unionId, 9);
});
test('creator or minister can save; ordinary members cannot; default skin keeps its existing request contract', async () => {
 for (const permission of [{ unionPostType: 3 }, { unionPostType: 1, minister: 3 }, { unionPostType: 1, minister: 1 }]) {
  const { c, root, admin } = fixture('ClubAllianceManager', permission); await c.loadSetting(); await c.saveSetting(); const allowed = permission.unionPostType === 3 || permission.minister === 3; assert.equal(admin.active, allowed); assert.equal(c.roomCardFields.get(root).admin.enabled, allowed); assert.equal(c.calls.some(x => x.route === 'union.CUnionChangeDimondsAttention'), allowed);
 }
 const { c } = fixture('UnionManager'); await c.loadSetting(); await c.saveSetting(); assert.ok(c.calls.some(x => x.route === 'union.CUnionSetConfig')); assert.ok(!c.calls.some(x => x.route === 'union.CUnionChangeDimondsAttention'));
});
test('closed session ignores stale load and stale save notifications, and an unloaded form cannot save placeholders', async () => {
 const { c, root } = fixture(); await c.saveSetting(); assert.equal(c.calls.length, 0);
 let finish; c.client.request = () => new Promise(resolve => finish = resolve); const load = c.loadSetting(); c.form = null; c.releaseBindings(); finish({ unionDiamondsAttentionMinister: 999 }); await load; assert.equal(c.roomCardFields.get(root).admin.string, '');
 c.form = { node: root }; c.roomCardFields.get(root).ready = true; c.tips = []; c.client.request = route => route === 'union.CUnionSetConfig' ? new Promise(resolve => finish = resolve) : Promise.resolve(); const save = c.saveSetting(); c.form = null; c.releaseBindings(); finish(); await save; assert.equal(c.tips.length, 0); assert.equal(c.settingSaving, false);
});
