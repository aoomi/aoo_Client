import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('club and alliance vocabulary is canonical on all three application surfaces', () => {
    const client = read('assets/Club/Code/Runtime/ClubBusinessVocabulary.ts');
    const admin = read('../Admin/src/config/clubBusinessVocabulary.ts');
    const server = read('../Server/server/LegacyCommDef/src/jsproto/c2s/cclass/union/AllianceBusinessTerms.java');
    for (const term of ['联盟', '盟主', '圈主', '盟友', '联盟管理', '圈管理', '合伙人', '队长', '成员']) {
        assert.match(client, new RegExp(term));
        assert.match(admin, new RegExp(term));
        assert.match(server, new RegExp(term));
    }
});

test('legacy numeric role contracts remain stable', () => {
    const client = read('assets/Club/Code/Runtime/ClubBusinessVocabulary.ts');
    const server = read('../Server/server/LegacyCommDef/src/jsproto/c2s/cclass/union/UnionDefine.java');
    assert.match(client, /Member = 0[\s\S]*Ally = 1[\s\S]*AllianceManager = 2[\s\S]*AllianceOwner = 3/);
    assert.match(server, /AllianceOwner = UNION_CREATE/);
    assert.match(server, /AllianceManager = UNION_MANAGE/);
    assert.match(server, /Ally = UNION_CLUB/);
    assert.match(server, /Member = UNION_GENERAL/);
});

test('club runtime uses new display terms and leaves compatibility aliases centralized', () => {
    const runtimeFiles = [
        'LegacyUnionCreateController.ts',
        'LegacyUnionInviteController.ts',
        'LegacyUnionManagerController.ts',
        'LegacyJoinUnionController.ts',
        'LegacyUnionInfoPopupController.ts',
        'LegacyClubPromotionController.ts',
    ];
    for (const file of runtimeFiles) {
        const source = read(`assets/Club/Code/Runtime/${file}`);
        assert.doesNotMatch(source, /赛事|推广员/);
    }
    assert.match(read('assets/Modules/Tournament/Code/CompetitionController.ts'), /赛事/);
});

test('club and alliance UI no longer display the generic creator title', () => {
    const sources = [
        'assets/Club/Code/Runtime/ClubBusinessVocabulary.ts',
        'assets/Club/Code/Runtime/LegacyUnionZhongzhiManagerController.ts',
        'assets/Club/Code/Runtime/LegacyUnionInviteController.ts',
        'assets/Club/Code/Runtime/LegacyUnionManagerController.ts',
        'assets/Club/Code/Runtime/LegacyClubMainController.ts',
        'assets/Club/Code/Runtime/LegacyClubMemberController.ts',
        'assets/Lobby/Code/ClubList/LobbyClubListController.ts',
        'assets/Club/Prefab/ClubPromoterSet.prefab',
        'assets/Club/Prefab/ClubAllianceManager.prefab',
        'assets/Club/Prefab/UnionManager.prefab',
    ].map(read);
    for (const source of sources) assert.doesNotMatch(source, /创建者/);
    assert.match(sources.join('\n'), /盟主/);
    assert.match(sources.join('\n'), /圈主/);
});

// Hydrate real serialized node paths; this harness proves controller behavior, not Creator rendering.
async function allianceHarness(prefab = 'ClubAllianceManager') {
    const [{ default: vm }, { default: ts }] = await Promise.all([
        import('node:vm'), import('../../node_modules/typescript/lib/typescript.js'),
    ]);
    class Toggle { static EventType = { TOGGLE: 'toggle' }; isChecked = false; setIsCheckedWithoutNotify(value) { this.isChecked = value; } }
    class EditBox { string = ''; }
    class Node {
        constructor(name) { this.name = name; this.children = []; this.active = true; this.isValid = true; this.components = new Map(); this.listeners = new Map(); }
        getChildByPath(path) { return path.split('/').reduce((node, name) => node?.children.find(child => child.name === name), this) ?? null; }
        getComponent(type) { return this.components.get(type) ?? null; }
        on(event, fn) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(fn); }
        off(event, fn) { this.listeners.get(event)?.delete(fn); }
        emit(event) { for (const fn of this.listeners.get(event) ?? []) fn(); }
    }
    const cc = { Node, Toggle, EditBox, Button: { EventType: { CLICK: 'click' } } };
    function load(file) {
        const result = ts.transpileModule(read(`assets/Club/Code/Runtime/${file}.ts`), {
            reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        });
        assert.equal(result.diagnostics?.length ?? 0, 0);
        const module = { exports: {} };
        vm.runInNewContext(`(function(require,module,exports){${result.outputText}\n})(require,module,module.exports)`, {
            module, require: name => name === 'cc' ? cc : name === './UnionTotalScore' ? load('UnionTotalScore') : {},
        });
        return module.exports;
    }
    const data = JSON.parse(read(`assets/Club/Prefab/${prefab}.prefab`));
    const nodes = new Map(data.flatMap((item, index) => item?.__type__ === 'cc.Node' ? [[index, new Node(item._name)]] : []));
    for (const [index, node] of nodes) {
        node.active = data[index]._active;
        node.children = (data[index]._children ?? []).map(ref => nodes.get(ref.__id__));
        for (const child of node.children) child.parent = node;
        for (const ref of data[index]._components ?? []) {
            const source = data[ref.__id__], type = source.__type__ === 'cc.Toggle' ? Toggle : source.__type__ === 'cc.EditBox' ? EditBox : null;
            if (type) { const component = new type(); component.node = node; node.components.set(type, component); }
        }
    }
    const rootNode = [...nodes.values()].find(node => !node.parent);
    const Controller = load('LegacyUnionManagerController').LegacyUnionManagerController;
    const controller = Object.create(Controller.prototype);
    const pages = ['Setting', 'Data', 'Member', 'MemberCheck', 'Wanfa', 'Message', 'RaceRank', 'ForbidTable', 'Management', 'ForbidGame', 'SetSkinType', 'RaceRankZhongzhi'];
    Object.assign(controller, { pages, disposers: [], rowDisposers: [], boundSettingToggles: new WeakSet(), form: { node: rootNode }, context: { clubId: 17, unionId: 23, unionPostType: 3, minister: 3 }, path: 'ui/club_2/UIUnionManager_2' });
    return { controller, rootNode, Toggle, EditBox, nodes };
}

test('alliance prefab exact setting paths preserve independent values and configuration packet', async () => {
    const { controller: c, rootNode, Toggle, EditBox } = await allianceHarness();
    const setting = c.desc(rootNode, 'btn_SettingNode');
    assert.equal(setting, rootNode.getChildByPath('Right/Set'));
    assert.equal(c.desc(rootNode, 'btn_close'), rootNode.getChildByPath('Popup/Btn_Close'));
    assert.equal(c.desc(rootNode, 'lb_Title'), rootNode.getChildByPath('Popup/Title/Lb_Title'));
    for (const [key, path] of Object.entries({ NameEditBox: 'AllianceName/EditBox', ClubCentEdit: 'AllianceTotalScore/EditBox', OutSportsEditBox: 'EliminationScore/EditBox', JoinToggle1: 'AllianceApplySubmit/Join/Yes', ExitToggle1: 'AllianceQuitApplySubmit/Exit/Yes', StateToggle1: 'AllianceStatus/Status/Yes', btn_SaveSetting: 'Btn_SaveSet', btn_ExitUnion: 'Btn_ExitAlliance', btn_DissolveUnion: 'Btn_DissolveAlliance' })) {
        assert.ok(c.desc(setting, key), key); assert.equal(c.desc(setting, key), setting.getChildByPath(path));
    }
    const config = { name: '测试联盟', join: 1, quit: 0, joinClubSameUnion: 1, tableNum: 20, state: 1, unionTotalScore: 98765, matchRate: 2, outSports: -321, prizeType: 2, ranking: 7, value: 11 };
    const requests = [], tips = [];
    c.client = { request: async (route, packet) => { requests.push({ route, packet: JSON.parse(JSON.stringify(packet)) }); return config; } };
    c.tip = async message => tips.push(message);
    await c.loadSetting();
    const listenerCount = c.disposers.length;
    await c.loadSetting();
    assert.equal(c.disposers.length, listenerCount, 'refresh does not add duplicate toggle listeners');
    assert.equal(c.desc(setting, 'NameEditBox').getComponent(EditBox).string, config.name);
    assert.equal(c.desc(setting, 'ClubCentEdit').getComponent(EditBox).string, '98765');
    assert.equal(c.desc(setting, 'OutSportsEditBox').getComponent(EditBox).string, '-321');
    await c.saveSetting();
    assert.deepEqual(requests.at(-1), { route: 'union.CUnionSetConfig', packet: { clubId: 17, unionId: 23, ...config } });
    assert.deepEqual(tips, ['修改成功']);
    const yes = c.desc(setting, 'JoinToggle1').getComponent(Toggle), no = c.desc(setting, 'JoinToggle2').getComponent(Toggle);
    yes.isChecked = true; yes.node.emit('toggle'); assert.equal(no.isChecked, false);
    c.desc(setting, 'ClubCentEdit').getComponent(EditBox).string = 'invalid';
    const count = requests.length; await c.saveSetting(); assert.equal(requests.length, count); assert.match(tips.at(-1), /联盟总分/);
    for (const dispose of c.disposers.splice(0)) dispose();
    assert.equal(yes.node.listeners.get('toggle').size, 0);
});

test('alliance prefab Toggle navigation switches once, keeps selection, preserves permissions and cleans listeners', async () => {
    const { controller: c, rootNode, Toggle } = await allianceHarness();
    const calls = [];
    c.loadSetting = () => calls.push('Setting'); c.loadMembers = () => calls.push('Member'); c.loadOnline = () => {};
    c.bindNavigation(rootNode);
    for (const page of c.pages) assert.ok(c.desc(rootNode, `btn_${page}`).getComponent(Toggle), page);
    c.openPage('Setting');
    const member = c.desc(rootNode, 'btn_Member').getComponent(Toggle);
    member.isChecked = true; member.node.emit('toggle');
    assert.deepEqual(calls, ['Setting', 'Member']);
    assert.equal(c.desc(rootNode, 'btn_MemberNode').active, true);
    assert.equal(c.desc(rootNode, 'btn_SettingNode').active, false);
    assert.equal(c.desc(rootNode, 'btn_Setting').getComponent(Toggle).isChecked, false);
    member.isChecked = false; member.node.emit('toggle'); assert.equal(member.isChecked, true);
    assert.equal(member.node.listeners.has('click'), false);
    c.context = { unionPostType: 0, minister: 0 }; c.configureNavigation(rootNode);
    assert.equal(c.desc(rootNode, 'btn_Setting').active, false); assert.equal(c.desc(rootNode, 'btn_Wanfa').active, true);
    c.context = { unionPostType: 3 }; c.configureNavigation(rootNode);
    assert.equal(c.desc(rootNode, 'btn_RaceRankZhongzhi').active, true); assert.equal(c.desc(rootNode, 'btn_Data').active, true);
    const data = c.desc(rootNode, 'btn_Data').getComponent(Toggle);
    data.isChecked = true; data.node.emit('toggle');
    assert.equal(c.desc(rootNode, 'btn_DataNode').active, true);
    assert.equal(c.desc(rootNode, 'btn_MemberNode').active, false);
    assert.equal(member.isChecked, false);
    for (const context of [{ unionPostType: 0 }, { unionPostType: 1 }]) { c.context = context; c.configureNavigation(rootNode); assert.equal(c.desc(rootNode, 'btn_Data').active, false); }
    for (const context of [{ unionPostType: 2 }, { unionPostType: 3 }, { minister: 1 }]) { c.context = context; c.configureNavigation(rootNode); assert.equal(c.desc(rootNode, 'btn_Data').active, true); }
    for (const dispose of c.disposers.splice(0)) dispose();
    member.isChecked = true; member.node.emit('toggle'); assert.equal(calls.length, 2);
});

test('alliance prefab default skin retains Button navigation and old setting lookup', async () => {
    const { controller: c, rootNode } = await allianceHarness('UnionManager');
    c.context = { unionPostType: 3, minister: 3 }; c.configureNavigation(rootNode);
    assert.equal(c.desc(rootNode, 'btn_Data')?.active ?? false, false);
    const calls = []; c.openPage = page => calls.push(page);
    c.bindNavigation(rootNode);
    const button = c.desc(rootNode, 'btn_Setting');
    button.emit('click'); assert.deepEqual(calls, ['Setting']);
    assert.ok(c.desc(c.desc(rootNode, 'btn_SettingNode'), 'NameEditBox'));
    for (const dispose of c.disposers.splice(0)) dispose();
    button.emit('click'); assert.equal(calls.length, 1);
});

test('alliance prefab relocated action buttons, close and destruction retain lifecycle behavior', async () => {
    const { controller: c, rootNode, nodes } = await allianceHarness();
    const registrations = new Map(), actions = [];
    c.forms = { register: (path, value) => registrations.set(path, value), close: path => actions.push(path) };
    for (const key of ['roomFee', 'createUnion', 'joinUnion', 'infoPopups', 'unionInvite', 'zhongzhiManager', 'zhongzhiRank', 'memberDetails']) c[key] = { install() {}, dispose() {} };
    c.install();
    const life = registrations.get('ui/club/ClubAllianceManager').lifecycle;
    c.saveSetting = () => actions.push('save'); c.confirmQuit = () => actions.push('quit'); c.confirmDissolve = () => actions.push('dissolve');
    life.onCreate(c.form);
    for (const [path, action] of [['Right/Set/Btn_SaveSet', 'save'], ['Right/Set/Btn_ExitAlliance', 'quit'], ['Right/Set/Btn_DissolveAlliance', 'dissolve']]) {
        rootNode.getChildByPath(path).emit('click'); assert.equal(actions.at(-1), action);
    }
    const help = rootNode.getChildByPath('Right/Set/Help/Node/helpNode');
    const before = help.active; rootNode.getChildByPath('Popup/Btns/btn_help').emit('click'); assert.equal(help.active, !before);
    rootNode.getChildByPath('Popup/Btn_Close').emit('click'); assert.equal(actions.at(-1), 'ui/club/ClubAllianceManager');
    let cleared = false; c.rowDisposers.push(() => { cleared = true; }); life.onClose();
    assert.equal(c.form, null); assert.equal(cleared, true);
    const form = { node: rootNode }; c.show = () => {};
    life.onShow(form); life.onShow(form);
    const saved = actions.filter(value => value === 'save').length;
    rootNode.getChildByPath('Right/Set/Btn_SaveSet').emit('click');
    assert.equal(actions.filter(value => value === 'save').length, saved + 1);
    life.onDestroy(form);
    c.dispose();
    for (const node of nodes.values()) for (const listeners of node.listeners.values()) assert.equal(listeners.size, 0, node.name);
});
