import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = path.join(root, 'assets');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function methodBody(source, signature) {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `missing method: ${signature}`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}' && --depth === 0) return source.slice(open + 1, index);
    }
    assert.fail(`unterminated method: ${signature}`);
}

function filesBelow(entry) {
    const found = [];
    if (!fs.existsSync(entry)) return found;
    for (const item of fs.readdirSync(entry, { withFileTypes: true })) {
        const target = path.join(entry, item.name);
        if (item.isDirectory()) found.push(...filesBelow(target));
        else if (!item.isSymbolicLink()) found.push(target);
    }
    return found;
}

test('AooClientManager and its persistent Cocos identity are completely removed', () => {
    const production = filesBelow(assets);
    assert.equal(production.some(file => path.basename(file).startsWith('AooClientManager.')), false);
    for (const file of production.filter(file => /\.(ts|scene|prefab|meta)$/.test(file))) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /AooClientManager|aoo\.client\.manager\.authority|fa435291-894d-4e9f-a76a-6005c0ca3701/, file);
        assert.doesNotMatch(source, /addPersistRootNode\s*\(/, file);
    }
});

test('composition root is unique, typed, node-free and the only service constructor', () => {
    const composition = read('assets/Login/Code/Bootstrap/ClientBootstrap.ts');
    assert.match(composition, /Symbol\.for\('aoo\.client\.runtime\.services'\)/);
    assert.doesNotMatch(composition, /\bany\b|\bNode\b|from ['"]cc['"]/);
    assert.match(composition, /Object\.freeze\(\{ auth, network, scenes, roomRecovery \}\)/);
    for (const name of ['AuthSession', 'NetworkRuntime', 'SceneRouter', 'RoomRecoveryStore']) {
        let constructors = 0;
        for (const file of filesBelow(assets).filter(file => file.endsWith('.ts'))) {
            constructors += fs.readFileSync(file, 'utf8').match(new RegExp(`new ${name}\\(`, 'g'))?.length ?? 0;
        }
        assert.equal(constructors, 1, `${name} must be constructed only by ClientBootstrap`);
    }
});

test('services expose explicit lifecycle and separated responsibilities', () => {
    const auth = read('assets/Login/Code/Auth/AuthSession.ts');
    const network = read('assets/Login/Code/Network/NetworkRuntime.ts');
    const scenes = read('assets/Login/Code/Navigation/SceneRouter.ts');
    for (const [name, source] of [['AuthSession', auth], ['NetworkRuntime', network], ['SceneRouter', scenes]]) {
        assert.match(source, /public start\(\): void/);
        assert.match(source, /public stop\(\): void/);
        assert.match(source, /public dispose\(\): void/);
        assert.match(source, /if \(this\.disposed\) return/);
        assert.doesNotMatch(source, /extends Component|addPersistRootNode/);
        assert.doesNotMatch(source, /class \w*Manager/);
        assert.ok(source.includes(`class ${name}`));
    }
    assert.doesNotMatch(auth, /WebSocket|ProtocolClient|director|loadScene/);
    assert.match(network, /ProtocolClient|HallHeartbeatService|LegacyRoleGateway/);
    assert.doesNotMatch(network, /LobbyScreenController|director|loadScene/);
    assert.match(scenes, /LobbyScreenController|loadScene/);
    assert.match(scenes, /recoverStartup\(sceneName: string, parent: Node\)/);
});

test('Login, Lobby and gameplay use injected canonical interfaces without aliases or fallback', () => {
    const loginBootstrap = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');
    const loginView = read('assets/Login/Code/Auth/LoginView.ts');
    const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
    assert.equal(loginBootstrap.match(/startClientServices\(\)/g)?.length, 1);
    assert.match(loginView, /configure\(auth: AuthSession\)/);
    assert.match(lobby, /private readonly resetRuntime: \(\) => void/);
    for (const file of filesBelow(assets).filter(file => file.endsWith('.ts'))) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /CompatibilityApp\/auth\//, file);
        assert.doesNotMatch(source, /getAuthService|installAuthGateway|AuthRuntime|AuthService/, file);
        assert.doesNotMatch(source, /(?:aooClientManager|clientManager)\s*\?\?|globalThis\s+as\s+.*\bany\b/, file);
    }
});

test('BootStrap is the only startup-route owner and presentation scenes only consume it', () => {
    const bootstrap = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');
    const composition = read('assets/Login/Code/Bootstrap/ClientBootstrap.ts');
    const scenes = read('assets/Login/Code/Navigation/SceneRouter.ts');

    assert.match(composition, /export function getStartedClientServices\(\): ClientServices \| null/);
    assert.equal(bootstrap.match(/startClientServices\(\)/g)?.length, 1,
        'only the authored Boot path may construct/start client services');
    assert.match(bootstrap, /if \(!isBootstrapScene\) \{[\s\S]*getStartedClientServices\(\)[\s\S]*mountLoginPresentation\(epoch\)[\s\S]*return;/,
        'LoginScene must consume the existing runtime and return before startup routing');
    assert.match(bootstrap, /__aoo_BOOTSTRAP_ROUTE_OWNER__/);
    assert.doesNotMatch(bootstrap, /addPersistRootNode\s*\(/);

    assert.match(scenes, /if \(!activeRoom\) \{[\s\S]*await this\.presentLobbyScene\(account, role, operationId\)/,
        'the no-room route must commit and mount MainScene using its existing Hall role');
    assert.match(scenes, /private async presentLobbyScene\(account: AuthenticatedAccount, role: RoleSession, operationId: number\)/);
    const authenticatedRoute = scenes.slice(
        scenes.indexOf('public async recoverAuthenticatedTarget'),
        scenes.indexOf('public async recoverStartup'),
    );
    const currentGuard = authenticatedRoute.slice(
        authenticatedRoute.indexOf('const current ='),
        authenticatedRoute.indexOf('this.logNavigation'),
    );
    assert.doesNotMatch(currentGuard, /parent\.isValid/,
        'a committed target scene must not be rejected because its source node was destroyed');
});

test('session reset closes one socket/listener/timer owner before relogin', () => {
    const network = read('assets/Login/Code/Network/NetworkRuntime.ts');
    const scenes = read('assets/Login/Code/Navigation/SceneRouter.ts');
    const heartbeat = read('assets/Common/Code/Runtime/network/HallHeartbeatService.ts');
    assert.doesNotMatch(network, /public start\(\): void \{[\s\S]{0,220}new ProtocolClient\('hall'\)/);
    assert.match(network, /loginToHall\(account[\s\S]*new ProtocolClient\('hall'\)/);
    assert.match(network, /disposeTransport\(\)[\s\S]*cancelWsTicketRequest[\s\S]*heartbeat\?\.stop\(\)[\s\S]*client\?\.close\(\)/);
    const resetSession = methodBody(scenes, 'public resetSession(): void');
    assert.match(resetSession, /this\.lobby\?\.destroy\(\)/);
    assert.match(resetSession, /this\.network\.reset\(\)/);
    assert.doesNotMatch(resetSession, /this\.network\.resetGame\(\)/);
    assert.match(heartbeat, /public start\(\): void \{\s*this\.stop\(\)/);
    assert.match(heartbeat, /clearInterval\(this\.timer\)/);
});
