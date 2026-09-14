import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { BdjhmjRuntime } from './BdjhmjRuntime';
import type { LegacyBdjhmjRoom } from './model';
import { BdjhmjPlayView } from './BdjhmjPlayView';

const { ccclass } = _decorator;
export type BdjhmjViewMode = '2d' | 'xy' | 'wz' | 'kl';
export interface BdjhmjSceneOptions {
    roomId: number; playerId: number; viewMode: BdjhmjViewMode;
    onRoomReady?: (room: LegacyBdjhmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<BdjhmjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'BDJHMJPlay', setting: 1 }, xy: { prefab: 'BDJHMJXYPlay', setting: 2 },
    wz: { prefab: 'BDJHMJPlay', setting: 3 }, kl: { prefab: 'BDJHMJPlay', setting: 4 },
};

@ccclass('BdjhmjSceneBootstrap')
export class BdjhmjSceneBootstrap extends Component {
    private runtime: BdjhmjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: BdjhmjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/bdjhmj/resources/game/BDJHMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new BdjhmjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(BdjhmjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-bdjhmj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(BdjhmjPlayView) ?? playNode.addComponent(BdjhmjPlayView);
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
