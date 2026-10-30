/**
 * The single client-side lifecycle authority for one room instance.
 *
 * GameplayRuntime and CommonRoomRuntime are children of the same orchestrator;
 * neither child may decide whether the room is mounted or destroyed. The
 * orchestrator accepts callbacks instead of exposing either child's
 * implementation, keeping the Common/Gameplay boundary one-way.
 */
export type RoomOrchestratorState =
    | 'IDLE'
    | 'PREPARING'
    | 'COMMITTING'
    | 'ACTIVE'
    | 'ROLLING_BACK'
    | 'FAILED'
    | 'DESTROYING'
    | 'DESTROYED';

export interface RoomOrchestratorCapabilityContract {
    readonly commonContractVersion: string;
    readonly gameAdapterVersion: string;
    readonly snapshotSchemaVersion: string | number;
    readonly supportedCapabilities: readonly string[];
}

export interface RoomOrchestratorOptions {
    /** Required only when the authoritative handoff has supplied a contract. */
    readonly requiredCapabilities?: Partial<RoomOrchestratorCapabilityContract>;
    readonly prepareTimeoutMs?: number;
    readonly commitTimeoutMs?: number;
    readonly restoreTimeoutMs?: number;
}

export interface RoomOrchestratorContext {
    readonly roomInstanceId: number;
    readonly lifecycleEpoch: number;
    readonly mountRequestId: string;
    readonly signal: AbortSignal;
}

export interface RoomOrchestratorChild {
    /** Compatibility operation for children that still enter atomically. */
    readonly enter: () => Promise<void>;
    /** New children may split resource preparation from publication. */
    readonly prepare?: (context: RoomOrchestratorContext) => Promise<void>;
    readonly commit?: (context: RoomOrchestratorContext) => Promise<void>;
    readonly rollback?: (context: RoomOrchestratorContext) => void;
    readonly capabilities?: () => RoomOrchestratorCapabilityContract;
    /** Identifies which side of the room contract the child proves. */
    readonly capabilityScope?: 'common' | 'gameplay';
    readonly destroy: () => void;
    readonly restore?: (context?: RoomOrchestratorContext) => Promise<void>;
}

export interface RoomOrchestratorSnapshot {
    readonly roomInstanceId: number;
    readonly lifecycleEpoch: number;
    readonly state: RoomOrchestratorState;
    readonly mountRequestId?: string;
}

const DEFAULT_OPERATION_TIMEOUT_MS = 15_000;

export class RoomOrchestrator {
    private state: RoomOrchestratorState = 'IDLE';
    private generation = 0;
    private enteredChildren: RoomOrchestratorChild[] = [];
    private activeContext: (RoomOrchestratorContext & { readonly controller: AbortController }) | null = null;
    private readonly options: Required<Pick<RoomOrchestratorOptions,
        'prepareTimeoutMs' | 'commitTimeoutMs' | 'restoreTimeoutMs'>>
        & Pick<RoomOrchestratorOptions, 'requiredCapabilities'>;

    public constructor(
        private readonly roomInstanceId: number,
        private readonly report: (error: unknown) => void = () => undefined,
        options: RoomOrchestratorOptions = {},
    ) {
        if (!Number.isSafeInteger(roomInstanceId) || roomInstanceId <= 0) {
            throw new Error('ROOM_ORCHESTRATOR_ROOM_INSTANCE_ID_INVALID');
        }
        this.options = {
            requiredCapabilities: options.requiredCapabilities,
            prepareTimeoutMs: normalizeTimeout(options.prepareTimeoutMs),
            commitTimeoutMs: normalizeTimeout(options.commitTimeoutMs),
            restoreTimeoutMs: normalizeTimeout(options.restoreTimeoutMs),
        };
    }

    public get snapshot(): RoomOrchestratorSnapshot {
        return Object.freeze({
            roomInstanceId: this.roomInstanceId,
            lifecycleEpoch: this.generation,
            state: this.state,
            mountRequestId: this.activeContext?.mountRequestId,
        });
    }

    public get currentState(): RoomOrchestratorState {
        return this.state;
    }

    public async enter(common: RoomOrchestratorChild,
        gameplay: RoomOrchestratorChild): Promise<void> {
        if (this.state === 'DESTROYED' || this.state === 'DESTROYING') {
            throw new Error('ROOM_ORCHESTRATOR_DESTROYED');
        }
        if (this.state === 'PREPARING' || this.state === 'COMMITTING'
            || this.state === 'ACTIVE' || this.state === 'ROLLING_BACK') {
            throw new Error('ROOM_ORCHESTRATOR_ALREADY_ENTERED');
        }
        const epoch = ++this.generation;
        const context = this.createContext(epoch);
        this.activeContext = context;
        this.state = 'PREPARING';
        this.enteredChildren = [];
        try {
            this.assertCapabilityHandshake([common, gameplay]);
            await this.prepareChild(epoch, common, context);
            await this.prepareChild(epoch, gameplay, context);
            this.assertCurrent(epoch, 'PREPARING');
            this.state = 'COMMITTING';
            await this.commitChild(epoch, gameplay, context);
            // Gameplay must establish the single authoritative room client
            // before Common acquires its session and installs public UI.
            await this.commitChild(epoch, common, context);
            this.assertCurrent(epoch, 'COMMITTING');
            this.state = 'ACTIVE';
        } catch (error) {
            // A concurrent destroy owns the terminal transition. A late
            // rejection from an already-cancelled child must never resurrect
            // FAILED or overwrite DESTROYED, and must not trigger a second
            // cleanup pass.
            if (epoch === this.generation
                && (this.state === 'PREPARING' || this.state === 'COMMITTING')) {
                this.state = 'ROLLING_BACK';
                context.controller.abort();
                this.rollbackChildren(context);
                ++this.generation;
                this.state = 'FAILED';
                this.activeContext = null;
                this.report(error);
            }
            throw error;
        } finally {
            if (this.state === 'ACTIVE' && this.activeContext?.lifecycleEpoch === epoch) {
                this.activeContext = null;
            }
        }
    }

    public async restore(): Promise<void> {
        if (this.state !== 'ACTIVE') throw new Error('ROOM_ORCHESTRATOR_NOT_ACTIVE');
        const epoch = this.generation;
        const context = this.createContext(epoch);
        this.activeContext = context;
        try {
            await Promise.all(this.enteredChildren.map(child => this.withTimeout(
                'restore', child.restore?.(context), context.signal,
                this.options.restoreTimeoutMs,
            )));
            this.assertCurrent(epoch, 'ACTIVE');
        } catch (error) {
            // Restore is transactional: a current-generation failure cannot
            // leave one child active while the other is only partly restored.
            // A concurrent destroy remains the owner of its terminal state.
            if (epoch === this.generation && this.state === 'ACTIVE') {
                this.state = 'ROLLING_BACK';
                context.controller.abort();
                this.rollbackChildren(context);
                ++this.generation;
                this.state = 'FAILED';
                this.activeContext = null;
                this.report(error);
            }
            throw error;
        } finally {
            if (this.activeContext?.lifecycleEpoch === epoch) this.activeContext = null;
        }
    }

    public destroy(): void {
        if (this.state === 'DESTROYED' || this.state === 'DESTROYING') return;
        this.state = 'DESTROYING';
        ++this.generation;
        this.activeContext?.controller.abort();
        const context = this.activeContext ?? this.createContext(this.generation);
        this.rollbackChildren(context);
        this.activeContext = null;
        this.state = 'DESTROYED';
    }

    private createContext(epoch: number): RoomOrchestratorContext & { readonly controller: AbortController } {
        const controller = new AbortController();
        return Object.freeze({
            roomInstanceId: this.roomInstanceId,
            lifecycleEpoch: epoch,
            mountRequestId: `${this.roomInstanceId}:${epoch}`,
            signal: controller.signal,
            controller,
        });
    }

    private async prepareChild(epoch: number, child: RoomOrchestratorChild,
        context: RoomOrchestratorContext): Promise<void> {
        this.assertCurrent(epoch, 'PREPARING');
        // Register before awaiting so a concurrent destroy can always clean up
        // a child whose asynchronous preparation has already started.
        this.enteredChildren.push(child);
        const operation = child.prepare ? child.prepare(context) : child.enter();
        await this.withTimeout('prepare', operation, context.signal, this.options.prepareTimeoutMs);
        this.assertCurrent(epoch, 'PREPARING');
    }

    private async commitChild(epoch: number, child: RoomOrchestratorChild,
        context: RoomOrchestratorContext): Promise<void> {
        this.assertCurrent(epoch, 'COMMITTING');
        if (!child.commit) return;
        await this.withTimeout('commit', child.commit(context), context.signal,
            this.options.commitTimeoutMs);
        this.assertCurrent(epoch, 'COMMITTING');
    }

    private async withTimeout<T>(phase: 'prepare' | 'commit' | 'restore',
        operation: Promise<T> | undefined, signal: AbortSignal, timeoutMs: number): Promise<T | undefined> {
        if (!operation) return undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let abortListener: (() => void) | undefined;
        const guarded = Promise.resolve(operation);
        // Attach a rejection handler to the underlying operation. This keeps a
        // timed-out/aborted child from producing an unhandled rejection after
        // the orchestrator has already rolled back the room.
        void guarded.catch(() => undefined);
        try {
            return await new Promise<T>((resolve, reject) => {
                abortListener = () => reject(new Error('ROOM_ORCHESTRATOR_ABORTED'));
                if (signal.aborted) return abortListener();
                signal.addEventListener('abort', abortListener, { once: true });
                timer = setTimeout(() => reject(new Error(
                    `ROOM_ORCHESTRATOR_${phase.toUpperCase()}_TIMEOUT`)), timeoutMs);
                guarded.then(resolve, reject);
            });
        } finally {
            if (timer !== undefined) clearTimeout(timer);
            if (abortListener) signal.removeEventListener('abort', abortListener);
        }
    }

    private assertCapabilityHandshake(children: readonly RoomOrchestratorChild[]): void {
        const required = this.options.requiredCapabilities;
        if (!required) return;
        for (const child of children) {
            const actual = child.capabilities?.();
            if (!actual) throw new Error('ROOM_ORCHESTRATOR_CAPABILITY_HANDSHAKE_REQUIRED');
            if (required.commonContractVersion !== undefined
                && actual.commonContractVersion !== required.commonContractVersion) {
                throw new Error('ROOM_ORCHESTRATOR_COMMON_CONTRACT_UNSUPPORTED');
            }
            if (child.capabilityScope !== 'common'
                && required.gameAdapterVersion !== undefined
                && actual.gameAdapterVersion !== required.gameAdapterVersion) {
                throw new Error('ROOM_ORCHESTRATOR_GAME_ADAPTER_UNSUPPORTED');
            }
            if (required.snapshotSchemaVersion !== undefined
                && actual.snapshotSchemaVersion !== required.snapshotSchemaVersion) {
                throw new Error('ROOM_ORCHESTRATOR_SNAPSHOT_SCHEMA_UNSUPPORTED');
            }
            for (const capability of required.supportedCapabilities ?? []) {
                if (!actual.supportedCapabilities.includes(capability)) {
                    throw new Error(`ROOM_ORCHESTRATOR_CAPABILITY_UNSUPPORTED:${capability}`);
                }
            }
        }
    }

    private assertCurrent(epoch: number, expectedState: RoomOrchestratorState): void {
        if (this.state !== expectedState) throw new Error('ROOM_ORCHESTRATOR_LIFECYCLE_INVALID');
        if (epoch !== this.generation) throw new Error('ROOM_ORCHESTRATOR_STALE_EPOCH');
    }

    private rollbackChildren(context: RoomOrchestratorContext): void {
        for (const child of [...this.enteredChildren].reverse()) {
            try { child.rollback?.(context); } catch (error) { this.report(error); }
            try { child.destroy(); } catch (error) { this.report(error); }
        }
        this.enteredChildren = [];
    }
}

function normalizeTimeout(value: number | undefined): number {
    if (value === undefined) return DEFAULT_OPERATION_TIMEOUT_MS;
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error('ROOM_ORCHESTRATOR_TIMEOUT_INVALID');
    }
    return Math.floor(value);
}
