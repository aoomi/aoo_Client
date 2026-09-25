import { CN298Snapshot } from './CN298RoomState';
import { GameRequestIdentity } from '../../../../../Common/Code/Runtime/network/GameRequestIdentity';
import { CN298_FAMILY, CN298_GAME_CODE, CN298_PLAY_VERSION, CN298RoomRules, validateCN298Rules } from './CN298Rules';

export const CN298_MESSAGES = Object.freeze({
    state: 'poker.cn298.state_req', sit: 'poker.cn298.sit_req', start: 'poker.cn298.start_req',
    rob: 'poker.cn298.rob_req', bet: 'poker.cn298.bet_req', split: 'poker.cn298.split_req',
    continueRound: 'poker.cn298.continue_req', timeout: 'poker.cn298.timeout_req',
} as const);

export interface CN298CommandEnvelope {
    msgId: typeof CN298_MESSAGES[keyof typeof CN298_MESSAGES];
    requestId: string;
    roomId: number;
    stateVersion: number;
    body: Readonly<Record<string, unknown>>;
}

export interface CN298Transport {
    request(command: CN298CommandEnvelope): Promise<CN298Snapshot>;
}

/** 只负责构造 CN298 消息；鉴权、WebSocket 和重试由 Aoo 公共网络层提供。 */
export class CN298ProtocolAdapter {
    private readonly requests: GameRequestIdentity;
    constructor(private readonly transport: CN298Transport, private readonly roomId: number,
        private readonly stateVersion: () => number, private readonly requestPrefix: string) {
        if (!Number.isSafeInteger(roomId) || roomId <= 0 || !requestPrefix.trim()) {
            throw new Error('[CN298] invalid protocol adapter identity');
        }
        this.requests = new GameRequestIdentity(requestPrefix, roomId);
    }

    createRoomBody(rules: CN298RoomRules): Readonly<Record<string, unknown>> {
        const checked = validateCN298Rules(rules);
        return Object.freeze({ gameCode: CN298_GAME_CODE, family: CN298_FAMILY,
            playVersion: CN298_PLAY_VERSION, ...checked });
    }
    state(): Promise<CN298Snapshot> { return this.send(CN298_MESSAGES.state, {}); }
    sit(): Promise<CN298Snapshot> { return this.send(CN298_MESSAGES.sit, {}); }
    start(): Promise<CN298Snapshot> { return this.send(CN298_MESSAGES.start, {}); }
    rob(multiplier: number): Promise<CN298Snapshot> { return this.send(CN298_MESSAGES.rob, { multiplier }); }
    bet(multiplier: number): Promise<CN298Snapshot> { return this.send(CN298_MESSAGES.bet, { multiplier }); }
    split(cards: readonly number[]): Promise<CN298Snapshot> { return this.send(CN298_MESSAGES.split, { cards: [...cards] }); }
    continueRound(): Promise<CN298Snapshot> { return this.send(CN298_MESSAGES.continueRound, {}); }
    timeout(): Promise<CN298Snapshot> { return this.send(CN298_MESSAGES.timeout, {}); }

    private send(msgId: CN298CommandEnvelope['msgId'], body: Record<string, unknown>): Promise<CN298Snapshot> {
        // Gateway idempotency survives a browser refresh. A sequence-only ID restarts at 1 and
        // can replay the previous page's cached state response after the room has already mutated.
        // Keep the readable prefix while adding one immutable namespace per runtime instance.
        const requestId = this.requests.next();
        return this.transport.request(Object.freeze({ msgId, requestId, roomId: this.roomId,
            stateVersion: this.stateVersion(), body: Object.freeze({ ...body }) }));
    }

}
