import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('startup loading cover shows one fixed loading message above the progress bar', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    const startup = read('assets/Startup/Code/StartupPresentationView.ts');
    const desktop = read('build-templates/web-desktop/index.html');
    const mobile = read('build-templates/web-mobile/index.html');

    for (const source of [desktop, mobile]) {
        assert.match(source, /aoo-startup-status[^>]*>正在加载中\.\.\.\.\.\./);
        assert.doesNotMatch(source, /<[^>]*class=["']aoo-startup-percent["']/);
        assert.match(source, /\.aoo-startup-card \{ position:fixed; left:50%; bottom:30px;/);
        assert.match(source, /width:min\(1200px,calc\(100vw - 48px\)\)/);
        assert.match(source, /\.aoo-startup-status \{[^}]*color:#fff; text-shadow:-0\.5px -0\.5px 0 #000/);
        assert.doesNotMatch(source, /aoo-startup-error/);
        assert.match(source, /\.aoo-startup-progress \{[^}]*background:rgba\(0,0,0,\.38\);[^}]*box-shadow:inset/);
    }
    assert.match(read('preview-template/index.ejs'),
        /\.aoo-startup-card \{ position:fixed; left:50%; bottom:30px;/);
    assert.match(read('preview-template/index.ejs'),
        /\.aoo-startup-status \{[^}]*color:#fff; text-shadow:-0\.5px -0\.5px 0 #000/);

    assert.doesNotMatch(coordinator, /dom\.percent|percent:\s*root\.querySelector/);
    assert.match(startup, /failed \? _message : '正在加载中\.\.\.\.\.\.'/);
    assert.doesNotMatch(startup, /aoo-startup-error/);
    assert.match(coordinator, /aoo-scene-transition-status/);
    assert.match(coordinator, /\.aoo-scene-transition-status\{[^}]*color:#fff;text-shadow:-0\.5px -0\.5px 0 #000/);
    assert.doesNotMatch(coordinator, /aoo-scene-transition-error/);
    const bootstrap = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');
    assert.match(bootstrap, /label\.color = Color\.WHITE/);
    assert.match(bootstrap, /outline\.color = Color\.BLACK/);
    assert.match(bootstrap, /outline\.width = 0\.5/);
});

test('web startup owns the only visible first-load progress surface', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    const startup = read('assets/Startup/Code/StartupPresentationView.ts');
    const bootstrap = read('assets/Login/Code/Bootstrap/LoginScreenBootstrap.ts');
    const router = read('assets/Login/Code/Navigation/SceneRouter.ts');

    assert.match(coordinator, /public updateInitial\(message: string, progress: number\): boolean/);
    assert.match(coordinator, /const initialPresentationVisible = this\.initialPresentationActive[\s\S]{0,100}this\.initialPresentation\?\.isVisible\(\) \?\? false/);
    assert.match(coordinator, /this\.initialPresentationActive = true;[\s\S]{0,120}this\.initialPresentation\?\.update/);
    assert.match(coordinator, /this\.initialPresentationActive = false;[\s\S]{0,100}this\.initialPresentation\?\.release/);
    assert.match(coordinator, /!silentHandoff && !initialPresentationVisible/);
    assert.match(coordinator, /outcome === 'commit' && record\.options\.releaseInitialPresentation/);
    assert.match(router, /releaseInitialPresentation: true/);
    assert.match(startup, /if \(!root\) return false;[\s\S]*return true;/);
    assert.match(startup, /public isVisible\(\): boolean/);
    assert.match(startup, /return Boolean\(root && !this\.released\)/);
    assert.match(bootstrap, /const startupOwnsPresentation = presentationTransition\.updateInitial/);
    assert.match(bootstrap, /\['BootstrapStatus', 'ProgressTrack', 'ProgressPercent'\]/);
    assert.match(bootstrap, /presentationNode\.active = !startupOwnsPresentation/);
});

test('startup progress stays animated below completion and commits only after painting 100%', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    assert.match(coordinator, /Math\.min\(0\.94, this\.clamp\(progress\)\)/);
    assert.match(coordinator, /this\.displayedProgress < 0\.9399/);
    assert.match(coordinator, /await this\.afterBrowserPaint\(id\);\s*await this\.completeProgress\(id\);\s*this\.finish\(id, 'commit'\)/);
    assert.match(coordinator, /this\.paintProgress\(1\);\s*this\.requestFrame\(\(\) => resolve\(\)\)/);
    assert.match(coordinator, /Math\.min\(80, Math\.max\(32,/);
    assert.doesNotMatch(coordinator, /transition:transform/);
});

test('startup cover is removed atomically after the painted target is ready', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    assert.match(coordinator, /await this\.afterEngineDraw\(id\);[\s\S]*await this\.afterBrowserPaint\(id\);/);
    assert.match(coordinator, /const dom = this\.dom\?\.root\.isConnected \? this\.dom : null;/);
    assert.match(coordinator, /dom\.root\.setAttribute\('aria-hidden', 'true'\);[\s\S]*dom\.root\.hidden = true;/);
    assert.doesNotMatch(coordinator, /is-revealing[^}]*transition:\s*opacity|setTimeout\([\s\S]{0,300}root\.hidden = true/);
});

test('a remaining silent room handoff cannot inherit a completed visible cover', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    assert.match(coordinator,
        /this\.records\.size > 0[\s\S]{0,500}some\(item => item\.visible\)[\s\S]{0,300}this\.hideDomCover\(\)/);
    assert.match(coordinator, /private hideDomCover\(\): void/);
    assert.match(coordinator, /const current = this\.records\.get\(id\);[\s\S]*?if \(!current\?\.visible\) return;/);
});

test('startup presentation releases when its route commits even if background preloads remain', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    const releaseAt = coordinator.indexOf("outcome === 'commit' && record.options.releaseInitialPresentation");
    const remainingRecordsAt = coordinator.indexOf('if (this.records.size > 0)', releaseAt);
    assert.ok(releaseAt >= 0 && remainingRecordsAt > releaseAt,
        'startup ownership must release before the remaining-background-record early return');
});

test('startup and scene transition visuals use separate owners and named assets', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    const catalog = read('assets/Common/Code/Runtime/ui/SceneTransitionAssetCatalog.ts');
    const startup = read('assets/Startup/Code/StartupPresentationView.ts');
    assert.match(startup, /Texture\/StartupBg\/spriteFrame/);
    assert.match(startup, /class StartupPresentationView implements InitialPresentationBoundary/);
    assert.match(catalog, /backgroundTexture: 'Texture\/TransitionBg\/texture'/);
    assert.match(coordinator, /new AssetLoader\(\)/);
    assert.match(coordinator, /SceneTransitionAssetCatalog\.backgroundTexture/);
    assert.doesNotMatch(coordinator, /aoo-startup-|STARTUP_LOGO_URL|StartupBg/);
    assert.doesNotMatch(startup, /TransitionBg/);
});

test('scene transition resolves its bundle image before revealing the cover', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    assert.match(coordinator, /const backgroundReady = this\.prepareTransitionBackground\(\)/);
    assert.match(coordinator, /backgroundReady\.then\(reveal\)/);
    assert.match(coordinator, /resolveBundleNativeUrl\(nativeUrl, bundle\.base\)/);
    assert.match(coordinator, /nativeUrl\.startsWith\('native\/'\)/);
    assert.match(coordinator, /new URL\(relativeNativeUrl, absoluteBundleBase\)\.href/);
    assert.doesNotMatch(coordinator, /backgroundImage = `url\("\$\{nativeUrl\}"\)`/);
});

test('visible navigation waits for the shared half-second threshold while preloads stay silent', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    const router = read('assets/Login/Code/Navigation/SceneRouter.ts');
    const forms = read('assets/Common/Code/Runtime/ui/LegacyFormManager.ts');
    assert.match(coordinator, /export const NAVIGATION_REVEAL_DELAY_MS = 500/);
    assert.match(coordinator, /options\.showAfterMs \?\? NAVIGATION_REVEAL_DELAY_MS/);
    assert.match(router, /showAfterMs = NAVIGATION_REVEAL_DELAY_MS/);
    assert.match(router, /name: 'scene-navigation'[\s\S]{0,160}showAfterMs,/);
    assert.match(forms, /path === 'UIMessage_Drift' \? 15_000 : NAVIGATION_REVEAL_DELAY_MS/);
    assert.match(forms, /name: `prefab-preload:\$\{path\}`[\s\S]{0,180}showDuringProgress: false/);
    assert.match(forms, /private invalidatePending\(\): void \{[\s\S]{0,180}request\.transition\.cancel\(\)/);
    assert.match(forms, /private cancelPending\(path: string\): void \{[\s\S]{0,180}request\.transition\.cancel\(\)/);
});

test('scene navigation progress is anchored 30px above the viewport bottom', () => {
    const coordinator = read('assets/Common/Code/Runtime/ui/PresentationTransitionCoordinator.ts');
    assert.match(coordinator, /\.aoo-scene-transition-card\{position:fixed;left:50%;bottom:30px;/);
    assert.match(coordinator, /width:min\(1200px,calc\(100vw - 48px\)\)/);
    assert.match(coordinator, /\.aoo-scene-transition-progress\{[^}]*background:rgba\(0,0,0,\.38\);[^}]*box-shadow:inset/);
    assert.match(coordinator, /transform:translateX\(-50%\)/);
    assert.doesNotMatch(coordinator, /aoo-scene-transition-error/);
});

test('room first-presentation wait cannot retain the previous frame until navigation timeout', () => {
    const pdk = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts');
    const launcher = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher.ts');
    assert.match(pdk, /waitForInitialPresentation\(\): Promise<void>[\s\S]*?return Promise\.resolve\(\)/);
    const initialWait = pdk.match(/waitForInitialPresentation\(\): Promise<void> \{[\s\S]*?\n    \}/)?.[0] ?? '';
    assert.doesNotMatch(initialWait, /waitForRoundEndPresentation|setTimeout|Promise\.race/);
    assert.match(launcher, /transition\.update\('正在提交房间首帧\.\.\.', 0\.98, 'STAGE'\);[\s\S]{0,500}?await transition\.commitAfterPresentation\(\);/);
    assert.doesNotMatch(launcher, /waitForRoomBasePresentation|roomBaseReady/);
});
