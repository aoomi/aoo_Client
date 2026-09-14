import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relativePath => fs.readFileSync(path.join(clientRoot, relativePath), 'utf8');

test('web templates disable the default Cocos splash before the engine starts', () => {
    for (const template of [
        'build-templates/web-mobile/index.html',
        'build-templates/web-desktop/index.html',
    ]) {
        const source = read(template);
        assert.match(source, /#F2F1ED/);
        assert.match(source, /#splash, \.progress-bar[\s\S]*display: none !important/);
        assert.match(source, /id="aoo-startup-cover"/);
        assert.match(source, /正在加载中\.\.\.\.\.\./);
        assert.doesNotMatch(source, /aoo-startup-percent/);
        assert.match(source, /f60d7021-4ffc-4350-bc4e-c2b8afc4dd04\.png/);
        assert.doesNotMatch(source, /Cocos Creator/);
        assert.doesNotMatch(source, /System\.import = function|Object\.defineProperty\(window, 'System'/);
    }

    assert.doesNotMatch(read('build-templates/web-mobile/index.html'), /Cocos Creator/);
    const preview = read('preview-template/index.ejs');
    assert.match(preview, /#splash, \.progress-bar[\s\S]*display: none !important/);
    assert.match(preview, /<div id="splash" aria-hidden="true">/);
    assert.match(preview, /id="aoo-startup-cover"/);
    assert.match(preview, /prefers-reduced-motion/);
    assert.doesNotMatch(preview, /Object\.defineProperty\(window, 'System'|System\.import = function/);
    assert.match(preview, /const aooPreviewVersion = 'aoo-preview-/);
    assert.match(preview, /previewPorts = new Set\(\['7456', '7457', '7458', '7459', '7460', '5173', '5188'\]\)/);
    assert.match(preview, /window\.__aoo_RUNTIME_CONFIG__ = \{[\s\S]*environment: 'test',[\s\S]*apiBaseUrl: `http:\/\/\$\{location\.hostname\}:8080\/`/);
    assert.ok(preview.indexOf('window.__aoo_RUNTIME_CONFIG__ = {') < preview.indexOf('versionPreviewMarkup(include(cocosTemplate'));
    assert.match(preview, /Object\.defineProperty\(window, '__aoo_CREATOR_LAN_PREVIEW__'/);
    assert.ok(preview.indexOf("Object.defineProperty(window, '__aoo_CREATOR_LAN_PREVIEW__'") < preview.indexOf('versionPreviewMarkup(include(cocosTemplate'));
    const protocolHttp = read('assets/Common/Code/Runtime/network/ProtocolHttpClient.ts');
    assert.match(protocolHttp, /new URL\(previewGateway\)\.origin === url\.origin/);
    assert.match(protocolHttp, /previewRuntime\.__aoo_CREATOR_LAN_PREVIEW__ === true/);
    assert.doesNotMatch(protocolHttp, /previewGateway\?\.origin/);
    assert.doesNotMatch(preview, /const nativeFetch|XMLHttpRequest\.prototype\.open|HTMLScriptElement\.prototype/,
        'preview must not monkey-patch browser loaders because it corrupts Creator module exports');
    assert.match(preview, /versionPreviewMarkup\(include\(cocosTemplate/);

    for (const application of [
        'build/web-mobile/application.js',
        'build/web-desktop/application.js',
    ]) {
        if (!fs.existsSync(path.join(clientRoot, application))) continue;
        const source = read(application);
        assert.match(source, /splashScreen:\s*\{/);
        assert.match(source, /totalTime:\s*0/);
        assert.match(source, /type:\s*'none'/);
    }
});

test('startup and scene transitions have separate visual owners', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    const startup = read('assets/Startup/Code/StartupPresentationView.ts');
    const catalog = read('assets/Common/Code/Runtime/ui/SceneTransitionAssetCatalog.ts');
    assert.match(startup, /class StartupPresentationView implements InitialPresentationBoundary/);
    assert.match(startup, /Texture\/StartupBg\/spriteFrame/);
    assert.match(coordinator, /#aoo-scene-transition-cover\{position:fixed;inset:0/);
    assert.match(catalog, /backgroundTexture: 'Texture\/TransitionBg\/texture'/);
    assert.match(coordinator, /'正在加载中\.\.\.\.\.\.'/);
    assert.doesNotMatch(coordinator, /aoo-startup-|STARTUP_LOGO_URL|StartupBg/);
    assert.doesNotMatch(coordinator, /percent: HTMLElement|dom\.percent\.textContent/);
});

test('startup transition stays visible until login or lobby presentation is ready', () => {
    const router = read('assets/Login/Code/Navigation/SceneRouter.ts');
    const bootstrap = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');

    assert.match(router, /PresentationTransitionCoordinator/);
    assert.match(router, /public prepareStartupTransition\(message =/);
    assert.match(router, /public async releaseStartupTransition\(\): Promise<void>/);
    assert.match(router, /if \(scene !== 'BootStrap'\) this\.prepareStartupTransition\(`正在打开\$\{scene\}\.\.\.`\);/);
    assert.match(router, /await this\.enterLobby\(account, parent\);[\s\S]*await this\.waitForTargetPresentation\(\);[\s\S]*await this\.releaseStartupTransition\(\);/);
    assert.doesNotMatch(router, /toDataURL|captureCanvasSnapshot|aoo-startup-transition-mask/);
    assert.match(router, /commitAfterPresentation/);

    assert.match(bootstrap, /this\.services\?\.scenes\.prepareStartupTransition\(\);[\s\S]*director\.loadScene\('LoginScene'/);
    assert.match(bootstrap, /loginView = await this\.mountLoginView\(\);[\s\S]*await this\.services\.scenes\.releaseStartupTransition\(\);/);
    assert.match(bootstrap, /failStartupTransition\(new Error\(message\)/);
    assert.match(bootstrap, /\[BootstrapStage\] startup-route:start/);
    assert.match(bootstrap, /recoverBootstrapTarget\([\s\S]*12_000,[\s\S]*恢复登录状态超时/);
    assert.match(bootstrap, /\[BootstrapStage\] login-scene-load:success/);
    assert.match(bootstrap, /function diagnosticError\(error: unknown\)/);

    const accountGateway = read('assets/Login/Code/Auth/UnifiedIdentityAuthGateway.ts');
    assert.match(accountGateway, /this\.origin = gatewayOrigin\(options\.endpoint\)/);
    assert.doesNotMatch(accountGateway, /生产账号入口必须使用 HTTPS|requireOrigin\(/);
    assert.match(bootstrap, /presentationTransition\.updateInitial\(message, this\.bootstrapProgress\)/);
    assert.doesNotMatch(bootstrap, /__aooReleaseBootCover\?\.\(\);[\s\S]*const safeProgress/);

    const launcher = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts');
    assert.doesNotMatch(launcher, /toDataURL|captureCanvasFrame|aoo-startup-dom-mask|sleep\(150\)/);
    assert.match(launcher, /presentationTransition\.begin/);
    assert.match(launcher, /await this\.waitForBaseLayers\(1_200\)/);
    assert.match(launcher, /BackgroundLayer/);
    assert.match(launcher, /OperationLayer/);
    assert.match(launcher, /房间基础界面未完成绘制，请重试/);
    assert.match(launcher, /mount-room-runtime/);
    assert.match(launcher, /present-room-base/);
    assert.match(bootstrap, /startup-route:failure', diagnosticError\(error\)/);
    assert.match(launcher, /commitAfterPresentation/);

    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    assert.match(coordinator, /private readonly records = new Map/);
    assert.match(coordinator, /showAfterMs/);
    assert.match(coordinator, /progressKind/);
    assert.match(coordinator, /this\.armTimeout\(record\)/,
        'transition timeout must be renewed by real progress instead of timing the whole route');
    assert.match(coordinator, /new Error\(`\$\{record\.message\}超时，请重试`\)/,
        'an inactivity timeout should report the stalled stage');
    assert.match(coordinator, /Director\.EVENT_AFTER_DRAW/);
    assert.match(coordinator, /aoo-scene-transition-cover/);
    assert.match(coordinator, /this\.cancel\(id\);[\s\S]*retry\?\.\(\);/);
    assert.doesNotMatch(coordinator, /commitAfterPresentation\(readiness:[\s\S]{0,240}finally/);
    assert.doesNotMatch(coordinator, /toDataURL|getImageData/);
    assert.match(coordinator, /root\.hidden = true;[\s\S]*documentRef\.body\.appendChild\(root\)/,
        'a lazily-created transition cover must be hidden before it enters the document');
    assert.match(coordinator, /const dom = this\.dom\?\.root\.isConnected \? this\.dom : null;/,
        'finishing a silent handoff must not create a visible transition cover');
    assert.match(router, /大厅场景已加载，正在挂载界面/);
    assert.match(router, /大厅界面已挂载，正在提交首帧/);
    assert.match(router, /await this\.loadOwnedScene\('MainScene'\)/);
    assert.match(router, /const bundle = await getOrLoadBundle\('lobby'\)/);
    assert.match(router, /bundle\.loadScene\('MainScene'/);
    assert.doesNotMatch(router, /director\.loadScene\('MainScene'/,
        'MainScene belongs to the lobby Bundle and must not be resolved from the main bundle');
    assert.doesNotMatch(router, /场景 \$\{scene\} 未加入构建列表/,
        'a synchronous load rejection must not be reported as a build-list fact');

    const forms = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    assert.match(forms, /name: `form:\$\{path\}`/);
    assert.match(forms, /showAfterMs: this\.transitionShowDelay\(120\)/);
    assert.match(forms, /commitAfterPresentation/);

    const roomScene = JSON.parse(read('assets/Games/Common/Scenes/GameRoom2D.scene'));
    const camera = roomScene.find(item => item.__type__ === 'cc.Camera');
    assert.deepEqual(camera._color, { __type__: 'cc.Color', r: 4, g: 21, b: 34, a: 255 });
});

test('unused club bootstrap requests are not sent during lobby mounting', () => {
    const session = read('assets/Lobby/Code/LobbySessionService.ts');
    assert.doesNotMatch(session, /club\.CClubInvited/);
    assert.doesNotMatch(session, /union\.CUnionNotify/);
    assert.match(session, /await this\.client\.request<LegacyCurrentRoom>\('game\.C1101GetRoomID'/);
});

test('club list code 3008 is rendered as an empty list instead of a global error', () => {
    const gateway = read('assets/Lobby/Code/ClubList/LobbyClubListGateway.ts');
    assert.match(gateway, /\^3008:\\s/);
    assert.match(gateway, /return \[\]/);
    assert.match(gateway, /throw error/);
});
