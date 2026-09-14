import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AqmjRuntime } from './AqmjRuntime';
import type { LegacyAqmjRoom } from './model';
import { AqmjPlayView } from './AqmjPlayView';

const { ccclass } = _decorator;
export type AqmjViewMode = '2d' | 'xy' | 'wz' | 'yf';
export interface AqmjSceneOptions {
    roomId: number; playerId: number; viewMode: AqmjViewMode;
    onRoomReady?: (room: LegacyAqmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<AqmjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'AQMJ2DPlay', setting: 1 }, xy: { prefab: 'AQMJXYPlay', setting: 2 },
    wz: { prefab: 'AQMJWZPlay', setting: 0 }, yf: { prefab: 'AQMJYFPlay', setting: 3 },
};

@ccclass('AqmjSceneBootstrap')
export class AqmjSceneBootstrap extends Component {
    private runtime: AqmjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: AqmjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/aqmj/resources/game/AQMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new AqmjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(AqmjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-aqmj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(AqmjPlayView) ?? playNode.addComponent(AqmjPlayView);
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
