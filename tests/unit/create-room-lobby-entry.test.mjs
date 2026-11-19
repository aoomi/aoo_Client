import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative) {
    return readFileSync(path.join(clientRoot, relative), 'utf8');
}

test('the lobby create-room card is the single native entry to UnifiedPlaySelector', () => {
    const prefab = JSON.parse(read('assets/Lobby/Prefab/LobbyMain.prefab'));
    const source = read('assets/Lobby/Code/LobbyScreenController.ts');
    const nodes = prefab.filter(item => item?.__type__ === 'cc.Node');
    const createRoom = nodes.find(item => item._name === 'CreateRoom');
    assert.ok(createRoom, 'CreateRoom must be serialized in LobbyMain.prefab');
    assert.equal(createRoom._active, true, 'semantic entry remains visible in the authored lobby shell');
    assert.ok(createRoom._components.some(ref => prefab[ref.__id__]?.__type__ === 'cc.Button'));
    const sprite = createRoom._components.map(ref => prefab[ref.__id__])
        .find(component => component?.__type__ === 'cc.Sprite');
    assert.equal(sprite?._spriteFrame?.__uuid__, '90576c27-22d5-47cf-897a-f59265106918@3d633');
    assert.equal(sprite?._sizeMode, 2, 'the authored create-room art must retain the current lobby card sizing');
    assert.equal(nodes.some(item => item._name === 'btn_create'), false);
    assert.match(source, /case 'CreateRoom':[\s\S]*openCreateRoomSelector\(\)/);
    assert.match(source, /openCreateRoomSelector\(\)[\s\S]*selector\.open\(\)/);
    assert.match(source, /supportedEntryNames = new Set\(\['CreateRoom'/);
    assert.match(source, /private readonly boundLegacyButtons = new WeakSet<Node>\(\)/);
    assert.match(source, /private readonly viewportCapturedMainForms = new WeakSet<Node>\(\)/);
    assert.match(source, /this\.applyLegacyRuntimeVisibility\(main\.node\);[\s\S]*this\.bindMainLegacyButtons\(main\.node\);/);
    assert.match(source, /if \(this\.boundLegacyButtons\.has\(node\)\) \{[\s\S]*return;[\s\S]*this\.boundLegacyButtons\.add\(node\);/);
    assert.match(source, /const supportedEntryNames = new Set\(\['CreateRoom', 'JoinRoom'/);
    assert.match(source, /this\.installMainEntryViewportCapture\(formRoot\)/);
    assert.doesNotMatch(source, /installCreateRoomViewportCapture/);
    assert.match(source, /installMainEntryViewportCapture\(formRoot\)/);
    assert.doesNotMatch(source, /case 'btn_create':/);
    assert.doesNotMatch(source, /btn_create_room[\s\S]{0,120}toggleMorePanel/);
});

test('the selector retains authoritative create, duplicate guard, close, and failure feedback', () => {
    const selector = read('assets/Modules/CreateRoom/Code/PlaySelectorController.ts');
    const prefab = JSON.parse(read('assets/Modules/CreateRoom/Prefab/CreateRoom.prefab'));
    const nodes = prefab.filter(item => item?.__type__ === 'cc.Node');
    const createRoom = nodes.find(item => item._name === 'Btn_Create');
    const createRoomLabel = nodes.find(item => item._name === 'Label' && item._parent?.__id__ === prefab.indexOf(createRoom));
    assert.match(selector, /FORM_PATH = 'UICreateRoom'/);
    assert.match(selector, /zOrder: 12, modal: false/);
    assert.doesNotMatch(selector, /blockBackgroundInput|propagationStopped/);
    assert.match(selector, /showCreateFeedback\(validation\.message\)/);
    assert.match(selector, /this\.setLabel\(CREATE_BUTTON_PATH, text\)/);
    assert.match(selector, /if \(this\.disposed \|\| this\.submitting\)/);
    assert.match(selector, /const selectedGame = this\.selectedGame/);
    assert.match(selector, /gateway\.create\(selectedGame\.gameCode, submittedRules/);
    assert.match(selector, /创建房间失败，请重试/);
    assert.match(selector, /this\.forms\.close\(FORM_PATH\)/);
    assert.match(selector, /CLOSE_BUTTON_PATH = 'Top\/Btn_Close'/);
    assert.match(selector, /CREATE_BUTTON_PATH = 'Bottom\/Btn_Create'/);
    assert.match(selector, /RESET_BUTTON_PATH = 'Top\/Btn_Reset'/);
    assert.match(selector, /RULES_PATH = 'Rules'/);
    assert.match(selector, /Left\/FavoriteList\/ScrollView\/Viewport\/Content/);
    assert.doesNotMatch(selector, /MainPanel\/Actions|MainPanel\/RulesPanel|MainPanel\/FavoriteList/);
    assert.match(selector, /window\.addEventListener\('mouseup', captureWindowPointer, true\)/);
    assert.match(selector, /window\.addEventListener\('click', captureWindowPointer, true\)/);
    assert.match(selector, /const viewport = view\.getViewportRect\(\)/);
    assert.match(selector, /event\.clientX - bounds\.left - viewport\.x/);
    assert.match(selector, /bounds\.bottom - event\.clientY - viewport\.y/);
    assert.match(selector, /window\.removeEventListener\('mouseup', captureWindowPointer, true\)/);
    assert.match(selector, /window\.removeEventListener\('click', captureWindowPointer, true\)/);
    assert.match(selector, /private runtimeFamily/);
    assert.match(selector, /const normalized = String\(familyCode \?\? ''\)\.trim\(\)\.toLowerCase\(\)/);
    assert.ok(createRoom, 'the unified selector must keep one native create-room button');
    assert.ok(createRoomLabel, 'the create-room text must remain editable as a native Label');
    assert.equal(createRoomLabel._parent?.__id__, prefab.indexOf(createRoom));
    const label = createRoomLabel._components.map(ref => prefab[ref.__id__])
        .find(component => component?.__type__ === 'cc.Label');
    assert.equal(label?._string, '创建房间');
    const sprite = createRoom._components.map(ref => prefab[ref.__id__])
        .find(component => component?.__type__ === 'cc.Sprite');
    assert.equal(sprite?._spriteFrame?.__uuid__, 'c5fe3a60-9b35-4026-9dc6-08cfd5a6d682@f9941');
    assert.doesNotMatch(selector, /selectCity|selectRegion|legacy-data|CBaseGameIdList/);
    const presenter = read('assets/Modules/CreateRoom/Code/CreateRoomRulePresenter.ts');
    assert.doesNotMatch(presenter, /createRuntimeTemplate|createOptionPrototype/);
    assert.match(presenter, /Prefab 缺少 TemplateRoot/);
});

test('startup excludes gameplay and removed shared prefab bundles', () => {
    const atlasMeta = JSON.parse(read('assets/Common/Atlas.meta'));
    const bootstrap = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');
    assert.deepEqual(atlasMeta.userData, {});
    assert.doesNotMatch(bootstrap, /loadBootstrapBundle\(\s*'common-prefab'/);
    assert.doesNotMatch(bootstrap, /common-atlas|common-(?:longcard|mahjong|poker|wordcard)[_-]cards/);
});
