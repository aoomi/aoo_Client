import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AfmjRuntime } from './AfmjRuntime';
import type { LegacyAfmjRoom } from './model';
import { AfmjPlayView } from './AfmjPlayView';

const { ccclass } = _decorator;
export type AfmjViewMode = '2d' | 'xy' | 'wz' | 'yf';
export interface AfmjSceneOptions {
    roomId: number; playerId: number; viewMode: AfmjViewMode;
    onRoomReady?: (room: LegacyAfmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<AfmjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'AFMJ2DPlay', setting: 1 }, xy: { prefab: 'AFMJXYPlay', setting: 2 },
    wz: { prefab: 'AFMJWZPlay', setting: 0 }, yf: { prefab: 'AFMJYFPlay', setting: 3 },
};

@ccclass('AfmjSceneBootstrap')
export class AfmjSceneBootstrap extends Component {
    private runtime: AfmjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: AfmjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/afmj/resources/game/AFMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new AfmjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(AfmjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-afmj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(AfmjPlayView) ?? playNode.addComponent(AfmjPlayView);
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
