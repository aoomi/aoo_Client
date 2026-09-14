import { _decorator, Button, Component, instantiate, Layout, Node, Prefab, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import type { AsmjRuntime } from './AsmjRuntime';
import { AsmjPlayStateController, type AsmjPlaySnapshot } from './AsmjPlayStateController';
import type { AsmjViewMode } from './AsmjSceneBootstrap';
import { AsmjTableController } from './AsmjTableController';

const { ccclass } = _decorator;

const operationByButton: Record<string, number> = {
    btn_out: 7,
    btn_next: 8,
    btn_pen: 2,
    btn_gang: 3,
    btn_chi: 6,
    btn_hu: 1,
};

const textureFolder: Record<AsmjViewMode, string> = {
    '3d': '3D/texture/game/majiang/self/show',
    jdz2d: 'JDZ2D/texture/game/majiang/self/show',
    wl: 'WL/texture/game/majiang/self/show',
};

/** Native Creator 3.8.8 binder shared by all three migrated ASMJ table prefabs. */
@ccclass('AsmjPlayView')
export class AsmjPlayView extends Component {
    private runtime: AsmjRuntime | null = null;
    private state: AsmjPlayStateController | null = null;
    private viewMode: AsmjViewMode = '3d';
    private generation = 0;
    private resultNode: Node | null = null;
    private table: AsmjTableController | null = null;

    public initialize(runtime: AsmjRuntime, viewMode: AsmjViewMode): void {
        this.runtime = runtime;
        this.viewMode = viewMode;
        this.state = new AsmjPlayStateController(runtime);
        this.table = new AsmjTableController(this.node, runtime, (message) => this.node.emit('legacy-asmj-message', message));
        this.bindOperationButtons();
        this.node.on('legacy-asmj-event', this.onRoomEvent, this);
    }

    public renderRoom(): void {
        const snapshot = this.state?.refreshFromRoom();
        if (snapshot) void this.render(snapshot);
    }

    protected override onDestroy(): void {
        this.generation += 1;
        this.node.off('legacy-asmj-event', this.onRoomEvent, this);
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

    private async render(snapshot: AsmjPlaySnapshot): Promise<void> {
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
        const suffix = this.viewMode === '3d' ? '' : this.viewMode.toUpperCase();
        const path = phase === 'ended'
            ? `native-ui/game/asmj/resources/game/ASMJ/base/asmj_UIMJResultDetail${suffix}`
            : `native-ui/game/asmj/resources/game/ASMJ/base/asmj_UIMJWinLost${suffix}`;
        const prefab = await this.loadPrefab(path);
        if (this.resultNode?.isValid || !this.node.isValid) return;
        this.resultNode = instantiate(prefab);
        this.node.addChild(this.resultNode);
    }

    private loadCardFrame(cardId: number): Promise<SpriteFrame> {
        const cardType = Math.floor(cardId / 100);
        const name = String(cardType).padStart(2, '0');
        const path = `legacy-ui/asmj-source/${textureFolder[this.viewMode]}/hh_face_li_${name}/spriteFrame`;
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
