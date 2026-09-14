import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AhmjRuntime } from './AhmjRuntime';
import type { LegacyAhmjRoom } from './model';
import { AhmjPlayView } from './AhmjPlayView';

const { ccclass } = _decorator;
export type AhmjViewMode = '2d' | 'xy' | 'wz' | 'kl';
export interface AhmjSceneOptions {
    roomId: number; playerId: number; viewMode: AhmjViewMode;
    onRoomReady?: (room: LegacyAhmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<AhmjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'AHMJPlay', setting: 1 }, xy: { prefab: 'AHMJXYPlay', setting: 2 },
    wz: { prefab: 'AHMJWZPlay', setting: 3 }, kl: { prefab: 'AHMJKLPlay', setting: 4 },
};

@ccclass('AhmjSceneBootstrap')
export class AhmjSceneBootstrap extends Component {
    private runtime: AhmjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: AhmjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/ahmj/resources/game/AHMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new AhmjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(AhmjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-ahmj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(AhmjPlayView) ?? playNode.addComponent(AhmjPlayView);
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
