import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view, Widget } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AydssPlayController } from './AydssPlayController';
import { AydssRuntime, AydssRuntimeOptions } from './AydssRuntime';
const { ccclass } = _decorator;
export interface AydssSceneStartOptions extends AydssRuntimeOptions { roomId: number }

/** Serialized Creator 3.8.8 entry for the sole native AYDSS table view. */
@ccclass('AydssSceneBootstrap')
export class AydssSceneBootstrap extends Component {
    private runtime: AydssRuntime | null = null; private play: Node | null = null; private controls: AydssPlayController | null = null;
    public async startRoom(client: ProtocolClient, options: AydssSceneStartOptions): Promise<void> {
        this.stopRoom(); this.play = await this.mountPlay(); const external = options.onEvent;
        this.runtime = new AydssRuntime(client, { ...options,
            onRoomReady: (room) => { if (this.play && this.runtime && !this.controls) { this.controls = new AydssPlayController(this.play, this.runtime); this.controls.bind(); } options.onRoomReady?.(room); },
            onEvent: (event, body) => { this.route(event, body); external?.(event, body); },
        }); await this.runtime.enterRoom(options.roomId);
    }
    public stopRoom(): void { this.controls?.unbind(); this.controls = null; this.runtime?.destroy(); this.runtime = null; this.play?.destroy(); this.play = null; }
    protected override onDestroy(): void { this.stopRoom(); }
    private async mountPlay(): Promise<Node> {
        const prefab = await new Promise<Prefab>((resolve, reject) => resources.load('native-ui/game/aydss/resources/game/AYDSS/ui/AYDSSPlay', Prefab, (error, asset) => error || !asset ? reject(error ?? new Error('AYDSSPlay 原生预制体不存在')) : resolve(asset)));
        const node = instantiate(prefab); this.node.addChild(node); node.getComponent(Widget)?.destroy(); const transform = node.getComponent(UITransform); const visible = view.getVisibleSize();
        if (transform?.width && transform.height) { const scale = Math.min(visible.width / transform.width, visible.height / transform.height); node.setScale(scale, scale, 1); } node.setPosition(0, 0, 0); return node;
    }
    private route(event: string, body: unknown): void { const key = event.toLowerCase(); if (key.endsWith('startround') || key.endsWith('changestatus')) this.controls?.updateOperation(this.isClientOperation(body)); if (key.endsWith('setend') || key.endsWith('roomend')) this.controls?.updateOperation(false); this.play?.emit(event, body); }
    private isClientOperation(body: unknown): boolean { const packet = body as Record<string, any> | null; const list = packet?.setRound?.opPosList ?? packet?.opPosList ?? []; const opPos = Number(packet?.opPos ?? list?.[0]?.pos ?? list?.[0]?.posID ?? -1); const clientPos = Number((this.runtime?.getRoomPositionManager() as any)?.GetClientPos?.() ?? -2); return opPos === clientPos; }
}
