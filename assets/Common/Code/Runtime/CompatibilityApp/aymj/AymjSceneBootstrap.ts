import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AymjRuntime } from './AymjRuntime';
import type { LegacyAymjRoom } from './model';
import { AymjPlayView } from './AymjPlayView';

const { ccclass } = _decorator;
export type AymjViewMode = '2d' | 'xy' | 'wz' | 'kl';
export interface AymjSceneOptions {
    roomId: number; playerId: number; viewMode: AymjViewMode;
    onRoomReady?: (room: LegacyAymjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<AymjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'AYMJPlay', setting: 1 }, xy: { prefab: 'AYMJXYPlay', setting: 2 },
    wz: { prefab: 'AYMJPlay', setting: 3 }, kl: { prefab: 'AYMJPlay', setting: 4 },
};

@ccclass('AymjSceneBootstrap')
export class AymjSceneBootstrap extends Component {
    private runtime: AymjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: AymjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/aymj/resources/game/AYMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new AymjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(AymjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-aymj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(AymjPlayView) ?? playNode.addComponent(AymjPlayView);
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
