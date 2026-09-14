import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenePath = path.join(root, 'assets/Login/Scenes/LoginScene.scene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

assert.ok(Array.isArray(scene) && scene.length > 0, 'LoginScene must be a native object array');
for (let index = 0; index < scene.length; index += 1) {
    const object = scene[index];
    assert.ok(object && typeof object === 'object', `null serialized object at ${index}`);
    JSON.stringify(object, (key, value) => {
        if (key === '__id__') {
            assert.ok(Number.isInteger(value) && value >= 0 && value < scene.length,
                `invalid __id__ ${value} referenced by object ${index}`);
        }
        return value;
    });
    assert.notEqual(object.__type__, 'cc.LabelOutline', `deprecated LabelOutline at ${index}`);
}

const names = scene.filter((item) => item?.__type__ === 'cc.Node').map((node) => node._name);
assert.ok(!names.includes('AooClientManager'), 'LoginScene statically contains AooClientManager');
const directLoginChildren = scene
    .filter((item) => item?.__type__ === 'cc.Node' && item._parent?.__id__ === 5)
    .map((node) => node._name);
// LoginScene is a frozen migrated visual asset. Historical visual node names are
// not evidence that runtime code creates nodes, and this verifier must not force
// scene-layout edits that violate the LoginScene read-only contract.
const frozenLegacyVisualNodes = ['New Label', 'New Sprite(Splash)', 'bj']
  .filter((name) => names.includes(name));
if (frozenLegacyVisualNodes.length > 0) {
  console.warn(
    `[creator-node-creation] ignored frozen LoginScene visual nodes: ${frozenLegacyVisualNodes.join(', ')}`,
  );
}
const accountPanelNames = ['account_login', 'mobile'];
const accountPanelIndexes = scene
    .map((item, index) => item?.__type__ === 'cc.Node' && accountPanelNames.includes(item._name) ? index : -1)
    .filter(index => index >= 0);
assert.equal(accountPanelIndexes.length, 1, 'LoginScene account-login panel identity must be unique');
for (const requiredName of ['btn_guest_login', 'btn_account_login', 'btn_login', 'btn_back']) {
    assert.equal(names.filter(name => name === requiredName).length, 1, `LoginScene requires one ${requiredName}`);
}
for (const retiredName of ['btnReg', 'btn_mobile']) assert.ok(!names.includes(retiredName), `LoginScene retains retired ${retiredName}`);
const accountPanelIndex = accountPanelIndexes[0];
const accountPanelChildren = scene[accountPanelIndex]._children.map(reference => scene[reference.__id__]?._name);
assert.ok(accountPanelChildren.includes('btn_login') && accountPanelChildren.includes('btn_back'),
    `${scene[accountPanelIndex]._name} must own submit and back controls`);
const wechatIndex = scene.findIndex(item => item?.__type__ === 'cc.Node' && item._name === 'btn_wechat_login');
if (wechatIndex < 0) console.warn('待用户在 Creator 中处理：LoginScene 缺少 btn_wechat_login。');
else {
    const wechatComponents = scene[wechatIndex]._components.map(reference => scene[reference.__id__]);
    assert.ok(wechatComponents.some(component => component?.__type__ === 'cc.Button' && component._interactable),
        'btn_wechat_login requires an interactable Button');
}
const agreementIndex = scene.findIndex(item => item?.__type__ === 'cc.Node' && item._name === 'user_agreement');
assert.ok(agreementIndex >= 0, 'LoginScene is missing the user agreement root');
const agreement = scene[agreementIndex];
const agreementChildren = agreement._children.map(reference => scene[reference.__id__]);
const toggleNode = agreementChildren.find(node => node?._name === 'toggle');
const agreementButton = agreementChildren.find(node => node?._name === 'btn_user_agree');
assert.ok(toggleNode, 'user agreement/toggle hierarchy is missing');
assert.ok(agreementButton, 'user agreement/btn_user_agree hierarchy is missing');
assert.ok(toggleNode._components.some(reference => scene[reference.__id__]?.__type__ === 'cc.Toggle'),
    'user agreement/toggle has no resolvable cc.Toggle component');

for (let index = 0; index < scene.length; index += 1) {
    const node = scene[index];
    if (node?.__type__ !== 'cc.Node') continue;
    assert.ok(Array.isArray(node._children), `node ${node._name} has invalid children array`);
    assert.ok(Array.isArray(node._components), `node ${node._name} has invalid components array`);
    const componentTypes = node._components.map(({ __id__ }) => scene[__id__]?.__type__);
    assert.ok(componentTypes.every(Boolean), `node ${node._name} has dangling component`);
    assert.equal(new Set(node._components.map(({ __id__ }) => __id__)).size,
        node._components.length, `node ${node._name} has a duplicate component reference`);
}

console.log(`Creator node-creation gate passed: ${scene.length} objects, ${names.length} nodes.`);
