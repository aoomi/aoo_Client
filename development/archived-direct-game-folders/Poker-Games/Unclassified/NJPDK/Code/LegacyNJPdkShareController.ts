import { Button, Node } from 'cc';
import type { LegacyForm, LegacyFormManager } from '../../../../../../core/runtime/ui/LegacyFormManager';
import type { LegacyNJPdkRuntime } from './LegacyNJPdkRuntime';

export interface LegacyNJPdkShareRequest {
    mode: 'link' | 'wechat-screen' | 'dingtalk-screen' | 'mw-screen' | 'xiangliao-screen';
    title?: string;
    description?: string;
    roomId?: number;
    roomKey?: string;
}

export class LegacyNJPdkShareController {
    private form: LegacyForm | null = null;

    public constructor(
        private readonly runtime: LegacyNJPdkRuntime,
        private readonly forms: LegacyFormManager,
        private readonly share: (request: LegacyNJPdkShareRequest) => void,
    ) {}

    public onCreate(form: LegacyForm): void {
        this.form = form;
        this.bind('bg/layout/btn_share', 'wechat-screen');
        this.bind('bg/layout/btn_ddshare', 'dingtalk-screen');
        this.bind('bg/layout/btn_mwshare', 'mw-screen');
        this.bind('bg/layout/btn_xiangliaoshare', 'xiangliao-screen');
        form.find('btn_closeshare')?.on(Button.EventType.CLICK, () => this.forms.close('game/NJPDK/njpdk_UIShareMore'), this);
    }

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

    public destroy(): void { this.form = null; }

    private bind(path: string, mode: LegacyNJPdkShareRequest['mode']): void {
        this.form?.find(path)?.on(Button.EventType.CLICK, () => {
            this.forms.close('game/NJPDK/njpdk_UIShareMore');
            this.share({ mode });
        }, this);
    }
}
