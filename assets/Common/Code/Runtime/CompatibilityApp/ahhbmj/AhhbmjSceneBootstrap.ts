import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AhhbmjRuntime } from './AhhbmjRuntime';
import type { LegacyAhhbmjRoom } from './model';
import { AhhbmjPlayView } from './AhhbmjPlayView';

const { ccclass } = _decorator;
export type AhhbmjViewMode = '2d' | 'xy' | 'wz' | 'yf' | 'jp';
export interface AhhbmjSceneOptions {
    roomId: number; playerId: number; viewMode: AhhbmjViewMode;
    onRoomReady?: (room: LegacyAhhbmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<AhhbmjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'AHHBMJ2DPlay', setting: 0 }, xy: { prefab: 'AHHBMJXYPlay', setting: 2 },
    wz: { prefab: 'AHHBMJWZPlay', setting: 3 }, yf: { prefab: 'AHHBMJYFPlay', setting: 5 },
    jp: { prefab: 'AHHBMJJPPlay', setting: 4 },
};

@ccclass('AhhbmjSceneBootstrap')
export class AhhbmjSceneBootstrap extends Component {
    private runtime: AhhbmjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: AhhbmjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/ahhbmj/resources/game/AHHBMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new AhhbmjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(AhhbmjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-ahhbmj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(AhhbmjPlayView) ?? playNode.addComponent(AhhbmjPlayView);
        playView.initialize(runtime, options.viewMode);
        await runtime.enterRoom(options.roomId);
    }
    public stopRoom(): void { this.runtime?.destroy(); this.runtime = null; this.playNode?.destroy(); this.playNode = null; }
    protected override onDestroy(): void { this.stopRoom(); }
    private loadPrefab(path: string): Promise<Prefab> {
        return new Promise((resolve, reject) => resources.load(path, Prefab, (error, prefab) => error ? reject(error) : resolve(prefab)));
    }
    private fit(node: Node): void {
        const bounds = node.getComponent(UITransform); if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
        const visible = view.getVisibleSize(); const scale = Math.min(visible.width / bounds.width, visible.height / bounds.height);
        node.setScale(scale, scale, 1); node.setPosition(0, 0, 0);
    }
}
