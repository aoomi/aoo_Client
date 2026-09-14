import { _decorator, Button, Component, instantiate, Layout, Node, Prefab, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import type { AhhbmjRuntime } from './AhhbmjRuntime';
import { AhhbmjPlayStateController, type AhhbmjPlaySnapshot } from './AhhbmjPlayStateController';
import type { AhhbmjViewMode } from './AhhbmjSceneBootstrap';
import { AhhbmjTableController } from './AhhbmjTableController';

const { ccclass } = _decorator;

const operationByButton: Record<string, number> = {
    btn_out: 7,
    btn_next: 8,
    btn_pen: 2,
    btn_gang: 3,
    btn_chi: 6,
    btn_hu: 1,
};

const textureFolder: Record<AhhbmjViewMode, string> = {
    '2d': 'texture/game/majiang/self2d/show',
    xy: 'texture/game/majiang/selfXY/show',
    wz: 'texture/game/majiang/selfWZ/show',
    yf: 'texture/game/majiang/selfYF/show',
    jp: 'texture/game/majiang/selfJP/show',
};

/** Native Creator 3.8.8 binder shared by all four migrated AHHBMJ table prefabs. */
@ccclass('AhhbmjPlayView')
export class AhhbmjPlayView extends Component {
    private runtime: AhhbmjRuntime | null = null;
    private state: AhhbmjPlayStateController | null = null;
    private viewMode: AhhbmjViewMode = '2d';
    private generation = 0;
    private resultNode: Node | null = null;
    private table: AhhbmjTableController | null = null;

    public initialize(runtime: AhhbmjRuntime, viewMode: AhhbmjViewMode): void {
        this.runtime = runtime;
        this.viewMode = viewMode;
        this.state = new AhhbmjPlayStateController(runtime);
        this.table = new AhhbmjTableController(this.node, runtime, (message) => this.node.emit('legacy-ahhbmj-message', message));
        this.bindOperationButtons();
        this.node.on('legacy-ahhbmj-event', this.onRoomEvent, this);
    }

    public renderRoom(): void {
        const snapshot = this.state?.refreshFromRoom();
        if (snapshot) void this.render(snapshot);
    }

    protected override onDestroy(): void {
        this.generation += 1;
        this.node.off('legacy-ahhbmj-event', this.onRoomEvent, this);
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

    private async render(snapshot: AhhbmjPlaySnapshot): Promise<void> {
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
            ? `native-ui/game/ahhbmj/resources/game/AHHBMJ/base/ahhbmj_UIMJResultDetail${suffix}`
            : `native-ui/game/ahhbmj/resources/game/AHHBMJ/base/ahhbmj_UIMJWinLost${suffix}`;
        const prefab = await this.loadPrefab(path);
        if (this.resultNode?.isValid || !this.node.isValid) return;
        this.resultNode = instantiate(prefab);
        this.node.addChild(this.resultNode);
    }

    private loadCardFrame(cardId: number): Promise<SpriteFrame> {
        const cardType = Math.floor(cardId / 100);
        const name = String(cardType).padStart(2, '0');
        const path = `legacy-ui/ahhbmj-source/${textureFolder[this.viewMode]}/hh_face_li_${name}/spriteFrame`;
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
