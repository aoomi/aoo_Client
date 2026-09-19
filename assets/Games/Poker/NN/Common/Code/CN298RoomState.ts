import { CN298_GAME_CODE } from './CN298Rules';

export type CN298Phase = 'WAITING' | 'ROBBING' | 'BETTING' | 'SPLITTING' | 'SETTLEMENT' | 'FINISHED';

export interface CN298PlayerStats {
    playerId: number; totalScore: number; winRounds: number; lossRounds: number;
    bankerRounds: number; bullBullRounds: number; maxRoundWin: number;
}

export interface CN298RoundSettlement {
    round: number; bankerSeat: number; scoreDelta: Readonly<Record<number, number>>;
    hands: Readonly<Record<number, unknown>>;
}

export interface CN298Snapshot {
    gameCode: typeof CN298_GAME_CODE;
    roomId: number;
    ownerPlayerId: number;
    stateVersion: number;
    round: number;
    roundLimit: number;
    maxPlayers: 8 | 10;
    startPlayers: 2 | 4 | 6;
    phase: CN298Phase;
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
    roundSettlement: Readonly<Partial<CN298RoundSettlement>>;
    playerStats: Readonly<Record<number, CN298PlayerStats>>;
    finalSettlement: Readonly<Record<number, CN298PlayerStats>>;
}

/** 只接受更高版本权威快照，避免刷新重连时旧响应覆盖新牌局状态。 */
export function acceptCN298Snapshot(current: CN298Snapshot | null, incoming: CN298Snapshot): CN298Snapshot {
    if (incoming.gameCode !== CN298_GAME_CODE) throw new Error(`[CN298] unexpected gameCode=${incoming.gameCode}`);
    if (!Number.isSafeInteger(incoming.roomId) || incoming.roomId <= 0) throw new Error('[CN298] invalid roomId');
    if (!Number.isSafeInteger(incoming.stateVersion) || incoming.stateVersion < 0) {
        throw new Error('[CN298] invalid stateVersion');
    }
    if (current && current.roomId !== incoming.roomId) throw new Error('[CN298] roomId changed inside one session');
    return current && incoming.stateVersion <= current.stateVersion ? current : freezeSnapshot(incoming);
}

function freezeSnapshot(snapshot: CN298Snapshot): CN298Snapshot {
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
        roundSettlement: Object.freeze({ ...snapshot.roundSettlement }),
        playerStats: Object.freeze(Object.fromEntries(Object.entries(snapshot.playerStats)
            .map(([seat, stats]) => [seat, Object.freeze({ ...stats })]))),
        finalSettlement: Object.freeze(Object.fromEntries(Object.entries(snapshot.finalSettlement)
            .map(([seat, stats]) => [seat, Object.freeze({ ...stats })]))),
    });
}
