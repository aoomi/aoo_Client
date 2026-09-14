import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(clientRoot, relative), 'utf8');

const mainControllerPath = 'assets/Club/Code/Runtime/LegacyClubMainController.ts';
const main = read(mainControllerPath);
const member = read('assets/Club/Code/Runtime/LegacyClubMemberController.ts');
const roomManagement = read('assets/Club/Code/Runtime/LegacyClubRoomManagementController.ts');
const unionManagement = read('assets/Club/Code/Runtime/LegacyUnionManagerController.ts');

const legacyMeta = JSON.parse(read('assets/Common/Atlas/Legacy.meta'));
assert.equal(legacyMeta.userData?.isBundle, true, 'legacy atlas must be runtime-loadable as a bundle');
assert.equal(legacyMeta.userData?.bundleName, 'legacy-ui', 'legacy atlas bundle must keep the legacy-ui name');

assert.ok(main.includes("assetManager.loadBundle(name"), 'club skin runtime must load skin assets from bundles');
assert.ok(main.includes('assetManager.loadAny<SpriteFrame>(uuid'), 'club skin runtime needs uuid fallback loading');
assert.ok(main.includes('resources.load(spec.resourcePath'), 'club skin runtime should keep resource-path compatibility');
assert.ok(main.includes('setSpriteFrame(sprite, frame)'), 'skin application must preserve sprite sizing while swapping frames');
assert.ok(main.includes('adaptClubMainLandscape'), 'club main must refresh prefab widgets after mounting');
assert.ok(!main.includes('resources.load(`legacy-ui/assets/texture/clubmain/${names[index]}/spriteFrame`'),
    'background switching must not use the stale resources-only path');

function parseSkinSpecs(constName) {
    const match = main.match(new RegExp(`const ${constName}: readonly ClubSkinSpriteSpec\\[\\] = \\[([\\s\\S]*?)\\];`));
    assert.ok(match, `${constName} block missing`);
    const specs = [];
    const entry = /\{\s*label: '([^']+)',\s*resourcePath: '([^']+)',\s*bundlePath: '([^']+)',\s*spriteUuid: '([^']+)',\s*\}/g;
    for (const item of match[1].matchAll(entry)) {
        specs.push({
            label: item[1],
            resourcePath: item[2],
            bundlePath: item[3],
            spriteUuid: item[4],
        });
    }
    return specs;
}

const backgrounds = parseSkinSpecs('CLUB_BACKGROUND_SKINS');
assert.deepEqual(backgrounds.map((spec) => spec.label),
    ['bg02', 'bg01', 'bg04', 'bg03', 'bg05', 'bg06', 'bg07', 'bg08'],
    'background buttons must keep the 2.22 serialized skin order');

const tables = parseSkinSpecs('CLUB_TABLE_SKINS');
assert.deepEqual(tables.map((spec) => spec.label),
    ['img_mjz（01）', 'img_mjz（02）', 'img_mjz（03）', 'img_zz0402',
        'puke', 'desk_1_1_2', 'desk_1_2_2', 'desk_1_2_3'],
    'table buttons must keep the 2.22 serialized skin order');

for (const spec of [...backgrounds, ...tables]) {
    assert.ok(spec.resourcePath.endsWith('/spriteFrame'), `${spec.label} resource path must target SpriteFrame`);
    assert.ok(spec.bundlePath.endsWith('/spriteFrame'), `${spec.label} bundle path must target SpriteFrame`);
    const withoutSubAsset = spec.bundlePath.replace(/\/spriteFrame$/, '');
    const stem = path.join(clientRoot, 'assets/Common/Atlas/Legacy', withoutSubAsset);
    const metaPath = ['.png.meta', '.jpg.meta', '.jpeg.meta'].map((suffix) => `${stem}${suffix}`)
        .find((candidate) => fs.existsSync(candidate));
    assert.ok(metaPath, `${spec.label} source meta missing for ${withoutSubAsset}`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert.equal(meta.subMetas?.f9941?.uuid, spec.spriteUuid,
        `${spec.label} SpriteFrame UUID must match source meta`);
}

function prefabNodes(relative) {
    const prefab = JSON.parse(read(relative));
    const rootId = prefab[0]?.data?.__id__;
    assert.ok(Number.isInteger(rootId), `${relative} root id missing`);
    const nodes = [];
    const walk = (id, prefix = '') => {
        const node = prefab[id];
        if (!node || node.__type__ !== 'cc.Node') return;
        const nodePath = prefix ? `${prefix}/${node._name}` : node._name;
        const button = (node._components ?? []).some((componentRef) => {
            const component = prefab[componentRef.__id__];
            return component?.__type__ === 'cc.Button';
        });
        nodes.push({ path: nodePath, name: node._name, button, active: node._active !== false });
        for (const child of node._children ?? []) walk(child.__id__, nodePath);
    };
    walk(rootId);
    const rootName = nodes[0]?.name;
    return nodes.map((node) => ({
        ...node,
        relativePath: node.path.startsWith(`${rootName}/`) ? node.path.slice(rootName.length + 1) : node.path,
    }));
}

const skinFormNodes = prefabNodes('assets/Club/Prefab/ClubHuanPi.prefab');
for (let index = 1; index <= 8; index += 1) {
    assert.ok(skinFormNodes.some((node) => node.button && node.relativePath.endsWith(`bglist/btn_bg${index}`)),
        `skin form background button ${index} missing`);
    assert.ok(skinFormNodes.some((node) => node.relativePath.endsWith(`bglist/btn_bg${index}/check`)),
        `skin form background check ${index} missing`);
    assert.ok(skinFormNodes.some((node) => node.button && node.relativePath.endsWith(`tblist/btn_tb${index}`)),
        `skin form table button ${index} missing`);
    assert.ok(skinFormNodes.some((node) => node.relativePath.endsWith(`tblist/btn_tb${index}/on`)),
        `skin form table on state ${index} missing`);
    assert.ok(skinFormNodes.some((node) => node.relativePath.endsWith(`tblist/btn_tb${index}/off`)),
        `skin form table off state ${index} missing`);
}
assert.ok(main.includes('backgroundList?.getChildByName(`btn_bg${index + 1}`)'),
    'all background secondary buttons must be registered through the loop');
assert.ok(main.includes('tableList?.getChildByName(`btn_tb${index + 1}`)'),
    'all table secondary buttons must be registered through the loop');
assert.ok(main.includes("this.onClick(form.find('bg/btn_close')"), 'skin form close button must be registered');
assert.ok(!main.includes('skinButton.active = true'),
    'a skin button hidden by the prefab must stay hidden; forcing it active overlaps the create-room button');
assert.ok(main.includes("top.setSiblingIndex(top.parent.children.length - 1)"),
    'the expanded More menu must stay above the bottom toolbar hit layer');
for (const [source, label] of [[main, 'club main'], [roomManagement, 'room management'], [unionManagement, 'union management']]) {
    assert.ok(source.includes("forms.show('common/Create_Room'"), `${label} must open the installed unified create-room form`);
    assert.ok(!source.includes("forms.show('UIUnifiedPlaySelector'"), `${label} must not target the removed legacy form path`);
}

const memberListNodes = prefabNodes('assets/Club/Prefab/ClubMembers.prefab');
assert.ok(memberListNodes.some((node) => node.button && node.relativePath === 'btn_close'),
    'ClubUserList close button must exist at root btn_close');
assert.ok(!memberListNodes.some((node) => node.button && node.relativePath === 'bottom/btn_close'),
    'ClubUserList must not be tested against the stale bottom/btn_close path');
assert.ok(member.includes("form.find('btn_close')"),
    'ClubUserList close button must bind the actual root btn_close path');
assert.ok(member.includes("forms.close('ui/club/ClubMembers')"),
    'ClubMembers close button must close ClubMembers');
assert.ok(member.includes('control.active = this.pageType !== 0'),
    'join/exit audit rows must expose their agree/refuse controls');

const unionNoneNodes = prefabNodes('assets/Club/Prefab/UnionNone.prefab');
for (const buttonName of ['btn_create', 'btn_join']) {
    assert.ok(unionNoneNodes.some((node) => node.button && node.relativePath === buttonName),
        `UIUnionNone ${buttonName} button must exist at root`);
}
assert.ok(main.includes("if (path === 'ui/club/UIUnionNone') this.bindUnionNone(form);"),
    'UIUnionNone must install create/join entry bindings during form creation');
assert.ok(main.includes("forms.show('ui/club/UIUnionCreate', {"),
    'UIUnionNone create button must open the official UnionCreate form with current club context');
assert.ok(main.includes("forms.show('ui/club/UIJoinUnion', this.clubId())"),
    'UIUnionNone join button must open the official JoinUnion form with current clubId');

const invalidToggleSprites = [
    'd3507d64-e24e-44ce-a0ae-bbd988c53d9e@f9941',
    'e9a31ee3-5543-4b97-b4f8-47f61e3069fc@f9941',
];
const validToggleSprites = [
    JSON.parse(read('assets/Common/Atlas/CreateRoomV2/checkbox_bg.png.meta')).subMetas?.f9941?.uuid,
    JSON.parse(read('assets/Common/Atlas/CreateRoomV2/checkbox_check.png.meta')).subMetas?.f9941?.uuid,
];
for (const prefab of [
    'assets/Club/Prefab/ClubHuanPi.prefab',
    'assets/Club/Prefab/UnionManager.prefab',
    'assets/Club/Prefab/Skin2UnionManager2.prefab',
]) {
    const content = read(prefab);
    for (const uuid of invalidToggleSprites) {
        assert.ok(!content.includes(uuid), `${prefab} must not reference stale converted toggle uuid ${uuid}`);
    }
    for (const uuid of validToggleSprites) {
        assert.ok(content.includes(uuid), `${prefab} must reference valid toggle SpriteFrame uuid ${uuid}`);
    }
}

const secondaryContainers = [
    'top/right_btn/moreNode/childMore',
    'left_wanfa',
    'bottom/wanfa_select',
    'bottom/wanfa_select/table_list',
];
const mainPrefabs = [
    'assets/Club/Prefab/Skin1ClubMain1.prefab',
    'assets/Club/Prefab/Skin2ClubMain2.prefab',
];

for (const prefab of mainPrefabs) {
    const visibleSecondaryButtons = prefabNodes(prefab)
        .filter((node) => node.button && node.active)
        .filter((node) => secondaryContainers.some((container) => node.relativePath.startsWith(`${container}/`)))
        .filter((node) => !node.relativePath.includes('/demo/'));
    for (const button of visibleSecondaryButtons) {
        assert.ok(main.includes(`'${button.relativePath}'`),
            `${prefab} secondary button lacks controller binding: ${button.relativePath}`);
    }
}

console.log('club secondary button and skin asset checks passed');
