import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AsmjRuntime } from './AsmjRuntime';
import type { LegacyAsmjRoom } from './model';
import { AsmjPlayView } from './AsmjPlayView';

const { ccclass } = _decorator;
export type AsmjViewMode = '3d' | 'jdz2d' | 'wl';
export interface AsmjSceneOptions {
    roomId: number; playerId: number; viewMode: AsmjViewMode;
    onRoomReady?: (room: LegacyAsmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}
const views: Record<AsmjViewMode, { prefab: string; setting: number }> = {
    '3d': { prefab: 'ASMJPlay3D', setting: 1 }, jdz2d: { prefab: 'ASMJPlayJDZ2D', setting: 2 },
    wl: { prefab: 'ASMJPlayWL', setting: 6 },
};

@ccclass('AsmjSceneBootstrap')
export class AsmjSceneBootstrap extends Component {
    private runtime: AsmjRuntime | null = null;
    private playNode: Node | null = null;
    public async startRoom(client: ProtocolClient, options: AsmjSceneOptions): Promise<void> {
        this.stopRoom();
        const selected = views[options.viewMode];
        const prefab = await this.loadPrefab(`native-ui/game/asmj/resources/game/ASMJ/ui/${selected.prefab}`);
        const playNode = instantiate(prefab);
        this.node.addChild(playNode);
        this.fit(playNode);
        this.playNode = playNode;
        const runtime = new AsmjRuntime(client, {
            playerId: options.playerId, viewSetting: selected.setting,
            onRoomReady: (room) => { playNode.getComponent(AsmjPlayView)?.renderRoom(); options.onRoomReady?.(room); },
            onEvent: (event, body) => { playNode.emit('legacy-asmj-event', { event, body }); options.onEvent?.(event, body); },
            onMessage: options.onMessage, onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(AsmjPlayView) ?? playNode.addComponent(AsmjPlayView);
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
