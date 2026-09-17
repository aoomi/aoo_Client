import {
    Asset,
    assetManager,
    Director,
    director,
    find,
    isValid,
    Node,
    Prefab,
    ResolutionPolicy,
    SceneAsset,
    view,
    type AssetManager,
} from 'cc';
import type { AuthenticatedAccount } from '../../../../../../Login/Code/Auth/AuthTypes';
import { ProtocolClient } from '../../../../../../Common/Code/Runtime/network/ProtocolClient';
import { connectionOwnership } from '../../../../../../Common/Code/Runtime/network/ConnectionOwnership';
import { LegacyFormManager } from '../../../../../../Common/Code/Runtime/ui/LegacyFormManager';
import { COMMON_PREFAB_BUNDLE } from '../../../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import type { LegacySubgameTicket } from '../../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { CommonPdkSwitchCoordinator } from './CommonPdkSwitchCoordinator';
import type { HallRoomConnectionTicket, HallRoomPreparation } from '../../../../../../Lobby/Code/HallRoomGateway';
import { presentationTransition, type PresentationTransition } from '../../../../../../Common/Code/Runtime/ui/PresentationTransitionCoordinator';
import { getOrLoadBundle } from '../../../../../../Common/Code/Runtime/navigation/BundleLoader';
import { hostRouteStore } from '../../../../../../Common/Code/Runtime/navigation/HostRouteStore';
import { COMMON_ROOM_FORM, PDK_ROOM_FORM } from './Room/PdkRoomNodePaths';

const RESOURCE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const LOAD_TIMEOUT_MS = 15_000;
const COMMON_SCENE_BUNDLE = 'games-common';
const COMMON_PDK_BUNDLE = 'paodekuai-common';
const COMMON_PDK_SCENE = 'GameRoom2D';
const COMMON_ROOM_PREFAB = 'Prefab/CommonRoom';
const PDK_ROOM_PREFAB = 'Prefab/PDK_CommonRoom';

export interface StartupSceneMask {
    readonly node: Node;
    readonly report?: (message: string, progress: number) => void;
}

export interface RoomReturnTarget {
    readonly entryOrigin?: unknown;
    readonly fromClub?: unknown;
    readonly returnContext?: unknown;
    readonly presentationTransition?: PresentationTransition;
    readonly startupMessage?: string;
}

/**
 * Owns the authoritative common PDK lobby-to-game scene boundary.
 * The server release selects the native Creator bundle and scene; this class
 * never derives either value from a region label or a client-side game table.
 */
export class CommonPdkGameSceneLauncher {
    private pending: Promise<void> | null = null;
    private coordinator: CommonPdkSwitchCoordinator | null = null;
    private forms: LegacyFormManager | null = null;
    private hallClient: ProtocolClient | null = null;
    private placeholder: Node | null = null;
    private returnPending: Promise<void> | null = null;
    private readonly prewarmPending = new Map<string, Promise<void>>();
    private readonly prewarmedAssets = new Map<string, readonly Asset[]>();
    private readonly sceneLoadPending = new Map<string, Promise<void>>();
    private disposed = false;

    public constructor(
        private readonly account: AuthenticatedAccount,
        private readonly playerId: number,
        private readonly refreshRoomConnection: (roomId: number) => Promise<HallRoomConnectionTicket>,
        private readonly leaveRoom: (roomId: number) => Promise<unknown>,
        private readonly onRoomClosed: () => void = () => undefined,
        private readonly navigateToLobby?: (target?: RoomReturnTarget) => Promise<void>,
        private readonly currentReplayCode: (roomId: number, setId: number) => Promise<string> = async () => '',
        private readonly settlementHistory: (roomId: number) => Promise<unknown> = async () => ({}),
    ) {}

    public launch(ticket: LegacySubgameTicket, startupMask?: StartupSceneMask): Promise<void> {
        if (this.pending) return this.pending;
        this.pending = this.launchOnce(ticket, startupMask).finally(() => { this.pending = null; });
        return this.pending;
    }

    /** Download and parse room resources while the desk is already visible. */
    public prewarm(preparation: HallRoomPreparation): Promise<void> {
        const bundleName = String(preparation.room.bundleName ?? '').trim();
        const sceneName = String(preparation.room.sceneName ?? '').trim();
        return this.prewarmResources(bundleName, sceneName);
    }

    /** Speculative warmup for the currently enabled common PDK family. */
    public prewarmDefaultRoom(): Promise<void> {
        return this.prewarmResources(COMMON_PDK_BUNDLE, COMMON_PDK_SCENE);
    }

    private prewarmResources(bundleName: string, sceneName: string): Promise<void> {
        if (!RESOURCE_NAME.test(bundleName) || !RESOURCE_NAME.test(sceneName)) return Promise.resolve();
        const key = `${bundleName}:${sceneName}`;
        const retained = this.prewarmedAssets.get(key);
        if (retained?.length && retained.every(asset => isValid(asset, true))) return Promise.resolve();
        if (retained) this.releasePrewarmedAssets(key);
        const existing = this.prewarmPending.get(key);
        if (existing) return existing;
        const pending = Promise.all([
            this.loadBundle(COMMON_PREFAB_BUNDLE),
            this.loadBundle(COMMON_SCENE_BUNDLE),
            this.loadBundle(bundleName),
        ]).then(([, sceneBundle, gameBundle]) => Promise.all([
            this.preloadScene(sceneBundle, sceneName),
            this.loadPrefab(sceneBundle, COMMON_ROOM_PREFAB),
            this.loadPrefab(gameBundle, PDK_ROOM_PREFAB),
        ]).then(([, commonRoom, gameRoom]) => {
            if (this.disposed) return;
            const assets = [commonRoom, gameRoom] as const;
            for (const asset of assets) asset.addRef();
            this.prewarmedAssets.set(key, assets);
        })).finally(() => this.prewarmPending.delete(key));
        this.prewarmPending.set(key, pending);
        return pending;
    }

    public destroy(): void {
        this.disposed = true;
        this.cleanup();
        for (const key of [...this.prewarmedAssets.keys()]) this.releasePrewarmedAssets(key);
        this.prewarmPending.clear();
        this.sceneLoadPending.clear();
    }

    public getFormManager(): LegacyFormManager | null {
        return this.forms;
    }

    private async launchOnce(ticket: LegacySubgameTicket, startupMask?: StartupSceneMask): Promise<void> {
        // Room reconnect and Creator hot-preview can restore GameRoom2D without
        // running LoginScreenBootstrap again. The room must therefore own its
        // resolution policy instead of inheriting whichever policy the previous
        // scene happened to leave behind.
        view.setDesignResolutionSize(1280, 720, ResolutionPolicy.FIXED_HEIGHT);
        const bundleName = String(ticket.bundleName ?? '').trim();
        const sceneName = String(ticket.sceneName ?? '').trim();
        if (!RESOURCE_NAME.test(bundleName) || !RESOURCE_NAME.test(sceneName)) {
            throw new Error('玩法资源发布信息无效，请重试');
        }
        const transition = presentationTransition.begin({
            name: `game:${sceneName}`, message: '正在准备房间资源...', progress: 0.05,
            progressKind: 'STAGE', showAfterMs: 0, showDuringProgress: false,
            retainCurrentFrame: true, timeoutMs: 30_000,
        });
        try {
            transition.update('正在加载玩法资源...', 0.18, 'STAGE');
            // Bundle manifests have no ordering dependency. More importantly,
            // the room Scene depends only on games-common, so start parsing it as
            // soon as that bundle arrives instead of waiting for both prefab
            // bundles first.
            const commonBundleReady = this.stage('load-common-bundle',
                this.withTimeout(this.loadBundle(COMMON_PREFAB_BUNDLE), '公共房间资源下载超时'));
            const sceneBundleReady = this.stage('load-common-scene-bundle',
                this.withTimeout(this.loadBundle(COMMON_SCENE_BUNDLE), '公共房间场景下载超时'));
            const gameBundleReady = this.stage('load-game-bundle',
                this.withTimeout(this.loadBundle(bundleName), '玩法资源下载超时'));
            const sceneBundle = await sceneBundleReady;
            startupMask?.report?.('正在切换房间场景...', 0.92);
            transition.update('正在切换房间场景...', 0.82, 'STAGE');
            const sceneReady = director.getScene()?.name === sceneName
                ? Promise.resolve()
                : this.stage('load-room-scene', this.withTimeout(
                    this.loadScene(sceneBundle, sceneName), '进入游戏场景超时'));
            await Promise.all([commonBundleReady, gameBundleReady, sceneReady]);
            if (director.getScene()?.name !== sceneName) {
                throw new Error(`游戏场景未成功切换：${sceneName}`);
            }
            transition.update('正在建立房间连接...', 0.9, 'STAGE');
            await this.stage('mount-room-runtime', this.mount(ticket, sceneName));
            const fromClub = ticket.entryOrigin === 'CLUB' || ticket.entryOrigin === 'UNION' || Boolean(ticket.fromClub);
            const clubId = Number(ticket.returnContext?.clubId ?? ticket.clubId ?? 0);
            const returnTo = fromClub && Number.isSafeInteger(clubId) && clubId > 0
                ? { name: 'club' as const, clubId }
                : { name: 'lobby' as const };
            const roomId = Number(ticket.roomId ?? ticket.roomID);
            if (Number.isSafeInteger(roomId) && roomId > 0) {
                hostRouteStore.save(String(this.account.accountId), {
                    name: 'game', pluginId: bundleName, roomId, returnTo,
                });
            }
            transition.update('正在提交房间首帧...', 0.98, 'STAGE');
            // coordinator.enter resolves only after CommonRoom and the gameplay
            // form have mounted and their initial presentation barrier has run.
            // Rechecking generic scene layers here created a second, divergent
            // readiness owner that could time out over an already usable room.
            await transition.commitAfterPresentation();
        } catch (error: unknown) {
            transition.fail(error, () => { void this.launch(ticket, startupMask); });
            throw error;
        }
    }

    private async mount(ticket: LegacySubgameTicket, sceneName: string): Promise<void> {
        await this.ensureMountedShell(sceneName);
        const coordinator = this.coordinator;
        if (!coordinator) throw new Error('游戏房间壳层未能建立，请重试');
        await coordinator.enter(ticket);
        if (!coordinator.isInGameSession()) {
            throw new Error('游戏房间未能建立，请返回大厅重试');
        }
    }

    private async ensureMountedShell(sceneName: string): Promise<void> {
        if (this.coordinator && this.forms && this.placeholder?.isValid) return;
        const scene = await this.waitForSceneActivation(sceneName);
        const canvas = find('Canvas', scene) ?? scene.getChildByName('Canvas');
        const uiLayer = find('Canvas/TableLayer', scene) ?? find('Canvas/OperationLayer', scene)
            ?? find('Canvas/PopupLayer', scene) ?? canvas;
        if (!canvas || !uiLayer) throw new Error('游戏场景缺少原生 UI 容器');

        const placeholder = new Node('LobbyPlaceholder');
        canvas.addChild(placeholder);
        const forms = new LegacyFormManager(uiLayer, () => undefined, true);
        const hallClient = connectionOwnership.hall as unknown as ProtocolClient;
        const coordinator = new CommonPdkSwitchCoordinator(
            this.account, this.playerId, hallClient, forms, placeholder, this.refreshRoomConnection,
            this.leaveRoom, this.onRoomClosed, this.currentReplayCode, this.settlementHistory,
        );
        this.placeholder = placeholder;
        this.forms = forms;
        const diagnostics = globalThis as typeof globalThis & {
            __PDK_E2E_LOGS__?: unknown[];
            __PDK_E2E_FORMS__?: LegacyFormManager;
            __PDK_LIFECYCLE_TRACE__?: unknown[];
        };
        if (Array.isArray(diagnostics.__PDK_E2E_LOGS__)) {
            diagnostics.__PDK_E2E_FORMS__ = forms;
            diagnostics.__PDK_LIFECYCLE_TRACE__ ??= [];
            diagnostics.__PDK_LIFECYCLE_TRACE__.push({ stage: 'mounted', forms: forms.diagnostics() });
        }
        this.hallClient = hallClient;
        this.coordinator = coordinator;
        // Room-reachable panels are preloaded by CommonPdkSwitchCoordinator while
        // the entry cover is still present. A global background scan here requests
        // unrelated lobby/module assets and can flash or emit 404s after the table
        // is already interactive.
        placeholder.on('subgame-returned', (target: RoomReturnTarget) => { void this.requestReturnToLobby(target); });
    }

    private async waitForSceneActivation(sceneName: string): Promise<Node> {
        const deadline = Date.now() + 3_000;
        while (Date.now() < deadline) {
            const scene = director.getScene();
            const canvas = scene ? (find('Canvas', scene) ?? scene.getChildByName('Canvas')) : null;
            if (scene?.name === sceneName && isValid(scene, true) && canvas && isValid(canvas, true)
                && canvas.activeInHierarchy) return scene;
            await this.nextFrame();
        }
        const current = director.getScene()?.name ?? 'none';
        throw new Error(`游戏场景尚未激活（expected=${sceneName}, current=${current}）`);
    }

    private requestReturnToLobby(target?: RoomReturnTarget): Promise<void> {
        if (this.returnPending) return this.returnPending;
        const pending = Promise.resolve().then(() => this.returnToLobby(target));
        this.returnPending = pending;
        return pending.finally(() => { if (this.returnPending === pending) this.returnPending = null; });
    }

    private async returnToLobby(target?: RoomReturnTarget): Promise<void> {
        if (this.disposed) return;
        const transition = target?.presentationTransition ?? presentationTransition.begin({
            name: 'game-return-lobby', message: '正在返回大厅...', progress: 0,
            progressKind: 'STAGE', showAfterMs: 0, showDuringProgress: false,
            retainCurrentFrame: true, timeoutMs: LOAD_TIMEOUT_MS,
        });
        try {
            // The coordinator has already confirmed its retained source frame;
            // cleanup can proceed immediately without the legacy one-second draw wait.
            this.cleanup();
            this.onRoomClosed();
            await this.withTimeout(this.navigateToLobby ? this.navigateToLobby(target) : this.loadMainScene(), '返回大厅超时');
            await transition.commitAfterPresentation({
                ready: () => Boolean(director.getScene()?.isValid),
            });
        } catch (error: unknown) {
            transition.fail(error, () => { void this.returnToLobby(target); });
            throw error;
        }
    }

    private loadMainScene(): Promise<void> {
        return getOrLoadBundle('lobby').then(bundle => new Promise<void>((resolve, reject) => {
            bundle.loadScene('MainScene', (error, sceneAsset) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (!sceneAsset) {
                    const error = new Error('大厅场景资源不存在');
                    reject(error);
                    return;
                }
                director.runScene(sceneAsset);
                resolve();
            });
        }));
    }

    private cleanup(): void {
        const diagnostics = globalThis as typeof globalThis & {
            __PDK_E2E_FORMS__?: LegacyFormManager;
            __PDK_LIFECYCLE_TRACE__?: unknown[];
        };
        if (this.forms && Array.isArray(diagnostics.__PDK_LIFECYCLE_TRACE__)) {
            diagnostics.__PDK_LIFECYCLE_TRACE__.push({ stage: 'before-destroy', forms: this.forms.diagnostics() });
        }
        this.coordinator?.destroy();
        this.coordinator = null;
        this.forms?.destroy();
        if (this.forms && Array.isArray(diagnostics.__PDK_LIFECYCLE_TRACE__)) {
            diagnostics.__PDK_LIFECYCLE_TRACE__.push({ stage: 'destroyed', alive: this.forms.isAlive(), forms: this.forms.diagnostics() });
        }
        if (diagnostics.__PDK_E2E_FORMS__ === this.forms) delete diagnostics.__PDK_E2E_FORMS__;
        this.forms = null;
        this.hallClient = null;
        if (this.placeholder?.isValid) this.placeholder.destroy();
        this.placeholder = null;
    }

    private loadBundle(bundleName: string): Promise<AssetManager.Bundle> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(bundleName, (error, bundle) => {
                if (error || !bundle) reject(error ?? new Error(`Bundle ${bundleName} 不存在`));
                else resolve(bundle);
            });
        });
    }

    private preloadScene(bundle: AssetManager.Bundle, sceneName: string,
        progress?: (completed: number, total: number) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            bundle.preloadScene(sceneName, (completed, total) => progress?.(completed, total), (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    private loadPrefab(bundle: AssetManager.Bundle, assetPath: string): Promise<Prefab> {
        return new Promise((resolve, reject) => {
            bundle.load(assetPath, Prefab, (error, prefab) => {
                if (error || !prefab) reject(error ?? new Error(`房间 Prefab ${assetPath} 不存在`));
                else if (!isValid(prefab, true)) {
                    bundle.release(assetPath, Prefab);
                    bundle.load(assetPath, Prefab, (retryError, retryPrefab) => {
                        if (retryError || !retryPrefab || !isValid(retryPrefab, true)) {
                            reject(retryError ?? new Error(`房间 Prefab ${assetPath} 已失效`));
                            return;
                        }
                        resolve(retryPrefab);
                    });
                } else resolve(prefab);
            });
        });
    }

    private releasePrewarmedAssets(key: string): void {
        const assets = this.prewarmedAssets.get(key);
        if (!assets) return;
        this.prewarmedAssets.delete(key);
        for (const asset of assets) {
            if (isValid(asset, true)) asset.decRef();
        }
    }

    private loadScene(bundle: AssetManager.Bundle, sceneName: string): Promise<void> {
        const existing = this.sceneLoadPending.get(sceneName);
        if (existing) return existing;
        const pending = new Promise<void>((resolve, reject) => {
            const run = (allowReload: boolean): void => {
                bundle.loadScene(sceneName, (error, sceneAsset) => {
                    if (error || !sceneAsset) {
                        reject(error ?? new Error(`房间场景 ${sceneName} 不存在`));
                        return;
                    }
                    if (!sceneAsset.scene || !isValid(sceneAsset.scene, true)) {
                        if (!allowReload) {
                            reject(new Error(`房间场景 ${sceneName} 已失效`));
                            return;
                        }
                        // runScene destroys the previous Scene node, while the Bundle can
                        // still retain its SceneAsset wrapper. Evict that wrapper so a
                        // second room entry parses a new Scene instead of reopening a dead one.
                        assetManager.releaseAsset(sceneAsset as SceneAsset);
                        run(false);
                        return;
                    }
                    // The optimistic shell and the authoritative launch can arrive
                    // in the same frame. Keep this request pending until Director
                    // has actually launched the scene; otherwise both paths can
                    // schedule runScene with the same Scene object and the second
                    // launch destroys the scene that it is about to reuse.
                    director.runScene(sceneAsset, undefined, (launchError) => {
                        if (launchError) reject(launchError);
                        else resolve();
                    });
                });
            };
            run(true);
        }).finally(() => {
            if (this.sceneLoadPending.get(sceneName) === pending) this.sceneLoadPending.delete(sceneName);
        });
        this.sceneLoadPending.set(sceneName, pending);
        return pending;
    }

    private nextFrame(): Promise<void> {
        return new Promise(resolve => globalThis.requestAnimationFrame?.(() => resolve()) ?? globalThis.setTimeout(resolve, 16));
    }

    private withTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = globalThis.setTimeout(() => reject(new Error(message)), LOAD_TIMEOUT_MS);
            operation.then(
                value => { globalThis.clearTimeout(timer); resolve(value); },
                error => { globalThis.clearTimeout(timer); reject(error); },
            );
        });
    }

    private async stage<T>(name: string, operation: Promise<T>): Promise<T> {
        try {
            return await operation;
        } catch (cause: unknown) {
            const detail = cause instanceof Error ? cause.message : String(cause);
            throw new Error(`游戏房间恢复失败（${name}）：${detail}`, { cause });
        }
    }
}
