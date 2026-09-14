import { _decorator, Button, Component, instantiate, Layout, Node, Prefab, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import type { AqmjRuntime } from './AqmjRuntime';
import { AqmjPlayStateController, type AqmjPlaySnapshot } from './AqmjPlayStateController';
import type { AqmjViewMode } from './AqmjSceneBootstrap';
import { AqmjTableController } from './AqmjTableController';

const { ccclass } = _decorator;

const operationByButton: Record<string, number> = {
    btn_out: 7,
    btn_next: 8,
    btn_pen: 2,
    btn_gang: 3,
    btn_chi: 6,
    btn_hu: 1,
};

const textureFolder: Record<AqmjViewMode, string> = {
    '2d': 'texture/game/majiang/self2d/show',
    xy: 'texture/game/majiang/selfXY/show',
    wz: 'texture/game/majiang/selfWZ/show',
    yf: 'texture/game/majiang/selfYF/show',
};

/** Native Creator 3.8.8 binder shared by all four migrated AQMJ table prefabs. */
@ccclass('AqmjPlayView')
export class AqmjPlayView extends Component {
    private runtime: AqmjRuntime | null = null;
    private state: AqmjPlayStateController | null = null;
    private viewMode: AqmjViewMode = '2d';
    private generation = 0;
    private resultNode: Node | null = null;
    private table: AqmjTableController | null = null;

    public initialize(runtime: AqmjRuntime, viewMode: AqmjViewMode): void {
        this.runtime = runtime;
        this.viewMode = viewMode;
        this.state = new AqmjPlayStateController(runtime);
        this.table = new AqmjTableController(this.node, runtime, (message) => this.node.emit('legacy-aqmj-message', message));
        this.bindOperationButtons();
        this.node.on('legacy-aqmj-event', this.onRoomEvent, this);
    }

    public renderRoom(): void {
        const snapshot = this.state?.refreshFromRoom();
        if (snapshot) void this.render(snapshot);
    }

    protected override onDestroy(): void {
        this.generation += 1;
        this.node.off('legacy-aqmj-event', this.onRoomEvent, this);
        this.resultNode?.destroy();
        this.resultNode = null;
        this.table?.destroy();
        this.table = null;
        this.runtime = null;
        this.state = null;
    }

    private onRoomEvent(payload: unknown): void {
        if (!payload || typeof payload !== 'object' || !this.state) return;
        const packet = payload as { event?: unknown; body?: unknown };
        void this.render(this.state.consume(String(packet.event ?? ''), packet.body));
    }

    private async render(snapshot: AqmjPlaySnapshot): Promise<void> {
        await this.renderHand(snapshot.hand);
        this.renderOperations(snapshot.availableOperations);
        if (snapshot.phase === 'settled' || snapshot.phase === 'ended') await this.showResult(snapshot.phase);
    }

    private async renderHand(cards: readonly number[]): Promise<void> {
        const generation = ++this.generation;
        const parent = this.ensureHandContainer();
        parent.removeAllChildren();
        for (const cardId of cards) {
            const card = new Node(`card_${cardId}`);
            const transform = card.addComponent(UITransform);
            transform.setContentSize(68, 94);
            const sprite = card.addComponent(Sprite);
            const button = card.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            card.on(Button.EventType.CLICK, () => { void this.runtime?.operate(cardId, 7); }, this);
            parent.addChild(card);
            const frame = await this.loadCardFrame(cardId);
            if (generation !== this.generation || !card.isValid) return;
            sprite.spriteFrame = frame;
        }
    }

    private ensureHandContainer(): Node {
        const existing = this.node.getChildByPath('cardNodes/card01/NativeHand');
        if (existing) return existing;
        const parent = this.node.getChildByPath('cardNodes/card01') ?? this.node;
        const hand = new Node('NativeHand');
        const transform = hand.addComponent(UITransform);
        transform.setContentSize(980, 110);
        const layout = hand.addComponent(Layout);
        layout.type = Layout.Type.HORIZONTAL;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.spacingX = -6;
        parent.addChild(hand);
        return hand;
    }

    private bindOperationButtons(): void {
        this.walk(this.node, (node) => {
            const operation = operationByButton[node.name];
            if (!operation) return;
            node.active = false;
            const button = node.getComponent(Button) ?? node.addComponent(Button);
            node.on(Button.EventType.CLICK, () => { void this.runtime?.operate(0, operation); }, this);
        });
    }

    private renderOperations(operations: readonly number[]): void {
        const allowed = new Set(operations);
        this.walk(this.node, (node) => {
            const operation = operationByButton[node.name];
            if (operation) node.active = allowed.has(operation) || (operation === 8 && operations.length > 0);
        });
    }

    private async showResult(phase: 'settled' | 'ended'): Promise<void> {
        if (this.resultNode?.isValid) return;
        const suffix = this.viewMode === '2d' ? '' : this.viewMode.toUpperCase();
        const path = phase === 'ended'
            ? `native-ui/game/aqmj/resources/game/AQMJ/base/aqmj_UIMJResultDetail${suffix}`
            : `native-ui/game/aqmj/resources/game/AQMJ/base/aqmj_UIMJWinLost${suffix}`;
        const prefab = await this.loadPrefab(path);
        if (this.resultNode?.isValid || !this.node.isValid) return;
        this.resultNode = instantiate(prefab);
        this.node.addChild(this.resultNode);
    }

    private loadCardFrame(cardId: number): Promise<SpriteFrame> {
        const cardType = Math.floor(cardId / 100);
        const name = String(cardType).padStart(2, '0');
        const path = `legacy-ui/aqmj-source/${textureFolder[this.viewMode]}/hh_face_li_${name}/spriteFrame`;
        return new Promise((resolve, reject) => {
            resources.load(path, SpriteFrame, (error, frame) => error ? reject(error) : resolve(frame));
        });
    }

    private loadPrefab(path: string): Promise<Prefab> {
        return new Promise((resolve, reject) => {
            resources.load(path, Prefab, (error, prefab) => error ? reject(error) : resolve(prefab));
        });
    }

    private walk(root: Node, visit: (node: Node) => void): void {
        visit(root);
        for (const child of root.children) this.walk(child, visit);
    }
}
