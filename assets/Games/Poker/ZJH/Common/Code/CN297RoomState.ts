import { CN297_GAME_CODE, CN297_PLAY_VERSION } from './CN297Rules';

export type CN297Phase = 'WAITING' | 'PLAYING' | 'ROUND_FINISHED' | 'FINISHED';
export interface CN297SeatState {
    playerId: number; cards: readonly number[]; cardCount: number; active: boolean; ready: boolean;
    looked: boolean; comparedOut: boolean; committedBet: number; preBet: number;
}
export interface CN297Snapshot {
    gameCode: typeof CN297_GAME_CODE; playVersion: typeof CN297_PLAY_VERSION; roomId: number; ownerPlayerId: number;
    seatLimit: 8 | 10; viewerRole: 'SPECTATOR' | 'SEATED';
    stateVersion: number; state: CN297Phase;
    roundNo: number; roundLimit: number; operatorSeat: number; winnerSeat: number;
    bettingRound: number; compareStartRound: number; baseBet: number; maximumBet: number; pot: number;
    operationDeadlineEpochMillis: number; seats: Readonly<Record<number, CN297SeatState>>;
}

export function acceptCN297Snapshot(current: CN297Snapshot | null, incoming: CN297Snapshot): CN297Snapshot {
    if (incoming.gameCode !== CN297_GAME_CODE) throw new Error(`[CN297] unexpected gameCode=${incoming.gameCode}`);
    if (incoming.playVersion !== CN297_PLAY_VERSION) throw new Error(`[CN297] unexpected playVersion=${incoming.playVersion}`);
    if (!Number.isSafeInteger(incoming.roomId) || incoming.roomId <= 0
        || !Number.isSafeInteger(incoming.ownerPlayerId) || incoming.ownerPlayerId <= 0
        || ![8, 10].includes(incoming.seatLimit) || !['SPECTATOR', 'SEATED'].includes(incoming.viewerRole)
        || !Number.isSafeInteger(incoming.stateVersion) || incoming.stateVersion < 0) {
        throw new Error('[CN297] invalid authoritative snapshot identity');
    }
    if (current && current.roomId !== incoming.roomId) throw new Error('[CN297] roomId changed inside one session');
    return current && incoming.stateVersion <= current.stateVersion ? current : freezeSnapshot(incoming);
}

function freezeSnapshot(snapshot: CN297Snapshot): CN297Snapshot {
    const seats = Object.fromEntries(Object.entries(snapshot.seats).map(([seat, state]) => [seat,
        Object.freeze({ ...state, cards: Object.freeze([...state.cards]) })]));
    return Object.freeze({ ...snapshot, seats: Object.freeze(seats) });
}
