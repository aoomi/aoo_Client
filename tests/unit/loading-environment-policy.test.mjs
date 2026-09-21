import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function compile(relativePath, dependencies = {}) {
    const source = fs.readFileSync(path.join(clientRoot, relativePath), 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: relativePath })(
        (specifier) => {
            if (specifier in dependencies) return dependencies[specifier];
            throw new Error(`unexpected import ${specifier} from ${relativePath}`);
        },
        module,
        module.exports,
    );
    return module.exports;
}

function canonicalGateway(raw) {
    const url = new URL(raw);
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) throw new Error('生产网关必须使用 HTTPS');
    if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
        throw new Error('gatewayOrigin 只能包含 scheme、host 和 port');
    }
    url.pathname = '/'; url.search = ''; url.hash = '';
    return url;
}

const policyPath = 'assets/Login/Code/Bootstrap/LoadingEnvironmentPolicy.ts';
const bootstrapPath = 'assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts';
const authPath = 'assets/Login/Code/Auth/AuthSession.ts';
const policySource = fs.readFileSync(path.join(clientRoot, policyPath), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(clientRoot, bootstrapPath), 'utf8');
const bootstrapScene = JSON.parse(fs.readFileSync(path.join(clientRoot, 'assets/Login/Scenes/BootStrap.scene'), 'utf8'));
const policy = compile(policyPath, {
    '../../../Common/Code/Runtime/network/GatewayEntryPolicy': {
        gatewayOrigin: canonicalGateway,
        testPreviewGatewayOrigin: (explicit, page) => {
            if (!page || page.protocol !== 'http:') return explicit;
            if (!explicit) return `http://${page.hostname}:8080/`;
            const url = new URL(explicit);
            if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) url.hostname = page.hostname;
            return url.toString();
        },
    },
});

class BrowserStorage {
    constructor(entries = {}, failOnRemove = []) {
        this.values = new Map(Object.entries(entries));
        this.failOnRemove = new Set(failOnRemove);
        this.removed = [];
    }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] ?? null; }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, value); }
    removeItem(key) {
        if (this.failOnRemove.has(key)) throw new Error('remove denied');
        this.removed.push(key);
        this.values.delete(key);
    }
    get(key) { return this.values.get(key) ?? null; }
    set(key, value) { this.values.set(key, value); }
    remove(key) { this.removeItem(key); }
}

class KeyValueStorage {
    constructor(entries = {}, failOnRemove = []) {
        this.values = new Map(Object.entries(entries));
        this.failOnRemove = new Set(failOnRemove);
    }
    get(key) { return this.values.get(key) ?? null; }
    set(key, value) { this.values.set(key, value); }
    remove(key) {
        if (this.failOnRemove.has(key)) throw new Error('remove denied');
        this.values.delete(key);
    }
}

class MemoryIndexedDb {
    constructor(names = [], failOnDelete = []) {
        this.names = new Set(names);
        this.failOnDelete = new Set(failOnDelete);
        this.deleted = [];
    }
    async databases() { return [...this.names].map((name) => ({ name })); }
    deleteDatabase(name) {
        this.deleted.push(name);
        const request = {};
        setImmediate(() => {
            if (this.failOnDelete.has(name)) {
                request.error = new Error('delete denied');
                request.onerror?.();
                return;
            }
            this.names.delete(name);
            request.onsuccess?.();
        });
        return request;
    }
}

class MemoryCacheStorage {
    constructor(names = [], failOnDelete = []) {
        this.names = new Set(names);
        this.failOnDelete = new Set(failOnDelete);
        this.deleted = [];
    }
    async keys() { return [...this.names]; }
    async delete(name) {
        this.deleted.push(name);
        if (this.failOnDelete.has(name)) throw new Error('cache delete denied');
        return this.names.delete(name);
    }
}

const errors = compile('assets/Common/Code/Runtime/core/AppError.ts');
const lastAccount = compile('assets/Login/Code/Auth/LastAccountStore.ts');
const guestSession = compile('assets/Login/Code/Auth/GuestSessionStore.ts');
const auth = compile(authPath, {
    '../../../Common/Code/Runtime/core/AppError': errors,
    './LastAccountStore': lastAccount,
    './GuestSessionStore': guestSession,
});
class MockComponent { node = null; }
class MockButton {}
class MockEditBox { static EventType = { EDITING_RETURN: 'editing-return' }; }
class MockLabel {}
class MockNode {}
class MockToggle {}
const loginViewModule = compile('assets/Login/Code/Auth/LoginView.ts', {
    cc: {
        _decorator: {
            ccclass: () => (value) => value,
            property: () => () => undefined,
        },
        Button: MockButton,
        Component: MockComponent,
        EditBox: MockEditBox,
        Label: MockLabel,
        Node: MockNode,
        Toggle: MockToggle,
    },
    '../../../Common/Code/Runtime/core/AppError': errors,
});

function account(name, token = `token-${name}`) {
    return { account: name, accountToken: token };
}

function authService(storage, onTokenLogin = () => undefined) {
    const sessions = new guestSession.GuestSessionStore(storage);
    const service = new auth.AuthSession({
        loginWithPassword: async ({ account: name }) => account(name),
        registerGuest: async () => account('guest:new'),
        loginWithToken: async (name) => {
            onTokenLogin();
            return account(name, `rotated-${name}`);
        },
    }, new lastAccount.LastAccountStore(storage), sessions);
    service.start();
    return { service, sessions };
}

test('Creator keeps the three properties without rewriting the user-owned switch value', () => {
    assert.match(bootstrapSource, /displayName:\s*'是否测试环境'/);
    assert.match(bootstrapSource, /private isTestEnvironment = true/);
    assert.match(bootstrapSource, /displayName:\s*'是否清除本地数据'/);
    assert.match(bootstrapSource, /清除 Aoo 登录、会话及业务本地数据/);
    assert.doesNotMatch(bootstrapSource, /保留账号会话/);
    assert.match(bootstrapSource, /private isClearLocalData = false/);
    assert.match(bootstrapSource, /displayName:\s*'网关地址集合'/);
    assert.match(bootstrapSource, /type:\s*\[CCString\]/);
    assert.match(bootstrapSource, /private gatewayAddresses: string\[\] = \[\]/);
    const serialized = bootstrapScene.find((entry) => entry?.__type__ === '7386d+/6hBPO43r+g1sdJ8A');
    assert.ok(serialized);
    assert.equal(serialized.isTestEnvironment, true);
    assert.equal(typeof serialized.isClearLocalData, 'boolean');
    assert.deepEqual(serialized.gatewayAddresses, []);
    const loginScene = JSON.parse(fs.readFileSync(path.join(clientRoot, 'assets/Login/Scenes/LoginScene.scene'), 'utf8'));
    const loginBootstrap = loginScene.find((entry) => entry?._id === 'loginScreenBootstrap');
    assert.ok(loginBootstrap);
    const presentationGuard = bootstrapSource.indexOf('if (!isBootstrapScene)');
    const launchSelectionRead = bootstrapSource.indexOf('const launchSelection = loadingBoot.resolveLaunchSelection');
    assert.ok(presentationGuard >= 0 && presentationGuard < launchSelectionRead,
        'LoginScene exits through presentation-only consumption before serialized launch settings are read');
    assert.match(bootstrapSource, /if \(loadingRuntime\.__aoo_BOOTSTRAP_ENTRY_REDIRECT__\)/);
    assert.match(bootstrapSource, /director\.loadScene\('BootStrap'/);
    assert.match(bootstrapSource, /启动入口循环：\$\{sceneName\} 未能进入 BootStrap/);
    assert.match(bootstrapSource, /resolveLaunchSelection\(isBootstrapScene/);
    assert.match(bootstrapSource, /source=\{\$\{authoritySource\}\}/);
});

test('BootStrap is the only launch authority and preserves both false and true choices per boot', () => {
    const falseBoot = new policy.AooLoadingBootState('unchecked');
    assert.equal(falseBoot.resolveLaunchSelection(false, {
        isTestEnvironment: true, isClearLocalData: true, gatewayAddresses: ['http://ignored'],
    }), null);
    const unchecked = falseBoot.resolveLaunchSelection(true, {
        isTestEnvironment: true, isClearLocalData: false, gatewayAddresses: [],
    });
    assert.equal(unchecked.isClearLocalData, false);
    assert.equal(falseBoot.resolveLaunchSelection(false, {
        isTestEnvironment: false, isClearLocalData: true, gatewayAddresses: ['http://ignored'],
    }).isClearLocalData, false, 'Login/Main defaults cannot override BootStrap');

    const checked = new policy.AooLoadingBootState('checked').resolveLaunchSelection(true, {
        isTestEnvironment: true, isClearLocalData: true, gatewayAddresses: [],
    });
    assert.equal(checked.isClearLocalData, true);
});

test('test and production gateway selection preserve current Aoo authentication configuration', async () => {
    const current = { bootstrapToken: 'required-bootstrap-token', clientChannel: 'editor-test' };
    const applied = await policy.applyLoadingEnvironment({
        isTestEnvironment: true,
        isClearLocalData: false,
        gatewayAddresses: ['https://prod.example.com', 'http://127.0.0.1:8080'],
    }, current);
    assert.equal(applied.selectedGateway, 'http://127.0.0.1:8080/');
    assert.equal(applied.runtimeConfig.bootstrapToken, 'required-bootstrap-token');
    assert.equal(applied.runtimeConfig.clientChannel, 'editor-test');
    assert.equal(applied.runtimeConfig.environment, 'test');
    assert.equal(policy.selectGatewayAddress([
        'http://localhost:8080', 'https://api.example.com',
    ], false), 'https://api.example.com/');
    assert.throws(() => policy.selectGatewayAddress(['http://localhost:8080'], false), /非本机 HTTPS/);
});

test('Creator LAN preview rewrites the loopback gateway to the phone-reachable Mac host', async () => {
    const applied = await policy.applyLoadingEnvironment({
        isTestEnvironment: true,
        isClearLocalData: false,
        gatewayAddresses: ['http://127.0.0.1:8080'],
    }, {}, { location: { protocol: 'http:', hostname: '192.168.1.107', port: '7456' } });
    assert.equal(applied.runtimeConfig.apiBaseUrl, 'http://192.168.1.107:8080/');
    assert.equal(applied.runtimeConfig.avatarBaseUrl, 'http://192.168.1.107:8765/');
    assert.equal(applied.runtimeConfig.environment, 'test');
});

test('clear=true deletes account, guest, reconnect, gameplay, region, protocol and browser caches only in Aoo namespaces', async () => {
    const localStorage = new BrowserStorage({
        'aoo.auth.session.v2': 'access-refresh-ticket',
        'aoo.auth.last-account': 'player',
        'aoo.deviceId': 'local-app-device',
        'aoo.privacy.agreement': 'accepted',
        'aoo:selected-server': '2',
        'aoo.room.reconnect': 'room-ticket',
        'aoo.gameplay.filter': 'mahjong',
        'settings.music': '1',
        Account: 'legacy-account-and-token',
        SysSetting: 'legacy-settings',
        myCityID: '3401',
        99881: 'legacy-player-slot',
        legacy_last_club_42: 'club-cache',
        mywanfa_1_2: 'play-cache',
        password_2_3: 'room-password',
        '42_NoTipUnion': '1',
        hzmj_7_rounds: '8',
        'vendor.preference': 'must-stay',
    });
    const sessionStorage = new BrowserStorage({
        'aoo.auth.wsTicket': 'ticket',
        'aoo.room.reconnectToken': 'reconnect',
        'vendor.session': 'must-stay',
    });
    const indexedDB = new MemoryIndexedDb(['aoo-room-state', 'aoo-engine-assets', 'third-party-db']);
    const cacheStorage = new MemoryCacheStorage(['aoo-media-v1', 'aoo-download-v3', 'aoo-app-shell-v1', 'vendor-assets']);
    const applied = await policy.applyLoadingEnvironment({
        isTestEnvironment: true,
        isClearLocalData: true,
        gatewayAddresses: [],
    }, { bootstrapToken: 'keep-runtime-auth-config' }, {
        localStorage, sessionStorage, indexedDB, cacheStorage, cleanupTimeoutMs: 500,
    });

    assert.equal(applied.autoRestoreBlocked, true);
    assert.equal(applied.interactiveLoginAllowed, true);
    assert.equal(applied.cleanupRanThisCall, true);
    assert.deepEqual(applied.cleanup.failures, []);
    assert.deepEqual([...localStorage.values.keys()].sort(), [
        'aoo.deviceId',
        'vendor.preference',
    ]);
    assert.deepEqual([...sessionStorage.values.keys()], ['vendor.session']);
    assert.equal(indexedDB.deleted.includes('aoo-room-state'), true);
    assert.equal(indexedDB.deleted.includes('aoo-engine-assets'), false);
    assert.equal(indexedDB.deleted.includes('third-party-db'), false);
    assert.deepEqual(cacheStorage.deleted.sort(), ['aoo-download-v3', 'aoo-media-v1']);
    assert.equal(cacheStorage.names.has('aoo-app-shell-v1'), true);
    assert.equal(cacheStorage.names.has('vendor-assets'), true);
    assert.equal(applied.runtimeConfig.bootstrapToken, 'keep-runtime-auth-config');
});

test('clear=false preserves the existing automatic-login session and does not touch browser stores in test or production', async () => {
    const localStorage = new BrowserStorage({ 'aoo.auth.session.v2': 'keep', 'aoo.room.reconnect': 'keep' });
    const indexedDB = new MemoryIndexedDb(['aoo-room-state']);
    const cacheStorage = new MemoryCacheStorage(['aoo-media-v1']);
    const applied = await policy.applyLoadingEnvironment({
        isTestEnvironment: true,
        isClearLocalData: false,
        gatewayAddresses: [],
    }, {}, { localStorage, indexedDB, cacheStorage });
    assert.equal(applied.autoRestoreBlocked, false);
    assert.equal(applied.interactiveLoginAllowed, true);
    assert.equal(applied.cleanup.attempted, false);
    assert.equal(localStorage.values.get('aoo.auth.session.v2'), 'keep');
    assert.deepEqual(indexedDB.deleted, []);
    assert.deepEqual(cacheStorage.deleted, []);

    const storage = new KeyValueStorage();
    const { service, sessions } = authService(storage);
    sessions.save({ account: 'player', token: 'refresh-player' });
    assert.equal((await service.restoreSession()).account, 'player');
});

test('logged-in and guest sessions restart empty and route to LoginScene when clear=true', async () => {
    for (const cached of [
        { account: 'player', token: 'refresh-player', accessToken: 'access-player', refreshToken: 'refresh-player' },
        { account: 'guest:42', token: 'refresh-guest', refreshToken: 'refresh-guest', guestCredential: 'guest-secret' },
    ]) {
        const storage = new KeyValueStorage({
            'aoo.auth.session.v2': JSON.stringify(cached),
            'aoo.auth.last-account': cached.account,
        });
        let tokenLogins = 0;
        const { service } = authService(storage, () => { tokenLogins += 1; });
        service.blockAutomaticRestore();
        assert.equal(await service.restoreSession(), null);
        assert.equal(service.getLastAccount(), '');
        assert.equal(tokenLogins, 0);
    }

    const loadedScenes = [];
    const routerModule = compile('assets/Login/Code/Navigation/SceneRouter.ts', {
        cc: { director: { loadScene: (name) => loadedScenes.push(name) } },
        '../../../Lobby/Code/LobbyScreenController': { LobbyScreenController: class {} },
        '../../../Lobby/Code/HallRoomGateway': { HallRoomGateway: class {} },
        '../../../Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher': { CommonPdkGameSceneLauncher: class {} },
        '../../../Common/Code/Runtime/platform/LegacyPlatformRuntime': {
            legacyPlatformRuntime: { audio: { detach() {} } },
        },
        '../../../Common/Code/Runtime/core/AppError': { AppError: class AppError extends Error {} },
        '../../../Common/Code/Runtime/ui/PresentationTransitionCoordinator': {
            presentationTransition: { begin: () => ({ isCurrent: () => true, update() {}, cancel() {}, fail() {}, commitAfterPresentation: async () => undefined }) },
        },
        '../../../Common/Code/Runtime/navigation/BundleLoader': {
            getOrLoadBundle: async () => ({}),
        },
    });
    const router = new routerModule.SceneRouter(
        { restoreSession: async () => null },
        { reset() {}, onSessionReplaced() { return () => undefined; } },
        { load: () => null },
    );
    router.start();
    assert.equal(await router.recoverStartup('LoginScene', {}), 'LOGIN_REQUIRED');
    assert.equal(await router.recoverStartup('BootStrap', {}), 'LOGIN_REQUIRED');
    assert.deepEqual(loadedScenes, []);
    assert.match(bootstrapSource, /director\.loadScene\('LoginScene'/);
});

test('cleanup failures keep stale storage unreachable and still require interactive login', async () => {
    const localStorage = new BrowserStorage({
        'aoo.auth.session.v2': 'stale-session',
        'aoo.auth.last-account': 'stale-account',
    }, ['aoo.auth.session.v2']);
    const indexedDB = new MemoryIndexedDb(['aoo-room-state'], ['aoo-room-state']);
    const cacheStorage = new MemoryCacheStorage(['aoo-media-v1'], ['aoo-media-v1']);
    const applied = await policy.applyLoadingEnvironment({
        isTestEnvironment: true,
        isClearLocalData: true,
        gatewayAddresses: [],
    }, {}, { localStorage, indexedDB, cacheStorage, cleanupTimeoutMs: 500 });
    assert.equal(applied.autoRestoreBlocked, true);
    assert.equal(applied.interactiveLoginAllowed, true);
    assert.equal(applied.cleanup.failures.length >= 3, true);
    assert.equal(localStorage.values.has('aoo.auth.session.v2'), true, 'mock keeps the failed stale token');

    const stale = JSON.stringify({ account: 'player', token: 'stale-refresh' });
    const storage = new KeyValueStorage({
        'aoo.auth.session.v2': stale,
        'aoo.auth.last-account': 'player',
    }, ['aoo.auth.session.v2', 'aoo.auth.last-account']);
    let tokenLogins = 0;
    const { service } = authService(storage, () => { tokenLogins += 1; });
    service.blockAutomaticRestore();
    assert.equal(await service.restoreSession(), null);
    assert.equal(service.getLastAccount(), '');
    assert.equal(tokenLogins, 0);
    assert.equal(storage.values.get('aoo.auth.session.v2'), stale);
});

test('failed guest-session deletion cannot reuse the old guest identity', async () => {
    const stale = JSON.stringify({
        account: 'guest:old', token: 'stale-refresh', guestCredential: 'stale-guest-secret',
    });
    const storage = new KeyValueStorage({ 'aoo.auth.session.v2': stale }, ['aoo.auth.session.v2']);
    let tokenLogins = 0;
    const { service } = authService(storage, () => { tokenLogins += 1; });
    service.blockAutomaticRestore();
    assert.equal((await service.loginAsGuest()).account, 'guest:new');
    assert.equal(tokenLogins, 0);
});

test('repeated clear startups are idempotent', async () => {
    const localStorage = new BrowserStorage({
        'aoo.auth.session.v2': 'session',
        'aoo.room.reconnect': 'room',
        'vendor.preference': 'stay',
    });
    const indexedDB = new MemoryIndexedDb(['aoo-room-state']);
    const cacheStorage = new MemoryCacheStorage(['aoo-media-v1']);
    const selection = { isTestEnvironment: true, isClearLocalData: true, gatewayAddresses: [] };
    const bootState = new policy.AooLoadingBootState('repeat-boot');
    const first = await policy.applyLoadingEnvironment(selection, {}, {
        localStorage, indexedDB, cacheStorage, cleanupTimeoutMs: 500, bootState,
    });
    const removedAfterFirst = localStorage.removed.length;
    const second = await policy.applyLoadingEnvironment(selection, {}, {
        localStorage, indexedDB, cacheStorage, cleanupTimeoutMs: 500, bootState,
    });
    assert.deepEqual(first.cleanup.failures, []);
    assert.deepEqual(second.cleanup.failures, []);
    assert.equal(first.cleanupRanThisCall, true);
    assert.equal(second.cleanupRanThisCall, false);
    assert.equal(localStorage.removed.length, removedAfterFirst);
    assert.deepEqual([...localStorage.values.keys()].sort(), [
        'vendor.preference',
    ]);
});

test('clear=true repeats only on a new boot; clear=false never inherits an auto-login block', async () => {
    const localStorage = new BrowserStorage({
        'aoo.auth.session.v2': 'session',
        'vendor.preference': 'stay',
    });
    const selection = { isTestEnvironment: true, isClearLocalData: true, gatewayAddresses: [] };
    const first = await policy.applyLoadingEnvironment(selection, {}, {
        localStorage, bootState: new policy.AooLoadingBootState('first-boot'),
    });
    assert.equal(first.cleanupRanThisCall, true);
    assert.equal(first.autoRestoreBlocked, true);
    localStorage.setItem('aoo.auth.session.v2', 'fresh-session');

    const second = await policy.applyLoadingEnvironment(selection, {}, {
        localStorage, bootState: new policy.AooLoadingBootState('second-boot'),
    });
    assert.equal(second.cleanupRanThisCall, true);
    assert.equal(second.autoRestoreBlocked, true);
    assert.equal(localStorage.getItem('aoo.auth.session.v2'), null);

    const reusedBoot = new policy.AooLoadingBootState('reused-boot');
    await policy.applyLoadingEnvironment(selection, {}, { localStorage, bootState: reusedBoot });
    localStorage.setItem('aoo.auth.session.v2', 'valid-session');
    const falseOnSameBoot = await policy.applyLoadingEnvironment({ ...selection, isClearLocalData: false }, {}, {
        localStorage, bootState: reusedBoot,
    });
    assert.equal(falseOnSameBoot.cleanupRanThisCall, false);
    assert.equal(falseOnSameBoot.autoRestoreBlocked, false);
    assert.equal(localStorage.getItem('aoo.auth.session.v2'), 'valid-session');
});

test('one boot clears once, allows a fresh guest session, and never deletes it on component retry', async () => {
    const storage = new BrowserStorage({
        'aoo.auth.session.v2': JSON.stringify({ account: 'guest:old', token: 'old', guestCredential: 'old-secret' }),
        'aoo.auth.last-account': 'guest:old',
    });
    const bootState = new policy.AooLoadingBootState('guest-boot');
    const selection = { isTestEnvironment: true, isClearLocalData: true, gatewayAddresses: [] };
    const first = await policy.applyLoadingEnvironment(selection, {}, { localStorage: storage, bootState });
    assert.equal(first.cleanupRanThisCall, true);
    assert.equal(bootState.claimAutomaticRestoreReset(), true);

    const { service, sessions } = authService(storage);
    service.blockAutomaticRestore();
    assert.deepEqual(service.loginGateState(), { autoRestoreBlocked: true, interactiveLoginAllowed: true });
    assert.equal((await service.loginAsGuest()).account, 'guest:new');
    assert.equal(sessions.load().account, 'guest:new');
    assert.deepEqual(service.loginGateState(), { autoRestoreBlocked: false, interactiveLoginAllowed: true });

    const sessionAfterLogin = storage.values.get('aoo.auth.session.v2');
    const second = await policy.applyLoadingEnvironment(selection, {}, { localStorage: storage, bootState });
    assert.equal(second.cleanupRanThisCall, false);
    assert.equal(bootState.claimAutomaticRestoreReset(), false);
    assert.equal(storage.values.get('aoo.auth.session.v2'), sessionAfterLogin);
});

test('the real guest button path enforces agreement, then creates a fresh session and emits login success', async () => {
    const storage = new BrowserStorage();
    let registrations = 0;
    const sessions = new guestSession.GuestSessionStore(storage);
    const service = new auth.AuthSession({
        loginWithPassword: async ({ account: name }) => account(name),
        registerGuest: async () => { registrations += 1; return account('guest:button'); },
        loginWithToken: async (name) => account(name),
    }, new lastAccount.LastAccountStore(storage), sessions);
    service.start();
    service.blockAutomaticRestore();

    const emitted = [];
    const messages = [];
    const view = new loginViewModule.LoginView();
    view.node = { emit: (event, payload) => emitted.push([event, payload]) };
    view.guestLoginButton = { interactable: true };
    view.userAgreementToggle = { isChecked: false };
    view.showInlineError = (message) => messages.push(message);
    view.configure(service);

    await view.onGuestLoginClicked();
    assert.equal(registrations, 0);
    assert.deepEqual(messages, ['请先阅读并同意用户使用协议']);
    assert.deepEqual(emitted, []);

    view.userAgreementToggle.isChecked = true;
    await view.onGuestLoginClicked();
    assert.equal(registrations, 1);
    assert.equal(emitted[0][0], 'login-succeeded');
    assert.equal(emitted[0][1].account, 'guest:button');
    assert.equal(sessions.load().account, 'guest:button');
    assert.deepEqual(service.loginGateState(), { autoRestoreBlocked: false, interactiveLoginAllowed: true });
    assert.equal(view.guestLoginButton.interactable, true);
});

test('a fresh boot clears the prior boot guest, while cleanup failure still permits a new interactive login', async () => {
    const storage = new BrowserStorage({
        'aoo.auth.session.v2': JSON.stringify({ account: 'guest:previous-boot', token: 'old' }),
        'aoo.auth.last-account': 'guest:previous-boot',
    }, ['aoo.auth.session.v2']);
    const bootState = new policy.AooLoadingBootState('fresh-boot');
    const applied = await policy.applyLoadingEnvironment({
        isTestEnvironment: true, isClearLocalData: true, gatewayAddresses: [],
    }, {}, { localStorage: storage, bootState });
    assert.equal(applied.cleanup.failures.length, 1);
    assert.equal(bootState.claimAutomaticRestoreReset(), true);

    const { service } = authService(storage);
    service.blockAutomaticRestore();
    assert.equal(await service.restoreSession(), null);
    assert.equal((await service.login('new-player', 'secret')).account, 'new-player');
    assert.deepEqual(service.loginGateState(), { autoRestoreBlocked: false, interactiveLoginAllowed: true });
});

test('implementation has no broad clear, protected-login allowlist, old gateway or auth bypass', () => {
    const authSource = fs.readFileSync(path.join(clientRoot, authPath), 'utf8');
    const production = `${policySource}\n${bootstrapSource}\n${authSource}`;
    assert.doesNotMatch(production, /localStorage\s*\.\s*clear\s*\(/);
    assert.doesNotMatch(policySource, /PROTECTED_LOCAL|PreservingSecurity|isProtectedLocalKey/);
    assert.doesNotMatch(production, /jjres|qpvvv|gateWayUrlStr|dd_isdebug\s*[,)]|skipAuth|disableAuth|bypass/i);
    assert.match(policySource, /gatewayOrigin\(value\)/);
    assert.match(bootstrapSource, /await applyLoadingEnvironment/);
    assert.doesNotMatch(bootstrapSource, /__aoo_FORCE_INTERACTIVE_LOGIN__/);
    assert.match(bootstrapSource, /currentAooLoadingBootState\(\)/);
    assert.match(bootstrapSource, /claimAutomaticRestoreReset\(\)/);
    assert.match(bootstrapSource, /services\.auth\.blockAutomaticRestore\(\)/);
    assert.match(bootstrapSource, /services\.scenes\.resetSession\(\)/);
    assert.match(authSource, /if \(this\.autoRestoreBlocked\) return Promise\.resolve\(null\)/);
    assert.match(authSource, /interactiveLoginAllowed:/);
    assert.doesNotMatch(bootstrapSource, /ServerDirectorySelector|区服：|installServerDirectorySelector/);
    assert.match(bootstrapSource, /bootstrapRuntime\.initialize\(\)/);
});

test('clear-local-data claims one authenticated authoritative room cleanup after explicit login', () => {
    const clientBootstrap = fs.readFileSync(path.join(clientRoot, 'assets/Login/Code/Bootstrap/ClientBootstrap.ts'), 'utf8');
    const authSource = fs.readFileSync(path.join(clientRoot, authPath), 'utf8');
    const cleanup = fs.readFileSync(path.join(clientRoot,
        'assets/Common/Code/Runtime/room/StuckRoomCleanupService.ts'), 'utf8');
    assert.match(policySource, /claimRoomCleanup\(\)/);
    assert.match(policySource, /releaseRoomCleanupClaim\(\)/);
    assert.match(clientBootstrap, /claimRoomCleanup\(\)[\s\S]*StuckRoomCleanupService\(\)\.cleanup\(account\)/);
    assert.match(clientBootstrap, /catch \(error: unknown\)[\s\S]*releaseRoomCleanupClaim\(\)[\s\S]*throw error/);
    assert.match(authSource, /await this\.afterExplicitLogin\(authenticated\)/);
    assert.match(authSource, /await this\.afterExplicitLogin\(account\)/);
    assert.match(cleanup, /\/api\/v2\/hall\/rooms\/active/);
    assert.match(cleanup, /\/api\/v2\/hall\/rooms\/\$\{roomId\}\/leave/);
    assert.match(cleanup, /if \(confirmed\?\.active\) throw new Error/);
});
