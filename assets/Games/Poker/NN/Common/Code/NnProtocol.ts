import { NnSnapshot } from './NnRoomState';
import { GameRequestIdentity } from '../../../../../Common/Code/Runtime/network/GameRequestIdentity';
import { NN_FAMILY, NN_GAME_CODE, NN_PLAY_VERSION, NnRoomRules, validateNnRules } from './NnRules';

export const NN_MESSAGES = Object.freeze({
    state: 'poker.quanguo2998.state_req', sit: 'poker.quanguo2998.sit_req', start: 'poker.quanguo2998.start_req',
    rob: 'poker.quanguo2998.rob_req', bet: 'poker.quanguo2998.bet_req', split: 'poker.quanguo2998.split_req',
    continueRound: 'poker.quanguo2998.continue_req', timeout: 'poker.quanguo2998.timeout_req',
} as const);

export interface NnCommandEnvelope {
    msgId: typeof NN_MESSAGES[keyof typeof NN_MESSAGES];
    requestId: string;
    roomId: number;
    stateVersion: number;
    body: Readonly<Record<string, unknown>>;
}

export interface NnTransport {
    request(command: NnCommandEnvelope): Promise<NnSnapshot>;
}

/** 只负责构造 NN 消息；鉴权、WebSocket 和重试由 Aoo 公共网络层提供。 */
export class NnProtocolAdapter {
    private readonly requests: GameRequestIdentity;
    constructor(private readonly transport: NnTransport, private readonly roomId: number,
        private readonly stateVersion: () => number, private readonly requestPrefix: string) {
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !requestPrefix.trim()) {
            throw new Error('[NN] invalid protocol adapter identity');
        }
        this.requests = new GameRequestIdentity(requestPrefix, roomId);
    }

    createRoomBody(rules: NnRoomRules): Readonly<Record<string, unknown>> {
        const checked = validateNnRules(rules);
        return Object.freeze({ gameCode: NN_GAME_CODE, family: NN_FAMILY,
            playVersion: NN_PLAY_VERSION, ...checked });
    }
    state(): Promise<NnSnapshot> { return this.send(NN_MESSAGES.state, {}); }
    sit(): Promise<NnSnapshot> { return this.send(NN_MESSAGES.sit, {}); }
    start(): Promise<NnSnapshot> { return this.send(NN_MESSAGES.start, {}); }
    rob(multiplier: number): Promise<NnSnapshot> { return this.send(NN_MESSAGES.rob, { multiplier }); }
    bet(multiplier: number): Promise<NnSnapshot> { return this.send(NN_MESSAGES.bet, { multiplier }); }
    split(cards: readonly number[]): Promise<NnSnapshot> { return this.send(NN_MESSAGES.split, { cards: [...cards] }); }
    continueRound(): Promise<NnSnapshot> { return this.send(NN_MESSAGES.continueRound, {}); }
    timeout(): Promise<NnSnapshot> { return this.send(NN_MESSAGES.timeout, {}); }

    private send(msgId: NnCommandEnvelope['msgId'], body: Record<string, unknown>): Promise<NnSnapshot> {
        // Gateway idempotency survives a browser refresh. A sequence-only ID restarts at 1 and
        // can replay the previous page's cached state response after the room has already mutated.
        // Keep the readable prefix while adding one immutable namespace per runtime instance.
        const requestId = this.requests.next();
        return this.transport.request(Object.freeze({ msgId, requestId, roomId: this.roomId,
            stateVersion: this.stateVersion(), body: Object.freeze({ ...body }) }));
    }

}
