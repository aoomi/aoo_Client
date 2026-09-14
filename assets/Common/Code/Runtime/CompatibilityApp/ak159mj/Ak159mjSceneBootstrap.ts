import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { Ak159mjRuntime } from './Ak159mjRuntime';
import type { LegacyAk159mjRoom } from './model';
import { Ak159mjPlayView } from './Ak159mjPlayView';

const { ccclass } = _decorator;
export type Ak159mjViewMode = '2d' | 'xy' | 'wz' | 'yf' | 'jp';
export interface Ak159mjSceneOptions {
    roomId: number; playerId: number; viewMode: Ak159mjViewMode;
    onRoomReady?: (room: LegacyAk159mjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<Ak159mjViewMode, { prefab: string; setting: number }> = {
    '2d': { prefab: 'AK159MJ2DPlay', setting: 0 }, xy: { prefab: 'AK159MJXYPlay', setting: 2 },
    wz: { prefab: 'AK159MJWZPlay', setting: 3 }, yf: { prefab: 'AK159MJYFPlay', setting: 5 },
    jp: { prefab: 'AK159MJJPPlay', setting: 4 },
};

@ccclass('Ak159mjSceneBootstrap')
export class Ak159mjSceneBootstrap extends Component {
    private runtime: Ak159mjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: Ak159mjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/ak159mj/resources/game/AK159MJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new Ak159mjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(Ak159mjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-ak159mj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(Ak159mjPlayView) ?? playNode.addComponent(Ak159mjPlayView);
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
