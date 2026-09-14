import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

test('normal room entry and exit keep the current scene visible without progress UI', () => {
    const launcher = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts'), 'utf8');
    const router = fs.readFileSync(path.join(root, 'assets/Login/Code/Navigation/SceneRouter.ts'), 'utf8');
    const createRoom = fs.readFileSync(path.join(root, 'assets/Modules/CreateRoom/Code/PlaySelectorController.ts'), 'utf8');

    assert.match(launcher, /name: `game:\$\{sceneName\}`[\s\S]{0,180}showDuringProgress: false/);
    assert.match(launcher, /name: `game:\$\{sceneName\}`[\s\S]{0,260}retainCurrentFrame: true/);
    assert.match(launcher, /name: 'game-return-lobby'[\s\S]{0,180}showDuringProgress: false/);
    assert.match(launcher, /name: 'game-return-lobby'[\s\S]{0,280}retainCurrentFrame: true/);
    assert.match(router, /\} : null, false\);/);
    assert.match(router, /prepareStartupTransition\('正在准备目标界面\.\.\.', 0, showTransition\)/);
    assert.match(router, /leavingAuthenticatedLogin[\s\S]*prepareStartupTransition\('正在准备目标界面\.\.\.', 0, presentation === 'NAVIGATE',[\s\S]*leavingAuthenticatedLogin \? 0 : NAVIGATION_REVEAL_DELAY_MS/);
    assert.match(router, /stage: 'ROOM_PRESENTED'[\s\S]{0,300}await this\.releaseStartupTransition\(\)/);
    assert.match(createRoom, /name: `create-room:\$\{selectedGame\.gameCode\}`[\s\S]{0,220}showDuringProgress: false/);
    assert.match(createRoom, /name: `create-room:\$\{selectedGame\.gameCode\}`[\s\S]{0,280}retainCurrentFrame: true/);
    assert.ok(createRoom.indexOf('this.forms.close(FORM_PATH)') < createRoom.indexOf('await this.onCreated({ ...handoff'));
});

test('room reconnect keeps its cover until authoritative avatars and cards are presented', () => {
    const controller = fs.readFileSync(path.join(root,
        'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
    assert.match(controller, /waitForInitialPresentation\(\): Promise<void>[\s\S]{0,220}pendingPresentations[\s\S]{0,160}Promise\.allSettled\(initial\)/);
    assert.doesNotMatch(controller, /waitForInitialPresentation\(\): Promise<void>\s*\{\s*return Promise\.resolve\(\);/);
});

test('navigation cover is revealed before its optional background texture finishes loading', () => {
    const coordinator = fs.readFileSync(path.join(root,
        'assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts'), 'utf8');
    assert.match(coordinator, /void this\.prepareTransitionBackground\(\);/);
    assert.match(coordinator, /if \(showAfterMs === 0\) reveal\(\);/);
    assert.doesNotMatch(coordinator, /backgroundReady\.then\(reveal\)/);
});

test('Creator preview owns the very first refresh frame instead of exposing its black page', () => {
    const preview = fs.readFileSync(path.join(root, 'preview-template/index.ejs'), 'utf8');
    assert.match(preview, /id="aoo-startup-cover"/);
    assert.match(preview, /html, body, #GameDiv, #Cocos3dGameContainer, #GameCanvas \{ background:#F2F1ED !important; \}/);
    assert.match(preview, /rel="preload" as="image" href="assets\/Startup\/native\/f6\/f60d7021-4ffc-4350-bc4e-c2b8afc4dd04\.png" fetchpriority="high"/);
    assert.match(preview, /#aoo-startup-cover[^}]+url\('assets\/Startup\/native\/f6\/f60d7021-4ffc-4350-bc4e-c2b8afc4dd04\.png'\)/);
    assert.ok(preview.indexOf('id="aoo-startup-cover"') < preview.indexOf('id="GameCanvas"'));
});

test('startup and navigation progress keep moving until the target frame is ready', () => {
    const startup = fs.readFileSync(path.join(root, 'assets/Startup/Code/StartupPresentationView.ts'), 'utf8');
    const coordinator = fs.readFileSync(path.join(root,
        'assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts'), 'utf8');
    const preview = fs.readFileSync(path.join(root, 'preview-template/index.ejs'), 'utf8');
    assert.match(preview, /animation:aoo-startup-first-motion/);
    assert.match(startup, /Math\.max\(this\.targetProgress, 0\.985\)/);
    assert.match(startup, /fill\.style\.transform = 'scaleX\(1\)'/);
    assert.match(coordinator, /Math\.max\(this\.targetProgress, 0\.985\)/);
});

test('silent transitions still reveal their error cover on failure', () => {
    const coordinator = fs.readFileSync(path.join(root, 'assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts'), 'utf8');
    assert.match(coordinator, /if \(options\.showDuringProgress !== false && !silentHandoff && !initialPresentationVisible\) \{/);
    assert.match(coordinator, /const silentHandoff = \[\.\.\.this\.records\.values\(\)\]/);
    const failureStart = coordinator.lastIndexOf('public fail(');
    const failure = coordinator.slice(failureStart, coordinator.indexOf('public cancel(', failureStart));
    assert.match(failure, /record\.visible = true/);
    assert.match(failure, /this\.show\(record\)/);
    assert.match(coordinator, /texture\.readPixels\(\)/);
    assert.match(coordinator, /camera\.targetTexture = texture/);
    assert.doesNotMatch(coordinator, /drawImage\(source/);
    assert.match(coordinator, /target\.scale\(1, -1\)/);
    assert.match(coordinator, /director\.once\(Director\.EVENT_AFTER_DRAW, this\.captureAfterDraw, this\)/);
    assert.match(coordinator, /!this\.hasVisiblePixels\(pixels\)/);
    assert.match(coordinator, /960 \/ Math\.max\(1, source\.width\)/);
    assert.doesNotMatch(coordinator, /getImageData\(/);
    assert.match(coordinator, /this\.releaseCurrentFrame\(\)/);
    assert.match(coordinator, /visibleOwnerActive[\s\S]*options\.retainCurrentFrame && !visibleOwnerActive/);
    assert.match(coordinator, /outcome === 'commit' && record\.visible && record\.options\.showDuringProgress !== false[\s\S]*this\.releaseCurrentFrame\(\)/);
});

test('room transitions avoid serial bundle loads and duplicate exit-frame commits', () => {
    const launcher = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts'), 'utf8');
    const router = fs.readFileSync(path.join(root, 'assets/Login/Code/Navigation/SceneRouter.ts'), 'utf8');
    const coordinator = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'), 'utf8');

    assert.match(launcher, /const commonBundleReady = this\.stage\('load-common-bundle'/);
    assert.match(launcher, /const sceneBundleReady = this\.stage\('load-common-scene-bundle'/);
    assert.match(launcher, /const gameBundleReady = this\.stage\('load-game-bundle'/);
    assert.match(launcher, /const sceneBundle = await sceneBundleReady/);
    assert.match(launcher, /await Promise\.all\(\[commonBundleReady, gameBundleReady, sceneReady\]\)/);
    assert.match(launcher, /load-common-bundle[\s\S]*load-common-scene-bundle[\s\S]*load-game-bundle/);
    const launch = launcher.slice(launcher.indexOf('private async launchOnce('), launcher.indexOf('private async mount('));
    assert.doesNotMatch(launch, /await this\.afterCurrentSceneDraw\(\)/);
    assert.doesNotMatch(launch, /await this\.stage\('join-room-prewarm'/);
    assert.doesNotMatch(launch, /await this\.stage\('preload-room-scene'/);
    assert.match(launch, /const sceneReady[\s\S]*this\.stage\('load-room-scene'/);
    const presentation = launcher.match(/private async waitForRoomBasePresentation\(\): Promise<void> \{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.doesNotMatch(presentation, /nextFrame|afterBrowserPaint/);
    assert.match(router, /target\?\.presentationTransition\?\.isCurrent\(\)/);
    assert.match(router, /this\.startupTransition = target\.presentationTransition/);
    const enterStart = coordinator.indexOf('public async enter(');
    const deferredStart = coordinator.indexOf('private async preloadDeferredRoomForms');
    const enter = coordinator.slice(enterStart, deferredStart);
    assert.ok(enter.indexOf('await gameClient.connect(authorityRoute)') < enter.indexOf('await runtime.enterRoom(roomId)'));
    assert.ok(enter.indexOf('this.forms.preload(COMMON_ROOM_FORM)') < enter.indexOf('await gameClient.connect(authorityRoute)'));
    assert.ok(enter.indexOf('this.forms.preload(PDK_ROOM_FORM)') < enter.indexOf('await gameClient.connect(authorityRoute)'));
    assert.match(enter, /const showRoomLayersWhenReady = async/);
    assert.match(enter, /roomLayersPending \?\?= showRoomLayersWhenReady\(\)/);
    assert.ok(enter.indexOf("this.lobbyNode.emit('common-pdk-room-ready'") < enter.indexOf('this.preloadDeferredRoomForms('));
    assert.doesNotMatch(enter.slice(0, enter.indexOf("this.lobbyNode.emit('common-pdk-room-ready'")),
        /settlementBundlePreloader\.preload/);
});

test('room admission reuses lobby metadata and parallelizes post-join requests', () => {
    const gateway = fs.readFileSync(path.join(root, 'assets/Lobby/Code/HallRoomGateway.ts'), 'utf8');
    const lobby = fs.readFileSync(path.join(root, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');
    const club = fs.readFileSync(path.join(root, 'assets/Club/Code/Runtime/LegacyClubMainController.ts'), 'utf8');
    const launcher = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts'), 'utf8');
    assert.match(gateway, /private static readonly metadataCacheMs = 60_000/);
    assert.match(gateway, /private readonly catalogCache/);
    assert.match(gateway, /private readonly configurationCache/);
    const join = gateway.match(/private async joinOnce[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.match(join, /const \[prepared, ticket\] = await Promise\.all\(\[/);
    assert.match(join, /this\.issueRoomTicket\(roomId, resolveRuntimeEndpoints\(\)\.hallWebSocketUrl\)/);
    assert.match(join, /this\.prepare\(roomId\)/);
    assert.match(club, /legacy-club-prewarm-room/);
    assert.match(lobby, /hallRoomGateway\.prepare\(roomId\)/);
    assert.match(lobby, /prewarmDefaultRoom\(\)/);
    assert.match(launcher, /preloadScene\(sceneBundle, sceneName\)/);
    assert.match(launcher, /this\.loadPrefab\(sceneBundle, COMMON_ROOM_PREFAB\)/);
    assert.match(launcher, /this\.loadPrefab\(gameBundle, PDK_ROOM_PREFAB\)/);
});

test('regional PDK desk clicks use one authoritative scene launch after admission', () => {
    const launcher = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts'), 'utf8');
    const lobby = fs.readFileSync(path.join(root, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');
    const router = fs.readFileSync(path.join(root, 'assets/Login/Code/Navigation/SceneRouter.ts'), 'utf8');

    assert.match(launcher, /private async ensureMountedShell\(sceneName: string\)/);
    assert.doesNotMatch(launcher, /presentDefaultRoomShell|rollbackRoomShell|presentRoomShell|shellPending|shellTransition/);
    const coordinator = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'), 'utf8');
    const play = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'), 'utf8');
    const forms = fs.readFileSync(path.join(root, 'assets/Common/Code/Runtime/ui/LegacyFormManager.ts'), 'utf8');
    assert.match(coordinator, /await this\.playController\?\.waitForInitialPresentation\(\)/);
    assert.equal((coordinator.match(/presentationOwnedExternally: true/g) ?? []).length, 2);
    assert.match(forms, /presentationOwnedExternally\) transition\.cancel\(\)/);
    assert.match(play, /trackPresentation\(this\.renderHeads\(\)/);
    assert.match(play, /trackPresentation\(this\.renderHand\(\)/);

    const enterRoom = lobby.slice(lobby.indexOf('private async enterRoom('), lobby.indexOf('private roomEntryMessage('));
    const admissionAt = enterRoom.indexOf('this.hallRoomGateway.join(roomId)');
    const launchAt = enterRoom.indexOf('this.enterAuthoritativeSubgame');
    assert.ok(admissionAt >= 0 && launchAt > admissionAt, 'the room scene must launch only after Hall admission succeeds');
    assert.doesNotMatch(enterRoom, /presentDefaultRoomShell|rollbackRoomShell/);
    assert.match(router, /startupMessage: typeof target\?\.startupMessage === 'string'/);
    assert.ok(lobby.indexOf('prewarmDefaultRoom()') < lobby.indexOf('restoreLastClub('),
        'default room prewarm must begin before club restoration exposes desks');
});

test('room re-entry retains warmed prefabs instead of reusing destroyed promise-only cache', () => {
    const launcher = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts'), 'utf8');
    assert.match(launcher, /private readonly prewarmedAssets = new Map<string, readonly Asset\[\]>/);
    assert.match(launcher, /retained\.every\(asset => isValid\(asset, true\)\)/);
    assert.match(launcher, /for \(const asset of assets\) asset\.addRef\(\)/);
    assert.match(launcher, /this\.prewarmedAssets\.set\(key, assets\)/);
    assert.match(launcher, /bundle\.release\(assetPath, Prefab\)/);
    assert.match(launcher, /if \(isValid\(asset, true\)\) asset\.decRef\(\)/);
    assert.match(launcher, /!sceneAsset\.scene \|\| !isValid\(sceneAsset\.scene, true\)/);
    assert.match(launcher, /assetManager\.releaseAsset\(sceneAsset as SceneAsset\)/);
    assert.match(launcher, /run\(false\)/);
    assert.match(launcher, /private readonly sceneLoadPending = new Map<string, Promise<void>>/);
    assert.match(launcher, /const existing = this\.sceneLoadPending\.get\(sceneName\)/);
    assert.match(launcher, /director\.runScene\(sceneAsset, undefined, \(launchError\)/);
    assert.match(launcher, /this\.sceneLoadPending\.set\(sceneName, pending\)/);

    const cleanup = launcher.slice(launcher.indexOf('private cleanup(): void'), launcher.indexOf('private loadBundle('));
    assert.doesNotMatch(cleanup, /releasePrewarmedAssets|prewarmedAssets\.clear/,
        'normal room exit must retain warmed assets for immediate re-entry');
    const destroy = launcher.slice(launcher.indexOf('public destroy(): void'), launcher.indexOf('public getFormManager'));
    assert.match(destroy, /releasePrewarmedAssets/,
        'launcher destruction must release the retained resource ownership');
});

test('runtime room exit contains Hall failures instead of leaking an unhandled rejection', () => {
    const coordinator = fs.readFileSync(path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'), 'utf8');
    assert.match(coordinator, /onExit:\s*\(\)\s*=>\s*\{\s*this\.requestLeave\('room-not-found'\);\s*\}/);
    assert.doesNotMatch(coordinator, /onExit:\s*\(\)\s*=>\s*\{\s*void this\.leave\('room-not-found'\)/);
});
