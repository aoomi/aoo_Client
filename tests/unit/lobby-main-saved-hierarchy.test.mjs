import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';

const source = fs.readFileSync(new URL('../../assets/Lobby/Code/LobbyScreenController.ts', import.meta.url), 'utf8');
const prefabURL = new URL('../../assets/Lobby/Prefab/LobbyMain.prefab', import.meta.url);
const prefabBytes = fs.readFileSync(prefabURL);
const prefabSHA = crypto.createHash('sha256').update(prefabBytes).digest('hex');
const prefab = JSON.parse(prefabBytes);
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
});
assert.equal((compiled.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);

class Button { static EventType = { CLICK: 'click' }; }
class Label {}
class Sprite {}
class UITransform { setContentSize() {} getBoundingBoxToWorld() { return { x: 0, y: 0, width: 1, height: 1 }; } }
class Layout {}
class Node {
    static EventType = { TOUCH_END: 'touch-end', MOUSE_UP: 'mouse-up' };
    constructor(name) {
        this.name = name; this.children = []; this.parent = null;
        this.active = true; this.isValid = true; this.scene = null;
        this.components = new Map(); this.listeners = new Map(); this._eventProcessor = {};
    }
    addComponent(type) { const c = new type(); c.node = this; this.components.set(type, c); return c; }
    addChild(node) { node.parent = this; this.children.push(node); }
    setPosition() {}
    get activeInHierarchy() { return this.active && (!this.parent || this.parent.activeInHierarchy); }
    getChildByName(name) { return this.children.find(child => child.name === name) ?? null; }
    getComponent(type) { return this.components.get(type) ?? null; }
    on(type, callback) { const list = this.listeners.get(type) ?? []; list.push(callback); this.listeners.set(type, list); }
    off(type, callback) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item !== callback)); }
    emit(type, ...args) { for (const callback of [...(this.listeners.get(type) ?? [])]) callback(...args); }
}
const cc = { Node, Button, Label, Sprite, UITransform, Layout };
let capturedMainLifecycle;
const captureSentinel = new Error('FIXTURE_STOP_BEFORE_NETWORK');
class FixtureFormManager {
    register(name, options) { if (name === 'UILobbyMain') capturedMainLifecycle = options.lifecycle; }
    addDefault() { throw captureSentinel; }
}
const sandbox = { module: { exports: {} }, console, Date, require(name) {
    if (name === 'cc') return cc;
    if (name.endsWith('/LegacyFormManager')) return { LegacyFormManager: FixtureFormManager };
    if (name.endsWith('/PlayerAvatarService')) return { PlayerAvatarService: { url: () => '' } };
    // Imported domains are not instantiated: only the real controller's UI methods run.
    return new Proxy({}, { get: () => class UnusedDependency {} });
} };
vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})(require,module,module.exports);`, sandbox);
const Controller = sandbox.module.exports.LobbyScreenController;

function fixture() {
    const nodes = new Map();
    prefab.forEach((entry, index) => {
        if (entry?.__type__ !== 'cc.Node') return;
        const node = new Node(entry._name); node.uuid = `fixture-${index}`; node.active = entry._active;
        for (const reference of entry._components ?? []) {
            const type = { 'cc.Button': Button, 'cc.Label': Label, 'cc.Sprite': Sprite, 'cc.UITransform': UITransform, 'cc.Layout': Layout }[prefab[reference.__id__].__type__];
            if (type) { const component = new type(); component.node = node; node.components.set(type, component); }
        }
        nodes.set(index, node);
    });
    for (const [index, node] of nodes) for (const child of prefab[index]._children ?? []) {
        const childNode = nodes.get(child.__id__); childNode.parent = node; node.children.push(childNode);
    }
    const root = [...nodes.values()].find(node => !node.parent);
    const controller = Object.create(Controller.prototype);
    Object.assign(controller, { disposed: false, lifecycleEpoch: 1, gameIds: [],
        boundLegacyButtons: new WeakSet(), viewportCapturedMainForms: new WeakSet(),
        mainButtonTapGuard: new Map(), mainActionBusy: new Set(), nodeDisposers: [] });
    const at = path => path.split('/').reduce((node, name) => node?.getChildByName(name), root);
    return { root, controller, at, nodes };
}

test('real visibility method accepts current saved semantic Button parents and retains More toggle state', () => {
    const { controller, root, at } = fixture();
    assert.equal(controller.findAll(root, node => node.name === 'GiftRoomCard').length, 1);
    assert.equal(controller.findAll(root, node => node.name === 'Support').length, 1);
    assert.doesNotThrow(() => controller.applyLegacyRuntimeVisibility(root));
    for (const path of ['Left/GiftRoomCard', 'Left/Support', 'Right/JoinClub', 'Right/CreateRoom', 'Right/JoinRoom']) {
        assert.equal(at(path)?.active, true, path);
        assert.ok(at(path).getComponent(Button), `${path} actual Button`);
    }
    assert.equal(at('Bottom/MoreMenu').active, false, 'More panel keeps its authored toggle lifecycle');
    assert.ok(at('Middle'), 'saved Middle is a root sibling');
});

test('exact saved paths distinguish wrapper from button and resolve the actual avatar Sprite and labels', () => {
    const { controller, root, at } = fixture();
    for (const name of ['GiftRoomCard', 'Support']) {
        assert.ok(at(`Left/${name}`).getComponent(Button), 'semantic parent is the current actual Button');
        assert.equal(controller.lobbyNode(root, 'Left', name), at(`Left/${name}`));
    }
    assert.ok(controller.lobbyNode(root, 'Top', 'Player', 'AvatarMask', 'Avatar').getComponent(Sprite));
    controller.setLobbyLabel(root, 'Top', ['Player', 'PlayerName'], 'fixture-name');
    assert.equal(at('Top/Player/PlayerName').getComponent(Label).string, 'fixture-name');
});

test('missing exact child fails even when another same-name node exists elsewhere', () => {
    const { controller, root, at } = fixture();
    const left = at('Left');
    left.children = left.children.filter(node => node.name !== 'GiftRoomCard');
    const decoy = new Node('GiftRoomCard'); decoy.parent = root; root.children.push(decoy);
    assert.throws(() => controller.applyLegacyRuntimeVisibility(root), /大厅缺少语义节点: Left\/GiftRoomCard/);
});

test('real button binding is idempotent and existing Gift/Support dispatch is not duplicated', async () => {
    const { controller, root, at, nodes } = fixture();
    let gifts = 0, support = 0;
    controller.giftingController = { open() { gifts++; return Promise.resolve(); } };
    controller.productionBridge = { support: { open() { support++; } } };
    controller.bindMainLegacyButtons(root);
    controller.bindMainLegacyButtons(root);
    for (const node of nodes.values()) if (node.getComponent(Button) && !['Practice', 'Agent', 'Bounty', 'Rebate', 'LuckyDraw', 'InviteRewards'].includes(node.name)) {
        for (const type of ['click', 'touch-end', 'mouse-up']) assert.equal(node.listeners.get(type)?.length, 1, `${node.name}:${type}`);
    }
    for (const path of ['Left/GiftRoomCard', 'Left/Support']) {
        for (const type of ['click', 'touch-end', 'mouse-up']) at(path).emit(type);
    }
    await Promise.resolve();
    assert.equal(gifts, 1); assert.equal(support, 1);
    for (const dispose of controller.nodeDisposers) dispose();
    assert.equal(at('Left/GiftRoomCard').listeners.get('click').length, 0);
});

test('component validation never changes the saved user prefab bytes', () => {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(prefabURL)).digest('hex'), prefabSHA);
});


test('real registered onCreate initializes every current saved label and binds Balances to the existing store once', async () => {
    const { controller, root, at } = fixture();
    controller.registerCommonSystemForms = () => {};
    controller.startupOptions = {};
    controller.role = { displayName: 'fixture', playerId: 7, roomCard: 12, gold: 34, raw: { gold: 99 }, headImageUrl: '' };
    controller.account = { displayName: 'fixture' };
    await assert.rejects(controller.mount(root), error => error === captureSentinel);
    assert.equal(typeof capturedMainLifecycle.onCreate, 'function');
    capturedMainLifecycle.onCreate({ node: root }); // Current saved graph, before the explicit deletion variant.
    const withdrawn = ['Practice', 'Agent', 'Bounty', 'Rebate', 'LuckyDraw', 'InviteRewards'];
    for (const name of withdrawn) { const node = at(`Left/${name}`); if (node) node.parent.children = node.parent.children.filter(child => child !== node); }
    capturedMainLifecycle.onCreate({ node: root });
    assert.equal(at('Top/Balances/RoomCard/Value').getComponent(Label).string, '12');
    assert.equal(at('Top/Balances/Gold/Value').getComponent(Label).string, '34');
    assert.equal(at('Top/Player/PlayerId').getComponent(Label).string, 'ID:7');
    assert.equal(at('Top/Balances/ClubCard'), null);
    let opens = 0;
    controller.productionBridge = { store: { open() { opens++; return Promise.resolve(); } } };
    controller.bindMainLegacyButtons(root);
    for (const type of ['click', 'touch-end', 'mouse-up']) at('Top/Balances').emit(type);
    await Promise.resolve();
    assert.equal(opens, 1);
    for (const dispose of controller.nodeDisposers) dispose();
    assert.equal(at('Top/Balances').listeners.get('click').length, 0);
});

test('real player update keeps the two balances independent and ignores removed currencies', () => {
    const { controller, root, at } = fixture();
    const calls = [];
    const top = { setGold: v => calls.push(['gold', v]), setRoomCard: v => calls.push(['roomCard', v]) };
    for (const property of ['gold', 'roomCard', 'clubCard', 'diamond', 'crystal']) controller.applyPlayerChanged(root, top, { property, value: 8 });
    assert.equal(at('Top/Balances/RoomCard/Value').getComponent(Label).string, '8');
    assert.equal(at('Top/Balances/Gold/Value').getComponent(Label).string, '8');
    assert.deepEqual(calls, [['gold', 8], ['roomCard', 8]]);
});

 test('withdrawn six entries receive no listeners while their feature routes remain implemented', () => {
    const { controller, root, at } = fixture();
    controller.bindMainLegacyButtons(root);
    for (const name of ['Practice', 'Agent', 'Bounty', 'Rebate', 'LuckyDraw', 'InviteRewards']) {
        assert.ok(source.includes(`case '${name}':`));
        const node = at(`Left/${name}`);
        if (node) assert.equal(node.listeners.size, 0);
    }
});


test('current Support icon Button invokes the existing route once without parent event propagation', async () => {
    const { controller, root, at } = fixture();
    const icon = at('Left/Support/icon');
    assert.ok(icon.getComponent(Button), 'the actual child owns a Button');
    let calls = 0;
    controller.productionBridge = { support: { open() { calls++; } } };
    controller.bindMainLegacyButtons(root);
    controller.bindMainLegacyButtons(root);
    for (const type of ['click', 'touch-end', 'mouse-up']) icon.emit(type);
    await Promise.resolve();
    assert.equal(calls, 1, 'child-only delivery reaches Support, and the existing guard prevents duplicates');
    for (const type of ['click', 'touch-end', 'mouse-up']) assert.equal(icon.listeners.get(type)?.length, 1);
    for (const dispose of controller.nodeDisposers) dispose();
    assert.equal(icon.listeners.get('click').length, 0);
});
