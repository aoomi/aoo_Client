export interface PdkRoomCommandPort {
    action<T = unknown>(key: string, msgId: string, body: unknown): Promise<T>;
}

export class RoomLifecycleController {
    public constructor(private readonly commands: PdkRoomCommandPort) {}
    // 房间生命周期必须直达公共权威 msgId；若再经过玩法旧 action
    // 包装，Gateway 会形成第二条路由，也无法对通用房间契约做静态门禁。
    public ready(roomID: number, posIndex: number): Promise<unknown> { return this.commands.action('ready', 'common.room.ready_req', { roomID, posIndex }); }
    public trusteeship(roomID: number, pos: number, enabled: boolean): Promise<unknown> {
        return this.commands.action('trusteeship', 'common.room.trusteeship_req', { roomID, pos, trusteeship: enabled });
    }
    public dissolve(roomID: number): Promise<unknown> {
        return this.commands.action('dissolve', 'common.room.dissolve_req', { roomID });
    }
    public play(roomID: number, pos: number, opCardType: number, cardList: readonly number[], daiNum: number): Promise<unknown> {
        return this.commands.action('op-card', 'common.room.play_req', { roomID, pos, opCardType, cards: cardList, daiNum });
    }
    public pass(roomID: number, pos: number): Promise<unknown> {
        return this.commands.action('pass', 'common.room.pass_req', { roomID, pos });
    }
    public hint(roomID: number, pos: number): Promise<unknown> {
        return this.commands.action('hint', 'common.room.hint_req', { roomID, pos });
    }
}
