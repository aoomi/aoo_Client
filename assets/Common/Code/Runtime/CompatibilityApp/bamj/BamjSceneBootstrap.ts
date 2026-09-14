import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { BamjRuntime } from './BamjRuntime';
import type { LegacyBamjRoom } from './model';
import { BamjPlayView } from './BamjPlayView';

const { ccclass } = _decorator;
export type BamjViewMode = '2d' | 'xy' | 'wz' | 'kl';
export interface BamjSceneOptions {
    roomId: number; playerId: number; viewMode: BamjViewMode;
    onRoomReady?: (room: LegacyBamjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<BamjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'BAMJPlay', setting: 1 }, xy: { prefab: 'BAMJXYPlay', setting: 2 },
    wz: { prefab: 'BAMJPlay', setting: 3 }, kl: { prefab: 'BAMJPlay', setting: 4 },
};

@ccclass('BamjSceneBootstrap')
export class BamjSceneBootstrap extends Component {
    private runtime: BamjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: BamjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/bamj/resources/game/BAMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new BamjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(BamjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-bamj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(BamjPlayView) ?? playNode.addComponent(BamjPlayView);
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
