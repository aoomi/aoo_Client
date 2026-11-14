import { ZJH_GAME_CODE, ZJH_PLAY_VERSION } from './ZjhRules';

export type ZjhPhase = 'WAITING' | 'PLAYING' | 'ROUND_FINISHED' | 'FINISHED';
export interface ZjhSeatState {
    playerId: number; cards: readonly number[]; cardCount: number; active: boolean; ready: boolean;
    looked: boolean; comparedOut: boolean; committedBet: number; preBet: number;
}
export interface ZjhSnapshot {
    gameCode: typeof ZJH_GAME_CODE; playVersion: typeof ZJH_PLAY_VERSION; roomId: number; ownerPlayerId: number;
    seatLimit: 8 | 10; minimumPlayers: number; viewerRole: 'SPECTATOR' | 'SEATED';
    stateVersion: number; state: ZjhPhase;
    roundNo: number; roundLimit: number; operatorSeat: number; winnerSeat: number;
    bettingRound: number; compareStartRound: number; mustBlindRounds: number;
    baseBet: number; minimumBet: number; maximumBet: number; pot: number;
    operationDeadlineEpochMillis: number; seats: Readonly<Record<number, ZjhSeatState>>;
}

export function acceptZjhSnapshot(current: ZjhSnapshot | null, incoming: ZjhSnapshot): ZjhSnapshot {
    if (incoming.gameCode !== ZJH_GAME_CODE) throw new Error(`[ZJH] unexpected gameCode=${incoming.gameCode}`);
    if (incoming.playVersion !== ZJH_PLAY_VERSION) throw new Error(`[ZJH] unexpected playVersion=${incoming.playVersion}`);
    if (!Number.isSafeInteger(incoming.roomId) || incoming.roomId <= 0
        || !Number.isSafeInteger(incoming.ownerPlayerId) || incoming.ownerPlayerId <= 0
        || ![8, 10].includes(incoming.seatLimit) || !['SPECTATOR', 'SEATED'].includes(incoming.viewerRole)
        || !Number.isSafeInteger(incoming.stateVersion) || incoming.stateVersion < 0) {
        throw new Error('[ZJH] invalid authoritative snapshot identity');
    }
    if (current && current.roomId !== incoming.roomId) throw new Error('[ZJH] roomId changed inside one session');
    return current && incoming.stateVersion <= current.stateVersion ? current : freezeSnapshot(incoming);
}

function freezeSnapshot(snapshot: ZjhSnapshot): ZjhSnapshot {
    const seats = Object.fromEntries(Object.entries(snapshot.seats).map(([seat, state]) => [seat,
        Object.freeze({ ...state, cards: Object.freeze([...state.cards]) })]));
    return Object.freeze({ ...snapshot, seats: Object.freeze(seats) });
}
