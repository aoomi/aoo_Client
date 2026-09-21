import {
    _decorator,
    assetManager,
    Button,
    BlockInputEvents,
    CCString,
    Color,
    Component,
    director,
    EditBox,
    Label,
    LabelOutline,
    Node,
    ProgressBar,
    RichText,
    ResolutionPolicy,
    Toggle,
    view,
    UITransform,
    sys,
} from 'cc';
import type { AuthenticatedAccount } from '../Auth/AuthTypes';
import { LoginView } from '../Auth/LoginView';
import { getStartedClientServices, startClientServices, type ClientServices } from './ClientBootstrap';
import { LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { createMsgDriftLifecycle } from '../../../Common/Code/Runtime/ui/MsgDriftLifecycle';
import { AooWeChatLoginController } from '../Auth/AooWeChatLoginController';
import { bootstrapRuntime } from '../../../Common/Code/Runtime/bootstrap/BootstrapRuntime';
import { legacyPlatformRuntime } from '../../../Common/Code/Runtime/platform/LegacyPlatformRuntime';
import { applyLoadingEnvironment, currentAooLoadingBootState } from './LoadingEnvironmentPolicy';
import { presentationTransition } from '../../../Common/Code/Runtime/ui/PresentationTransitionCoordinator';
import '../../../Startup/Code/StartupPresentationView';

const { ccclass, property } = _decorator;
const DISPLAY_PROGRESS_RATE_PER_MS = 0.0025;

function diagnosticError(error: unknown): Readonly<Record<string, unknown>> {
    if (!(error instanceof Error)) return Object.freeze({ message: String(error) });
    const cause = 'cause' in error ? error.cause : undefined;
    return Object.freeze({
        name: error.name,
        message: error.message,
        stack: error.stack ?? '',
        cause: cause instanceof Error
            ? { name: cause.name, message: cause.message, stack: cause.stack ?? '' }
            : cause === undefined ? '' : String(cause),
    });
}
type LoadingRuntimeState = typeof globalThis & {
    __aooReleaseBootCover?: () => void;
    __aoo_LOADING_DIAGNOSTIC__?: Readonly<{
        bootId: string;
        environment: 'test' | 'production';
        selectedGateway: string | null;
        cleanupRanThisCall: boolean;
        cleanupFailures: readonly string[];
    }>;
    __aoo_BOOT_TRANSITION_ROOT__?: Node;
    __aoo_BOOTSTRAP_ROUTE_OWNER__?: Readonly<{ bootId: string; nodeUuid: string }>;
    __aoo_BOOTSTRAP_ENTRY_REDIRECT__?: boolean;
};

@ccclass('LoginScreenBootstrap')
export class LoginScreenBootstrap extends Component {
    @property({
        displayName: '是否测试环境',
        tooltip: '只从“网关地址集合”选择受 Aoo 网关策略校验的测试入口；不会关闭鉴权。',
        visible: () => director.getScene()?.name === 'BootStrap',
    })
    private isTestEnvironment = true;

    @property({
        displayName: '是否清除本地数据',
        tooltip: '仅 BootStrap 启动入口读取的持续预览配置。勾选后每次浏览器刷新或 Creator 预览重启都会清除 Aoo 登录、会话及业务本地数据并进入登录；取消勾选后才允许恢复有效会话。',
        visible: () => director.getScene()?.name === 'BootStrap',
    })
    private isClearLocalData = false;

    @property({
        displayName: '网关地址集合',
        type: [CCString],
        tooltip: 'Aoo apiBaseUrl 候选集合。正式环境仅接受非本机 HTTPS；空集合继续使用构建注入的 RuntimeEndpoints 配置。',
        visible: () => director.getScene()?.name === 'BootStrap',
    })
    private gatewayAddresses: string[] = [];

    private bootstrapProgress = 0;
    private displayedBootstrapProgress = 0;
    private progressAnimationFrame: number | null = null;
    private progressAnimationTimestamp = 0;
    private bootstrapBlocked = false;
    private loginForms: LegacyFormManager | null = null;
    private lifecycleEpoch = 0;
    private weChatLogin: AooWeChatLoginController | null = null;
    private services: ClientServices | null = null;
    private loginSystemConfirm: (() => void) | null = null;

    protected override async start(): Promise<void> {
        const epoch = ++this.lifecycleEpoch;
        this.bootstrapProgress = 0;
        this.displayedBootstrapProgress = 0;
        this.cancelProgressAnimation();
        this.bootstrapBlocked = false;
        if (!this.isCurrent(epoch) || !this.node) return;
        const initialErrorPanel = this.node.getChildByName('ErrorPanel');
        if (initialErrorPanel) initialErrorPanel.active = false;
        // Keep the authored 720px height while exposing the live viewport width.
        // The lobby background owns the horizontal 160px extension on each side
        // of its 1280px content area; SHOW_ALL would letterbox that design and
        // prevent Top/Bottom/Left/Right widgets from reaching wide-screen edges.
        view.setDesignResolutionSize(1280, 720, ResolutionPolicy.FIXED_HEIGHT);
        const sceneName = director.getScene()?.name || 'UnnamedScene';
        // Creator Preview can deserialize the currently opened scene with an
        // empty runtime name even though the scene asset is named BootStrap.
        // BootstrapStatus is exclusive to the authored startup canvas, so it
        // is the stable ownership marker when the editor omits the scene name.
        const isBootstrapScene = sceneName === 'BootStrap'
            || Boolean(this.node.getChildByName('BootstrapStatus'))
            || Boolean(this.node.getChildByName('ErrorPanel') && this.node.getChildByName('ProgressTrack'));
        const loadingRuntime = globalThis as LoadingRuntimeState;
        const loadingBoot = currentAooLoadingBootState();
        // Only the authored BootStrap component may initialize environment,
        // version, services and the startup route. LoginScene carries the same
        // component solely as a presentation adapter; allowing it to bootstrap
        // again races the Boot route after MainScene has already committed.
        if (!isBootstrapScene) {
            const services = getStartedClientServices();
            if (!services) {
                // Creator Preview starts from whichever scene is currently
                // open. If that is LoginScene there is no process owner yet;
                // enter the authored BootStrap scene so it can establish the
                // real environment, services and route owner before LoginScene
                // consumes them. This is an initial-entry correction, not a
                // runtime route and never manufactures a presentation owner.
                if (loadingRuntime.__aoo_BOOTSTRAP_ENTRY_REDIRECT__) {
                    this.showBootstrapBlock(`启动入口循环：${sceneName} 未能进入 BootStrap`);
                    return;
                }
                loadingRuntime.__aoo_BOOTSTRAP_ENTRY_REDIRECT__ = true;
                this.logBootstrapOwner({ action: 'ENTER_BOOTSTRAP', sceneName, nodeUuid: this.node.uuid });
                this.setBootstrapStatus('正在进入启动场景...', 0.01);
                director.loadScene('BootStrap', (error) => {
                    if (!error) return;
                    loadingRuntime.__aoo_BOOTSTRAP_ENTRY_REDIRECT__ = false;
                    if (this.isCurrent(epoch)) this.showBootstrapBlock(`启动场景打开失败：${error.message}`);
                });
                return;
            }
            this.services = services;
            this.logBootstrapOwner({
                action: 'CONSUME_PRESENTATION', sceneName, nodeUuid: this.node.uuid,
                owner: loadingRuntime.__aoo_BOOTSTRAP_ROUTE_OWNER__ ?? null,
            });
            if (sceneName === 'LoginScene') await this.mountLoginPresentation(epoch);
            return;
        }
        if (loadingRuntime.__aoo_BOOTSTRAP_ROUTE_OWNER__) {
            this.logBootstrapOwner({
                action: 'DISCARD_DUPLICATE_BOOT', sceneName, nodeUuid: this.node.uuid,
                owner: loadingRuntime.__aoo_BOOTSTRAP_ROUTE_OWNER__,
            });
            return;
        }
        const routeBootId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
        loadingRuntime.__aoo_BOOTSTRAP_ROUTE_OWNER__ = Object.freeze({ bootId: routeBootId, nodeUuid: this.node.uuid });
        this.logBootstrapOwner({ action: 'CLAIM', bootId: routeBootId, sceneName, nodeUuid: this.node.uuid });
        const authoritySource = `scene=${isBootstrapScene ? 'BootStrap' : 'BootStrap(in-memory)'} `
            + `node=${this.node.name} component=LoginScreenBootstrap property=isClearLocalData`;
        // Runtime scene navigation must never reload BootStrap: it is the
        // editor-configured initial scene only. Missing authority is a clear
        // configuration error rather than a recursive bootstrap redirect.
        if (!isBootstrapScene && !loadingBoot.resolveLaunchSelection(false, {
            isTestEnvironment: this.isTestEnvironment,
            isClearLocalData: this.isClearLocalData,
            gatewayAddresses: this.gatewayAddresses,
        })) {
            this.showBootstrapBlock(`启动配置缺失：${sceneName} 必须从 BootStrap 初始入口启动`);
            return;
        }
        const launchSelection = loadingBoot.resolveLaunchSelection(isBootstrapScene, {
            isTestEnvironment: this.isTestEnvironment,
            isClearLocalData: this.isClearLocalData,
            gatewayAddresses: this.gatewayAddresses,
        });
        if (!launchSelection) {
            this.showBootstrapBlock('启动配置尚未就绪，请从 BootStrap 启动预览');
            return;
        }
        let applied: Awaited<ReturnType<typeof applyLoadingEnvironment>>;
        try {
            applied = await applyLoadingEnvironment(launchSelection, globalThis.__aoo_RUNTIME_CONFIG__ ?? {}, {
                localStorage: sys.localStorage,
                sessionStorage: sys.isBrowser ? globalThis.sessionStorage : undefined,
                indexedDB: sys.isBrowser ? globalThis.indexedDB : undefined,
                cacheStorage: sys.isBrowser ? globalThis.caches : undefined,
                bootState: loadingBoot,
            });
            globalThis.__aoo_RUNTIME_CONFIG__ = applied.runtimeConfig;
            loadingRuntime.__aoo_LOADING_DIAGNOSTIC__ = Object.freeze({
                bootId: applied.bootId,
                environment: applied.environment,
                selectedGateway: applied.selectedGateway,
                cleanupRanThisCall: applied.cleanupRanThisCall,
                cleanupFailures: applied.cleanup.failures,
            });
            console.debug(
                `[LoadingEnvironment] boot=${applied.bootId} environment=${applied.environment} `
                + `source={${authoritySource}} gateway=${applied.selectedGateway ?? 'runtime-config'} `
                + `clearRequested=${launchSelection.isClearLocalData} cleanupNow=${applied.cleanupRanThisCall} `
                + `local=${applied.cleanup.removedLocalStorageKeys} session=${applied.cleanup.removedSessionStorageKeys} `
                + `indexedDB=${applied.cleanup.deletedIndexedDatabases} caches=${applied.cleanup.deletedCacheStores}`,
            );
            if (applied.cleanup.failures.length > 0) {
                console.warn(`本地数据未完全删除，已阻止自动登录：${applied.cleanup.failures.join('；')}`);
            }
        } catch (error: unknown) {
            this.showBootstrapBlock(error instanceof Error ? error.message : String(error));
            return;
        }
        this.setBootstrapStatus('正在连接启动服务...', 0.05);
        let startup;
        try {
            if (applied.environment === 'test') {
                console.debug('[BootstrapStage] version-check:start', {
                    host: globalThis.location?.host ?? 'native',
                    apiBaseUrl: globalThis.__aoo_RUNTIME_CONFIG__?.apiBaseUrl ?? 'unset',
                });
            }
            startup = await this.withTimeout(
                bootstrapRuntime.initialize(),
                10_000,
                '启动服务响应超时，请检查网络或服务器后点击重试',
            );
            if (applied.environment === 'test') console.debug('[BootstrapStage] version-check:success');
        } catch (error: unknown) {
            if (applied.environment === 'test') {
                console.error('[BootstrapStage] version-check:failure', error);
            }
            this.showBootstrapBlock(error instanceof Error ? error.message : String(error));
            return;
        }
        this.setBootstrapStatus('版本与服务器检查完成', 0.35);
        if (startup.status === 'MAINTENANCE' || startup.maintenance?.loginBlocked) {
            this.showBootstrapBlock(startup.maintenance?.message ?? '服务器维护中');
            return;
        }
        if (startup.forceUpdate || startup.status === 'FORCE_UPDATE') {
            this.showBootstrapBlock(`发现必须安装的新版本 ${startup.release?.version ?? ''}，资源更新完成后请重启。`);
            return;
        }
        try {
            if (applied.environment === 'test') console.debug('[BootstrapStage] services:start');
            this.services = startClientServices();
            if (applied.autoRestoreBlocked && loadingBoot.claimAutomaticRestoreReset()) {
                this.services.auth.blockAutomaticRestore();
                this.services.scenes.resetSession();
            }
            // The bootstrap scene is the only minimal, fully-owned audio root.
            // Traversing the migrated Login hierarchy through the legacy audio
            // adapter can encounter unresolved 2.2 child slots in Web builds.
            if (isBootstrapScene) legacyPlatformRuntime.audio.attach(this.node);
            if (applied.environment === 'test') console.debug('[BootstrapStage] services:success');
        } catch (error: unknown) {
            if (applied.environment === 'test') console.error('[BootstrapStage] services:failure', diagnosticError(error));
            this.showBootstrapBlock(error instanceof Error ? error.message : String(error));
            return;
        }
        // Bootstrap has no session UI of its own. Once the authoritative
        // startup checks and service wiring succeed, load LoginScene directly.
        // Routing through recoverStartup() used to destroy this component
        // during the awaited call, so its epoch guard could leave the visual
        // progress at 100% without completing the handoff in Web builds.
        if (isBootstrapScene) {
            let routeResult: 'LOGIN_REQUIRED' | 'NAVIGATED' | 'LOBBY_MOUNTED';
            try {
                if (applied.environment === 'test') console.debug('[BootstrapStage] startup-route:start');
                routeResult = await this.withTimeout(
                    this.services.scenes.recoverBootstrapTarget(
                        this.node,
                        (message, progress) => {
                            if (applied.environment === 'test') {
                                console.debug('[BootstrapStage] startup-route:progress', { message, progress });
                            }
                            this.setBootstrapStatus(message, progress);
                        },
                    ),
                    12_000,
                    '恢复登录状态超时，请检查网络后点击重试',
                );
                if (applied.environment === 'test') {
                    console.debug('[BootstrapStage] startup-route:success', { routeResult });
                }
            } catch (error: unknown) {
                if (applied.environment === 'test') {
                    console.error('[BootstrapStage] startup-route:failure', diagnosticError(error));
                }
                this.showBootstrapBlock(error instanceof Error ? error.message : String(error));
                return;
            }
            if (!this.isCurrent(epoch)) return;
            if (routeResult !== 'LOGIN_REQUIRED') {
                this.releasePersistentBootCover();
                return;
            }
            this.setBootstrapStatus('正在准备登录资源...', 0.52);
            void this.preloadLoginScene();
            return;
        }

        const routeResult = await this.services.scenes.recoverStartup(sceneName, this.node);
        if (!this.isCurrent(epoch)) return;
        if (routeResult !== 'LOGIN_REQUIRED') {
            if (!isBootstrapScene) this.releasePersistentBootCover();
            return;
        }

        await this.mountLoginPresentation(epoch);
    }

    private async mountLoginPresentation(epoch: number): Promise<void> {
        if (!this.services) return;
        let loginView: LoginView;
        try {
            loginView = await this.mountLoginView();
        } catch (error: unknown) {
            this.showBootstrapBlock(error instanceof Error ? error.message : String(error));
            return;
        }
        if (!this.isCurrent(epoch)) return;
        this.installWeChatLogin(loginView);
        const restoreFailureMessage = this.services.auth.consumeRestoreFailureMessage();
        if (restoreFailureMessage) loginView.showSystemMessage?.(restoreFailureMessage);
        await this.services.scenes.releaseStartupTransition();
        this.releasePersistentBootCover();
        if (!this.isCurrent(epoch) || !this.services) return;
        if (this.services.scenes.consumeSessionReplacementNotice()) this.showSessionReplacementMessage();
        loginView.node.on('login-succeeded', (account: AuthenticatedAccount) => {
            const services = this.services;
            if (!services) return;
            void services.scenes.recoverAuthenticatedTarget(account, this.node).catch((error: unknown) => {
                loginView.showSystemMessage?.(error instanceof Error ? error.message : '活动房间查询失败，请稍后重试');
            });
        }, this);
    }

    private releasePersistentBootCover(): void {
        const runtime = globalThis as LoadingRuntimeState;
        const root = runtime.__aoo_BOOT_TRANSITION_ROOT__;
        if (!root) return;
        // Cleanup only for an in-memory root left by a pre-fix hot preview.
        // Current startup uses SceneRouter's DOM snapshot mask and never makes
        // a Cocos scene node persistent.
        console.info('[AooTransition] overlay:release', {
            uuid: root.uuid, active: root.activeInHierarchy, valid: root.isValid,
            overlayCount: 1,
        });
        root.active = false;
        director.removePersistRootNode(root);
        root.destroy();
        runtime.__aoo_BOOT_TRANSITION_ROOT__ = undefined;
        console.info('[AooTransition] overlay:released', { overlayCount: 0 });
    }

    private async preloadLoginScene(): Promise<void> {
        try {
            const testEnvironment = globalThis.__aoo_RUNTIME_CONFIG__?.environment === 'test';
            if (testEnvironment) console.debug('[BootstrapStage] login-bundle:start');
            // LoginScene owns its authored login presentation. Lobby forms now
            // live in their Modules bundles and must not block the login scene.
            if (testEnvironment) console.debug('[BootstrapStage] login-bundle:skipped');
            this.setBootstrapStatus('正在准备登录界面...', 0.6);
            if (testEnvironment) console.debug('[BootstrapStage] login-scene-preload:start');
            await this.preloadLoginSceneAsset();
            if (testEnvironment) console.debug('[BootstrapStage] login-scene-preload:success');
            this.setBootstrapStatus('登录界面资源加载完成', 0.95);
            this.services?.scenes.prepareStartupTransition();
            if (testEnvironment) console.debug('[BootstrapStage] login-scene-load:start');
            await this.withTimeout(new Promise<void>((resolve, reject) => {
                let settled = false;
                director.loadScene('LoginScene', (loadError) => {
                    if (settled || this.bootstrapBlocked) return;
                    settled = true;
                    loadError ? reject(loadError) : resolve();
                });
            }), 8_000, '登录界面打开超时，请点击重试');
            if (testEnvironment) console.debug('[BootstrapStage] login-scene-load:success');
        } catch (error: unknown) {
            if (globalThis.__aoo_RUNTIME_CONFIG__?.environment === 'test') {
                console.error('[BootstrapStage] login-scene:failure', error);
            }
            this.showBootstrapBlock(error instanceof Error ? error.message : String(error));
        }
    }

    private preloadLoginSceneAsset(): Promise<void> {
        const timeoutMessage = '登录界面资源加载超时，请检查资源完整性后点击重试';
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            let idleTimeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
            const finish = (error?: unknown): void => {
                if (settled) return;
                settled = true;
                if (idleTimeoutId !== undefined) globalThis.clearTimeout(idleTimeoutId);
                error ? reject(error) : resolve();
            };
            const armIdleTimeout = (): void => {
                if (idleTimeoutId !== undefined) globalThis.clearTimeout(idleTimeoutId);
                idleTimeoutId = globalThis.setTimeout(() => finish(new Error(timeoutMessage)), 15_000);
            };
            // Creator Preview 首次打开时 LoginScene 依赖量会随反序列化继续增长，
            // 用固定总时长会把“仍在推进的真实加载”误判为失败。这里改为无进度
            // 超时：只要 preloadScene 继续上报进度，就保持等待；真正停滞才 fail。
            armIdleTimeout();
            director.preloadScene('LoginScene', (completed, total) => {
                if (settled || this.bootstrapBlocked) return;
                const ratio = total > 0 ? Math.min(1, completed / total) : 0;
                this.setBootstrapStatus('正在加载登录界面...', 0.6 + ratio * 0.35);
                armIdleTimeout();
            }, (error) => {
                if (this.bootstrapBlocked) return;
                finish(error);
            });
        });
    }

    private async loadBootstrapBundle(
        bundleName: string,
        loadingMessage: string,
        progress: number,
        timeoutMessage: string,
    ): Promise<void> {
        if (assetManager.getBundle(bundleName)) return;
        this.setBootstrapStatus(loadingMessage, progress);
        await this.withTimeout(new Promise<void>((resolve, reject) => {
            let settled = false;
            assetManager.loadBundle(bundleName, (error) => {
                if (settled || this.bootstrapBlocked) return;
                settled = true;
                error ? reject(error) : resolve();
            });
        }), 12_000, timeoutMessage);
    }

    private showBootstrapBlock(message: string): void {
        if (!this.isValid || !this.node) return;
        this.bootstrapBlocked = true;
        this.services?.scenes.prepareStartupTransition('启动失败', this.bootstrapProgress);
        this.services?.scenes.failStartupTransition(new Error(message), () => globalThis.location?.reload());
        presentationTransition.updateInitial(message, this.bootstrapProgress);
        const panel = this.node.getChildByName('ErrorPanel');
        const messageNode = panel?.getChildByName('ErrorMessage') ?? null;
        const retryNode = panel?.getChildByName('Btn_Retry') ?? null;
        if (panel && messageNode && retryNode) {
            panel.active = true;
            const messageLabel = messageNode.getComponent(Label) ?? messageNode.addComponent(Label);
            messageLabel.string = message;
            const retry = (): void => globalThis.location?.reload();
            const retryButton = retryNode.getComponent(Button) ?? retryNode.addComponent(Button);
            retryButton.clickEvents.length = 0;
            retryNode.off(Button.EventType.CLICK);
            retryNode.off(Node.EventType.TOUCH_END);
            retryNode.on(Button.EventType.CLICK, retry, this);
            retryNode.on(Node.EventType.TOUCH_END, retry, this);
            const status = this.node.getChildByName('BootstrapStatus')?.getComponent(Label);
            if (status) status.string = '启动失败，请查看提示后重试';
            return;
        }
        let node = this.node.getChildByName('BootstrapStatus');
        if (!node) { node = new Node('BootstrapStatus'); node.addComponent(UITransform).setContentSize(900, 160); this.node.addChild(node); }
        const label = node.getComponent(Label) ?? node.addComponent(Label);
        label.string = `${message}\n点击此处重试`; label.fontSize = 28; label.lineHeight = 38;
        this.styleLoadingLabel(label);
        node.off(Node.EventType.TOUCH_END);
        node.on(Node.EventType.TOUCH_END, () => globalThis.location?.reload());
    }

    private setBootstrapStatus(message: string, progress: number): void {
        const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : this.bootstrapProgress;
        this.bootstrapProgress = Math.max(this.bootstrapProgress, safeProgress);
        const startupOwnsPresentation = presentationTransition.updateInitial(message, this.bootstrapProgress);
        // Web owns one pre-engine Startup surface. Keep the authored Cocos
        // progress as the native fallback, but never paint both during Web boot.
        for (const name of ['BootstrapStatus', 'ProgressTrack', 'ProgressPercent']) {
            const presentationNode = this.node.getChildByName(name);
            if (presentationNode) presentationNode.active = !startupOwnsPresentation;
        }
        const status = this.node.getChildByName('BootstrapStatus')?.getComponent(Label);
        if (status && !startupOwnsPresentation) {
            status.string = message;
            this.styleLoadingLabel(status);
        }
        this.scheduleProgressAnimation();
    }

    private styleLoadingLabel(label: Label): void {
        label.color = Color.WHITE;
        const outline = label.getComponent(LabelOutline) ?? label.node.addComponent(LabelOutline);
        outline.color = Color.BLACK;
        outline.width = 0.5;
    }

    private scheduleProgressAnimation(): void {
        if (this.progressAnimationFrame !== null) return;
        const animate = (timestamp: number): void => {
            this.progressAnimationFrame = null;
            if (!this.isValid || !this.node?.isValid) {
                this.progressAnimationTimestamp = 0;
                return;
            }
            const elapsed = this.progressAnimationTimestamp > 0
                ? Math.max(0, timestamp - this.progressAnimationTimestamp) : 16;
            this.progressAnimationTimestamp = timestamp;
            this.displayedBootstrapProgress = Math.min(
                this.bootstrapProgress,
                this.displayedBootstrapProgress + Math.max(0, elapsed * DISPLAY_PROGRESS_RATE_PER_MS),
            );
            this.renderDisplayedProgress();
            if (this.displayedBootstrapProgress < this.bootstrapProgress) {
                this.progressAnimationFrame = globalThis.requestAnimationFrame?.(animate) ?? null;
            } else {
                this.progressAnimationTimestamp = 0;
            }
        };
        this.progressAnimationFrame = globalThis.requestAnimationFrame?.(animate) ?? null;
        if (this.progressAnimationFrame === null) {
            this.displayedBootstrapProgress = this.bootstrapProgress;
            this.renderDisplayedProgress();
        }
    }

    private renderDisplayedProgress(): void {
        const progressBar = this.node.getChildByName('ProgressTrack')?.getComponent(ProgressBar);
        if (progressBar) progressBar.progress = this.displayedBootstrapProgress;
        const percent = this.node.getChildByName('ProgressPercent')?.getComponent(Label);
        if (percent) percent.string = `${Math.round(this.displayedBootstrapProgress * 100)}%`;
    }

    private cancelProgressAnimation(): void {
        if (this.progressAnimationFrame !== null) {
            globalThis.cancelAnimationFrame?.(this.progressAnimationFrame);
            this.progressAnimationFrame = null;
        }
        this.progressAnimationTimestamp = 0;
    }

    private async withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
        let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timeoutId = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
        });
        try {
            return await Promise.race([task, timeout]);
        } finally {
            if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
        }
    }

    private installWeChatLogin(view: LoginView): void {
        this.weChatLogin?.destroy();
        this.weChatLogin = new AooWeChatLoginController();
        const button = this.findComponentByName(view.node, 'Btn_WechatLogin', Button);
        if (!button) return;
        const node = button.node;
        view.weChatLoginButton = button;
        view.weChatLogin = () => this.weChatLogin!.login();
        const click=():void=>{void view.onWeChatLoginClicked();};
        node.on(Button.EventType.CLICK,click,view);
        node.active = bootstrapRuntime.isEnabled('wechat_login');
    }

    private async mountLoginView(): Promise<LoginView> {
        // In Creator preview the component can begin start() while the scene's
        // Canvas reference is still being rebound. Resolve from the live scene
        // as a safe fallback instead of treating that transient owner as a
        // missing serialized Login root.
        if (!this.isValid || !this.node) throw new Error('登录场景已经切换');
        const sceneCanvas = director.getScene()?.getChildByName('Canvas') ?? null;
        const embeddedLogin = this.node.getChildByName('Login') ?? sceneCanvas?.getChildByName('Login') ?? null;
        if (embeddedLogin) {
            try {
                const node = embeddedLogin;
                node.active = true;
                // LoginScene is the visual authority. Do not move, scale or
                // re-parent its serialized nodes at runtime: Creator preview
                // and web builds must render the same initial composition.
                const accountPanel = node.getChildByName('AccountLoginPanel');
                const agreementRoot = node.getChildByName('UserAgreement');
                const signUpPanel = node.getChildByName('SignUpPanel');
                if (accountPanel) accountPanel.active = false;

                const view = node.getComponent(LoginView) ?? node.addComponent(LoginView);
                view.configure(this.requireServices().auth);
                // These are fixed direct children in the native LoginScene.
                // Avoid legacy recursive traversal here: unresolved 2.2 child
                // slots can surface as null during Web scene activation.
                const accountInputNode = accountPanel?.getChildByName('AccountInput') ?? null;
                const passwordInputNode = accountPanel?.getChildByName('PasswordInput') ?? null;
                view.accountInput = this.ensureEditBoxRuntime(accountInputNode, false);
                view.passwordInput = this.ensureEditBoxRuntime(passwordInputNode, true);
                // The user-owned LoginScene may serialize these existing EditBox
                // components disabled. Keep the scene untouched, but enable the
                // bound runtime controls so visible fields can receive real input.
                view.loginButton = this.findDirectButton(accountPanel, 'Btn_Login');
                view.guestLoginButton = this.findDirectButton(node, 'Btn_GuestLogin');
                view.accountDialog = accountPanel;
                view.accountLoginEntryButton = this.findDirectButton(node, 'Btn_AccountLogin');
                view.cancelButton = this.findDirectButton(accountPanel, 'Btn_Back');
                view.loadingIndicator = accountPanel?.getChildByName('AccountLoadingIndicator') ?? null;
                view.errorLabel = accountPanel?.getChildByName('AccountErrorLabel')?.getComponent(Label) ?? null;
                view.userAgreementToggle = agreementRoot
                    ? agreementRoot.getChildByName('AgreementToggle')?.getComponent(Toggle) ?? null
                    : null;
                view.signUpPanel = signUpPanel;
                view.signUpIdentityInput = signUpPanel?.getChildByName('AccountInput')?.getComponent(EditBox) ?? null;
                view.signUpPasswordInput = signUpPanel?.getChildByName('PasswordInput')?.getComponent(EditBox) ?? null;
                view.signUpCodeInput = signUpPanel?.getChildByName('VerificationCodeInput')?.getComponent(EditBox) ?? null;
                view.signUpConfirmButton = this.findDirectButton(signUpPanel, 'Btn_ConfirmSignUp');
                view.signUpCancelButton = signUpPanel?.getChildByName('Btn_ConfirmSignUp')
                    ?.getChildByName('Btn_Back')?.getComponent(Button) ?? null;
                view.signUpSendCodeButton = this.findDirectButton(signUpPanel, 'Btn_SendVerificationCode');
                const driftRoot = node.getChildByName('Message_Drift') ?? null;
                view.messageDriftRoot = driftRoot;
                const driftLabelNode = driftRoot?.getChildByName('Sprite')?.getChildByName('LabelMessage') ?? null;
                view.messageDriftLabel = driftLabelNode?.getComponent(RichText) ?? null;
                if (!view.messageDriftRoot || !view.messageDriftLabel) {
                    console.error('LoginScene Message_Drift/Sprite/LabelMessage 绑定缺失');
                } else {
                    console.info('[MessageDrift] bound', { uuid: view.messageDriftRoot.uuid, path: 'LoginScene/Message_Drift/Sprite/LabelMessage' });
                    view.messageDriftRoot.active = false;
                }
                view.showSystemMessage = (message, modal = false) => {
                    this.showLoginSystemMessage(message, modal);
                };

                const missingBindings: string[] = [];
                if (!view.accountInput) missingBindings.push('AccountInput');
                if (!view.passwordInput) missingBindings.push('PasswordInput');
                if (!view.loginButton) missingBindings.push('AccountLoginPanel/Btn_Login');
                if (!view.guestLoginButton) missingBindings.push('Btn_GuestLogin');
                if (missingBindings.length > 0) {
                    console.warn(`登录场景绑定不完整：缺少 ${missingBindings.join(', ')}`);
                }

                view.activateBindings();

                let lastFire = 0;
                const bind = (node: Button | null, action: () => void): void => {
                    if (!node) return;
                    // Migrated serialized component handlers cannot resolve
                    // their retired script class names. The equivalent action is
                    // rebound below, so retaining them would throw engine error 3804.
                    node.clickEvents.length = 0;
                    node.node.targetOff(view);
                    const guard = (): void => {
                        if (!node.interactable) return;
                        const now = Date.now();
                        if (now - lastFire < 180) return;
                        lastFire = now;
                        void action();
                    };
                    // The migrated Web scene receives MOUSE_UP on desktop and
                    // TOUCH_END on mobile, while Button.CLICK is not emitted.
                    // The shared guard deduplicates hybrid-device compatibility
                    // events so one physical action still submits exactly once.
                    node.node.on(Node.EventType.TOUCH_END, guard, view);
                    node.node.on(Node.EventType.MOUSE_UP, guard, view);
                };
                bind(view.loginButton, () => void view.onLoginClicked());
                bind(view.guestLoginButton, () => void view.onGuestLoginClicked());
                bind(view.accountLoginEntryButton, () => {
                    view.openAccountDialog();
                    view.scheduleOnce(() => {
                        view.accountInput = this.ensureEditBoxRuntime(accountInputNode, false);
                        view.passwordInput = this.ensureEditBoxRuntime(passwordInputNode, true);
                        view.accountInput?.focus();
                    });
                });
                bind(view.cancelButton, () => view.closeAccountDialog());
                bind(this.findDirectButton(accountPanel, 'Btn_SignUp'), () => view.openSignUp());
                bind(view.signUpCancelButton, () => view.closeSignUp());
                bind(view.signUpSendCodeButton, () => void view.sendRegistrationCode());
                bind(view.signUpConfirmButton, () => void view.confirmSignUp());

                return view;
            } catch (error: unknown) {
                console.error('登录场景 UI 初始化失败', error);
            }
        }

        throw new Error('唯一登录场景缺少 Login 根节点。');
    }

    private ensureEditBoxRuntime(node: Node | null, password: boolean): EditBox | null {
        if (!node?.isValid) return null;
        const components = (node as unknown as { _components: Component[] })._components;
        // Migrated Creator 2.2 components can come from another module realm,
        // so `instanceof EditBox` is not a reliable identity check here. Use
        // Creator's own component query and remove those exact stale objects.
        const staleInputs = new Set(node.getComponents(EditBox).filter((component) => !component.isValid));
        for (let index = components.length - 1; index >= 0; index -= 1) {
            if (staleInputs.has(components[index] as EditBox)) components.splice(index, 1);
        }
        let input = node.getComponents(EditBox).find((component) => component.isValid) ?? null;
        if (!input) {
            const restored = node.addComponent(EditBox);
            restored.textLabel = node.getChildByName('InputTextLabel')?.getComponent(Label) ?? null;
            restored.placeholderLabel = node.getChildByName('InputPlaceholderLabel')?.getComponent(Label) ?? null;
            restored.inputFlag = password ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
            restored.inputMode = EditBox.InputMode.SINGLE_LINE;
            restored.returnType = EditBox.KeyboardReturnType.DONE;
            restored.maxLength = password ? 64 : 20;
            input = restored;
        }
        type WebEditBoxImpl = { _edTxt?: unknown; init?: (delegate: EditBox) => void };
        const migrated = input as EditBox & { _impl?: WebEditBoxImpl; _init?: () => void; __preload?: () => void };
        // Some migrated 2.2 scene components deserialize under an inactive
        // parent before Creator runs EditBox.__preload(), leaving no Web input
        // implementation. Initialize that existing component once; never
        // replace or write back the user-owned scene component.
        if (!migrated._impl) migrated.__preload?.();
        if (!migrated._impl) migrated._init?.();
        else if (typeof document !== 'undefined' && '_edTxt' in migrated._impl && !migrated._impl._edTxt) {
            migrated._impl.init?.(input);
        }
        input.enabled = false;
        input.enabled = true;
        return input;
    }

    private ensureLoginForms(): LegacyFormManager {
        if (this.loginForms) return this.loginForms;
        const forms = new LegacyFormManager(this.node);
        forms.register('UIMessage_Drift', {
            zOrder: 8,
            modal: false,
            lifecycle: createMsgDriftLifecycle(() => forms.close('UIMessage_Drift')),
        });
        forms.register('UIMessage', {
            zOrder: 2147483647,
            modal: true,
            lifecycle: {
                onShow: (form, _msgId, _args, content) => {
                    const label = this.findComponentByName(form.node, 'LabelMessage', Label);
                    if (label) label.string = String(content ?? '');
                    const cancel = form.find('btnCancel');
                    const close = form.find('btn_close');
                    if (cancel) cancel.active = true;
                    if (close) close.active = true;
                },
                onLegacyEvent: (_form, _payload, sourceNode) => {
                    if (sourceNode.name === 'btnSure') {
                        forms.close('UIMessage');
                        const confirm = this.loginSystemConfirm;
                        this.loginSystemConfirm = null;
                        confirm?.();
                    } else if (['btnCancel', 'btn_close'].includes(sourceNode.name)) {
                        this.loginSystemConfirm = null;
                        forms.close('UIMessage');
                    }
                },
            },
        });
        globalThis.setTimeout(() => { void forms.preloadRefreshSurface(false, 1); }, 0);
        this.loginForms = forms;
        return forms;
    }

    private showLoginSystemMessage(message: string, modal = false, onConfirm: (() => void) | null = null): void {
        const formName = modal ? 'UIMessage' : 'UIMessage_Drift';
        if (modal) this.loginSystemConfirm = onConfirm;
        void this.ensureLoginForms().show(formName, null, null, message);
    }

    private showSessionReplacementMessage(): void {
        if (!this.isValid || !this.node || !this.services) return;
        this.showLoginSystemMessage(
            '你的账号已在其他设备登录',
            true,
            () => this.services?.scenes.confirmSessionReplacement(),
        );
    }

    private findComponentByName<T extends Component>(
        root: Node,
        name: string,
        componentType: new (...args: never[]) => T,
    ): T | null {
        const stack: Node[] = [root];
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (node.name === name) {
                return node.getComponent(componentType as unknown as typeof Component) as T | null;
            }
            for (const child of node.children) stack.push(child);
        }
        return null;
    }

    private findDirectButton(root: Node | null | undefined, name: string): Button | null {
        if (!root) return null;
        return root.getChildByName(name)?.getComponent(Button) ?? null;
    }

    private isCurrent(epoch: number): boolean {
        return this.isValid && epoch === this.lifecycleEpoch;
    }

    protected override onDestroy(): void {
        this.lifecycleEpoch += 1;
        this.cancelProgressAnimation();
        this.loginSystemConfirm = null;
        this.loginForms?.destroy();
        this.loginForms = null;
        this.weChatLogin?.destroy();
        this.weChatLogin = null;
        this.services = null;
    }

    private requireServices(): ClientServices {
        if (!this.services) throw new Error('Client services are not assembled');
        return this.services;
    }

    private logBootstrapOwner(detail: Readonly<Record<string, unknown>>): void {
        console.info('[BootstrapOwner]', JSON.stringify(detail));
    }
}
