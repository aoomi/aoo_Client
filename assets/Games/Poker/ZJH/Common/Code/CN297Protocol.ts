import { CN297Snapshot } from './CN297RoomState';
import { CN297_DEFAULT_RULES, CN297_FAMILY, CN297_GAME_CODE, CN297_PLAY_VERSION,
    CN297RoomRules, validateCN297Rules } from './CN297Rules';
import type { ProtocolClient } from '../../../../../Common/Code/Runtime/network/ProtocolClient';
import { GameRequestIdentity } from '../../../../../Common/Code/Runtime/network/GameRequestIdentity';

export const CN297_DISPATCH = 'common.room.dispatch' as const;

export const CN297_MESSAGES = Object.freeze({
    state: 'poker.CN297.state_req', sit: 'poker.CN297.sit_req',
    start: 'poker.CN297.start_req', continueRound: 'poker.CN297.continue_req', look: 'poker.CN297.look_req', bet: 'poker.CN297.bet_req',
    preBet: 'poker.CN297.prebet_req', fold: 'poker.CN297.fold_req', compare: 'poker.CN297.compare_req',
    timeout: 'poker.CN297.timeout_req', settle: 'poker.CN297.settle_req',
} as const);
type CN297Message = typeof CN297_MESSAGES[keyof typeof CN297_MESSAGES];
export interface CN297CommandEnvelope { msgId: CN297Message; requestId: string; roomId: number;
    roundNo: number; playVersion: typeof CN297_PLAY_VERSION; expectedStateVersion: number;
    body: Readonly<Record<string, unknown>>; }
export interface CN297CompareResult { loserSeat: number; view: CN297Snapshot; }
export interface CN297SettlementEntry { playerId: number; scoreDelta: number; dimensions: Readonly<Record<string, number>>; }
export interface CN297SettlementResult { winnerSeat: number; winnerBonusPerOpponent: number;
    roundNo: number; final: boolean; entries: readonly CN297SettlementEntry[];
    cumulativeEntries?: readonly CN297SettlementEntry[]; }
export interface CN297Transport { request<T>(command: CN297CommandEnvelope): Promise<T>; }

/** Exact Hall create payload for the published CN297 workbook contract. */
export function createCN297RoomBody(rules: CN297RoomRules = CN297_DEFAULT_RULES): Readonly<Record<string, unknown>> {
    return Object.freeze({ gameCode: CN297_GAME_CODE, playVersion: CN297_PLAY_VERSION,
        family: CN297_FAMILY, ...validateCN297Rules(rules) });
}

/** Keeps CN297 on the shared V2 authority envelope without teaching the shared client game-specific commands. */
export class CN297ProtocolClientTransport implements CN297Transport {
    constructor(private readonly client: ProtocolClient) {}
    request<T>(command: CN297CommandEnvelope): Promise<T> {
        return this.client.request<T>(CN297_DISPATCH, Object.freeze({
            roomId: command.roomId, roundNo: command.roundNo, playVersion: command.playVersion,
            expectedStateVersion: command.expectedStateVersion, action: command.msgId, payload: command.body,
        }));
    }
}

export class CN297ProtocolAdapter {
    private readonly requests: GameRequestIdentity;
    private acceptedStateVersion = -1;
    private acceptedRoundNo = -1;
    constructor(private readonly transport: CN297Transport, private readonly roomId: number,
        private readonly stateVersion: () => number, private readonly roundNo: () => number,
        private readonly requestPrefix: string) {
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !requestPrefix.trim()) throw new Error('[CN297] invalid adapter identity');
        this.requests = new GameRequestIdentity(requestPrefix, roomId);
    }
    createRoomBody(rules: CN297RoomRules): Readonly<Record<string, unknown>> {
        return createCN297RoomBody(rules);
    }
    state() { return this.send<CN297Snapshot>(CN297_MESSAGES.state, {}); }
    sit() { return this.send<CN297Snapshot>(CN297_MESSAGES.sit, {}); }
    start() { return this.send<CN297Snapshot>(CN297_MESSAGES.start, {}); }
    continueRound() { return this.send<CN297Snapshot>(CN297_MESSAGES.continueRound, {}); }
    look() { return this.send<CN297Snapshot>(CN297_MESSAGES.look, {}); }
    bet(amount: number) { return this.send<CN297Snapshot>(CN297_MESSAGES.bet, { amount }); }
    preBet(amount: number) { return this.send<CN297Snapshot>(CN297_MESSAGES.preBet, { amount }); }
    fold() { return this.send<CN297Snapshot>(CN297_MESSAGES.fold, {}); }
    compare(targetSeatId: number) { return this.send<CN297CompareResult>(CN297_MESSAGES.compare, { targetSeatId }); }
    timeout() { return this.send<CN297Snapshot>(CN297_MESSAGES.timeout, {}); }
    settle() { return this.send<CN297SettlementResult>(CN297_MESSAGES.settle, {}); }
    private send<T>(msgId: CN297Message, body: Record<string, unknown>): Promise<T> {
        const roundNo = this.acceptedRoundNo >= 0 ? this.acceptedRoundNo : this.roundNo();
        const expectedStateVersion = this.acceptedStateVersion >= 0 ? this.acceptedStateVersion : this.stateVersion();
        if (!Number.isSafeInteger(roundNo) || roundNo < 0 || !Number.isSafeInteger(expectedStateVersion)
            || expectedStateVersion < 0) throw new Error('[CN297] invalid authority cursor');
        return this.transport.request<T>(Object.freeze({ msgId, requestId: this.requests.next(),
            roomId: this.roomId, roundNo, playVersion: CN297_PLAY_VERSION, expectedStateVersion,
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
