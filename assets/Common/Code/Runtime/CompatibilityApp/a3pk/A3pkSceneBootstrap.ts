import { _decorator, Component, instantiate, Node, Prefab, resources, UITransform, view, Widget } from 'cc';
import { ProtocolClient } from '../../network/ProtocolClient';
import { A3pkPlayController } from './A3pkPlayController';
import { A3pkRuntime, A3pkRuntimeOptions } from './A3pkRuntime';
const { ccclass } = _decorator;

export interface A3pkSceneStartOptions extends A3pkRuntimeOptions { roomId: number }

/** Serialized Creator 3.8.8 entry for the migrated A3PK native table. */
@ccclass('A3pkSceneBootstrap')
export class A3pkSceneBootstrap extends Component {
    private runtime: A3pkRuntime | null = null;
    private play: Node | null = null;
    private controls: A3pkPlayController | null = null;

    public async startRoom(client: ProtocolClient, options: A3pkSceneStartOptions): Promise<void> {
        this.stopRoom();
        this.play = await this.mountPlay();
        const external = options.onEvent;
        this.runtime = new A3pkRuntime(client, { ...options,
            onRoomReady: (room) => { if (this.play && this.runtime && !this.controls) { this.controls = new A3pkPlayController(this.play, this.runtime); this.controls.bind(); } options.onRoomReady?.(room); },
            onEvent: (event, body) => { this.route(event, body); external?.(event, body); },
        });
        await this.runtime.enterRoom(options.roomId);
    }
    public stopRoom(): void { this.controls?.unbind(); this.controls = null; this.runtime?.destroy(); this.runtime = null; this.play?.destroy(); this.play = null; }
    protected override onDestroy(): void { this.stopRoom(); }

    private async mountPlay(): Promise<Node> {
        const prefab = await new Promise<Prefab>((resolve, reject) => resources.load(
            'native-ui/game/a3pk/resources/game/A3PK/ui/A3PKPlay', Prefab,
            (error, asset) => error || !asset ? reject(error ?? new Error('A3PKPlay 原生预制体不存在')) : resolve(asset)));
        const node = instantiate(prefab); this.node.addChild(node); node.getComponent(Widget)?.destroy();
        const transform = node.getComponent(UITransform); const visible = view.getVisibleSize();
        if (transform?.width && transform.height) { const scale = Math.min(visible.width / transform.width, visible.height / transform.height); node.setScale(scale, scale, 1); }
        node.setPosition(0, 0, 0); return node;
    }
    private route(event: string, body: unknown): void {
        const key = event.toLowerCase();
        if (key.endsWith('setstart') || key.endsWith('changestatus')) this.controls?.updateOperation(this.isClientOperation(body));
        if (key.endsWith('setend') || key.endsWith('roomend')) this.controls?.updateOperation(false);
        this.play?.emit(event, body);
    }
    private isClientOperation(body: unknown): boolean {
        const packet = body as Record<string, unknown> | null; const opPos = Number(packet?.opPos ?? packet?.pos ?? -1);
        const manager = this.runtime?.getRoomPositionManager() as any; const clientPos = Number(manager?.GetClientPos?.() ?? -2);
        return opPos === clientPos;
    }
}
