import { instantiate, Label, Layout, Node, tween, Tween, UITransform } from 'cc';
import type {
    PdkRetainedPlayedCardFlow,
    PdkRetainedPlayedCardMove,
} from '../../Common/Code/Runtime/Room/PdkRetainedPlayedCardFlow';
import {
    layoutPdkRetainedHand,
    layoutPdkRetainedHands,
    positionPdkPlayCount,
} from '../../Common/Code/Runtime/Room/PdkRetainedPlayedCardFlow';

const OUT_CARD_HOLD_MS = 2000;
const MOVE_TO_ARRANGEMENT_SECONDS = 0.45;

/**
 * 凉山摆牌流程：公共层先把牌从手牌区移动到 Out_Card；本流程只接管后半段，
 * 让同一批实体牌在出牌区停满两秒，再连续移动到 Table_Cards。实时流程禁止
 * 销毁后重建牌节点，断线恢复仍由权威历史重建。
 */
export class LS201PlayedCardFlow implements PdkRetainedPlayedCardFlow {
    private readonly pendingHoldReleases = new Set<() => void>();
    private readonly activeTransfers = new Set<Promise<void>>();
    private releaseNextHold = false;

    public flushPendingHolds(releaseNextHold = false): void {
        const released = this.pendingHoldReleases.size > 0;
        for (const release of [...this.pendingHoldReleases]) release();
        if (!released && releaseNextHold) this.releaseNextHold = true;
    }

    public async waitForPendingTransfers(): Promise<void> {
        // A released hold resumes on the next microtask and registers its move.
        // Yield once before sampling, then drain again if another released hold
        // joined while the first transfer was completing.
        await Promise.resolve();
        while (this.activeTransfers.size > 0) {
            await Promise.all([...this.activeTransfers]);
        }
    }

    public async moveAfterLiveHold(request: PdkRetainedPlayedCardMove): Promise<boolean> {
        if (!request.isCurrent() || !request.outCard.isValid || !request.tableCards.isValid) return false;
        // Lock this operation's physical cards when its Out_Card hold begins.
        // Out_Card is a shared live slot: reading children after the delay can
        // accidentally capture the next operation that landed during this hold.
        const cards = request.outCard.children.filter((child) =>
            child.name !== 'PlayCount' && child.isValid);
        if (cards.length === 0) return false;
        const nodeName = `Play_${request.operationId}`;
        const retainedHand = request.tableCards.getChildByName(nodeName);
        if (retainedHand) {
            this.addStoppedPlayCount(retainedHand, request.playCountTemplate, request.playIndex);
            layoutPdkRetainedHands(request.tableCards);
            return true;
        }

        const releaseImmediately = this.releaseNextHold;
        this.releaseNextHold = false;
        if (!releaseImmediately) await new Promise<void>((resolve) => {
            let settled = false;
            const finish = (): void => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                this.pendingHoldReleases.delete(finish);
                resolve();
            };
            const timeout = globalThis.setTimeout(finish, OUT_CARD_HOLD_MS);
            this.pendingHoldReleases.add(finish);
        });
        if (!request.isCurrent() || !request.outCard.isValid || !request.tableCards.isValid) return false;
        // A newer authority projection may have replaced this live slot while
        // the hold was pending. Never steal nodes that no longer belong to it.
        if (cards.some((card) => !card.isValid || card.parent !== request.outCard)) return false;
        const recoveredHand = request.tableCards.getChildByName(nodeName);
        if (recoveredHand) {
            this.addStoppedPlayCount(recoveredHand, request.playCountTemplate, request.playIndex);
            layoutPdkRetainedHands(request.tableCards);
            return true;
        }

        const starts = cards.map((card) => ({
            position: card.worldPosition.clone(),
            scale: card.worldScale.clone(),
        }));
        request.tableCards.active = true;
        const outerLayout = request.tableCards.getComponent(Layout) ?? request.tableCards.addComponent(Layout);
        outerLayout.enabled = false;

        const hand = new Node(nodeName);
        hand.parent = request.tableCards;
        hand.addComponent(UITransform).setContentSize(0, 0);
        for (const card of cards) card.parent = hand;
        layoutPdkRetainedHand(hand, cards, request.outCard.getComponent(Layout)?.spacingX ?? 0);
        layoutPdkRetainedHands(request.tableCards);

        const targets = cards.map((card) => ({ position: card.position.clone(), scale: card.scale.clone() }));
        // The final layout is now known. Freeze it while the actual cards travel
        // from their saved Out_Card world transforms to those authored targets.
        cards.forEach((card, index) => {
            card.setWorldPosition(starts[index].position);
            const parentScale = hand.worldScale;
            card.setScale(
                starts[index].scale.x / (parentScale.x || 1),
                starts[index].scale.y / (parentScale.y || 1),
                starts[index].scale.z / (parentScale.z || 1),
            );
        });

        const transfer = Promise.all(cards.map((card, index) => new Promise<void>((resolve) => {
            let settled = false;
            const finish = (): void => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                resolve();
            };
            const timeout = globalThis.setTimeout(finish, 700);
            tween(card).to(MOVE_TO_ARRANGEMENT_SECONDS, {
                position: targets[index].position,
                scale: targets[index].scale,
            }, { easing: 'quadInOut' }).call(finish).start();
        }))).then(() => undefined);
        this.activeTransfers.add(transfer);
        try {
            await transfer;
        } finally {
            this.activeTransfers.delete(transfer);
        }
        if (!request.isCurrent()) {
            for (const card of cards) Tween.stopAllByTarget(card);
            return false;
        }
        // The hand number is not part of the flight. Match SmallSettlement:
        // create one Count only after this complete hand has stopped in its
        // retained position, and anchor it over the last card of that hand.
        const countTemplate = request.playCountTemplate;
        this.addStoppedPlayCount(hand, countTemplate, request.playIndex);
        request.outCard.active = request.outCard.children.some((child) =>
            child.isValid && child.name !== 'PlayCount');
        return true;
    }

    public addStoppedPlayCount(hand: Node, countTemplate: Node | null, playIndex: number): void {
        if (!countTemplate || !Number.isSafeInteger(playIndex) || playIndex <= 0) return;
        const cards = hand.children.filter((child) => child.isValid);
        if (cards.length === 0) return;
        const nodeName = `PlayCount_${playIndex}`;
        // PlayCount belongs only to a stopped retained hand. Reuse an existing
        // nested node for idempotent authority recovery; the live Out_Card path
        // deliberately has no badge, so its first completed move clones one.
        const count = cards
            .flatMap((card) => card.children)
            .find((child) => child.name === 'PlayCount' || child.name.startsWith('PlayCount_'))
            ?? instantiate(countTemplate);
        count.name = nodeName;
        count.active = true;
        positionPdkPlayCount(count, cards);
        const label = count.getComponent(Label) ?? count.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = String(playIndex);
    }
}
