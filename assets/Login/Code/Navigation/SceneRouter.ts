import { assetManager, Button, Canvas, Director, director, isValid, Label, Node, RichText, SceneAsset } from 'cc';
import { AppError } from '../../../Common/Code/Runtime/core/AppError';
import type { AuthenticatedAccount } from '../Auth/AuthTypes';
import type { AuthSession } from '../Auth/AuthSession';
import type { NetworkRuntime } from '../Network/NetworkRuntime';
import { LobbyScreenController } from '../../../Lobby/Code/LobbyScreenController';
import { legacyPlatformRuntime } from '../../../Common/Code/Runtime/platform/LegacyPlatformRuntime';
import type { RoomRecoveryStore } from '../../../Common/Code/Runtime/room/RoomRecoveryStore';
import { HallRoomGateway } from '../../../Lobby/Code/HallRoomGateway';
import { CommonPdkGameSceneLauncher } from '../../../Games/Poker/PDK/Common/Code/Runtime/CommonPdkGameSceneLauncher';
import type { RoleSession } from '../../../Common/Code/Runtime/role/RoleTypes';
import type { LegacySubgameTicket } from '../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import {
    NAVIGATION_REVEAL_DELAY_MS,
    presentationTransition,
    type PresentationTransition,
} from '../../../Common/Code/Runtime/ui/PresentationTransitionCoordinator';
import { LegacyFormManager } from '../../../Common/Code/Runtime/ui/LegacyFormManager';
import { getOrLoadBundle } from '../../../Common/Code/Runtime/navigation/BundleLoader';
import { hostRouteStore } from '../../../Common/Code/Runtime/navigation/HostRouteStore';

export type StartupRouteResult = 'NAVIGATED' | 'LOBBY_MOUNTED' | 'LOGIN_REQUIRED';
export type StartupProgressReporter = (message: string, progress: number) => void;

/** Owns scene transitions, delayed navigation cancellation and lobby mounting. */
export class SceneRouter {
    private static readonly transitionImplementation = 'aoo-transition-20260907-coordinator-1';
    private lobby: LobbyScreenController | null = null;
    private gameLauncher: CommonPdkGameSceneLauncher | null = null;
    private enterPending: Promise<Node> | null = null;
    private enterPendingAccount: AuthenticatedAccount | null = null;
    private pendingLobbyStartup: { restoreLastClubBeforeShow?: boolean; restoreClubId?: number; startupMessage?: string; skipRoomRecovery?: boolean } | null = null;
    private startupTransition: PresentationTransition | null = null;
    private epoch = 0;
    private navigationGeneration = 0;
    private started = false;
    private disposed = false;
    private sessionReplacementPending = false;
    private sessionReplacementNoticeAvailable = false;
    private sessionReplacementForms: LegacyFormManager | null = null;
    private disposeSessionReplacementListener: (() => void) | null = null;
    private activeAccountId = '';

    public constructor(
        private readonly auth: AuthSession,
        private readonly network: NetworkRuntime,
        private readonly roomRecovery: RoomRecoveryStore,
    ) {}

    public start(): void {
        if (this.disposed) throw new Error('SceneRouter has been disposed');
        if (this.started) return;
        this.started = true;
        this.disposeSessionReplacementListener = this.network.onSessionReplaced(() => this.handleSessionReplacement());
    }

    public enterLobby(account: AuthenticatedAccount, parent: Node): Promise<Node> {
        this.assertStarted();
        this.activeAccountId = String(account.accountId);
        if (this.enterPending && this.enterPendingAccount === account) return this.enterPending;
        if (this.enterPending) { this.epoch += 1; this.enterPending = null; this.enterPendingAccount = null; }
        const pending = this.performEnterLobby(account, parent, this.consumePendingLobbyStartup());
        this.enterPending = pending;
        this.enterPendingAccount = account;
        void pending.then(
            () => { if (this.enterPending === pending) { this.enterPending = null; this.enterPendingAccount = null; } },
            () => { if (this.enterPending === pending) { this.enterPending = null; this.enterPendingAccount = null; } },
        );
        return pending;
    }

    /** BootStrap is initial-entry only; runtime navigation would recursively bootstrap services. */
    public showBootstrap(): void {
        throw new Error('框架错误：运行期禁止导航 BootStrap；请使用持久过渡层或明确业务目标场景');
    }
    public showLogin(): void { this.navigate('LoginScene'); }
    public showLobby(): void { this.navigate('MainScene'); }

    public prepareStartupTransition(message = '正在准备目标界面...', progress = 0, showDuringProgress = true,
        showAfterMs = NAVIGATION_REVEAL_DELAY_MS): void {
        if (this.startupTransition?.isCurrent()) {
            this.startupTransition.update(message, progress, 'STAGE');
            return;
        }
        this.startupTransition = presentationTransition.begin({
            name: 'scene-navigation', message, progress, progressKind: 'STAGE',
            showAfterMs,
            showDuringProgress, retainCurrentFrame: !showDuringProgress,
            releaseInitialPresentation: true, timeoutMs: 15_000,
        });
    }

    public async releaseStartupTransition(): Promise<void> {
        await this.commitStartupTransition();
    }

    public failStartupTransition(error: unknown, retry?: () => void): void {
        this.startupTransition?.fail(error, retry);
    }

    public async recoverBootstrapTarget(parent: Node, report: StartupProgressReporter = () => undefined): Promise<StartupRouteResult> {
        this.assertStarted();
        report('正在恢复本地登录会话...', 0.42);
        const account = await this.auth.restoreSession();
        if (!account) return 'LOGIN_REQUIRED';
        return this.recoverAuthenticatedTarget(account, parent, report);
    }

    /** Local room intent is presentation context only; Hall is the sole recovery authority. */
    public async recoverAuthenticatedTarget(
        account: AuthenticatedAccount,
        parent: Node,
        report: StartupProgressReporter = () => undefined,
        presentation: 'NAVIGATE' | 'MOUNT_CURRENT' = 'NAVIGATE',
    ): Promise<StartupRouteResult> {
        this.assertStarted();
        // This route owns the handoff from the persistent HTML startup cover.
        // Lobby presentation already reuses this transaction; direct active-room
        // recovery must own it as well or the room can render successfully behind
        // a startup cover that no later transaction is authorized to release.
        const leavingAuthenticatedLogin = presentation === 'NAVIGATE' && director.getScene()?.name === 'LoginScene';
        // Once credentials are accepted, LoginScene is no longer a valid
        // presentation target. Cover it immediately so the nested room handoff
        // cannot reveal a retained login frame after GameRoom2D is active.
        this.prepareStartupTransition('正在准备目标界面...', 0, presentation === 'NAVIGATE',
            leavingAuthenticatedLogin ? 0 : NAVIGATION_REVEAL_DELAY_MS);
        this.activeAccountId = String(account.accountId);
        const operationId = ++this.navigationGeneration;
        // The source scene node is expected to become invalid when MainScene or
        // GameRoom2D commits. Route ownership is process/generation scoped, not
        // tied to the source Canvas lifetime.
        const current = () => operationId === this.navigationGeneration && this.started && !this.disposed;
        this.logNavigation({ operationId, stage: 'START', accountId: account.accountId });
        let role: RoleSession;
        let gateway: HallRoomGateway;
        let activeRoom: LegacySubgameTicket | null;
        try {
            role = await this.loginToHallForStartup(account, report);
            if (!current()) return this.discardLateNavigation(operationId, 'HALL_LOGIN');
            gateway = this.createHallRoomGateway(account, role);
            report('正在查询活动房间...', 0.58);
            activeRoom = await gateway.activeRoom();
            if (!current()) return this.discardLateNavigation(operationId, 'ACTIVE_ROOM');
        } catch (error: unknown) {
            if (!current()) return this.discardLateNavigation(operationId, 'AUTH_FAILURE');
            // A ticket refusal is an expected authentication-state boundary,
            // not a fatal Cocos exception. Tear down its socket/timers and
            // leave the user on the login page; unknown transport errors keep
            // propagating to the existing diagnostic surface.
            if (!this.isSessionAuthorizationFailure(error)) throw error;
            this.invalidateStartupSession(account);
            return 'LOGIN_REQUIRED';
        }
        const savedRoute = hostRouteStore.load(String(account.accountId));
        if (!activeRoom) {
            this.roomRecovery.clear(String(account.accountId));
            const savedStartup = savedRoute?.name === 'club'
                ? { restoreLastClubBeforeShow: true, skipRoomRecovery: true }
                : null;
            if (presentation === 'MOUNT_CURRENT') {
                await this.mountLobby(account, role, parent, savedStartup);
                await this.waitForTargetPresentation();
                await this.releaseStartupTransition();
                return 'LOBBY_MOUNTED';
            }
            await this.preloadLobbyPresentation(report);
            if (!current()) return this.discardLateNavigation(operationId, 'LOBBY_PRELOAD');
            await this.presentLobbyScene(account, role, operationId, savedStartup);
            return 'NAVIGATED';
        }
        // Hall owns whether the room is active, while HostRoute owns the last
        // successfully presented return location. Active-room recovery payloads
        // do not carry the original club entry, so merge it only for the same room.
        if (savedRoute?.name === 'game' && Number(savedRoute.roomId) === Number(activeRoom.roomId)) {
            const returnTo = savedRoute.returnTo;
            activeRoom = returnTo.name === 'club'
                ? { ...activeRoom, entryOrigin: 'CLUB', fromClub: true, clubId: returnTo.clubId,
                    returnContext: { clubId: returnTo.clubId } }
                : { ...activeRoom, entryOrigin: 'GAME_LOBBY', fromClub: false, returnContext: {} };
        }
        try {
            report('正在恢复房间连接...', 0.62);
            await this.recoverRoomHandoff(account, role, activeRoom, gateway, parent, report);
            if (!current()) return this.discardLateNavigation(operationId, 'ROOM_RECOVERY');
            this.logNavigation({
                operationId, stage: 'ROOM_PRESENTED', owner: 'authenticated-route',
                roomId: activeRoom.roomId, scene: director.getScene()?.name ?? 'none',
            });
            await this.waitForTargetPresentation();
            await this.releaseStartupTransition();
        } catch (error: unknown) {
            if (!current()) return this.discardLateNavigation(operationId, 'ROOM_RECOVERY_FAILURE');
            this.roomRecovery.clear(String(account.accountId));
            this.gameLauncher?.destroy();
            this.gameLauncher = null;
            this.pendingLobbyStartup = {
                skipRoomRecovery: true,
                startupMessage: error instanceof Error ? error.message : '房间恢复失败，已返回大厅',
            };
            this.network.reset();
            console.error('[StartupRoomRecovery] active-room recovery failed', this.roomRecoveryDiagnostic(error));
            if (presentation === 'MOUNT_CURRENT') {
                await this.enterLobby(account, parent);
                await this.waitForTargetPresentation();
                await this.releaseStartupTransition();
                return 'LOBBY_MOUNTED';
            }
            this.showLobby();
        }
        if (presentation === 'MOUNT_CURRENT' && this.startupTransition?.isCurrent()) {
            await this.waitForTargetPresentation();
            await this.releaseStartupTransition();
        }
        return 'NAVIGATED';
    }

    public async recoverStartup(sceneName: string, parent: Node): Promise<StartupRouteResult> {
        this.assertStarted();
        if (sceneName === 'BootStrap') {
            return 'LOGIN_REQUIRED';
        }
        const account = await this.auth.restoreSession();
        if (sceneName === 'MainScene') {
            if (!account) {
                this.showLogin();
                return 'NAVIGATED';
            }
            return await this.recoverAuthenticatedTarget(account, parent, () => undefined, 'MOUNT_CURRENT');
        }
        if (account) {
            this.showLobby();
            return 'NAVIGATED';
        }
        return 'LOGIN_REQUIRED';
    }

    public logout(): void {
        this.assertStarted();
        if (this.activeAccountId) hostRouteStore.clear(this.activeAccountId);
        this.activeAccountId = '';
        this.auth.logout(true);
        this.resetSession();
        this.showLogin();
    }

    public resetSession(): void {
        this.navigationGeneration += 1;
        this.epoch += 1;
        this.enterPending = null;
        this.enterPendingAccount = null;
        this.lobby?.destroy();
        this.lobby = null;
        this.gameLauncher?.destroy();
        this.gameLauncher = null;
        this.pendingLobbyStartup = null;
        this.startupTransition?.cancel();
        this.startupTransition = null;
        this.network.reset();
    }

    public consumeSessionReplacementNotice(): boolean {
        this.assertStarted();
        if (!this.sessionReplacementNoticeAvailable) return false;
        this.sessionReplacementNoticeAvailable = false;
        return true;
    }

    public confirmSessionReplacement(): void {
        this.assertStarted();
        if (!this.sessionReplacementPending) return;
        this.sessionReplacementPending = false;
        this.sessionReplacementNoticeAvailable = false;
        this.sessionReplacementForms?.close('UIMessage');
        this.sessionReplacementForms = null;
        this.navigationGeneration += 1;
        this.epoch += 1;
        this.enterPending = null;
        this.enterPendingAccount = null;
        this.lobby?.destroy();
        this.lobby = null;
        this.gameLauncher?.destroy();
        this.gameLauncher = null;
        this.pendingLobbyStartup = null;
        this.auth.clearReplacedSession();
        this.showLogin();
    }

    public stop(): void {
        if (!this.started) return;
        this.epoch += 1;
        this.navigationGeneration += 1;
        this.enterPending = null;
        this.enterPendingAccount = null;
        this.lobby?.destroy();
        this.lobby = null;
        this.gameLauncher?.destroy();
        this.gameLauncher = null;
        this.pendingLobbyStartup = null;
        this.disposeSessionReplacementListener?.();
        this.disposeSessionReplacementListener = null;
        this.startupTransition?.cancel();
        this.startupTransition = null;
        this.started = false;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.stop();
        this.disposed = true;
    }

    private async performEnterLobby(
        account: AuthenticatedAccount,
        parent: Node,
        startup: { restoreLastClubBeforeShow?: boolean; restoreClubId?: number; startupMessage?: string; skipRoomRecovery?: boolean } | null = null,
    ): Promise<Node> {
        const epoch = ++this.epoch;
        this.lobby?.destroy();
        this.lobby = null;
        const role = await this.network.loginToHall(account);
        if (epoch !== this.epoch || !parent.isValid) {
            this.logNavigation({ operationId: epoch, stage: 'DISCARD_LATE_LOBBY' });
            return parent;
        }
        return await this.mountLobby(account, role, parent, startup);
    }

    private async mountLobby(
        account: AuthenticatedAccount,
        role: RoleSession,
        parent: Node,
        startup: { restoreLastClubBeforeShow?: boolean; restoreClubId?: number; startupMessage?: string; skipRoomRecovery?: boolean } | null = null,
    ): Promise<Node> {
        let activeRole = role;
        let protocol;
        try {
            protocol = this.network.protocol;
        } catch (error: unknown) {
            // A page reload can stop the router after a lobby transition was
            // scheduled but before the screen is constructed. That stale
            // continuation must not turn normal teardown into an exception.
            if (this.disposed || !this.started || !parent.isValid) {
                this.logNavigation({ operationId: this.navigationGeneration, stage: 'DISCARD_LATE_LOBBY_TRANSPORT' });
                return parent;
            }
            if (error instanceof Error && error.message === 'NetworkRuntime transport is unavailable') {
                this.logNavigation({ operationId: this.navigationGeneration, stage: 'RECOVER_LOBBY_TRANSPORT' });
                activeRole = await this.network.loginToHall(account);
                if (this.disposed || !this.started || !parent.isValid) {
                    this.logNavigation({ operationId: this.navigationGeneration, stage: 'DISCARD_RECOVERED_LOBBY_TRANSPORT' });
                    return parent;
                }
                protocol = this.network.protocol;
            } else {
                throw error;
            }
        }
        this.lobby?.destroy();
        this.lobby = new LobbyScreenController(account, activeRole, protocol, () => this.logout(), this.roomRecovery,
            startup ?? undefined, (reason) => this.handleInvalidLobbySession(reason),
            target => this.returnFromRoom(account, activeRole, target));
        const mounted = await this.lobby.mount(parent);
        if (!startup?.restoreLastClubBeforeShow) hostRouteStore.save(String(account.accountId), { name: 'lobby' });
        return mounted;
    }

    private async returnFromRoom(account: AuthenticatedAccount, role: RoleSession,
        target?: { entryOrigin?: unknown; fromClub?: unknown; returnContext?: unknown;
            presentationTransition?: PresentationTransition; startupMessage?: string }): Promise<void> {
        const operationId = ++this.navigationGeneration;
        // The room launcher captured the intact room before teardown. Reuse that
        // transaction so lobby routing does not wait and commit a second retained
        // frame transaction for the identical scene switch.
        if (target?.presentationTransition?.isCurrent()) {
            this.startupTransition = target.presentationTransition;
        }
        const restoreLastClubBeforeShow = target?.entryOrigin === 'CLUB' || target?.entryOrigin === 'UNION'
            || Boolean(target?.fromClub);
        const context = target?.returnContext && typeof target.returnContext === 'object'
            ? target.returnContext as { clubId?: unknown } : null;
        const clubId = Number(context?.clubId ?? 0);
        await this.presentLobbyScene(account, role, operationId,
            restoreLastClubBeforeShow ? {
                restoreLastClubBeforeShow: true,
                restoreClubId: Number.isSafeInteger(clubId) && clubId > 0 ? clubId : undefined,
                startupMessage: typeof target?.startupMessage === 'string' ? target.startupMessage : undefined,
                skipRoomRecovery: true,
            } : target?.startupMessage ? {
                startupMessage: target.startupMessage,
                skipRoomRecovery: true,
            } : null, false);
    }

    /** One authenticated operation owns scene commit and lobby mount using its existing Hall transport. */
    private async presentLobbyScene(account: AuthenticatedAccount, role: RoleSession, operationId: number,
        startup: { restoreLastClubBeforeShow?: boolean; restoreClubId?: number; startupMessage?: string; skipRoomRecovery?: boolean } | null = null,
        showTransition = true,
    ): Promise<void> {
        this.prepareStartupTransition('正在准备目标界面...', 0, showTransition);
        legacyPlatformRuntime.audio.detach();
        this.logNavigation({ operationId, stage: 'LOBBY_SCENE_LOAD_START', owner: 'authenticated-route' });
        await getOrLoadBundle('lobby');
        await this.loadOwnedScene('MainScene');
        this.startupTransition?.update('大厅场景已加载，正在挂载界面...', 0.97, 'STAGE');
        if (operationId !== this.navigationGeneration || !this.started || this.disposed) {
            this.discardLateNavigation(operationId, 'LOBBY_SCENE_LOAD');
            return;
        }
        const scene = director.getScene();
        const canvas = this.resolveSceneCanvas();
        if (!canvas?.isValid) throw new Error('MainScene 缺少有效 cc.Canvas 容器，无法挂载大厅');
        this.logNavigation({
            operationId, stage: 'LOBBY_MOUNT_START', owner: 'authenticated-route',
            scene: scene?.name ?? 'none', canvasActive: canvas.activeInHierarchy,
        });
        await this.mountLobby(account, role, canvas, startup);
        this.startupTransition?.update('大厅界面已挂载，正在提交首帧...', 0.99, 'STAGE');
        if (operationId !== this.navigationGeneration || !this.started || this.disposed) {
            this.discardLateNavigation(operationId, 'LOBBY_MOUNT');
            return;
        }
        await this.waitForTargetPresentation();
        await this.releaseStartupTransition();
        this.logNavigation({ operationId, stage: 'LOBBY_PRESENTED', owner: 'authenticated-route' });
    }

    private async loginToHallForStartup(
        account: AuthenticatedAccount,
        report: StartupProgressReporter,
    ): Promise<RoleSession> {
        report('正在连接大厅服务...', 0.5);
        return await this.network.loginToHall(account);
    }

    /** Boot-owned, measurable transition work performed before MainScene tears down its source scene. */
    private async preloadLobbyPresentation(report: StartupProgressReporter): Promise<void> {
        report('正在加载大厅公共资源...', 0.68);
        this.startupTransition?.update('正在加载大厅公共资源...', 0.68, 'STAGE');
        await getOrLoadBundle('lobby');
        report('正在预加载大厅界面...', 0.78);
        this.startupTransition?.update('正在预加载大厅界面...', 0.78, 'MEASURED');
        await new Promise<void>((resolve, reject) => {
            director.preloadScene('MainScene', (completed, total) => {
                const ratio = total > 0 ? Math.min(1, completed / total) : 0;
                report('正在预加载大厅场景...', 0.78 + ratio * 0.16);
                this.startupTransition?.update('正在预加载大厅场景...', 0.78 + ratio * 0.16, 'MEASURED');
            }, error => error ? reject(error) : resolve());
        });
        report('正在准备大厅首帧...', 0.96);
    }

    private async recoverRoomHandoff(
        account: AuthenticatedAccount,
        role: RoleSession,
        handoff: LegacySubgameTicket,
        gateway: HallRoomGateway,
        parent: Node,
        report: StartupProgressReporter,
    ): Promise<void> {
        const playFamily = String(handoff.playFamily ?? '').trim().toLowerCase().replace(/[:_]/g, '-');
        if (playFamily !== 'poker-pao-de-kuai') throw new Error('房间玩法暂不支持启动期直接恢复，已返回大厅');
        report('正在加载房间资源...', 0.78);
        this.network.reset();
        this.gameLauncher?.destroy();
        this.gameLauncher = new CommonPdkGameSceneLauncher(
            account,
            role.playerId,
            id => gateway.refreshRoomConnection(id),
            id => gateway.leave(id),
            async () => { this.roomRecovery.clear(String(account.accountId)); },
            target => this.returnFromRoom(account, role, target),
        );
        await this.gameLauncher.launch(handoff, { node: parent, report });
    }

    private createHallRoomGateway(account: AuthenticatedAccount, role: RoleSession): HallRoomGateway {
        const accessToken = () => account.accessToken || account.token;
        const refreshSession = async () => {
            if (!account.refreshWsTicket) throw new Error('登录会话缺少刷新能力，请重新登录');
            account.wsTicket = await account.refreshWsTicket();
        };
        const shouldRefreshSession = () => {
            const expiry = this.tokenExpiryMillis(account.accessExpiresAt);
            return Number.isFinite(expiry) && expiry - Date.now() < 120000;
        };
        return new HallRoomGateway(accessToken, String(role.playerId), () => {
            const deviceId = account.deviceId?.trim() ?? '';
            if (!deviceId) throw new Error('登录会话缺少设备标识，请重新登录');
            return deviceId;
        }, refreshSession, shouldRefreshSession);
    }

    private tokenExpiryMillis(value: string | number | undefined): number {
        if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
        if (typeof value === 'string' && value.trim()) {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? numeric : numeric * 1000;
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return Number.NaN;
    }

    private roomRecoveryDiagnostic(error: unknown): Readonly<Record<string, unknown>> {
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

    private isSessionAuthorizationFailure(error: unknown): boolean {
        return error instanceof AppError && [
            'AUTH_TICKET_UNAUTHORIZED',
            'AUTH_TICKET_FORBIDDEN',
            'AUTH_SESSION_INVALID',
            'AUTH_SESSION_NOT_AUTHORIZED',
            'INVALID_CREDENTIALS',
        ].includes(error.code);
    }

    private invalidateStartupSession(account: AuthenticatedAccount): void {
        this.roomRecovery.clear(String(account.accountId));
        this.gameLauncher?.destroy();
        this.gameLauncher = null;
        this.pendingLobbyStartup = null;
        this.auth.clearSession();
        this.network.reset();
        void this.releaseStartupTransition();
    }

    private consumePendingLobbyStartup(): { restoreLastClubBeforeShow?: boolean; restoreClubId?: number; startupMessage?: string; skipRoomRecovery?: boolean } | null {
        const startup = this.pendingLobbyStartup;
        this.pendingLobbyStartup = null;
        return startup;
    }

    private handleSessionReplacement(): void {
        if (this.sessionReplacementPending || !this.started || this.disposed) return;
        this.sessionReplacementPending = true;
        this.network.suspendSession();
        this.auth.suspendReplacedSession();
        const forms = this.gameLauncher?.getFormManager() ?? this.lobby?.getFormManager() ?? null;
        if (!forms) {
            this.sessionReplacementNoticeAvailable = true;
            return;
        }
        forms.register('UIMessage', {
            zOrder: 2147483647,
            modal: true,
            lifecycle: {
                onCreate: (form) => {
                    let lastPointerAt = 0;
                    const bind = (name: string, action: () => void): void => {
                        const node = form.find(name);
                        if (!node) throw new Error(`公共系统弹窗缺少 ${name} 节点`);
                        const invoke = (event: unknown): void => {
                            const now = Date.now();
                            if (now - lastPointerAt < 180) return;
                            lastPointerAt = now;
                            const pointerEvent = event as { propagationStopped?: boolean; propagationImmediateStopped?: boolean };
                            pointerEvent.propagationStopped = true;
                            pointerEvent.propagationImmediateStopped = true;
                            action();
                        };
                        node.on(Button.EventType.CLICK, invoke);
                        node.on(Node.EventType.TOUCH_END, invoke);
                        node.on(Node.EventType.MOUSE_UP, invoke);
                    };
                    bind('btnSure', () => this.confirmSessionReplacement());
                    bind('btnCancel', () => {
                        forms.closeAfterPointer('UIMessage');
                        if (this.sessionReplacementForms === forms) this.sessionReplacementForms = null;
                    });
                    bind('btn_close', () => {
                        forms.closeAfterPointer('UIMessage');
                        if (this.sessionReplacementForms === forms) this.sessionReplacementForms = null;
                    });
                },
                onShow: (form, _msgId, _args, content) => {
                    const labelNode = form.find('LabelMessage');
                    const label = labelNode?.getComponent(RichText) ?? labelNode?.getComponent(Label) ?? null;
                    if (label) label.string = String(content ?? '');
                },
            },
        });
        this.sessionReplacementForms = forms;
        void forms.show('UIMessage', null, null, '你的账号已在其他设备登录');
    }

    private handleInvalidLobbySession(reason: 'SESSION_REPLACED' | 'SESSION_INVALID'): void {
        if (!this.started || this.disposed) return;
        if (reason === 'SESSION_REPLACED') {
            this.handleSessionReplacement();
            return;
        }
        if (this.sessionReplacementPending) return;
        this.network.suspendSession();
        this.auth.suspendReplacedSession();
        this.auth.clearReplacedSession();
        this.navigationGeneration += 1;
        this.epoch += 1;
        this.enterPending = null;
        this.enterPendingAccount = null;
        this.lobby?.destroy();
        this.lobby = null;
        this.gameLauncher?.destroy();
        this.gameLauncher = null;
        this.pendingLobbyStartup = null;
        this.showLogin();
    }

    private navigate(scene: string): void {
        this.assertStarted();
        this.navigationGeneration += 1;
        if (scene === 'BootStrap') throw new Error('框架错误：BootStrap 不能作为 SceneRouter 的运行期目标');
        if (scene !== 'BootStrap') this.prepareStartupTransition(`正在打开${scene}...`);
        legacyPlatformRuntime.audio.detach();
        console.info('[AooTransition]', SceneRouter.transitionImplementation, 'loadScene:start', scene);
        void this.loadOwnedScene(scene).then(() => {
            console.info('[AooTransition]', SceneRouter.transitionImplementation, 'loadScene:callback', scene);
            if (scene === 'BootStrap') return;
            return this.waitForTargetPresentation().then(() => this.releaseStartupTransition());
        }).catch(error => this.failStartupTransition(error, () => this.navigate(scene)));
    }

    /** Scene ownership follows Bundle boundaries; only Login scenes live in the main bundle. */
    private async loadOwnedScene(scene: string): Promise<void> {
        if (scene !== 'MainScene') {
            await new Promise<void>((resolve, reject) => {
                const accepted = director.loadScene(scene, error => error ? reject(error) : resolve());
                if (!accepted) reject(new Error(`主包场景 ${scene} 不存在或当前无法加载`));
            });
            return;
        }
        const bundle = await getOrLoadBundle('lobby');
        await new Promise<void>((resolve, reject) => {
            const load = (allowReload: boolean): void => {
                bundle.loadScene('MainScene', (error, sceneAsset) => {
                    if (error || !sceneAsset) {
                        reject(error ?? new Error('lobby Bundle 缺少 MainScene'));
                        return;
                    }
                    if (!sceneAsset.scene || !isValid(sceneAsset.scene, true)) {
                        if (!allowReload) {
                            reject(new Error('lobby Bundle 的 MainScene 已失效'));
                            return;
                        }
                        assetManager.releaseAsset(sceneAsset as SceneAsset);
                        load(false);
                        return;
                    }
                    director.runScene(sceneAsset, undefined, launchError => launchError ? reject(launchError) : resolve());
                });
            };
            load(true);
        });
    }

    private discardLateNavigation(operationId: number, stage: string): StartupRouteResult {
        this.logNavigation({ operationId, stage: `DISCARD_LATE_${stage}` });
        return 'NAVIGATED';
    }

    private logNavigation(detail: Readonly<Record<string, unknown>>): void {
        const runtime = globalThis as typeof globalThis & { __aoo_AUTH_NAVIGATION_LOG__?: Array<Readonly<Record<string, unknown>>> };
        const record = Object.freeze({ ...detail, navigationGeneration: this.navigationGeneration });
        const log = runtime.__aoo_AUTH_NAVIGATION_LOG__ ?? [];
        log.push(record);
        if (log.length > 128) log.shift();
        runtime.__aoo_AUTH_NAVIGATION_LOG__ = log;
        console.info('[AuthNavigation]', JSON.stringify(record));
    }

    private assertStarted(): void {
        if (!this.started || this.disposed) throw new Error('SceneRouter is not started');
    }

    private async commitStartupTransition(): Promise<void> {
        const transition = this.startupTransition;
        if (!transition) return;
        await transition.commitAfterPresentation({
            ready: () => Boolean(this.resolveSceneCanvas()?.activeInHierarchy),
            describe: () => `scene=${director.getScene()?.name ?? 'none'} canvas=${Boolean(this.resolveSceneCanvas()?.activeInHierarchy)}`,
        });
        if (this.startupTransition === transition) this.startupTransition = null;
        console.info('[AooTransition]', SceneRouter.transitionImplementation, 'overlay:destroy');
    }

    private async waitForTargetPresentation(): Promise<void> {
        const scene = director.getScene();
        const canvas = this.resolveSceneCanvas();
        console.info('[AooTransition]', SceneRouter.transitionImplementation, 'target:ready-check', {
            scene: scene?.name ?? 'none', sceneValid: Boolean(scene?.isValid),
            canvasValid: Boolean(canvas?.isValid), canvasActive: Boolean(canvas?.activeInHierarchy),
        });
        await new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
            const done = (): void => { director.off(Director.EVENT_AFTER_DRAW, done); if (timer) globalThis.clearTimeout(timer); resolve(); };
            director.once(Director.EVENT_AFTER_DRAW, done);
            timer = globalThis.setTimeout(() => {
                director.off(Director.EVENT_AFTER_DRAW, done);
                reject(new Error(`大厅首帧未提交：scene=${scene?.name ?? 'none'} canvas=${Boolean(canvas?.activeInHierarchy)}`));
            }, 12_000);
        });
        console.info('[AooTransition]', SceneRouter.transitionImplementation, 'target:after-draw');
    }

    /** Scene node names are editor details; the Canvas component is the stable mounting contract. */
    private resolveSceneCanvas(): Node | null {
        const scene = director.getScene();
        if (!scene?.isValid) return null;
        return scene.children.find(child => Boolean(child.isValid && child.getComponent(Canvas))) ?? null;
    }
}
