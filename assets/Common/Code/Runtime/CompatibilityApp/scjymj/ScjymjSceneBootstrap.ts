import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view, Widget } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { ScjymjPlayStateController, ScjymjGetCardPacket } from './ScjymjPlayStateController';
import { ScjymjPlayView } from './ScjymjPlayView';
import { ScjymjRoomButtonController } from './ScjymjRoomButtonController';
import { ScjymjRuntime, ScjymjRuntimeOptions } from './ScjymjRuntime';

const { ccclass } = _decorator;

export interface ScjymjSceneStartOptions extends ScjymjRuntimeOptions {
    roomId: number;
    remainingCards?: number[];
    viewMode?: '3d' | '2d' | 'xy';
}

/** Serialized scene entry that owns all SCJYMJ room resources. */
@ccclass('ScjymjSceneBootstrap')
export class ScjymjSceneBootstrap extends Component {
    private runtime: ScjymjRuntime | null = null;
    private readonly state = new ScjymjPlayStateController();
    private view: ScjymjPlayView | null = null;
    private playNode: Node | null = null;
    private roomButtons: ScjymjRoomButtonController | null = null;
    private initialCards: number[] = [];

    public async startRoom(client: ProtocolClient, options: ScjymjSceneStartOptions): Promise<void> {
        this.stopRoom();
        this.initialCards = [...(options.remainingCards ?? [])];
        await this.mountNativeView(options.viewMode ?? '2d');
        const externalEvent = options.onEvent;
        this.runtime = new ScjymjRuntime(client, {
            ...options,
            onRoomReady: (room) => {
                this.ensureView();
                this.state.enter(room, this.initialCards);
                if (this.playNode && this.runtime && !this.roomButtons) {
                    this.roomButtons = new ScjymjRoomButtonController(
                        this.playNode,
                        this.runtime,
                        () => this.view?.renderHand(),
                    );
                    this.roomButtons.bind();
                }
                options.onRoomReady?.(room);
            },
            onEvent: (event, body) => {
                this.routeRoomEvent(event, body);
                externalEvent?.(event, body);
            },
        });
        await this.runtime.enterRoom(options.roomId);
    }

    public stopRoom(): void {
        this.roomButtons?.unbind();
        this.roomButtons = null;
        this.view?.unbind();
        this.view = null;
        this.playNode?.destroy();
        this.playNode = null;
        this.state.leave();
        this.runtime?.destroy();
        this.runtime = null;
        this.initialCards.length = 0;
    }

    protected override onDestroy(): void {
        this.stopRoom();
    }

    private ensureView(): void {
        const view = this.playNode?.getComponent(ScjymjPlayView)
            ?? this.playNode?.getComponentInChildren(ScjymjPlayView)
            ?? null;
        if (!view) throw new Error('SCJYMJ 场景缺少原生 ScjymjPlayView 组件');
        this.view = view;
        view.bind(this.state, this.runtime ?? undefined);
    }

    private async mountNativeView(mode: '3d' | '2d' | 'xy'): Promise<void> {
        const prefabName = mode === '3d' ? 'SCJYMJPlay' : mode === 'xy' ? 'SCJYMJXYPlay' : 'SCJYMJ2DPlay';
        const prefab = await new Promise<Prefab>((resolve, reject) => {
            resources.load(`native-ui/game/scjymj/ui/${prefabName}`, Prefab, (error, asset) => {
                if (error || !asset) reject(error ?? new Error(`SCJYMJ 原生 Prefab 不存在：${prefabName}`));
                else resolve(asset);
            });
        });
        const node = instantiate(prefab);
        node.name = prefabName;
        this.node.addChild(node);
        node.getComponent(Widget)!.enabled = false;
        const transform = node.getComponent(UITransform);
        const background = node.getChildByName('bg');
        const bounds = background?.getComponent(UITransform) ?? transform;
        const visible = view.getVisibleSize();
        if (bounds && bounds.width > 0 && bounds.height > 0) {
            const scale = Math.min(visible.width / bounds.width, visible.height / bounds.height);
            node.setScale(scale, scale, 1);
            const centerX = background
                ? background.position.x + (0.5 - bounds.anchorX) * bounds.width
                : 0;
            const centerY = background
                ? background.position.y + (0.5 - bounds.anchorY) * bounds.height
                : 0;
            node.setPosition(-centerX * scale, -centerY * scale, 0);
        } else {
            node.setPosition(0, 0, 0);
        }
        if (!node.getComponentInChildren(ScjymjPlayView)) node.addComponent(ScjymjPlayView);
        this.playNode = node;
        this.ensureView();
    }

    private routeRoomEvent(event: string, body: unknown): void {
        const normalized = event.toLowerCase();
        if (normalized.endsWith('setstart')) {
            this.state.onSetStart();
            this.view?.renderHand();
            return;
        }
        if (normalized.endsWith('posgetcard')) {
            this.state.onPosGetCard(body as ScjymjGetCardPacket);
            this.view?.renderHand();
            return;
        }
        if (normalized.endsWith('setend') || normalized.endsWith('roomend')) {
            const room = this.runtime?.getRoom();
            if (room) this.state.enter(room, []);
        }
    }
}
