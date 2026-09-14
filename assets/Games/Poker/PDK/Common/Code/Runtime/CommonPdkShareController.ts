import type { CommonPdkRuntime } from './CommonPdkRuntime';

export interface CommonPdkShareRequest {
    mode: 'link' | 'wechat-screen' | 'dingtalk-screen' | 'mw-screen' | 'xiangliao-screen';
    title?: string;
    description?: string;
    roomId?: number;
    roomKey?: string;
}

export class CommonPdkShareController {
    /** The removed panel is not a runtime dependency; callers share directly. */
    public constructor(
        private readonly runtime: CommonPdkRuntime,
        private readonly share: (request: CommonPdkShareRequest) => void,
    ) {}

    public shareLink(): void {
        const room = this.runtime.getRoom();
        const players = this.runtime.getRoomPosManager().GetRoomAllPlayerInfo() ?? {};
        const names = Object.keys(players).map((key) => String(players[key]?.name ?? '')).filter(Boolean);
        const roomKey = String(room.GetRoomProperty('key') ?? '');
        this.share({
            mode: 'link',
            title: `房号：${roomKey} 互动中`,
            description: names.map((name) => `[${name}]`).join(' '),
            roomId: Number(room.GetRoomProperty('roomID') ?? 0),
            roomKey,
        });
    }

}
