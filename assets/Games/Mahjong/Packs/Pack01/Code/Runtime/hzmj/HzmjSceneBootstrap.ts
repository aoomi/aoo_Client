import { _decorator, Component, instantiate, Node, Prefab, UITransform, view } from 'cc';
import { loadHzmjPrefab } from './HzmjPrefabLoader';
import { ProtocolClient } from '../../../../../../../Common/Code/Runtime/network/ProtocolClient';
import { HzmjRuntime } from './HzmjRuntime';
import type { LegacyHzmjRoom } from './model/index';
import { HzmjPlayView } from './HzmjPlayView';

const { ccclass } = _decorator;

export type HzmjViewMode = '2d' | 'xy' | 'wz' | 'yx';

export interface HzmjSceneOptions {
    roomId: number;
    playerId: number;
    viewMode: HzmjViewMode;
    onRoomReady?: (room: LegacyHzmjRoom) => void;
    onEvent?: (event: string, body: unknown) => void;
    onMessage?: (message: string) => void;
    onExit?: (reason: string) => void;
}

const viewPrefabs: Record<HzmjViewMode, string> = {
    '2d': 'HZMJPlay',
    xy: 'HZMJXYPlay',
    wz: 'HZMJWZPlay',
    yx: 'HZMJYXPlay',
};

/** Loads one of the four native HZMJ tables and binds it to the migrated room runtime. */
@ccclass('HzmjSceneBootstrap')
export class HzmjSceneBootstrap extends Component {
    private runtime: HzmjRuntime | null = null;
    private playNode: Node | null = null;
    private generation = 0;

    public async startRoom(client: ProtocolClient, options: HzmjSceneOptions): Promise<void> {
        this.stopRoom();
        const generation = this.generation;
        const prefab = await this.loadPrefab(`GameHzmjUi${viewPrefabs[options.viewMode]}`);
        if (generation !== this.generation || !this.node.isValid) return;
        const playNode = instantiate(prefab);
        playNode.name = viewPrefabs[options.viewMode];
        this.node.addChild(playNode);
        this.fitToVisibleSize(playNode);
        this.playNode = playNode;
        const runtime = new HzmjRuntime(client, {
            playerId: options.playerId,
            onRoomReady: (room) => {
                playNode.getComponent(HzmjPlayView)?.renderRoom();
                options.onRoomReady?.(room);
            },
            onEvent: (event, body) => {
                playNode.emit('legacy-hzmj-event', { event, body });
                options.onEvent?.(event, body);
            },
            onMessage: options.onMessage,
            onExit: options.onExit,
        });
        this.runtime = runtime;
        const playView = playNode.getComponent(HzmjPlayView) ?? playNode.addComponent(HzmjPlayView);
        playView.initialize(runtime, options.viewMode);
        try {
            await runtime.enterRoom(options.roomId);
        } catch (error: unknown) {
            if (generation !== this.generation) return;
            this.stopRoom();
            throw error;
        }
    }

    public stopRoom(): void {
        this.generation += 1;
        this.runtime?.destroy();
        this.runtime = null;
        this.playNode?.destroy();
        this.playNode = null;
    }

    protected override onDestroy(): void {
        this.stopRoom();
    }

    private loadPrefab(path: string): Promise<Prefab> {
        return loadHzmjPrefab(path);
    }

    private fitToVisibleSize(node: Node): void {
        const bounds = node.getComponent(UITransform);
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
        const visible = view.getVisibleSize();
        const scale = Math.min(visible.width / bounds.width, visible.height / bounds.height);
        node.setScale(scale, scale, 1);
        node.setPosition(0, 0, 0);
    }
}
