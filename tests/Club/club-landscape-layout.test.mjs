import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(clientRoot, relative), 'utf8');

const formManager = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
assert.ok(formManager.includes('setContentSize(1280, 720)'), 'modal mask must use the 1280x720 design safe area');
assert.ok(formManager.includes('adaptLegacyFullscreenForm(node, path)'), 'fullscreen fitting must know the requested form path');
assert.ok(formManager.includes('this.isClubFullscreenForm(path)'), 'club forms must have their own fullscreen path branch');
assert.ok(formManager.includes("path.startsWith('club/default/')"), 'default club forms must skip generic legacy scaling');
assert.ok(formManager.includes("path.startsWith('club/skin-1/')"), 'skin-1 club forms must skip generic legacy scaling');
assert.ok(formManager.includes("path.startsWith('club/skin-2/')"), 'skin-2 club forms must skip generic legacy scaling');
assert.ok(formManager.includes('root.setScale(1, 1, 1)'), 'club fullscreen forms must preserve 1:1 landscape coordinates');

const adapter = read('assets/Club/Code/Runtime/LegacyClubLandscapeAdapter.ts');
assert.ok(adapter.includes('adaptClubMainLandscape'), 'club main must refresh prefab widgets after mounting');
assert.ok(adapter.includes('normalizeClubRoot(root);'), 'club main hit testing must share the 1280x720 root coordinates');
assert.ok(!adapter.includes("coverBackground(root, 'bg')"), 'club main background must not be resized in runtime code');
assert.ok(!adapter.includes("setScreenRect(root, 'bottom/"), 'club main buttons must not receive runtime coordinates');
assert.ok(adapter.includes("clampScreenButton(root, 'btn_close', 20);"),
    'legacy modal fallback remains isolated from the prefab-driven club main');

const main = read('assets/Club/Code/Runtime/LegacyClubMainController.ts');
assert.ok(main.includes("from './LegacyClubLandscapeAdapter'"), 'club main must import the landscape adapter');
assert.ok((main.match(/adaptClubMainLandscape\(form\.node\)/g) ?? []).length >= 2,
    'club main must align visual and input coordinates on create and show');
assert.ok((main.match(/adaptClubModalLandscape\(form\.node\)/g) ?? []).length >= 6,
    'club homepage popups must adapt on create/show paths');

const entry = read('assets/Club/Code/Runtime/LegacyClubEntryController.ts');
assert.ok(entry.includes("from './LegacyClubLandscapeAdapter'"), 'club entry pages must import the landscape adapter');
assert.ok((entry.match(/adaptClubModalLandscape\(form\.node\)/g) ?? []).length >= 6,
    'club entry pages must adapt on create/show so root input hit areas stay inside 1280x720');

const member = read('assets/Club/Code/Runtime/LegacyClubMemberController.ts');
assert.ok(member.includes("from './LegacyClubLandscapeAdapter'"), 'member list must import the landscape adapter');
assert.ok((member.match(/adaptClubMemberLandscape\(form\.node\)/g) ?? []).length >= 2,
    'member list must adapt on bind and show');

for (const prefabPath of [
    'assets/Club/Prefab/ClubMain.prefab',
    'assets/Club/Prefab/Skin1ClubMain1.prefab',
    'assets/Club/Prefab/Skin2ClubMain2.prefab',
]) {
    const prefab = JSON.parse(read(prefabPath));
    const rootNodeId = prefab[0].data.__id__;
    const rootTransform = prefab.find((entry) => entry?.__type__ === 'cc.UITransform'
        && entry.node?.__id__ === rootNodeId);
    assert.deepEqual(rootTransform?._contentSize, { __type__: 'cc.Size', width: 1280, height: 720 },
        `${prefabPath} root must use the project design coordinate system`);
    const widgets = prefab.filter((entry) => entry?.__type__ === 'cc.Widget');
    const rootWidget = widgets.find((entry) => entry.node?.__id__ === rootNodeId);
    assert.equal(rootWidget?._alignFlags, 45, `${prefabPath} root must fill all four canvas edges`);
    const nodeName = (widget) => prefab[widget.node.__id__]?._name;
    const isSemanticMain = prefabPath.endsWith('/ClubMain.prefab');
    assert.ok(widgets.some((widget) => nodeName(widget) === (isSemanticMain ? 'Top' : 'top')),
        `${prefabPath} top must be widget-aligned`);
    assert.ok(widgets.some((widget) => nodeName(widget) === (isSemanticMain ? 'Bottom' : 'bottom')),
        `${prefabPath} bottom must be widget-aligned`);
    assert.ok(widgets.some((widget) => nodeName(widget) === (isSemanticMain ? 'RoomList' : 'right_main')),
        `${prefabPath} content must be widget-aligned`);
}

assert.ok(main.includes("node('ClubSwitcher')?.getComponent(Button)"),
    'semantic club switcher container button must be disabled before child input is bound');

console.log('club main prefab-owned landscape layout checks passed');
