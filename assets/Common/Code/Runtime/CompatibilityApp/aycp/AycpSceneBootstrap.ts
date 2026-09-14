import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view, Widget } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { AycpPlayController } from './AycpPlayController';
import { AycpRuntime, AycpRuntimeOptions } from './AycpRuntime';
const { ccclass } = _decorator;
export interface AycpSceneStartOptions extends AycpRuntimeOptions { roomId: number }

/** Serialized Creator 3.8.8 entry for the sole native AYCP table view. */
@ccclass('AycpSceneBootstrap')
export class AycpSceneBootstrap extends Component {
    private runtime: AycpRuntime | null = null; private play: Node | null = null; private controls: AycpPlayController | null = null;
    public async startRoom(client: ProtocolClient, options: AycpSceneStartOptions): Promise<void> {
        this.stopRoom(); this.play = await this.mountPlay(); const external = options.onEvent;
        this.runtime = new AycpRuntime(client, { ...options,
            onRoomReady: (room) => { if (this.play && this.runtime && !this.controls) { this.controls = new AycpPlayController(this.play, this.runtime); this.controls.bind(); } options.onRoomReady?.(room); },
            onEvent: (event, body) => { this.route(event, body); external?.(event, body); },
        }); await this.runtime.enterRoom(options.roomId);
    }
    public stopRoom(): void { this.controls?.unbind(); this.controls = null; this.runtime?.destroy(); this.runtime = null; this.play?.destroy(); this.play = null; }
    protected override onDestroy(): void { this.stopRoom(); }
    private async mountPlay(): Promise<Node> {
        const prefab = await new Promise<Prefab>((resolve, reject) => resources.load('native-ui/game/aycp/resources/game/AYCP/ui/AYCPPlay', Prefab, (error, asset) => error || !asset ? reject(error ?? new Error('AYCPPlay 原生预制体不存在')) : resolve(asset)));
        const node = instantiate(prefab); this.node.addChild(node); node.getComponent(Widget)?.destroy(); const transform = node.getComponent(UITransform); const visible = view.getVisibleSize();
        if (transform?.width && transform.height) { const scale = Math.min(visible.width / transform.width, visible.height / transform.height); node.setScale(scale, scale, 1); } node.setPosition(0, 0, 0); return node;
    }
    private route(event: string, body: unknown): void { const key = event.toLowerCase(); if (key.endsWith('startround') || key.endsWith('changestatus')) this.controls?.updateOperation(this.isClientOperation(body)); if (key.endsWith('setend') || key.endsWith('roomend')) this.controls?.updateOperation(false); this.play?.emit(event, body); }
    private isClientOperation(body: unknown): boolean { const packet = body as Record<string, any> | null; const list = packet?.setRound?.opPosList ?? packet?.opPosList ?? []; const opPos = Number(packet?.opPos ?? list?.[0]?.pos ?? list?.[0]?.posID ?? -1); const clientPos = Number((this.runtime?.getRoomPositionManager() as any)?.GetClientPos?.() ?? -2); return opPos === clientPos; }
}
