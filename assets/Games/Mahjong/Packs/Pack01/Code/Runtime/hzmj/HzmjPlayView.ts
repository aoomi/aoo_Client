import { _decorator, Button, Component, instantiate, Layout, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import { settlementTemplateResolver } from '../../../../../../Common/Code/Settlement/SettlementTemplateResolver';
import type { HzmjRuntime } from './HzmjRuntime';
import { HzmjPlayStateController, type HzmjPlaySnapshot } from './HzmjPlayStateController';
import type { HzmjViewMode } from './HzmjSceneBootstrap';
import { HzmjTableController } from './HzmjTableController';
import { HZMJ_OPERATION, passOperation } from './HzmjOperationPolicy';

const { ccclass } = _decorator;

const operationsByButton: Record<string, readonly number[]> = {
    btn_next: [HZMJ_OPERATION.PASS, HZMJ_OPERATION.SQ_PASS],
    btn_pen: [HZMJ_OPERATION.PENG],
    btn_gang: [HZMJ_OPERATION.GANG, HZMJ_OPERATION.JIE_GANG, HZMJ_OPERATION.AN_GANG],
    btn_chi: [HZMJ_OPERATION.CHI],
    btn_hu: [HZMJ_OPERATION.HU, HZMJ_OPERATION.QIANG_GANG_HU],
};

const textureFolder: Record<HzmjViewMode, string> = {
    '2d': 'texture/game/majiang/self2d/show',
    xy: 'texture/game/majiang/selfXY/show',
    wz: 'texture/game/majiang/selfWZ/show',
    yx: 'texture/game/YX/majiang/self/show',
};

/** Native Creator 3.8.8 binder shared by all four migrated HZMJ table prefabs. */
@ccclass('HzmjPlayView')
export class HzmjPlayView extends Component {
    private runtime: HzmjRuntime | null = null;
    private state: HzmjPlayStateController | null = null;
    private viewMode: HzmjViewMode = '2d';
    private generation = 0;
    private resultNode: Node | null = null;
    private table: HzmjTableController | null = null;
    private operationPending = false;
    private canDiscard = false;
    private allowedOperations: readonly number[] = [];

    public initialize(runtime: HzmjRuntime, viewMode: HzmjViewMode): void {
        this.runtime = runtime;
        this.viewMode = viewMode;
        this.state = new HzmjPlayStateController(runtime);
        this.table = new HzmjTableController(this.node, runtime, (message) => this.node.emit('legacy-hzmj-message', message));
        this.bindOperationButtons();
        this.node.on('legacy-hzmj-event', this.onRoomEvent, this);
    }

    public renderRoom(): void {
        const snapshot = this.state?.refreshFromRoom();
        if (snapshot) void this.render(snapshot);
    }

    protected override onDestroy(): void {
        this.generation += 1;
        this.node.off('legacy-hzmj-event', this.onRoomEvent, this);
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

    private async render(snapshot: HzmjPlaySnapshot): Promise<void> {
        const generation = ++this.generation;
        this.canDiscard = snapshot.canDiscard;
        this.allowedOperations = snapshot.availableOperations;
        await this.renderHand(snapshot.hand, generation);
        if (generation !== this.generation || !this.node.isValid) return;
        this.renderOperations(snapshot.availableOperations);
        if (snapshot.phase === 'settled' || snapshot.phase === 'ended') await this.showResult(snapshot.phase, generation);
    }

    private async renderHand(cards: readonly number[], generation: number): Promise<void> {
        const parent = this.ensureHandContainer();
        parent.removeAllChildren();
        for (const cardId of cards) {
            const card = new Node(`card_${cardId}`);
            const transform = card.addComponent(UITransform);
            transform.setContentSize(68, 94);
            const sprite = card.addComponent(Sprite);
            const button = card.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            card.on(Button.EventType.CLICK, () => { void this.submit(cardId, HZMJ_OPERATION.OUT); }, this);
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
            const operations = operationsByButton[node.name];
            if (!operations) return;
            node.active = false;
            node.getComponent(Button) ?? node.addComponent(Button);
            node.on(Button.EventType.CLICK, () => {
                const operation = node.name === 'btn_next'
                    ? passOperation(this.allowedOperations)
                    : operations.find((candidate) => this.allowedOperations.includes(candidate)) ?? 0;
                if (operation) void this.submit(0, operation);
            }, this);
        });
    }

    private renderOperations(operations: readonly number[]): void {
        const allowed = new Set(operations);
        this.walk(this.node, (node) => {
            const candidates = operationsByButton[node.name];
            if (!candidates) return;
            node.active = candidates.some((operation) => allowed.has(operation));
            const button = node.getComponent(Button);
            if (button) button.interactable = !this.operationPending;
        });
    }

    private async submit(cardId: number, operation: number): Promise<void> {
        if (!this.runtime || this.operationPending) return;
        if (operation === HZMJ_OPERATION.OUT && !this.canDiscard) return;
        if (!this.allowedOperations.includes(operation)) return;
        const generation = this.generation;
        this.operationPending = true;
        this.renderOperations(this.allowedOperations);
        this.setHandInteractable(false);
        let succeeded = false;
        try {
            await this.runtime.operate(cardId, operation);
            succeeded = true;
        } catch (error: unknown) {
            if (generation === this.generation && this.node.isValid) {
                this.node.emit('legacy-hzmj-message', error instanceof Error ? error.message : '红中麻将操作失败');
            }
        } finally {
            if (generation === this.generation && this.node.isValid) {
                this.operationPending = false;
                if (succeeded) {
                    this.allowedOperations = [];
                    this.canDiscard = false;
                }
                this.renderOperations(this.allowedOperations);
                this.setHandInteractable(this.canDiscard);
            }
        }
    }

    private setHandInteractable(interactable: boolean): void {
        const hand = this.node.getChildByPath('cardNodes/card01/NativeHand');
        this.walk(hand ?? this.node, (node) => {
            if (!node.name.startsWith('card_')) return;
            const button = node.getComponent(Button);
            if (button) button.interactable = interactable;
        });
    }

    private async showResult(phase: 'settled' | 'ended', generation: number): Promise<void> {
        if (this.resultNode?.isValid) return;
        const templates = phase === 'ended'
            ? { '2d': 'BigSettleTpl_211', xy: 'BigSettleTpl_213', wz: 'BigSettleTpl_212', yx: 'BigSettleTpl_214' }
            : { '2d': 'SmallSettleTpl_114', xy: 'SmallSettleTpl_116', wz: 'SmallSettleTpl_115', yx: 'SmallSettleTpl_117' };
        const { prefab } = await settlementTemplateResolver.load({
            gameId: 'hzmj', settlementType: phase === 'ended' ? 'BIG' : 'SMALL',
            configuredTemplateId: templates[this.viewMode], playVersion: 'legacy-equivalent-1',
        });
        if (generation !== this.generation || this.resultNode?.isValid || !this.node.isValid) return;
        this.resultNode = instantiate(prefab);
        this.node.addChild(this.resultNode);
    }

    private loadCardFrame(cardId: number): Promise<SpriteFrame> {
        const cardType = Math.floor(cardId / 100);
        const name = String(cardType).padStart(2, '0');
        const path = `legacy-ui/hzmj-source/${textureFolder[this.viewMode]}/hh_face_li_${name}/spriteFrame`;
        return new Promise((resolve, reject) => {
            resources.load(path, SpriteFrame, (error, frame) => error ? reject(error) : resolve(frame));
        });
    }


    private walk(root: Node, visit: (node: Node) => void): void {
        visit(root);
        for (const child of root.children) this.walk(child, visit);
    }
}
