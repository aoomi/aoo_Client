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
    const prefab = JSON.parse(read('assets/Lobby/Prefab/NewMain.prefab'));
    const source = read('assets/Lobby/Code/LobbyScreenController.ts');
    const nodes = prefab.filter(item => item?.__type__ === 'cc.Node');
    const createRoom = nodes.find(item => item._name === 'btn_create_room');
    assert.ok(createRoom, 'btn_create_room must be serialized in NewMain.prefab');
    assert.equal(createRoom._active, false, 'design-time state remains owned by the lobby lifecycle');
    assert.ok(createRoom._components.some(ref => prefab[ref.__id__]?.__type__ === 'cc.Button'));
    const sprite = createRoom._components.map(ref => prefab[ref.__id__])
        .find(component => component?.__type__ === 'cc.Sprite');
    assert.equal(sprite?._spriteFrame?.__uuid__, '90106146-d030-4219-bb0b-62eaeb6d63f2@f9941');
    assert.equal(sprite?._sizeMode, 0, 'the existing create-room art must fit the preserved lobby card bounds');
    assert.equal(nodes.some(item => item._name === 'btn_create'), false);
    assert.match(source, /case 'btn_create_room':[\s\S]*openCreateRoomSelector\(\)/);
    assert.match(source, /openCreateRoomSelector\(\)[\s\S]*selector\.open\(\)/);
    assert.match(source, /main\/right_main\/btn_create_room/);
    assert.match(source, /private readonly boundLegacyButtons = new WeakSet<Node>\(\)/);
    assert.match(source, /private readonly viewportCapturedMainForms = new WeakSet<Node>\(\)/);
    assert.match(source, /this\.applyLegacyRuntimeVisibility\(main\.node\);[\s\S]*this\.bindMainLegacyButtons\(main\.node\);/);
    assert.match(source, /if \(this\.boundLegacyButtons\.has\(node\)\) \{[\s\S]*return;[\s\S]*this\.boundLegacyButtons\.add\(node\);/);
    assert.match(source, /const supportedEntryNames = new Set\(\['btn_create_room', 'btn_join'\]\)/);
    assert.match(source, /this\.installMainEntryViewportCapture\(formRoot\)/);
    assert.doesNotMatch(source, /installCreateRoomViewportCapture/);
    assert.match(source, /window\.addEventListener\('mouseup', captureDomPointer, true\)/);
    assert.match(source, /view\.getViewportRect\(\)/);
    assert.match(source, /event\.clientX - bounds\.left - viewport\.x/);
    assert.equal([...source.matchAll(/window\.addEventListener\('mouseup', captureDomPointer, true\)/g)].length, 1);
    assert.match(source, /transform\?\.getBoundingBoxToWorld\(\)\.contains\(location\)/);
    assert.doesNotMatch(source, /case 'btn_create':/);
    assert.doesNotMatch(source, /btn_create_room[\s\S]{0,120}toggleMorePanel/);
});

test('the selector retains authoritative create, duplicate guard, close, and failure feedback', () => {
    const selector = read('assets/Modules/CreateRoom/Code/PlaySelectorController.ts');
    const prefab = JSON.parse(read('assets/Lobby/Prefab/create_Room.prefab'));
    const nodes = prefab.filter(item => item?.__type__ === 'cc.Node');
    const createRoom = nodes.find(item => item._name === 'btn_create_room');
    const createRoomLabel = nodes.find(item => item._name === 'CreateRoomLabel');
    assert.match(selector, /FORM_PATH = 'lobby\/create_Room'/);
    assert.match(selector, /zOrder: 12, modal: false/);
    assert.doesNotMatch(selector, /blockBackgroundInput|propagationStopped/);
    assert.match(selector, /showCreateFeedback\(validation\.message\)/);
    assert.match(selector, /this\.setLabel\(CREATE_BUTTON_PATH, text\)/);
    assert.match(selector, /if \(this\.submitting\) return/);
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
    assert.match(selector, /gameCode\.toLowerCase\(\) === 'pdk'/);
    assert.doesNotMatch(selector, /gameCode\.toLowerCase\(\) === 'njpdk'/);
    assert.match(selector, /private runtimeFamily/);
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
