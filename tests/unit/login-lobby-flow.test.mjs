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
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} };
    const require = (specifier) => {
        if (specifier in dependencies) return dependencies[specifier];
        throw new Error(`unexpected dependency ${specifier} from ${relativePath}`);
    };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: relativePath })(
        require, module, module.exports,
    );
    return module.exports;
}

class MemoryStorage {
    values = new Map();
    get(key) { return this.values.get(key) ?? null; }
    set(key, value) { this.values.set(key, value); }
    remove(key) { this.values.delete(key); }
}

const errors = compile('assets/Common/Code/Runtime/core/AppError.ts');
const lastAccount = compile('assets/Login/Code/Auth/LastAccountStore.ts');
const guestSession = compile('assets/Login/Code/Auth/GuestSessionStore.ts');
const roomRecovery = compile('assets/Common/Code/Runtime/room/RoomRecoveryStore.ts');
const auth = compile('assets/Login/Code/Auth/AuthSession.ts', {
    '../../../Common/Code/Runtime/core/AppError': errors,
    './LastAccountStore': lastAccount,
    './GuestSessionStore': guestSession,
});

test('lobby scene mount resolves the stable Canvas component instead of a node name', () => {
    const source = fs.readFileSync(path.join(clientRoot, 'assets/Login/Code/Navigation/SceneRouter.ts'), 'utf8');
    assert.match(source, /child\.getComponent\(Canvas\)/);
    assert.doesNotMatch(source, /getChildByName\('Canvas'\)/);
    assert.match(source, /Director\.EVENT_AFTER_SCENE_LAUNCH/);
    assert.match(source, /director\.off\(Director\.EVENT_AFTER_SCENE_LAUNCH, launched\)/);
});

function account(name, token = `token-${name}`) {
    return { account: name, accountToken: token };
}

test('cache restore is single-flight and logout cannot resurrect a late session', async () => {
    const storage = new MemoryStorage();
    const sessions = new guestSession.GuestSessionStore(storage);
    sessions.save({ account: 'cached', token: 'cached-token' });
    let release;
    let tokenLogins = 0;
    const gateway = {
        loginWithPassword: async ({ account: name }) => account(name),
        registerGuest: async () => account('guest'),
        loginWithToken: async () => {
            tokenLogins += 1;
            return await new Promise((resolve) => { release = resolve; });
        },
    };
    const service = new auth.AuthSession(gateway, new lastAccount.LastAccountStore(storage), sessions);
    service.start();
    const first = service.restoreSession();
    const second = service.restoreSession();
    assert.equal(first, second);
    service.logout(true);
    release(account('cached', 'renewed'));
    assert.equal(await first, null);
    assert.equal(tokenLogins, 1);
    assert.equal(sessions.load(), null);
    assert.equal(service.getLastAccount(), '');
});

test('password login persists automatic-login credentials and rejects duplicate submission', async () => {
    const storage = new MemoryStorage();
    let release;
    let calls = 0;
    const gateway = {
        loginWithPassword: async ({ account: name }) => {
            calls += 1;
            return await new Promise((resolve) => { release = () => resolve(account(name)); });
        },
        registerGuest: async () => account('guest'),
        loginWithToken: async (name) => account(name),
    };
    const sessions = new guestSession.GuestSessionStore(storage);
    const service = new auth.AuthSession(gateway, new lastAccount.LastAccountStore(storage), sessions);
    service.start();
    const pending = service.login(' player ', 'secret');
    await assert.rejects(service.login('player', 'secret'), (error) => error.code === 'AUTH_IN_PROGRESS');
    release();
    assert.equal((await pending).account, 'player');
    assert.deepEqual(sessions.load(), { account: 'player', token: 'token-player' });
    assert.equal(calls, 1);
});

test('invalid refresh token clears local session and reports an interactive-login fallback', async () => {
    const storage = new MemoryStorage();
    const sessions = new guestSession.GuestSessionStore(storage);
    sessions.save({ account: 'player', token: 'stale-refresh', refreshToken: 'stale-refresh' });
    const service = new auth.AuthSession({
        loginWithPassword: async ({ account: name }) => account(name),
        registerGuest: async () => account('guest'),
        loginWithToken: async () => { throw new errors.AppError('INVALID_CREDENTIALS', 'revoked'); },
    }, new lastAccount.LastAccountStore(storage), sessions);
    service.start();
    assert.equal(await service.restoreSession(), null);
    assert.equal(sessions.load(), null);
    assert.equal(service.consumeRestoreFailureMessage(), '登录会话已过期，请重新登录');
    assert.equal(service.consumeRestoreFailureMessage(), '');
});

test('account and guest login use the authoritative Account API and durable rotating session fields', () => {
    const gateway = fs.readFileSync(path.join(clientRoot, 'assets/Login/Code/Auth/UnifiedIdentityAuthGateway.ts'), 'utf8');
    const store = fs.readFileSync(path.join(clientRoot, 'assets/Login/Code/Auth/GuestSessionStore.ts'), 'utf8');
    assert.match(gateway, /\/api\/v2\/account\/login/);
    assert.match(gateway, /\/api\/v2\/account\/guest\/register/);
    assert.match(gateway, /\/api\/v2\/account\/guest\/login/);
    assert.match(gateway, /\/api\/v2\/account\/token\/refresh/);
    assert.match(gateway, /\/api\/v2\/gateway\/ws_ticket/);
    assert.match(gateway, /this\.text\(data\.wsTicket\)/, 'gateway must read the canonical wsTicket field');
    assert.doesNotMatch(gateway, /this\.text\(data\.ticket\)/);
    assert.doesNotMatch(gateway, /Origin:\s*globalThis\.location/,
        'browser code must let the user agent supply the protected Origin header');
    assert.doesNotMatch(gateway, /ClientPack|legacy\.login|account\.login_compat|\/api\/v1\/account/);
    for (const field of ['accessToken', 'refreshToken', 'accountId', 'profile']) assert.match(store, new RegExp(field));
});

test('guest button uses one normalized Creator pointer binding', () => {
    const bootstrap = fs.readFileSync(path.join(clientRoot,
        'assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts'), 'utf8');
    const bindingStart = bootstrap.indexOf('const bind =');
    const binding = bootstrap.slice(bindingStart, bootstrap.indexOf('return view', bindingStart));
    assert.equal((binding.match(/node\.node\.on\(Node\.EventType\.TOUCH_END, guard, view\)/g) ?? []).length, 1);
    assert.equal((binding.match(/node\.node\.on\(Node\.EventType\.MOUSE_UP, guard, view\)/g) ?? []).length, 1);
    assert.match(binding, /if \(!node\.interactable\) return/);
    assert.match(binding, /if \(now - lastFire < 180\) return/);
    assert.doesNotMatch(binding, /Button\.EventType\.CLICK/);
    assert.match(binding, /bind\(view\.guestLoginButton, \(\) => void view\.onGuestLoginClicked\(\)\)/);
});

test('LoginScene never generates a visible server-directory debug label', () => {
    const bootstrap = fs.readFileSync(path.join(clientRoot,
        'assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts'), 'utf8');
    assert.doesNotMatch(bootstrap, /ServerDirectorySelector|区服：|installServerDirectorySelector/);
    assert.match(bootstrap, /selectedGateway: applied\.selectedGateway/,
        'the selected gateway remains available only in controlled diagnostics');
});

test('login view teardown tolerates Creator destroying EditBox nodes first', () => {
    const view = fs.readFileSync(path.join(clientRoot,
        'assets/Login/Code/Auth/LoginView.ts'), 'utf8');
    assert.match(view, /accountInput\?\.node\?\.off/);
    assert.match(view, /passwordInput\?\.node\?\.off/);
});

test('legacy form close stops animation tree through valid child snapshots', () => {
    const formManager = fs.readFileSync(path.join(clientRoot,
        'assets/Common/Code/Runtime/ui/LegacyFormManager.ts'), 'utf8');
    assert.match(formManager, /private stopAnimationTree\(node: Node \| null\): void/);
    assert.match(formManager, /if \(!node\?\.isValid\) return/);
    assert.match(formManager, /\[\.\.\.node\.children\] as Array<Node \| null>/);
    assert.match(formManager, /if \(this\.node\.isValid\) this\.node\.destroy\(\)/);
});

test('LoginScene serializes separate guest/account entry and a hidden editable account dialog', () => {
    const scene = JSON.parse(fs.readFileSync(path.join(clientRoot, 'assets/Login/Scenes/LoginScene.scene'), 'utf8'));
    const nodes = scene.filter((item) => item.__type__ === 'cc.Node');
    const named = (name) => nodes.find((node) => node._name === name);
    assert.equal(named('Btn_GuestLogin')._active, true);
    assert.equal(named('Btn_AccountLogin')._active, true);
    const guestX = Number(named('Btn_GuestLogin')._lpos.x);
    const accountX = Number(named('Btn_AccountLogin')._lpos.x);
    assert.ok(Number.isFinite(guestX));
    assert.ok(Number.isFinite(accountX));
    assert.notEqual(guestX, accountX, 'guest/account entries must remain visually separated without freezing user-owned coordinates');
    assert.equal(named('AccountLoginPanel')._active, false);
    assert.equal(named('AccountInput')._active, true);
    assert.equal(named('PasswordInput')._active, true);
    assert.equal(named('Btn_Login')._active, true);
    assert.equal(named('Btn_Back')._active, true);
    assert.equal(named('AccountLoadingIndicator')?._active ?? false, false);
    assert.equal(named('AccountErrorLabel')._active, true);
    const bootstrap = fs.readFileSync(path.join(clientRoot, 'assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts'), 'utf8');
    assert.match(bootstrap, /if \(accountPanel\) accountPanel\.active = false/);
    assert.match(bootstrap, /this\.ensureEditBoxRuntime\([\s\S]*AccountInput[\s\S]*false/);
    assert.match(bootstrap, /this\.ensureEditBoxRuntime\([\s\S]*PasswordInput[\s\S]*true/);
    assert.match(bootstrap, /if \(!migrated\._impl\) migrated\.__preload\?\.\(\)/);
    assert.match(bootstrap, /'_edTxt' in migrated\._impl && !migrated\._impl\._edTxt/);
    assert.match(bootstrap, /migrated\._impl\.init\?\.\(input\)/);
    const passwordNodeIndex = scene.indexOf(named('PasswordInput'));
    const password = scene.find((item) => item.__type__ === 'cc.EditBox' && item.node?.__id__ === passwordNodeIndex);
    assert.equal(password._inputFlag, 0, 'Creator PASSWORD input flag must mask the password');
});

test('V04 auto-login failure, logout, and repeat login cannot reuse a revoked session', async () => {
    const storage = new MemoryStorage();
    const sessions = new guestSession.GuestSessionStore(storage);
    let refreshValid = true;
    let logoutCalls = 0;
    const fullAccount = (name, refresh = `refresh-${name}`) => ({
        ...account(name, refresh), accountId: '42', displayName: name, refreshToken: refresh,
        accessToken: `access-${name}`, accountType: 1, openId: '', unionId: '', token: `access-${name}`,
        nickName: name, sex: 0, headImageUrl: '', profile: { nickname: name },
    });
    const gateway = {
        loginWithPassword: async ({ account: name }) => fullAccount(name),
        registerGuest: async () => ({ ...fullAccount('guest'), guestCredential: 'guest-credential' }),
        loginWithToken: async (name) => {
            if (!refreshValid) throw new errors.AppError('INVALID_CREDENTIALS', 'revoked refresh');
            return fullAccount(name, `rotated-${name}`);
        },
        logout: async () => { logoutCalls += 1; refreshValid = false; },
    };
    const service = new auth.AuthSession(gateway, new lastAccount.LastAccountStore(storage), sessions);
    service.start();
    await service.login('player', 'secret');
    assert.equal(sessions.load().refreshToken, 'refresh-player');
    service.logout();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logoutCalls, 1);
    assert.equal(await service.restoreSession(), null);
    refreshValid = true;
    assert.equal((await service.login('player', 'secret')).account, 'player');
});

test('guest cache is preserved on transient failure and never creates a duplicate identity', async () => {
    const storage = new MemoryStorage();
    const sessions = new guestSession.GuestSessionStore(storage);
    sessions.save({ account: 'guest:cached', token: 'refresh-cached', guestCredential: 'durable-credential' });
    let registrations = 0;
    const gateway = {
        loginWithPassword: async ({ account: name }) => account(name),
        registerGuest: async () => { registrations += 1; return account('guest:new'); },
        loginWithToken: async () => { throw new errors.AppError('AUTH_NETWORK_ERROR', 'offline'); },
    };
    const service = new auth.AuthSession(gateway, new lastAccount.LastAccountStore(storage), sessions);
    service.start();
    await assert.rejects(service.loginAsGuest(), (error) => error.code === 'AUTH_NETWORK_ERROR');
    assert.equal(registrations, 0);
    assert.equal(sessions.load().guestCredential, 'durable-credential');
});

test('room recovery store persists only reload intent and never reusable room credentials', () => {
    const storage = new MemoryStorage();
    const store = new roomRecovery.RoomRecoveryStore(storage);
    store.save('391', {
        roomId: 123456,
        gameId: 629,
        gameName: 'njpdk',
        playFamily: 'poker:pao-de-kuai',
        playVersion: 'v1',
        roomKey: '123456',
        clubId: 9,
        unionId: 3,
        fromClub: true,
        authorityRoute: 'wss://room.example/ws',
        gameTicket: 'one-use-ticket',
        snapshot: { hand: [1, 2, 3] },
    });
    const raw = JSON.parse(storage.get('aoo.room.recovery.v1.391'));
    assert.equal(raw.roomId, 123456);
    assert.equal(raw.gameId, 629);
    assert.equal(raw.authorityRoute, undefined);
    assert.equal(raw.gameTicket, undefined);
    assert.equal(raw.snapshot, undefined);
    assert.equal(store.load('391').roomKey, '123456');
    store.save('abc', { roomId: 123456, gameId: 629 });
    assert.equal(storage.get('aoo.room.recovery.v1.abc'), null);
    storage.set('aoo.room.recovery.v1.391', JSON.stringify({
        roomId: 123456,
        gameId: 629,
        updatedAt: Date.now() - 13 * 60 * 60 * 1000,
    }));
    assert.equal(store.load('391'), null);
    assert.equal(storage.get('aoo.room.recovery.v1.391'), null);
});

test('production bootstrap reaches login and lobby scenes, and logout returns to the exact login scene', () => {
    const bootstrap = fs.readFileSync(path.join(clientRoot, 'assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts'), 'utf8');
    const lobby = fs.readFileSync(path.join(clientRoot, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');
    for (const scene of ['BootStrap', 'LoginScene', 'MainScene']) {
        const sceneFile = scene === 'BootStrap'
            ? 'assets/Login/Scenes/BootStrap.scene'
            : scene === 'LoginScene' ? 'assets/Login/Scenes/LoginScene.scene' : 'assets/Lobby/Scenes/MainScene.scene';
        assert.equal(JSON.parse(fs.readFileSync(path.join(clientRoot, sceneFile), 'utf8'))[0]._name, scene);
    }
    assert.match(bootstrap, /services\.scenes\.recoverBootstrapTarget\(/);
    assert.match(bootstrap, /routeResult !== 'LOGIN_REQUIRED'/);
    assert.match(bootstrap, /services\.scenes\.recoverStartup\(sceneName, this\.node\)/);
    const router = fs.readFileSync(path.join(clientRoot, 'assets/Login/Code/Navigation/SceneRouter.ts'), 'utf8');
    assert.match(router, /sceneName === 'BootStrap'[\s\S]*return 'LOGIN_REQUIRED'/);
    assert.match(router, /sceneName === 'MainScene'[\s\S]*recoverAuthenticatedTarget\(account, parent, \(\) => undefined, 'MOUNT_CURRENT'\)/);
    assert.match(router, /protocol = this\.network\.protocol[\s\S]*new LobbyScreenController\(account, activeRole, protocol, \(\) => this\.logout\(\), this\.roomRecovery,[\s\S]*handleInvalidLobbySession/);
    assert.match(router, /recoverBootstrapTarget\(parent: Node/);
    assert.match(router, /activeRoom = await gateway\.activeRoom\(\);/);
  assert.match(router, /if \(!activeRoom\) \{[\s\S]*this\.showLobby\(\)/);
  assert.match(router, /await this\.recoverRoomHandoff\(account, role, activeRoom, gateway, parent, report\)/);
  assert.match(router, /active-room recovery failed/);
  assert.match(router, /this\.roomRecovery\.clear\(String\(account\.accountId\)\)/);
    assert.doesNotMatch(router, /recoverRoomTarget\(|recoverMainSceneTarget\(/);
    const gateway = fs.readFileSync(path.join(clientRoot, 'assets/Lobby/Code/HallRoomGateway.ts'), 'utf8');
    assert.match(gateway, /import \{[\s\S]*ProductionApiError[\s\S]*\} from/);
    assert.doesNotMatch(gateway, /activeRoomProbeError\(/);
    assert.doesNotMatch(gateway, /继续使用本地房间恢复意图/);
    const activeLookupAt = router.indexOf('activeRoom = await gateway.activeRoom();');
    const firstLobbyNavigationAt = router.indexOf('this.showLobby();');
    assert.ok(activeLookupAt >= 0 && firstLobbyNavigationAt > activeLookupAt,
        'startup must query the authoritative active room before any lobby scene navigation');
    assert.match(bootstrap, /consumeRestoreFailureMessage\(\)/);
    assert.match(lobby, /requestAccountLogout\(\): void \{\s*this\.clearRoomRecoveryIntent\(\);\s*this\.resetRuntime\(\)/);
});

test('AYCP has one authoritative resource root, native client bundle, and canonical dispatch', () => {
    const authoritative = path.join(
        clientRoot,
        'assets/Games/Other/resources/native-ui/game/aycp/resources/game/AYCP/ui/AYCPPlay.prefab',
    );
    assert.equal(fs.existsSync(authoritative), true);
    const commonAycpRoot = path.join(clientRoot, 'assets/Common/Code/Runtime/CompatibilityApp/aycp');
    const gameplayFiles = fs.existsSync(commonAycpRoot)
        ? fs.readdirSync(commonAycpRoot, { recursive: true }).filter((entry) => String(entry).endsWith('.ts'))
        : [];
    assert.deepEqual(gameplayFiles.sort(), [
        'AycpPlayController.ts', 'AycpRuntime.ts', 'AycpSceneBootstrap.ts', 'AycpSwitchCoordinator.ts',
        'model/LegacyAycpRoom.ts', 'model/LegacyAycpRoomManager.ts',
        'model/LegacyAycpRoomPositionManager.ts', 'model/LegacyAycpRoomSet.ts',
        'model/LegacyAycpSetPosition.ts', 'model/index.ts', 'network/AycpNetworkAdapter.ts',
    ].sort());
    const adapter = fs.readFileSync(path.join(commonAycpRoot, 'network/AycpNetworkAdapter.ts'), 'utf8');
    assert.match(adapter, /socket\.request<T>\('longcard\.aycp\.dispatch'/);
    assert.doesNotMatch(adapter, /socket\.request<T>\(event/);
    const lobby = fs.readFileSync(path.join(clientRoot, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');
    assert.match(lobby, /CompatibilityApp\/aycp\/AycpSwitchCoordinator/);
    assert.match(lobby, /this\.aycp\?\.accepts\(handoff\)[\s\S]*this\.aycp\.enter\(handoff\)/);
});

test('club and NJPDK production routes use real protocol requests with recovery paths', () => {
    const club = fs.readFileSync(path.join(clientRoot,
        'assets/Club/Code/Runtime/LegacyClubMainController.ts'), 'utf8');
    const create = fs.readFileSync(path.join(clientRoot,
        'assets/Modules/CreateRoom/Code/PlaySelectorController.ts'), 'utf8');
    const management = fs.readFileSync(path.join(clientRoot,
        'assets/Club/Code/Runtime/LegacyClubManagementController.ts'), 'utf8');
    const njpdkChat = fs.readFileSync(path.join(clientRoot,
        'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkChatController.ts'), 'utf8');
    assert.match(club, /CClubFindPIDInfo[\s\S]*CClubFindPIDAdd/);
    assert.match(club, /SClub_GetAllRoomMin[\s\S]*renderRooms\(\)/);
    assert.match(create, /selectedGame/);
    assert.match(create, /gateway\.create[\s\S]*type: 'CLUB'/);
    assert.doesNotMatch(create, /club\.CClubCreateRoom/);
    assert.match(management, /club\.CClubClose[\s\S]*catch/);
    assert.match(njpdkChat, /common\.room\.dispatch[\s\S]*catch/);
});
