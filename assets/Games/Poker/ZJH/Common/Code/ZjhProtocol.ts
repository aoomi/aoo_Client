import { ZjhSnapshot } from './ZjhRoomState';
import { ZJH_DEFAULT_RULES, ZJH_FAMILY, ZJH_GAME_CODE, ZJH_PLAY_VERSION,
    ZjhRoomRules, validateZjhRules } from './ZjhRules';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { GameRequestIdentity } from '../../../../../Common/Code/Runtime/network/GameRequestIdentity';

export const ZJH_DISPATCH = 'common.room.dispatch' as const;

export const ZJH_MESSAGES = Object.freeze({
    state: 'poker.quanguo2997.state_req', sit: 'poker.quanguo2997.sit_req',
    start: 'poker.quanguo2997.start_req', continueRound: 'poker.quanguo2997.continue_req', look: 'poker.quanguo2997.look_req', bet: 'poker.quanguo2997.bet_req',
    preBet: 'poker.quanguo2997.prebet_req', fold: 'poker.quanguo2997.fold_req', compare: 'poker.quanguo2997.compare_req',
    timeout: 'poker.quanguo2997.timeout_req', settle: 'poker.quanguo2997.settle_req',
} as const);
type ZjhMessage = typeof ZJH_MESSAGES[keyof typeof ZJH_MESSAGES];
export interface ZjhCommandEnvelope { msgId: ZjhMessage; requestId: string; roomId: number;
    roundNo: number; playVersion: typeof ZJH_PLAY_VERSION; expectedStateVersion: number;
    body: Readonly<Record<string, unknown>>; }
export interface ZjhCompareResult { loserSeat: number; view: ZjhSnapshot; }
export interface ZjhSettlementEntry { playerId: number; scoreDelta: number; dimensions: Readonly<Record<string, number>>; }
export interface ZjhSettlementResult { winnerSeat: number; winnerBonusPerOpponent: number;
    roundNo: number; final: boolean; entries: readonly ZjhSettlementEntry[];
    cumulativeEntries?: readonly ZjhSettlementEntry[]; }
export interface ZjhTransport { request<T>(command: ZjhCommandEnvelope): Promise<T>; }

/** Exact Hall create payload for the published ZJH workbook contract. */
export function createZjhRoomBody(rules: ZjhRoomRules = ZJH_DEFAULT_RULES): Readonly<Record<string, unknown>> {
    return Object.freeze({ gameCode: ZJH_GAME_CODE, playVersion: ZJH_PLAY_VERSION,
        family: ZJH_FAMILY, ...validateZjhRules(rules) });
}

/** Keeps ZJH on the shared V2 authority envelope without teaching the shared client game-specific commands. */
export class ZjhProtocolClientTransport implements ZjhTransport {
    constructor(private readonly client: ProtocolClient) {}
    request<T>(command: ZjhCommandEnvelope): Promise<T> {
        return this.client.request<T>(ZJH_DISPATCH, Object.freeze({
            roomId: command.roomId, roundNo: command.roundNo, playVersion: command.playVersion,
            expectedStateVersion: command.expectedStateVersion, action: command.msgId, payload: command.body,
        }));
    }
}

export class ZjhProtocolAdapter {
    private readonly requests: GameRequestIdentity;
    private acceptedStateVersion = -1;
    private acceptedRoundNo = -1;
    constructor(private readonly transport: ZjhTransport, private readonly roomId: number,
        private readonly stateVersion: () => number, private readonly roundNo: () => number,
        private readonly requestPrefix: string) {
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !requestPrefix.trim()) throw new Error('[ZJH] invalid adapter identity');
        this.requests = new GameRequestIdentity(requestPrefix, roomId);
    }
    createRoomBody(rules: ZjhRoomRules): Readonly<Record<string, unknown>> {
        return createZjhRoomBody(rules);
    }
    state() { return this.send<ZjhSnapshot>(ZJH_MESSAGES.state, {}); }
    sit(seatId: number) {
        if (!Number.isSafeInteger(seatId) || seatId < 0) throw new Error('[ZJH] invalid seat identity');
        return this.send<ZjhSnapshot>(ZJH_MESSAGES.sit, { seatId });
    }
    start() { return this.send<ZjhSnapshot>(ZJH_MESSAGES.start, {}); }
    continueRound() { return this.send<ZjhSnapshot>(ZJH_MESSAGES.continueRound, {}); }
    look() { return this.send<ZjhSnapshot>(ZJH_MESSAGES.look, {}); }
    bet(amount: number) { return this.send<ZjhSnapshot>(ZJH_MESSAGES.bet, { amount }); }
    preBet(amount: number) { return this.send<ZjhSnapshot>(ZJH_MESSAGES.preBet, { amount }); }
    fold() { return this.send<ZjhSnapshot>(ZJH_MESSAGES.fold, {}); }
    compare(targetSeatId: number) { return this.send<ZjhCompareResult>(ZJH_MESSAGES.compare, { targetSeatId }); }
    timeout() { return this.send<ZjhSnapshot>(ZJH_MESSAGES.timeout, {}); }
    settle() { return this.send<ZjhSettlementResult>(ZJH_MESSAGES.settle, {}); }
    /** Keeps request cursors aligned with authoritative websocket snapshots accepted by the controller. */
    observe(snapshot: ZjhSnapshot): void { this.observeAuthority(snapshot); }
    private send<T>(msgId: ZjhMessage, body: Record<string, unknown>): Promise<T> {
        const roundNo = this.acceptedRoundNo >= 0 ? this.acceptedRoundNo : this.roundNo();
        const expectedStateVersion = this.acceptedStateVersion >= 0 ? this.acceptedStateVersion : this.stateVersion();
        if (!Number.isSafeInteger(roundNo) || roundNo < 0 || !Number.isSafeInteger(expectedStateVersion)
            || expectedStateVersion < 0) throw new Error('[ZJH] invalid authority cursor');
        return this.transport.request<T>(Object.freeze({ msgId, requestId: this.requests.next(),
            roomId: this.roomId, roundNo, playVersion: ZJH_PLAY_VERSION, expectedStateVersion,
            body: Object.freeze({ ...body }) })).then(value => { this.observeAuthority(value); return value; });
    }
    private observeAuthority(value: unknown): void {
        if (!value || typeof value !== 'object') return;
        const record = value as Record<string, unknown>;
        const snapshot = record.view && typeof record.view === 'object'
            ? record.view as Record<string, unknown> : record;
        const stateVersion = Number(snapshot.stateVersion); const roundNo = Number(snapshot.roundNo);
        if (Number.isSafeInteger(stateVersion) && stateVersion >= this.acceptedStateVersion) {
            this.acceptedStateVersion = stateVersion;
            if (Number.isSafeInteger(roundNo) && roundNo >= 0) this.acceptedRoundNo = roundNo;
        }
    }
}
