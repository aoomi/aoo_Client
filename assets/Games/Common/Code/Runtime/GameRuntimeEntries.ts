import { assetManager, Button, Camera, instantiate, Label, Node, Prefab, UITransform, Widget } from 'cc';
import { CommonHeadController } from '../../../../Common/Code/UI/CommonHeadController';
import { commonRoomSeatSlots, createSeatPerspective } from '../../../../Common/Code/Runtime/state/SeatPerspective';
import type { CommonRoomSeatSlot } from '../../../../Common/Code/Runtime/state/SeatPerspective';
import { createNnGameRuntimeEntry } from '../../../Poker/NN/Common/Code/NnRuntimeEntry';
import { createChengdu1001RuntimeEntry } from '../../../Mahjong/Chengdu1001/Chengdu1001RuntimeEntry';
import { createMahjongCatalogRuntimeEntry } from '../../../Mahjong/Common/Code/MahjongCatalogRuntimeEntry';
import { createZjhGameRuntimeEntry } from '../../../Poker/ZJH/Common/Code/ZjhGameRuntimeEntry';
import {
    canonicalGameCode,
    canonicalGameFamily,
    COMMON_ROOM_QUICK_TEXTS,
    normalizeCommonRoomSocialEvents,
} from './GameRuntimeEntry';
import { parseCommonRoomPublicView } from './GameRuntimeEntry';
import type { CommonRoomFeaturePorts, CommonRoomMountedView, CommonRoomPublicView, GameRuntimeEntry } from './GameRuntimeEntry';
import type { CommonRoomSocialEvent, CommonRoomSocialRenderer } from '../Room/CommonRoomSocialController';
import {
    CommonRoomSettlementWindowRenderer,
    type RoomSettlementHistoryRenderer,
} from '../Room/RoomSettlementHistory';
import { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';
import {
    onGameReconnect, setGameReconnectRecipe, setGameRoomReconnectRecipe,
} from '../../../../Common/Code/Runtime/network/ConnectionOwnership';
import type { CommonRoomSession } from '../../../../Common/Code/Runtime/network/ProtocolClient';
import { GameRuntimeEntryRegistry } from './GameRuntimeEntryRegistry';
import { CommonRoomCapabilityController, type CommonRoomMoreMenuLayout } from '../Room/CommonRoomCapabilityController';
import { CommonRoomChatController } from '../Room/CommonRoomChatController';
import { CommonRoomSocialController } from '../Room/CommonRoomSocialController';
import { CommonRoomVoiceController } from '../Room/CommonRoomVoiceController';
import { RoomSettlementHistory } from '../Room/RoomSettlementHistory';
import { RoomNetworkControllerMount } from '../Room/RoomNetworkControllerMount';
import type { CommonRoomFormHost, CommonRoomRuntimeDependencies } from '../Room/RoomNetworkControllerMount';
import { CommonRoomMagicPanelController } from '../Room/CommonRoomMagicPanelController';
import { CommonRoomDissolveController } from '../Room/CommonRoomDissolveController';
import { mountCommonRoomShell } from '../Room/CommonRoomShellMount';
import { COMMON_ASSET_BUNDLE, COMMON_HEAD_ASSET } from '../../../../Common/Code/Runtime/ui/CommonPrefabRegistry';
import {
    RoomOrchestrator,
    type RoomOrchestratorCapabilityContract,
    type RoomOrchestratorContext,
    type RoomOrchestratorChild,
} from './RoomOrchestrator';

/** Composition root used by the lobby; feature packages provide isolated entries. */
export function createGameRuntimeEntryRegistry(entries: readonly GameRuntimeEntry[]): GameRuntimeEntryRegistry {
    const registry = new GameRuntimeEntryRegistry();
    for (const entry of entries) registry.register(entry);
    return registry;
}

export interface ProductionGameRuntimeEntriesOptions {
    readonly pdk: GameRuntimeEntry;
    /** New gameplay registers only its runtime entry; the CommonRoom lifecycle is composed here. */
    readonly additionalEntries?: readonly GameRuntimeEntry[];
    readonly lobbyNode: Node;
    readonly playerId: number;
    /** Account identity bound to the Gateway ticket; consumed by authoritative runtimes whose seats use account IDs. */
    readonly accountId: number;
    /** Issues a fresh, one-time Hall room ticket for every reconnect attempt. */
    readonly refreshRoomConnection: (roomId: number) => Promise<{
        authorityRoute: string;
        gameTicket: string;
    }>;
    /** Commits the authoritative Hall leave before local room teardown/navigation. */
    readonly requestRoomExit: (roomId: number) => Promise<void>;
    readonly onCD299ExitRequested?: (roomId: number) => Promise<void>;
    /** Optional dependency bundle for boot-time room recovery before the lobby owner exists. */
    readonly commonRoomRuntimeDependencies?: CommonRoomRuntimeDependencies;
}

type LazyCxGameRuntimeEntryOptions = Readonly<{
    parent: Node;
    playerId: number;
    requestPrefix: string;
    onExitRequested: (roomId: number) => Promise<void>;
}>;

function createLazyCxGameRuntimeEntry(
    options: LazyCxGameRuntimeEntryOptions,
): GameRuntimeEntry {
    let delegate: GameRuntimeEntry | null = null;
    let loading: Promise<GameRuntimeEntry> | null = null;
    let generation = 0;

    const load = (): Promise<GameRuntimeEntry> => {
        if (!loading) {
            const loadGeneration = generation;
            loading = import('../../../Poker/CX/Code/CxEntry').then(({ createCxGameRuntimeEntry }) => {
                if (loadGeneration !== generation) {
                    throw new Error('CX_RUNTIME_ENTRY_LOAD_DESTROYED');
                }
                delegate = createCxGameRuntimeEntry(options);
                return delegate;
            });
        }
        return loading;
    };

    const run = async (action: (entry: GameRuntimeEntry) => Promise<void> | void): Promise<void> => {
        const operationGeneration = generation;
        const entry = await load();
        if (operationGeneration !== generation || entry !== delegate) {
            throw new Error('CX_RUNTIME_ENTRY_LOAD_DESTROYED');
        }
        await action(entry);
    };

    return {
        id: 'cx',
        canonicalGameCodes: ['chengdu2999'],
        families: ['poker-cx'],
        supportsPlayVersion: playVersion => playVersion === 'cx-v1.0.0',
        preload: handoff => run(entry => entry.preload?.(handoff)),
        enter: handoff => run(entry => entry.enter(handoff)),
        enterReplay: handoff => run(entry => entry.enterReplay?.(handoff)),
        commonRoomPorts: () => delegate?.commonRoomPorts?.() ?? null,
        restoreAfterReconnect: () => run(entry => entry.restoreAfterReconnect?.()),
        destroy: () => {
            generation += 1;
            const current = delegate;
            delegate = null;
            loading = null;
            current?.destroy();
        },
    };
}

/** The single static composition point for native game runtimes shipped by Creator. */
export function createProductionGameRuntimeEntryRegistry(
    options: ProductionGameRuntimeEntriesOptions,
): GameRuntimeEntryRegistry {
    // Keep the source UI node rather than resolving a scene root here. The
    // shared mount resolves the live UI host at enter time, after any scene
    // handoff. A Scene node is not a UI event/render root in scenes that nest
    // their Canvas below a scene-management node.
    const roomHost = options.lobbyNode;
    const presentation = new GameRuntimePresentationLifecycle(options.lobbyNode);
    return createGameRuntimeEntryRegistry([
        options.pdk,
        createLazyCxGameRuntimeEntry({
            parent: roomHost,
            playerId: options.playerId,
            requestPrefix: 'cd299',
            onExitRequested: options.onCD299ExitRequested ?? options.requestRoomExit,
        }),
        createNnGameRuntimeEntry({
            playerId: options.playerId,
            requestPrefix: 'cn298',
            host: () => roomHost,
            requestRoomExit: options.requestRoomExit,
        }),
        createChengdu1001RuntimeEntry({
            parent: roomHost,
            accountId: options.accountId,
            requestRoomExit: options.requestRoomExit,
        }),
        // Every catalog-routed Mahjong profile without a dedicated table view
        // still enters through the same CommonRoom lifecycle. Its gameplay
        // adapter is selected by the authoritative code; CommonRoom owns the
        // shell, public seats, social buttons, reconnect and teardown once.
        createMahjongCatalogRuntimeEntry({
            accountId: options.accountId,
            requestRoomExit: options.requestRoomExit,
        }),
        createZjhGameRuntimeEntry({
            playerId: options.accountId,
            host: () => roomHost,
            requestRoomExit: options.requestRoomExit,
        }),
        ...(options.additionalEntries ?? []),
    ].map(entry => withPresentationLifecycle(entry, presentation, roomHost, options.lobbyNode,
        options.requestRoomExit, options.refreshRoomConnection, options.commonRoomRuntimeDependencies)));
}

type ChildPresentationState = { readonly node: Node; readonly active: boolean };
type ResolvedCommonRoomFeaturePorts = Omit<CommonRoomFeaturePorts,
    'chatWindow' | 'voiceCapture' | 'voiceWindow' | 'socialRenderer' | 'settlementHistoryRenderer' | 'exit'> & {
    readonly chatWindow: NonNullable<CommonRoomFeaturePorts['chatWindow']>;
    readonly voiceCapture: NonNullable<CommonRoomFeaturePorts['voiceCapture']>;
    readonly voiceWindow: NonNullable<CommonRoomFeaturePorts['voiceWindow']>;
    readonly socialRenderer: CommonRoomSocialRenderer;
    readonly settlementHistoryRenderer: RoomSettlementHistoryRenderer;
    readonly exit: NonNullable<CommonRoomFeaturePorts['exit']>;
};
type PreparedCommonRoom = Readonly<{
    readonly roomId: number;
    /**
     * An override may provide an already-mounted root.  The normal path keeps
     * this null until commit: prepare must not mutate the live Canvas.
     */
    readonly root: Node | null;
    readonly defaults: ReturnType<typeof RoomNetworkControllerMount.createCommonRoomDefaultPorts>;
    readonly ports: ResolvedCommonRoomFeaturePorts;
    readonly ownsRoot: boolean;
    readonly hasSettlementHistory: boolean;
    readonly formHost: CommonRoomFormHost | null;
}>;

/**
 * Owns the visual handoff between the persistent lobby/loading Canvas and a
 * dynamically mounted game room. The scene UI Camera is deliberately kept
 * active: feature prefabs mounted beside the Canvas still require it to render.
 */
class GameRuntimePresentationLifecycle {
    private hiddenChildren: ChildPresentationState[] = [];
    private enteredCount = 0;

    public constructor(private readonly source: Node) {}

    public preparing(): void {
        if (!this.source.isValid || this.hiddenChildren.length > 0) return;
        // Snapshot before the feature mounts its room node. The new room must
        // remain visible; only the pre-existing lobby/loading presentation hides.
        this.hiddenChildren = this.source.children.map(node => ({ node, active: node.active }));
    }

    public entered(entryId: string): void {
        this.enteredCount += 1;
        if (!this.source.isValid) return;
        for (const { node, active } of this.hiddenChildren) {
            const ownsCamera = Boolean(node.getComponent(Camera) ?? node.getComponentInChildren(Camera));
            if (active && !ownsCamera) node.active = false;
        }
        console.info('[GameRuntimePresentation]', {
            action: 'ENTERED', entryId, source: this.source.name,
            hiddenChildren: this.hiddenChildren.filter(item => item.active && !item.node.active).map(item => item.node.name),
            cameraPreserved: Boolean(this.source.getComponent(Camera) ?? this.source.getComponentInChildren(Camera)),
        });
    }

    public exited(entryId: string): void {
        this.enteredCount = Math.max(0, this.enteredCount - 1);
        if (this.enteredCount > 0) return;
        for (const { node, active } of this.hiddenChildren) {
            if (node.isValid) node.active = active;
        }
        this.hiddenChildren = [];
        console.info('[GameRuntimePresentation]', { action: 'EXITED', entryId, source: this.source.name });
    }

    public failed(): void {
        if (this.enteredCount === 0) this.hiddenChildren = [];
    }
}

/** Enter success is the only boundary allowed to hide the source presentation. */
function withPresentationLifecycle(entry: GameRuntimeEntry,
    presentation: GameRuntimePresentationLifecycle, roomHost: Node, defaultPortsHost: Node,
    requestRoomExit: (roomId: number) => Promise<void>,
    refreshRoomConnection: ProductionGameRuntimeEntriesOptions['refreshRoomConnection'],
    commonRoomRuntimeDependencies?: CommonRoomRuntimeDependencies): GameRuntimeEntry {
    let entered = false;
    let entryReady = false;
    let commonRoom: CommonRoomRuntimeLifecycle | null = null;
    let preparedCommonRoom: PreparedCommonRoom | null = null;
    let orchestrator: RoomOrchestrator | null = null;
    let reconnectDisposer: (() => void) | null = null;
    let reconnectInstalled = false;
    const clearRoomReconnect = (): void => {
        reconnectDisposer?.();
        reconnectDisposer = null;
        if (reconnectInstalled) setGameReconnectRecipe(null);
        reconnectInstalled = false;
    };
    const installRoomReconnect = (handoff: Parameters<GameRuntimeEntry['enter']>[0]): void => {
        const roomId = commonRoomId(handoff);
        const playVersion = String(handoff.playVersion ?? '').trim();
        if (!playVersion) throw new Error('COMMON_ROOM_HANDOFF_PLAY_VERSION_INVALID');
        clearRoomReconnect();
        setGameRoomReconnectRecipe(roomId, playVersion, refreshRoomConnection);
        reconnectInstalled = true;
        if (entry.restoreAfterReconnect) {
            reconnectDisposer = onGameReconnect(async () => {
                if (!entryReady || !entry.restoreAfterReconnect) return;
                if (!orchestrator) throw new Error('ROOM_ORCHESTRATOR_REQUIRED');
                await orchestrator.restore();
            });
        }
    };
    const prepareCommonRoom = async (handoff: Parameters<GameRuntimeEntry['enter']>[0],
        context?: RoomOrchestratorContext): Promise<void> => {
        if (commonRoom || preparedCommonRoom) return;
        const providedOverrides = entry.commonRoomPorts?.() ?? null;
        const overrides: CommonRoomFeaturePorts = providedOverrides ?? Object.freeze({});
        const roomId = commonRoomId(handoff);
        let root: Node | null = null;
        let defaults: ReturnType<typeof RoomNetworkControllerMount.createCommonRoomDefaultPorts> | null = null;
        try {
            if (Boolean(overrides.settlementHistoryRenderer || overrides.settlementHistoryWindow)
                !== Boolean(overrides.settlementHistoryFeed)) {
                throw new Error('COMMON_ROOM_SETTLEMENT_PORTS_INCOMPLETE');
            }
            // A caller-supplied root is already owned by its caller and may be
            // validated during preparation.  The normal prefab path is loaded
            // and attached only by commitCommonRoom, after Gameplay has
            // established the sole active room client.
            root = overrides.mountedRoot ?? null;
            if (root && (!root.isValid || !root.activeInHierarchy)) {
                throw new Error('COMMON_ROOM_MOUNTED_ROOT_INVALID');
            }
            if (context?.signal.aborted) throw new Error('ROOM_ORCHESTRATOR_ABORTED');
            defaults = overrides.mountedRootDefaults?.()
                // The shared network mount is installed on the persistent
                // lobby controller node. The shell itself mounts to the live
                // scene Canvas, so these must intentionally be separate hosts.
                ?? RoomNetworkControllerMount.createCommonRoomDefaultPorts(
                    defaultPortsHost, commonRoomRuntimeDependencies);
            const report = overrides.report ?? commonRoomReport(entry.id);
            const defaultRenderer: CommonRoomSocialRenderer = Object.freeze({
                render: (event: CommonRoomSocialEvent) => commonRoom?.renderDefaultSocial(event, defaults!.playVoice),
                clear: () => commonRoom?.clearDefaultSocial(),
            });
            const ports: ResolvedCommonRoomFeaturePorts = Object.freeze({
                ...overrides,
                chatWindow: overrides.chatWindow ?? defaults.chatWindow,
                voiceCapture: overrides.voiceCapture ?? defaults.voiceCapture,
                voiceWindow: overrides.voiceWindow ?? defaults.voiceWindow,
                socialRenderer: overrides.socialRenderer ?? defaultRenderer,
                settlementHistoryRenderer: overrides.settlementHistoryRenderer
                    ?? (overrides.settlementHistoryWindow
                        ? new CommonRoomSettlementWindowRenderer(
                            commonRoomRuntimeDependencies?.formHost ?? defaults!.formHost,
                            overrides.settlementHistoryWindow,
                            report,
                        )
                        : failClosedSettlementRenderer(entry.id)),
                exit: overrides.exit ?? Object.freeze({ request: () => requestRoomExit(roomId) }),
                report,
            });
            preparedCommonRoom = Object.freeze({
                roomId,
                root,
                defaults,
                ports,
                ownsRoot: !overrides.mountedRoot,
                hasSettlementHistory: Boolean(overrides.settlementHistoryRenderer || overrides.settlementHistoryWindow),
                formHost: commonRoomRuntimeDependencies?.formHost ?? defaults.formHost,
            });
        } catch (error) {
            defaults?.destroy();
            if (!overrides.mountedRoot && root?.isValid) root.destroy();
            preparedCommonRoom = null;
            commonRoom = null;
            throw error;
        }
    };
    const commitCommonRoom = async (context?: RoomOrchestratorContext): Promise<void> => {
        if (commonRoom) {
            await commonRoom.install();
            return;
        }
        const prepared = preparedCommonRoom;
        if (!prepared) throw new Error('COMMON_ROOM_PREPARE_REQUIRED');
        // The gameplay commit establishes the sole active room ProtocolClient
        // before Common asks for its session. This is intentionally the only
        // place where CommonRoom acquires the live session handle.
        const root = prepared.root ?? await mountCommonRoomShellCancellable(roomHost, context?.signal);
        if (!root.isValid || !root.activeInHierarchy) throw new Error('COMMON_ROOM_MOUNTED_ROOT_INVALID');
        if (context?.signal.aborted) throw new Error('ROOM_ORCHESTRATOR_ABORTED');
        const session = ProtocolClient.commonRoomSession(prepared.roomId);
        const lifecycle = new CommonRoomRuntimeLifecycle(entry.id, root, prepared.ports, session,
            prepared.defaults.destroy, prepared.ownsRoot,
            prepared.hasSettlementHistory, true, prepared.formHost);
        commonRoom = lifecycle;
        preparedCommonRoom = null;
        await lifecycle.install();
    };
    const bindCommonRoom = async (handoff: Parameters<GameRuntimeEntry['enter']>[0]): Promise<void> => {
        await prepareCommonRoom(handoff);
        await commitCommonRoom();
    };
    const unbindCommonRoom = (): void => {
        commonRoom?.destroy();
        commonRoom = null;
        const prepared = preparedCommonRoom;
        preparedCommonRoom = null;
        if (prepared) {
            prepared.defaults.destroy();
            if (prepared.ownsRoot && prepared.root?.isValid) prepared.root.destroy();
        }
    };
    return {
        id: entry.id,
        canonicalGameCodes: entry.canonicalGameCodes,
        families: entry.families,
        preload: entry.preload ? handoff => entry.preload!(handoff) : undefined,
        enter: async handoff => {
            presentation.preparing();
            try {
                installRoomReconnect(handoff);
                const roomId = commonRoomId(handoff);
                const capabilityContract = roomCapabilityContract(handoff);
                const commonCapabilities = commonRoomCapabilityContract();
                const gameplayCapabilities = gameplayRoomCapabilityContract(entry, handoff);
                orchestrator = new RoomOrchestrator(roomId, commonRoomReport(entry.id), {
                    requiredCapabilities: capabilityContract,
                });
                const gameplay: RoomOrchestratorChild = {
                    enter: () => entry.enter(handoff),
                    prepare: async context => {
                        await entry.preload?.(handoff);
                        if (context.signal.aborted) throw new Error('ROOM_ORCHESTRATOR_ABORTED');
                    },
                    commit: () => entry.enter(handoff),
                    capabilityScope: 'gameplay',
                    capabilities: () => gameplayCapabilities,
                    destroy: () => entry.destroy(),
                    restore: entry.restoreAfterReconnect
                        ? () => entry.restoreAfterReconnect!() : undefined,
                };
                const common: RoomOrchestratorChild = {
                    enter: () => bindCommonRoom(handoff),
                    prepare: context => prepareCommonRoom(handoff, context),
                    commit: commitCommonRoom,
                    capabilityScope: 'common',
                    capabilities: () => commonCapabilities,
                    destroy: unbindCommonRoom,
                };
                await orchestrator.enter(common, gameplay);
                entryReady = true;
                if (!entered) {
                    entered = true;
                    presentation.entered(entry.id);
                }
            } catch (error) {
                entryReady = false;
                clearRoomReconnect();
                orchestrator?.destroy();
                orchestrator = null;
                unbindCommonRoom();
                presentation.failed();
                throw error;
            }
        },
        enterReplay: entry.enterReplay ? async handoff => {
            presentation.preparing();
            try {
                clearRoomReconnect();
                const roomId = commonRoomId(handoff);
                const capabilityContract = roomCapabilityContract(handoff);
                const commonCapabilities = commonRoomCapabilityContract();
                const gameplayCapabilities = gameplayRoomCapabilityContract(entry, handoff);
                orchestrator = new RoomOrchestrator(roomId, commonRoomReport(entry.id), {
                    requiredCapabilities: capabilityContract,
                });
                const gameplay: RoomOrchestratorChild = {
                    enter: () => entry.enterReplay!(handoff),
                    prepare: async context => {
                        await entry.preload?.(handoff);
                        if (context.signal.aborted) throw new Error('ROOM_ORCHESTRATOR_ABORTED');
                    },
                    commit: () => entry.enterReplay!(handoff),
                    capabilityScope: 'gameplay',
                    capabilities: () => gameplayCapabilities,
                    destroy: () => entry.destroy(),
                };
                const common: RoomOrchestratorChild = {
                    enter: () => bindCommonRoom(handoff),
                    prepare: context => prepareCommonRoom(handoff, context),
                    commit: commitCommonRoom,
                    capabilityScope: 'common',
                    capabilities: () => commonCapabilities,
                    destroy: unbindCommonRoom,
                };
                await orchestrator.enter(common, gameplay);
                if (!entered) {
                    entered = true;
                    presentation.entered(entry.id);
                }
            } catch (error) {
                orchestrator?.destroy();
                orchestrator = null;
                unbindCommonRoom();
                presentation.failed();
                throw error;
            }
        } : undefined,
        commonRoomPorts: entry.commonRoomPorts ? () => entry.commonRoomPorts!() : undefined,
        restoreAfterReconnect: entry.restoreAfterReconnect
            ? () => entry.restoreAfterReconnect!()
            : undefined,
        destroy: () => {
            entryReady = false;
            clearRoomReconnect();
            if (orchestrator) {
                orchestrator.destroy();
                orchestrator = null;
            } else {
                unbindCommonRoom();
                entry.destroy();
            }
            if (entered) presentation.exited(entry.id);
            entered = false;
        },
    };
}

function commonRoomReport(entryId: string): (error: unknown) => void {
    return error => console.error('[CommonRoomBootstrap]', Object.freeze({
        stage: 'failed', capability: 'gameplayDifference', entryId,
        errorCode: error instanceof Error ? error.message : 'COMMON_ROOM_RUNTIME_FAILED',
    }));
}

function failClosedSettlementRenderer(entryId: string): RoomSettlementHistoryRenderer {
    const required = (): never => { throw new Error(`COMMON_ROOM_SETTLEMENT_RENDERER_REQUIRED:${entryId}`); };
    return Object.freeze({ open: required, close: (): void => undefined, destroy: (): void => undefined });
}

function commonRoomId(handoff: Parameters<GameRuntimeEntry['enter']>[0]): number {
    const value = Number(handoff.roomId ?? handoff.roomID ?? handoff.roomKey);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('COMMON_ROOM_HANDOFF_ROOM_ID_INVALID');
    return value;
}

function roomCapabilityContract(
    handoff: Parameters<GameRuntimeEntry['enter']>[0],
): RoomOrchestratorCapabilityContract {
    const gameAdapterVersion = String(handoff.playVersion ?? '').trim();
    if (!gameAdapterVersion) throw new Error('ROOM_ORCHESTRATOR_GAME_ADAPTER_VERSION_REQUIRED');
    return Object.freeze({
        commonContractVersion: 'common-room-v1',
        gameAdapterVersion,
        snapshotSchemaVersion: 1,
        supportedCapabilities: Object.freeze([
            'common.room', 'common.social', 'common.seat-head',
            'common.reconnect', 'common.handoff', 'common.settlement',
        ]),
    });
}

function commonRoomCapabilityContract(): RoomOrchestratorCapabilityContract {
    return Object.freeze({
        commonContractVersion: 'common-room-v1',
        gameAdapterVersion: 'common-room-runtime-v1',
        snapshotSchemaVersion: 1,
        supportedCapabilities: Object.freeze([
            'common.room', 'common.social', 'common.seat-head',
            'common.reconnect', 'common.handoff', 'common.settlement',
        ]),
    });
}

function gameplayRoomCapabilityContract(
    entry: GameRuntimeEntry,
    handoff: Parameters<GameRuntimeEntry['enter']>[0],
): RoomOrchestratorCapabilityContract {
    const gameCode = canonicalGameCode(handoff);
    const family = canonicalGameFamily(handoff);
    if (!entry.canonicalGameCodes.includes(gameCode)
        && !entry.families.some(candidate => canonicalFamily(candidate) === family)) {
        throw new Error('ROOM_ORCHESTRATOR_GAME_ENTRY_IDENTITY_MISMATCH');
    }
    const gameAdapterVersion = String(handoff.playVersion ?? '').trim();
    if (!gameAdapterVersion) throw new Error('ROOM_ORCHESTRATOR_GAME_ADAPTER_VERSION_REQUIRED');
    if (!entry.supportsPlayVersion
        || !entry.supportsPlayVersion(gameAdapterVersion, handoff)) {
        throw new Error('ROOM_ORCHESTRATOR_GAME_ADAPTER_UNSUPPORTED');
    }
    return Object.freeze({
        commonContractVersion: 'common-room-v1',
        gameAdapterVersion,
        snapshotSchemaVersion: 1,
        supportedCapabilities: Object.freeze([
            'common.room', 'common.social', 'common.seat-head',
            'common.reconnect', 'common.handoff', 'common.settlement',
            'gameplay.snapshot', 'gameplay.render', 'gameplay.settlement',
        ]),
    });
}

function canonicalFamily(value: string): string {
    return String(value ?? '').trim().toLowerCase().replace(/_/g, '-').replace(/:/g, '-');
}

function mountCommonRoomShellCancellable(parent: Node, signal?: AbortSignal): Promise<Node> {
    const mounted = mountCommonRoomShell(parent);
    if (!signal) return mounted;
    return new Promise<Node>((resolve, reject) => {
        let aborted = false;
        const cleanup = (): void => signal.removeEventListener('abort', onAbort);
        const onAbort = (): void => {
            aborted = true;
            cleanup();
            reject(new Error('ROOM_ORCHESTRATOR_ABORTED'));
        };
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        mounted.then(root => {
            if (aborted || signal.aborted) {
                if (root.isValid) root.destroy();
                return;
            }
            cleanup();
            resolve(root);
        }, error => {
            cleanup();
            if (!aborted) reject(error);
        });
    });
}

class CommonRoomRuntimeLifecycle {
    private readonly createdHeads = new Map<CommonRoomSeatSlot, Node>();
    private readonly dynamicHosts = new Map<CommonRoomSeatSlot, Node>();
    private readonly capability: CommonRoomCapabilityController;
    private readonly social: CommonRoomSocialController;
    private readonly magicPanel: CommonRoomMagicPanelController | null;
    private readonly history: RoomSettlementHistory;
    private readonly dissolve: CommonRoomDissolveController | null;
    private generation = 0;
    private readonly report: (error: unknown) => void;
    private readonly disposers: Array<() => void> = [];
    private installed = false;
    private destroyed = false;
    private exitPending = false;
    private roomRulePending = false;
    private readonly waitingPending = new Set<'ready' | 'start'>();
    private readonly menuPending = new Set<string>();
    private publicView: CommonRoomPublicView | null = null;
    private readonly socialTimers = new Map<CommonRoomSeatSlot, number>();
    private readonly socialRevisions = new Map<CommonRoomSeatSlot, number>();
    private readonly boundMagicHeads = new Set<Node>();

    public constructor(private readonly entryId: string, private readonly root: Node,
        private readonly ports: ResolvedCommonRoomFeaturePorts, private readonly session: CommonRoomSession,
        private readonly destroyDefaults: () => void, private readonly ownsRoot = true,
        hasSettlementHistory = true, hasSocialRenderer = true,
        formHost: CommonRoomFormHost | null = null) {
        this.report = ports.report ?? (() => undefined);
        this.social = new CommonRoomSocialController({
            send: (command, payload) => this.session.dispatch(command, payload),
            subscribe: (event, listener) => this.session.subscribe(inbound => {
                if (inbound.kind === 'social' && inbound.event === event) {
                    listener({ kind: inbound.event, payload: inbound.payload });
                }
            }),
        }, ports.socialRenderer);
        this.magicPanel = formHost ? new CommonRoomMagicPanelController(
            formHost, this.social, () => this.publicView, this.report,
        ) : null;
        this.dissolve = formHost && ports.menuActions?.dissolve
            ? new CommonRoomDissolveController(session, formHost, ports.menuActions.dissolve, this.report)
            : null;
        const chat = new CommonRoomChatController(this.social, ports.chatWindow);
        const voice = new CommonRoomVoiceController(this.social, ports.voiceCapture, ports.voiceWindow);
        this.history = new RoomSettlementHistory(ports.settlementHistoryRenderer);
        this.capability = new CommonRoomCapabilityController(
            root, { more: Boolean(ports.openRoomRule || ports.menuActions?.settings
                    || ports.menuActions?.dissolve), chat: hasSocialRenderer, voice: hasSocialRenderer,
                settlementHistory: hasSettlementHistory },
            chat, voice, this.history, this.report,
        );
    }

    public async install(): Promise<void> {
        if (this.installed) return;
        if (this.destroyed) throw new Error('COMMON_ROOM_RUNTIME_DESTROYED');
        this.installed = true;
        // CommonRoom.prefab still contains the authored DissolveRoom child for
        // compatibility with the old scene.  The live flow owns a separate
        // room/DissolveRoom form and must reveal it only after the user invokes
        // the dissolve action; otherwise the embedded legacy copy is visible
        // as soon as the room shell mounts and blocks the table.
        const embeddedDissolve = this.root.getChildByPath('DissolveRoom');
        if (embeddedDissolve?.isValid) embeddedDissolve.active = false;
        this.installMountedHook();
        // Common owns avatar hit testing and MagicPanel lifecycle. Gameplay
        // adapters must not bind SeatHost or instantiate the public panel.
        this.bindExit();
        this.bindRoomRule();
        this.bindWaitingActions();
        this.bindMenuActions();
        this.capability.install();
        for (const event of normalizeCommonRoomSocialEvents(
            ['room.quick_text', 'room.voice', 'room.magic_expression'])) this.social.listen(event);
        this.disposers.push(this.session.subscribe(event => {
            if (event.kind === 'snapshot') void this.render(parseCommonRoomPublicView(event.snapshot)).catch(this.report);
        }));
        const settlementSource = this.ports.settlementHistoryFeed;
        for (const entry of settlementSource?.snapshot() ?? []) this.history.record(entry);
        if (settlementSource) {
            this.disposers.push(settlementSource.subscribe(entry => this.history.record(entry)));
            this.disposers.push(settlementSource.subscribeControl((action, source) => {
                if (action === 'close') {
                    this.history.close();
                    return;
                }
                void this.history.open(source ?? 'room-button').catch(this.report);
            }));
        }
        // The authoritative room client is registered before the server's
        // first snapshot can arrive. Treat that small gap as a pending state;
        // the subscription above performs the first render once it does.
        try {
            await this.render(parseCommonRoomPublicView(this.session.snapshot()));
        } catch (error) {
            if (!(error instanceof Error) || error.message !== 'COMMON_ROOM_PUBLIC_VIEW_MISSING') throw error;
            console.info('[CommonRoomBootstrap]', { stage: 'awaiting-public-view', entryId: this.entryId });
        }
        console.info('[CommonRoomBootstrap]', { stage: 'install', entryId: this.entryId });
    }

    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.exitPending = false;
        this.roomRulePending = false;
        this.waitingPending.clear();
        this.menuPending.clear();
        this.generation += 1;
        this.clearDefaultSocial();
        this.destroyDefaults();
        for (const dispose of this.disposers.splice(0)) dispose();
        this.capability.destroy();
        this.social.destroy();
        this.magicPanel?.destroy();
        this.dissolve?.destroy();
        for (const head of this.boundMagicHeads) {
            if (head.isValid) {
                head.off(Node.EventType.TOUCH_END, this.onMagicHeadPointer, this, true);
                head.off(Node.EventType.MOUSE_UP, this.onMagicHeadPointer, this, true);
            }
        }
        this.boundMagicHeads.clear();
        for (const head of this.createdHeads.values()) if (head.isValid) head.destroy();
        this.createdHeads.clear();
        for (const host of this.dynamicHosts.values()) if (host.isValid) host.destroy();
        this.dynamicHosts.clear();
        if (this.ownsRoot && this.root.isValid) this.root.destroy();
        console.info('[CommonRoomBootstrap]', { stage: 'destroy', entryId: this.entryId });
    }

    public renderDefaultSocial(event: CommonRoomSocialEvent,
        playVoice: (assetId: number) => Promise<void>): void {
        if (this.destroyed || !this.publicView) return;
        const payload = event.payload && typeof event.payload === 'object'
            ? event.payload as Record<string, unknown> : null;
        const seatId = Number(payload?.sourceSeatId ?? payload?.seatId);
        const renderSeatId = event.kind === 'room.magic_expression'
            ? Number(payload?.targetSeatId ?? -1) : seatId;
        if (!payload || !Number.isSafeInteger(seatId) || seatId < 0
            || seatId >= this.publicView.seatCount || !Number.isSafeInteger(renderSeatId)
            || renderSeatId < 0 || renderSeatId >= this.publicView.seatCount) return;
        const perspective = createSeatPerspective(this.publicView.seatCount,
            this.publicView.localSeatId === -1 ? 0 : this.publicView.localSeatId);
        const slot = perspective.visualSlotOf(renderSeatId);
        if (!isCommonRoomSeatSlot(slot)) return;
        const head = this.createdHeads.get(slot)?.getComponent(CommonHeadController);
        if (!head || !this.publicView.seats.some(seat => seat.seatId === seatId && seat.occupied)) return;
        const previous = this.socialTimers.get(slot);
        if (previous !== undefined) globalThis.clearTimeout(previous);
        const revision = (this.socialRevisions.get(slot) ?? 0) + 1;
        this.socialRevisions.set(slot, revision);
        head.hideTransientEffects();
        if (event.kind === 'room.magic_expression') {
            const expressionId = Number(payload.expressionId ?? 0);
            if (!Number.isSafeInteger(expressionId) || expressionId < 1 || expressionId > 20) return;
            void head.showEmoji(expressionId).catch(this.report);
            this.socialTimers.set(slot, globalThis.setTimeout(() => {
                if (this.socialRevisions.get(slot) !== revision || !head.isValid) return;
                head.hideTransientEffects();
                this.socialTimers.delete(slot);
            }, 3000));
        } else if (event.kind === 'room.quick_text') {
            const quickId = Number(payload.quickId ?? 0);
            if (Number.isSafeInteger(quickId) && quickId >= 101 && quickId <= 120) {
                void head.showEmoji(quickId - 100).catch(this.report);
            } else {
                const content = String(payload.content || COMMON_ROOM_QUICK_TEXTS[quickId] || '').trim();
                if (!content) return;
                head.showQuickText(content);
            }
            this.socialTimers.set(slot, globalThis.setTimeout(() => {
                if (this.socialRevisions.get(slot) !== revision || !head.isValid) return;
                head.hideTransientEffects();
                this.socialTimers.delete(slot);
            }, 3000));
        } else if (event.kind === 'room.voice') {
            const assetId = Number(payload.assetId);
            if (!Number.isSafeInteger(assetId) || assetId <= 0) return;
            head.showVoice();
            const durationMs = Number(payload.durationMs);
            const timeout = Number.isFinite(durationMs) && durationMs > 0
                ? Math.min(durationMs, 60000) : 10000;
            this.socialTimers.set(slot, globalThis.setTimeout(() => {
                if (this.socialRevisions.get(slot) !== revision || !head.isValid) return;
                head.hideVoice();
                this.socialTimers.delete(slot);
            }, timeout));
            void playVoice(assetId).catch(this.report).finally(() => {
                if (this.socialRevisions.get(slot) === revision && head.isValid) head.hideVoice();
            });
        }
    }

    public clearDefaultSocial(): void {
        for (const timer of this.socialTimers.values()) globalThis.clearTimeout(timer);
        this.socialTimers.clear();
        this.socialRevisions.clear();
        for (const head of this.createdHeads.values()) {
            if (head.isValid) head.getComponent(CommonHeadController)?.hideTransientEffects();
        }
    }

    private bindExit(): void {
        const node = this.root.getChildByPath('Btn/Btn_Back');
        const button = node?.getComponent(Button);
        if (!node?.isValid || !button) throw new Error('COMMON_ROOM_BACK_BUTTON_REQUIRED');
        let lastDispatchAt = -Infinity;
        const handler = (): void => {
            if (this.destroyed || this.exitPending || !button.interactable) return;
            const now = Date.now();
            if (now - lastDispatchAt < 160) return;
            lastDispatchAt = now;
            this.exitPending = true;
            button.interactable = false;
            const operation = Promise.resolve().then(() => this.ports.exit.request());
            void operation.then(() => {
                if (!this.destroyed) console.info('[CommonRoomBootstrap]', {
                    stage: 'exit', entryId: this.entryId,
                });
            }).catch(error => {
                this.report(error);
            }).finally(() => {
                if (!this.destroyed) {
                    this.exitPending = false;
                    if (node.isValid) button.interactable = true;
                }
            });
        };
        node.on(Button.EventType.CLICK, handler, this);
        // Creator Web Preview can deliver a pointer completion without the
        // synthesized Button.CLICK when another room layer participates in
        // hit testing. Keep the public lifecycle independent of that detail.
        node.on(Node.EventType.TOUCH_END, handler, this, true);
        node.on(Node.EventType.MOUSE_UP, handler, this, true);
        this.disposers.push(() => {
            if (!node.isValid) return;
            node.off(Button.EventType.CLICK, handler, this);
            node.off(Node.EventType.TOUCH_END, handler, this, true);
            node.off(Node.EventType.MOUSE_UP, handler, this, true);
        });
    }

    private bindRoomRule(): void {
        const node = this.root.getChildByPath('CardCounter/MoreMenu/MoreItems/Btn_RoomRule');
        const button = node?.getComponent(Button);
        if (!node?.isValid || !button) throw new Error('COMMON_ROOM_RULE_BUTTON_REQUIRED');
        node.active = Boolean(this.ports.openRoomRule);
        button.interactable = Boolean(this.ports.openRoomRule);
        if (!this.ports.openRoomRule) return;
        let lastDispatchAt = -Infinity;
        const handler = (): void => {
            if (this.destroyed || this.roomRulePending || !button.interactable) return;
            const now = Date.now();
            if (now - lastDispatchAt < 160) return;
            lastDispatchAt = now;
            this.roomRulePending = true;
            button.interactable = false;
            this.capability.closeWindows();
            const operation = Promise.resolve().then(() => {
                return this.ports.openRoomRule!();
            });
            void operation.catch(error => this.report(error)).finally(() => {
                if (this.destroyed) return;
                this.roomRulePending = false;
                if (node.isValid) button.interactable = true;
            });
        };
        node.on(Button.EventType.CLICK, handler, this);
        node.on(Node.EventType.TOUCH_END, handler, this, true);
        node.on(Node.EventType.MOUSE_UP, handler, this, true);
        this.disposers.push(() => {
            if (!node.isValid) return;
            node.off(Button.EventType.CLICK, handler, this);
            node.off(Node.EventType.TOUCH_END, handler, this, true);
            node.off(Node.EventType.MOUSE_UP, handler, this, true);
        });
    }

    private bindWaitingActions(): void {
        this.bindWaitingAction('ready', 'WaitingActions/Btn_Ready', this.ports.waitingActions?.ready);
        this.bindWaitingAction('start', 'WaitingActions/Btn_Start', this.ports.waitingActions?.start);
    }

    private bindMenuActions(): void {
        this.bindMenuAction('settings', 'CardCounter/MoreMenu/MoreItems/Btn_Settings',
            this.ports.menuActions?.settings);
        this.bindMenuAction('dissolve', 'CardCounter/MoreMenu/MoreItems/Btn_DissolveRoom',
            this.dissolve ? () => this.dissolve!.open() : undefined);
    }

    private bindMenuAction(kind: string, path: string,
        action: (() => Promise<void> | void) | undefined): void {
        const node = this.root.getChildByPath(path);
        const button = node?.getComponent(Button);
        if (!node?.isValid || !button) throw new Error(`COMMON_ROOM_MENU_BUTTON_REQUIRED:${kind}`);
        node.active = Boolean(action);
        button.interactable = Boolean(action);
        if (!action) return;
        let lastDispatchAt = -Infinity;
        const handler = (): void => {
            if (this.destroyed || this.menuPending.has(kind) || !button.interactable) return;
            const now = Date.now();
            if (now - lastDispatchAt < 160) return;
            lastDispatchAt = now;
            this.menuPending.add(kind);
            button.interactable = false;
            this.capability.closeWindows();
            void Promise.resolve().then(action).catch(error => this.report(error)).finally(() => {
                this.menuPending.delete(kind);
                if (!this.destroyed && node.isValid) button.interactable = true;
            });
        };
        node.on(Button.EventType.CLICK, handler, this);
        node.on(Node.EventType.TOUCH_END, handler, this, true);
        node.on(Node.EventType.MOUSE_UP, handler, this, true);
        this.disposers.push(() => {
            if (!node.isValid) return;
            node.off(Button.EventType.CLICK, handler, this);
            node.off(Node.EventType.TOUCH_END, handler, this, true);
            node.off(Node.EventType.MOUSE_UP, handler, this, true);
        });
    }

    private bindWaitingAction(kind: 'ready' | 'start', path: string,
        action: (() => Promise<void>) | undefined): void {
        const node = this.root.getChildByPath(path);
        const button = node?.getComponent(Button);
        if (!node?.isValid || !button) throw new Error(`COMMON_ROOM_WAITING_BUTTON_REQUIRED:${kind}`);
        // The gameplay mounted hook may have already projected the current
        // authoritative waiting state. Keep that visibility for real actions;
        // only hide actions that this game does not have at all.
        if (!action) node.active = false;
        // A gameplay authority projection may activate a waiting button after
        // installation; inactive nodes cannot receive clicks, so keep the
        // Button ready for that later transition.
        button.interactable = Boolean(action);
        if (!action) return;
        let lastDispatchAt = -Infinity;
        const handler = (): void => {
            if (this.destroyed || this.waitingPending.has(kind) || !button.interactable) return;
            const now = Date.now();
            if (now - lastDispatchAt < 160) return;
            lastDispatchAt = now;
            this.waitingPending.add(kind);
            button.interactable = false;
            const operation = Promise.resolve().then(() => action());
            void operation.catch(error => this.report(error)).finally(() => {
                this.waitingPending.delete(kind);
                if (!this.destroyed && node.isValid) button.interactable = true;
            });
        };
        node.on(Button.EventType.CLICK, handler, this);
        node.on(Node.EventType.TOUCH_END, handler, this, true);
        node.on(Node.EventType.MOUSE_UP, handler, this, true);
        this.disposers.push(() => {
            if (!node.isValid) return;
            node.off(Button.EventType.CLICK, handler, this);
            node.off(Node.EventType.TOUCH_END, handler, this, true);
            node.off(Node.EventType.MOUSE_UP, handler, this, true);
        });
    }

    private installMountedHook(): void {
        if (!this.ports.mounted) return;
        let active = true;
        const requireNode = (path: string): Node => {
            if (!active || this.destroyed || !this.root.isValid) throw new Error('COMMON_ROOM_MOUNTED_VIEW_DESTROYED');
            const normalized = String(path ?? '').trim();
            if (!normalized) throw new Error('COMMON_ROOM_MOUNTED_PATH_REQUIRED');
            const node = this.root.getChildByPath(normalized);
            if (!node?.isValid) throw new Error(`COMMON_ROOM_MOUNTED_NODE_MISSING:${normalized}`);
            return node;
        };
        const finite = (value: number): number => {
            if (!Number.isFinite(value)) throw new Error('COMMON_ROOM_MOUNTED_NUMBER_INVALID');
            return value;
        };
        const layer = (node: Node, value: number): void => {
            node.layer = value;
            for (const child of node.children) layer(child, value);
        };
        const view: CommonRoomMountedView = Object.freeze({
            setWaitingActions: (ready: boolean, start: boolean): void => {
                const showReady = Boolean(this.ports.waitingActions?.ready) && ready;
                const showStart = Boolean(this.ports.waitingActions?.start) && start;
                view.setVisible('WaitingActions/Btn_Ready', showReady);
                view.setVisible('WaitingActions/Btn_Start', showStart);
                view.setVisible('WaitingActions', showReady || showStart);
            },
            closeMoreMenu: (): void => {
                this.capability.closeMoreMenu();
            },
            setMoreMenuLayout: (layout: CommonRoomMoreMenuLayout): void => {
                this.capability.setMoreMenuLayout(layout);
            },
            setVisible: (path: string, visible: boolean): void => {
                const node = requireNode(path);
                node.active = visible;
                const button = node.getComponent(Button);
                if (button) {
                    const waitingKind = path === 'WaitingActions/Btn_Ready' ? 'ready'
                        : path === 'WaitingActions/Btn_Start' ? 'start' : null;
                    button.interactable = visible && (!waitingKind || !this.waitingPending.has(waitingKind));
                }
            },
            setPosition: (path: string, x: number, y: number, z = 0): void => {
                requireNode(path).setPosition(finite(x), finite(y), finite(z));
            },
            setLabel: (path: string, value: string): void => {
                const label = requireNode(path).getComponent(Label);
                if (!label) throw new Error(`COMMON_ROOM_MOUNTED_LABEL_MISSING:${path}`);
                label.string = String(value);
            },
            setRootLayout: (width: number, height: number, x = 0, y = 0, z = 0): void => {
                if (!active || this.destroyed || !this.root.isValid) throw new Error('COMMON_ROOM_MOUNTED_VIEW_DESTROYED');
                const widget = this.root.getComponent(Widget);
                if (widget) widget.enabled = false;
                const transform = this.root.getComponent(UITransform);
                if (!transform) throw new Error('COMMON_ROOM_MOUNTED_ROOT_TRANSFORM_MISSING');
                transform.setContentSize(finite(width), finite(height));
                this.root.setPosition(finite(x), finite(y), finite(z));
            },
            setLayer: (value: number): void => {
                if (!Number.isSafeInteger(value) || value < 0) throw new Error('COMMON_ROOM_MOUNTED_LAYER_INVALID');
                if (!active || this.destroyed || !this.root.isValid) throw new Error('COMMON_ROOM_MOUNTED_VIEW_DESTROYED');
                layer(this.root, value);
            },
        });
        let dispose: (() => void) | void;
        this.disposers.push(() => {
            active = false;
            if (typeof dispose === 'function') dispose();
        });
        dispose = this.ports.mounted(view);
    }

    private async render(snapshot: CommonRoomPublicView): Promise<void> {
        const generation = ++this.generation;
        const enabled = new Set(commonRoomSeatSlots(snapshot.seatCount));
        const hosts = this.seatHosts(snapshot.seatCount);
        this.applySeatLayout(snapshot.seatCount, enabled, hosts);
        for (const [slot, host] of hosts) host.active = enabled.has(slot);
        const prefab = await this.loadCommonHead();
        if (this.destroyed || generation !== this.generation) return;
        this.publicView = snapshot;
        const perspective = createSeatPerspective(snapshot.seatCount,
            snapshot.localSeatId === -1 ? 0 : snapshot.localSeatId);
        const bySlot = new Map<CommonRoomSeatSlot, (typeof snapshot.seats)[number]>();
        for (const seat of snapshot.seats) {
            const rawSlot = perspective.visualSlotOf(seat.seatId);
            if (!isCommonRoomSeatSlot(rawSlot)) throw new Error(`COMMON_ROOM_SEAT_SLOT_INVALID:${rawSlot}`);
            const slot = rawSlot;
            if (enabled.has(slot)) bySlot.set(slot, seat);
        }
        for (const slot of enabled) {
            const host = hosts.get(slot);
            if (!host) throw new Error(`COMMON_ROOM_SEAT_HOST_MISSING:${slot}`);
            // A stale Creator prefab can leave a seat placeholder with a
            // cleared internal child list during scene handoff. Do not let
            // optional head rendering abort the whole room entry.
            if (!host.isValid || !host.children) continue;
            let head = this.createdHeads.get(slot);
            if (!head?.isValid) {
                // A recovered Canvas shell may retain its previous public
                // Head nodes. Reuse the named public node so recovery never
                // stacks duplicate heads and every physical slot is rendered.
                head = host.getChildByName('CommonHead') ?? instantiate(prefab);
                if (!head.parent) {
                    head.name = 'CommonHead';
                    this.setLayerRecursively(head, host.layer);
                    host.addChild(head);
                }
                this.createdHeads.set(slot, head);
            }
            const controller = head.getComponent(CommonHeadController);
            if (!controller) throw new Error('COMMON_ROOM_HEAD_CONTROLLER_MISSING');
            controller.renderPublicSeat(bySlot.get(slot) ?? { seatId: -1, occupied: false });
            this.bindMagicHead(head, slot);
        }
    }

    private bindMagicHead(head: Node, slot: CommonRoomSeatSlot): void {
        if (!this.magicPanel || this.boundMagicHeads.has(head)) return;
        head.on(Node.EventType.TOUCH_END, this.onMagicHeadPointer, this, true);
        head.on(Node.EventType.MOUSE_UP, this.onMagicHeadPointer, this, true);
        this.boundMagicHeads.add(head);
        (head as Node & { __commonRoomMagicSlot?: CommonRoomSeatSlot }).__commonRoomMagicSlot = slot;
    }

    private readonly onMagicHeadPointer = (event: { readonly target?: unknown }): void => {
        if (this.destroyed || !this.magicPanel || !this.publicView) return;
        const target = event.target instanceof Node ? event.target : null;
        let current: Node | null = target;
        let head: Node | null = null;
        while (current && current !== this.root) {
            if (this.boundMagicHeads.has(current)) { head = current; break; }
            current = current.parent;
        }
        const slot = head ? (head as Node & { __commonRoomMagicSlot?: CommonRoomSeatSlot }).__commonRoomMagicSlot : undefined;
        if (!slot) return;
        const perspective = createSeatPerspective(this.publicView.seatCount,
            this.publicView.localSeatId === -1 ? 0 : this.publicView.localSeatId);
        const seat = this.publicView.seats.find(candidate => candidate.occupied
            && perspective.visualSlotOf(candidate.seatId) === slot);
        if (seat) void this.magicPanel.open(seat.seatId).catch(this.report);
    };

    private applySeatLayout(seatCount: number, enabled: ReadonlySet<CommonRoomSeatSlot>,
        hosts: ReadonlyMap<CommonRoomSeatSlot, Node>): void {
        if (!this.ports.seatLayout) return;
        const slots = Object.freeze([...enabled]);
        const positions = this.ports.seatLayout(Object.freeze({ seatCount, slots }));
        if (!Array.isArray(positions) || positions.length !== slots.length) {
            throw new Error('COMMON_ROOM_SEAT_LAYOUT_RESULT_INVALID');
        }
        const seen = new Set<CommonRoomSeatSlot>();
        for (const position of positions) {
            if (!position || typeof position !== 'object' || !enabled.has(position.slot)) {
                throw new Error('COMMON_ROOM_SEAT_LAYOUT_SLOT_INVALID');
            }
            if (seen.has(position.slot)) throw new Error('COMMON_ROOM_SEAT_LAYOUT_SLOT_DUPLICATE');
            if (!Number.isFinite(position.x) || !Number.isFinite(position.y)
                || (position.z !== undefined && !Number.isFinite(position.z))) {
                throw new Error('COMMON_ROOM_SEAT_LAYOUT_POSITION_INVALID');
            }
            const host = hosts.get(position.slot);
            if (!host) throw new Error(`COMMON_ROOM_SEAT_HOST_MISSING:${position.slot}`);
            host.setPosition(position.x, position.y, position.z ?? 0);
            seen.add(position.slot);
        }
    }

    private seatHosts(seatCount: number): Map<CommonRoomSeatSlot, Node> {
        const root = this.root.getChildByName('SeatHost');
        if (!root) throw new Error('COMMON_ROOM_SEAT_HOST_MISSING');
        const result = new Map<CommonRoomSeatSlot, Node>();
        for (const slot of ['self', 'right', 'opposite', 'left'] as const) {
            const node = root.getChildByName(slot);
            if (!node) throw new Error(`COMMON_ROOM_SEAT_HOST_MISSING:${slot}`);
            result.set(slot, node);
        }
        const required = new Set<CommonRoomSeatSlot>();
        if (seatCount > 4) {
            for (let index = 1; index < seatCount; index += 1) required.add(`indexed:${index}`);
        }
        for (const [slot, host] of this.dynamicHosts) {
            if (required.has(slot) && host.isValid) continue;
            const head = this.createdHeads.get(slot);
            if (head?.isValid) head.destroy();
            this.createdHeads.delete(slot);
            if (host.isValid) host.destroy();
            this.dynamicHosts.delete(slot);
        }
        if (seatCount > 4) {
            for (let index = 1; index < seatCount; index += 1) {
                const slot: CommonRoomSeatSlot = `indexed:${index}`;
                let host = this.dynamicHosts.get(slot);
                if (!host?.isValid) {
                    host = new Node(slot);
                    const angle = -Math.PI / 2 + (2 * Math.PI * index) / seatCount;
                    host.setPosition(800 + 650 * Math.cos(angle), 450 + 350 * Math.sin(angle));
                    if (!root.isValid || !root.children) continue;
                    root.addChild(host);
                    this.dynamicHosts.set(slot, host);
                }
                result.set(slot, host);
            }
        }
        return result;
    }

    private loadCommonHead(): Promise<Prefab> {
        return new Promise((resolve, reject) => {
            const load = (bundle: ReturnType<typeof assetManager.getBundle>): void => {
                if (!bundle) return reject(new Error('COMMON_ROOM_COMMON_BUNDLE_MISSING'));
                bundle.load(COMMON_HEAD_ASSET, Prefab, (error, prefab) => error || !prefab
                    ? reject(error ?? new Error('COMMON_ROOM_HEAD_PREFAB_MISSING')) : resolve(prefab));
            };
        const bundle = assetManager.getBundle(COMMON_ASSET_BUNDLE);
        if (bundle) load(bundle);
        else assetManager.loadBundle(COMMON_ASSET_BUNDLE, (error, loaded) => error ? reject(error) : load(loaded));
        });
    }

    private setLayerRecursively(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) this.setLayerRecursively(child, layer);
    }
}

function isCommonRoomSeatSlot(value: string): value is CommonRoomSeatSlot {
    return value === 'self' || value === 'right' || value === 'opposite' || value === 'left'
        || /^indexed:[1-9]$/.test(value);
}
