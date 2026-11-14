import type { PdkRuntime } from './PdkRuntime';

export interface PdkShareRequest {
    mode: 'link' | 'wechat-screen' | 'dingtalk-screen' | 'mw-screen' | 'xiangliao-screen';
    title?: string;
    description?: string;
    roomId?: number;
    roomKey?: string;
}

export class PdkShareController {
    /** The removed panel is not a runtime dependency; callers share directly. */
    public constructor(
        private readonly runtime: PdkRuntime,
        private readonly share: (request: PdkShareRequest) => void,
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
