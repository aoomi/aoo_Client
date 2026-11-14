import type {
    CommonRoomDissolveCallbacks,
    CommonRoomDissolvePort,
    CommonRoomDissolveSnapshot,
} from '../../../../../Common/Code/Room/CommonRoomDissolveController';
import type { PdkRuntime } from './PdkRuntime';

/**
 * PDK contributes authoritative dissolve data and gameplay callbacks only.
 * CommonRoom owns the shared form, pointer lifecycle and wire commands.
 */
export class PdkDissolveAdapter {
    private readonly listeners = new Set<CommonRoomDissolveCallbacks>();
    private disposed = false;
    private readonly portValue: CommonRoomDissolvePort;

    public constructor(
        private readonly runtime: () => PdkRuntime | null,
        private readonly showMessage: (message: string) => void,
        private readonly onTerminal: (result: unknown) => void,
    ) {
        this.portValue = Object.freeze({
            read: (): CommonRoomDissolveSnapshot => this.read(),
            clear: (): void => this.clear(),
            reconcile: (): void => this.runtime()?.reconcileAuthority(),
            acceptVoteResult: (result: unknown, agree: boolean): boolean => {
                if (!agree) return false;
                return this.runtime()?.acceptDissolveVoteResult(result) ?? false;
            },
            message: (message: string): void => this.showMessage(message),
            terminal: (result: unknown): void => this.onTerminal(result),
            subscribe: (callbacks: CommonRoomDissolveCallbacks): (() => void) => {
                if (this.disposed) return () => undefined;
                this.listeners.add(callbacks);
                return () => this.listeners.delete(callbacks);
            },
        });
    }

    public port(): CommonRoomDissolvePort {
        return this.portValue;
    }

    public notifyStartVote(): void {
        if (this.disposed) return;
        for (const listener of this.listeners) listener.onStartVote();
    }

    public notifyVote(): void {
        if (this.disposed) return;
        for (const listener of this.listeners) listener.onVote();
    }

    public notifyRejected(seat?: number): void {
        if (this.disposed) return;
        for (const listener of this.listeners) listener.onRejected(seat);
    }

    public notifyTerminal(result: unknown): void {
        if (this.disposed) return;
        for (const listener of this.listeners) listener.onTerminal(result);
    }

    public destroy(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.listeners.clear();
    }

    private read(): CommonRoomDissolveSnapshot {
        const runtime = this.runtime();
        if (!runtime) throw new Error('COMMON_ROOM_DISSOLVE_RUNTIME_REQUIRED');
        const room = runtime.getRoom();
        const raw = room.GetRoomProperty('dissolve');
        const dissolve = raw && typeof raw === 'object' && !Array.isArray(raw)
            ? raw as Record<string, unknown> : {};
        const rawPlayers = runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        const players: Record<string, { readonly name?: string } | undefined> = {};
        for (let index = 0; index < 10; index += 1) {
            const player = rawPlayers[index] as Record<string, unknown> | undefined;
            if (player && typeof player === 'object') players[String(index)] = {
                name: String(player.name ?? ''),
            };
        }
        const rawVotes = Array.isArray(dissolve.posAgreeList) ? dissolve.posAgreeList : [];
        return Object.freeze({
            roomId: Number(runtime.getRoomManager().GetEnterRoomID()),
            clientSeat: Number(runtime.getRoomPosManager().GetClientPos()),
            createPos: Number(dissolve.createPos ?? -1),
            endSec: Number(dissolve.endSec ?? 0),
            votes: Object.freeze(rawVotes.map(value => Number(value))),
            players: Object.freeze(players),
        });
    }

    private clear(): void {
        this.runtime()?.getRoom().ClearDissolve();
    }
}
