import { _decorator, Component, Label, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import {
    ScjymjDissolveState,
    ScjymjPlayEvents,
    ScjymjPlayStateController,
    ScjymjRoomHeader,
} from './ScjymjPlayStateController';
import { ScjymjRuntime } from './ScjymjRuntime';

const { ccclass, property } = _decorator;

/** Native Creator 3.8.8 view shared by SCJYMJ 3D, 2D and XY tables. */
@ccclass('ScjymjPlayView')
export class ScjymjPlayView extends Component {
    @property(Label)
    public roomIdLabel: Label | null = null;

    @property(Label)
    public roundLabel: Label | null = null;

    @property(Label)
    public remainingLabel: Label | null = null;

    @property(Node)
    public roomInfo: Node | null = null;

    @property(Node)
    public trusteeship: Node | null = null;

    @property(Node)
    public dissolvePanel: Node | null = null;

    private controller: ScjymjPlayStateController | null = null;
    private runtime: ScjymjRuntime | null = null;
    private handRoot: Node | null = null;
    private selectedCard: Node | null = null;
    private handSignature = '';
    private syncElapsed = 0;

    public bind(controller: ScjymjPlayStateController, runtime?: ScjymjRuntime): void {
        if (this.controller === controller) {
            this.runtime = runtime ?? this.runtime;
            this.renderHand();
            return;
        }
        this.unbind();
        this.controller = controller;
        this.runtime = runtime ?? null;
        controller.events.on(ScjymjPlayEvents.RoomHeaderChanged, this.onRoomHeader, this);
        controller.events.on(ScjymjPlayEvents.RemainingCardsChanged, this.onRemainingCards, this);
        controller.events.on(ScjymjPlayEvents.TrusteeshipChanged, this.onTrusteeship, this);
        controller.events.on(ScjymjPlayEvents.DissolveChanged, this.onDissolve, this);
        controller.events.on(ScjymjPlayEvents.SetStarted, this.renderHand, this);
        controller.events.on(ScjymjPlayEvents.CardDrawn, this.renderHand, this);
    }

    public unbind(): void {
        if (!this.controller) return;
        this.controller.events.targetOff(this);
        this.controller = null;
        this.runtime = null;
        this.clearHand();
    }

    protected override onDisable(): void {
        this.unbind();
    }

    protected override onDestroy(): void {
        this.unbind();
    }

    protected override update(deltaTime: number): void {
        if (!this.runtime) return;
        this.syncElapsed += deltaTime;
        if (this.syncElapsed < 0.5) return;
        this.syncElapsed = 0;
        const setPos = this.runtime.getRoom().GetClientPlayerSetPos();
        const cards = [...(setPos?.GetSetPosProperty('shouCard') ?? [])] as number[];
        const handCard = Number(setPos?.GetSetPosProperty('handCard') ?? 0);
        if (handCard > 0) cards.push(handCard);
        const signature = cards.join(',');
        if (signature && signature !== this.handSignature) this.renderHand();
    }

    private onRoomHeader(header: ScjymjRoomHeader): void {
        if (this.roomInfo) this.roomInfo.active = true;
        if (this.roomIdLabel) this.roomIdLabel.string = `房间号：${header.roomId}`;
        if (this.roundLabel) this.roundLabel.string = `${header.currentSet}/${header.totalSet}`;
    }

    private onRemainingCards(count: number): void {
        if (this.remainingLabel) this.remainingLabel.string = String(count);
    }

    private onTrusteeship(active: boolean): void {
        if (this.trusteeship) this.trusteeship.active = active;
    }

    private onDissolve(state: ScjymjDissolveState): void {
        if (this.dissolvePanel) {
            this.dissolvePanel.active = Boolean(state.endSec || state.posAgreeList?.length);
        }
    }

    public renderHand(): void {
        const setPos = this.runtime?.getRoom().GetClientPlayerSetPos();
        const cards = [...(setPos?.GetSetPosProperty('shouCard') ?? [])] as number[];
        const handCard = Number(setPos?.GetSetPosProperty('handCard') ?? 0);
        if (handCard > 0) cards.push(handCard);
        cards.sort((a, b) => Math.floor(a / 100) - Math.floor(b / 100) || a - b);
        const signature = cards.join(',');
        if (signature === this.handSignature && this.handRoot) return;
        const root = this.findNode(this.node, 'card01');
        if (!root) return;
        this.clearHand();
        this.handSignature = signature;
        this.handRoot = root;
        const spacing = Math.min(58, 760 / Math.max(cards.length, 1));
        const startX = -spacing * (cards.length - 1) / 2;
        cards.forEach((cardId, index) => this.createCard(root, cardId, startX + index * spacing));
    }

    private createCard(root: Node, cardId: number, x: number): void {
        const node = new Node(`hand_${cardId}`);
        node.addComponent(UITransform).setContentSize(93, 145);
        const sprite = node.addComponent(Sprite);
        node.setPosition(x, 0, 0);
        root.addChild(node);
        const cardType = String(Math.floor(cardId / 100)).padStart(2, '0');
        resources.load(
            `legacy-ui/scjymj-source/game/SCJYMJ/texture/majiang/self/show/hh_face_li_${cardType}/spriteFrame`,
            SpriteFrame,
            (error, frame) => {
                if (!error && frame && node.isValid) sprite.spriteFrame = frame;
            },
        );
        node.on(Node.EventType.TOUCH_END, () => {
            if (this.selectedCard === node) {
                this.runtime?.getRoomManager().SendPosAction(cardId, 7);
                node.setPosition(x, 0, 0);
                this.selectedCard = null;
                return;
            }
            if (this.selectedCard) {
                const old = this.selectedCard.position;
                this.selectedCard.setPosition(old.x, 0, old.z);
            }
            node.setPosition(x, 28, 0);
            this.selectedCard = node;
        });
    }

    private clearHand(): void {
        this.selectedCard = null;
        this.handSignature = '';
        if (!this.handRoot) return;
        for (const child of [...this.handRoot.children]) {
            if (child.name.startsWith('hand_')) child.destroy();
        }
    }

    private findNode(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findNode(child, name);
            if (found) return found;
        }
        return null;
    }
}
