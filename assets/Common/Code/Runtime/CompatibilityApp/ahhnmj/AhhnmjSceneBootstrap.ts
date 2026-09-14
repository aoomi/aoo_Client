import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AhhnmjRuntime } from './AhhnmjRuntime';
import type { LegacyAhhnmjRoom } from './model';
import { AhhnmjPlayView } from './AhhnmjPlayView';

const { ccclass } = _decorator;
export type AhhnmjViewMode = '2d' | 'xy' | 'wz' | 'yf';
export interface AhhnmjSceneOptions {
    roomId: number; playerId: number; viewMode: AhhnmjViewMode;
    onRoomReady?: (room: LegacyAhhnmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<AhhnmjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'AHHNMJ2DPlay', setting: 0 }, xy: { prefab: 'AHHNMJXYPlay', setting: 2 },
    wz: { prefab: 'AHHNMJWZPlay', setting: 3 }, yf: { prefab: 'AHHNMJYFPlay', setting: 4 },
};

@ccclass('AhhnmjSceneBootstrap')
export class AhhnmjSceneBootstrap extends Component {
    private runtime: AhhnmjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: AhhnmjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/ahhnmj/resources/game/AHHNMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new AhhnmjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(AhhnmjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-ahhnmj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(AhhnmjPlayView) ?? playNode.addComponent(AhhnmjPlayView);
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
