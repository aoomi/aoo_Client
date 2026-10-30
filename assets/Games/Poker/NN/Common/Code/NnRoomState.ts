import { NN_GAME_CODE, NnSnapshotRules, parseNnSnapshotRules } from './NnRules';

export type NnPhase = 'WAITING' | 'ROBBING' | 'BETTING' | 'SPLITTING' | 'SETTLEMENT' | 'FINISHED';

export interface NnPlayerStats {
    playerId: number; totalScore: number; winRounds: number; lossRounds: number;
    bankerRounds: number; bullBullRounds: number; maxRoundWin: number;
}

export interface NnRoundSettlement {
    round: number; bankerSeat: number; scoreDelta: Readonly<Record<number, number>>;
    hands: Readonly<Record<number, unknown>>;
    settledAtEpochMillis: number;
    handTypes: Readonly<Record<number, number>>;
    multipliers: Readonly<Record<number, number>>;
}

export interface NnObserver { readonly playerId: number; readonly nickname: string; }
export interface NnHistoryRecord extends NnObserver {
    readonly seat: number; readonly totalScore: number;
}

export interface NnSnapshot {
    gameCode: typeof NN_GAME_CODE;
    roomId: number;
    ownerPlayerId: number;
    stateVersion: number;
    round: number;
    roundLimit: number;
    maxPlayers: 8 | 10;
    startPlayers: 2 | 4 | 6;
    phase: NnPhase;
    viewerStatus: 'SPECTATOR' | 'SEATED';
    viewerSeat: number;
    bankerSeat: number;
    robOptions: readonly number[];
    betOptions: readonly number[];
    players: Readonly<Record<number, number>>;
    robs: Readonly<Record<number, number>>;
    bets: Readonly<Record<number, number>>;
    splitSeats: readonly number[];
    pendingSeats: readonly number[];
    hands: Readonly<Record<number, readonly number[]>>;
    totalScores: Readonly<Record<number, number>>;
    roundSettlement: Readonly<Partial<NnRoundSettlement>>;
    playerStats: Readonly<Record<number, NnPlayerStats>>;
    finalSettlement: Readonly<Record<number, NnPlayerStats>>;
    observers: readonly NnObserver[];
    historyRecords: readonly NnHistoryRecord[];
    rules?: Readonly<NnSnapshotRules>;
    playerNames?: Readonly<Record<number, string>>;
}

export function roomRules(snapshot: NnSnapshot): Readonly<NnSnapshotRules> | undefined {
    return snapshot.rules;
}

export function playerName(snapshot: NnSnapshot, seat: number): string | undefined {
    return snapshot.playerNames?.[seat];
}

/** 只接受更高版本权威快照，避免刷新重连时旧响应覆盖新牌局状态。 */
export function acceptNnSnapshot(current: NnSnapshot | null, incoming: NnSnapshot): NnSnapshot {
    if (incoming.gameCode !== NN_GAME_CODE) throw new Error(`[NN] unexpected gameCode=${incoming.gameCode}`);
    if (!Number.isSafeInteger(incoming.roomId) || incoming.roomId <= 0) throw new Error('[NN] invalid roomId');
    if (!Number.isSafeInteger(incoming.stateVersion) || incoming.stateVersion < 0) {
        throw new Error('[NN] invalid stateVersion');
    }
    if (current && current.roomId !== incoming.roomId) throw new Error('[NN] roomId changed inside one session');
    return current && incoming.stateVersion <= current.stateVersion ? current : freezeSnapshot(incoming);
}

function freezeSnapshot(snapshot: NnSnapshot): NnSnapshot {
    return Object.freeze({
        ...snapshot,
        players: Object.freeze({ ...snapshot.players }),
        robs: Object.freeze({ ...snapshot.robs }),
        bets: Object.freeze({ ...snapshot.bets }),
        robOptions: Object.freeze([...snapshot.robOptions]),
        betOptions: Object.freeze([...snapshot.betOptions]),
        splitSeats: Object.freeze([...snapshot.splitSeats]),
        pendingSeats: Object.freeze([...snapshot.pendingSeats]),
        hands: Object.freeze(Object.fromEntries(Object.entries(snapshot.hands)
            .map(([seat, cards]) => [seat, Object.freeze([...cards])]))),
        totalScores: Object.freeze({ ...snapshot.totalScores }),
        roundSettlement: Object.freeze({ ...snapshot.roundSettlement,
            scoreDelta: Object.freeze({ ...(snapshot.roundSettlement.scoreDelta ?? {}) }),
            hands: Object.freeze({ ...(snapshot.roundSettlement.hands ?? {}) }),
            handTypes: Object.freeze({ ...(snapshot.roundSettlement.handTypes ?? {}) }),
            multipliers: Object.freeze({ ...(snapshot.roundSettlement.multipliers ?? {}) }),
        }),
        playerStats: Object.freeze(Object.fromEntries(Object.entries(snapshot.playerStats)
            .map(([seat, stats]) => [seat, Object.freeze({ ...stats })]))),
        finalSettlement: Object.freeze(Object.fromEntries(Object.entries(snapshot.finalSettlement)
            .map(([seat, stats]) => [seat, Object.freeze({ ...stats })]))),
        observers: Object.freeze((snapshot.observers ?? []).map(observer => Object.freeze({ ...observer }))),
        historyRecords: Object.freeze((snapshot.historyRecords ?? []).map(record => Object.freeze({ ...record }))),
        rules: parseNnSnapshotRules(snapshot.rules),
        playerNames: parsePlayerNames(snapshot.playerNames),
    });
}

function parsePlayerNames(value: unknown): Readonly<Record<number, string>> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const names = Object.fromEntries(Object.entries(value).flatMap(([seat, name]) => {
        const seatNumber = Number(seat);
        return Number.isInteger(seatNumber) && typeof name === 'string' && name.length > 0
            ? [[seatNumber, name]] : [];
    }));
    return Object.freeze(names);
}
