import { CN298_GAME_CODE } from './CN298Rules';

export type CN298Phase = 'WAITING' | 'ROBBING' | 'BETTING' | 'SPLITTING' | 'SETTLEMENT' | 'FINISHED';

export interface CN298Snapshot {
    gameCode: typeof CN298_GAME_CODE;
    roomId: number;
    stateVersion: number;
    round: number;
    roundLimit: number;
    maxPlayers: 8 | 10;
    phase: CN298Phase;
    viewerStatus: 'SPECTATOR' | 'SEATED';
    viewerSeat: number;
    bankerSeat: number;
    players: Readonly<Record<number, number>>;
    robs: Readonly<Record<number, number>>;
    bets: Readonly<Record<number, number>>;
    splitSeats: readonly number[];
    hands: Readonly<Record<number, readonly number[]>>;
    totalScores: Readonly<Record<number, number>>;
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
        splitSeats: Object.freeze([...snapshot.splitSeats]),
        hands: Object.freeze(Object.fromEntries(Object.entries(snapshot.hands)
            .map(([seat, cards]) => [seat, Object.freeze([...cards])]))),
        totalScores: Object.freeze({ ...snapshot.totalScores }),
    });
}
