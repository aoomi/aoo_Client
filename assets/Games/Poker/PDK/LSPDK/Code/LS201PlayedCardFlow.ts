import { instantiate, Label, Layout, Node, tween, Tween, UITransform } from 'cc';
import type {
    PdkRetainedPlayedCardFlow,
    PdkRetainedPlayedCardMove,
} from '../../Common/Code/Runtime/Room/PdkRetainedPlayedCardFlow';
import {
    layoutPdkRetainedHand,
    layoutPdkRetainedHands,
    positionPdkPlayCount,
    setPdkRetainedPlayIndex,
} from '../../Common/Code/Runtime/Room/PdkRetainedPlayedCardFlow';

const OUT_CARD_HOLD_MS = 2000;
const MOVE_TO_ARRANGEMENT_SECONDS = 0.45;

/**
 * 凉山摆牌流程：公共层先把牌从手牌区移动到 Out_Card；本流程只接管后半段，
 * 让同一批实体牌在未缩放的出牌层保持两秒，再连续移动到 Table_Cards。每手牌
 * 立即取得独立暂存节点，后续出牌无需等待；实时流程禁止销毁后重建牌节点，
 * 断线恢复仍由权威历史重建。
 */
export class LS201PlayedCardFlow implements PdkRetainedPlayedCardFlow {
    private readonly pendingHoldReleases = new Set<() => void>();
    private readonly activeTransfers = new Set<Promise<void>>();
    private readonly activeOperations = new Map<string, Promise<boolean>>();
    private readonly pendingTransferFinishes = new Set<() => void>();
    private readonly transientHands = new Set<Node>();

    public flushPendingHolds(): void {
        for (const release of [...this.pendingHoldReleases]) release();
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

    public async finishPendingImmediately(): Promise<void> {
        this.flushPendingHolds();
        // Released holds resume in a microtask and register their card finishes.
        await Promise.resolve();
        for (const finish of [...this.pendingTransferFinishes]) finish();
        await this.waitForPendingTransfers();
    }

    public async cancelPendingForSettlement(): Promise<void> {
        await this.cancelPendingForRoundBoundary();
    }

    public async cancelPendingForRoundBoundary(): Promise<void> {
        // The controller invalidates the round lease before entering here. Detach
        // every physical hand synchronously; the remaining awaits only drain
        // callbacks that can no longer pass request.isCurrent().
        for (const hand of [...this.transientHands]) {
            for (const card of hand.children) Tween.stopAllByTarget(card);
            if (hand.isValid) {
                // destroy() is deferred until the end of the Cocos frame. Detach
                // synchronously so a completed-round hand cannot remain visible
                // in Table_Cards or be discovered by a late completion callback.
                hand.removeFromParent();
                hand.destroy();
            }
        }
        this.flushPendingHolds();
        await Promise.resolve();
        for (const finish of [...this.pendingTransferFinishes]) finish();
        await this.waitForPendingTransfers();
    }

    public async moveAfterLiveHold(request: PdkRetainedPlayedCardMove): Promise<boolean> {
        const active = this.activeOperations.get(request.operationId);
        if (active) return active;
        const operation = this.performMoveAfterLiveHold(request);
        this.activeOperations.set(request.operationId, operation);
        try {
            return await operation;
        } finally {
            if (this.activeOperations.get(request.operationId) === operation) {
                this.activeOperations.delete(request.operationId);
            }
        }
    }

    private async performMoveAfterLiveHold(request: PdkRetainedPlayedCardMove): Promise<boolean> {
        if (!request.isCurrent() || !request.outCard.isValid || !request.tableCards.isValid) return false;
        // Claim this operation's physical cards before its visual hold begins.
        // Out_Card is only the shared landing slot and must be released for the
        // following operation immediately, while the claimed nodes remain in an
        // unscaled sibling layer until their archive transfer really starts.
        const cards = request.outCard.children.filter((child) =>
            child.name !== 'PlayCount' && child.isValid);
        if (cards.length === 0) return false;
        const nodeName = `Play_${request.operationId}`;
        const retainedHand = request.tableCards.getChildByName(nodeName);
        if (retainedHand) {
            // Reconnect/history recovery can win the async race and manufacture
            // the destination group while this operation's physical Out_Card
            // nodes are still present. In that state the restored group is a
            // duplicate, not proof that movement completed. Remove it and let
            // the physical nodes below remain the single presentation owner.
            retainedHand.removeFromParent();
            retainedHand.destroy();
        }

        const landingPoses = cards.map((card) => ({
            position: card.worldPosition.clone(),
            scale: card.worldScale.clone(),
        }));
        const holdLayer = request.outCard.parent;
        if (!holdLayer?.isValid) return false;
        const hand = new Node(nodeName);
        // The two-second landing display must remain in the unscaled live-card
        // layer. Parenting it into Table_Cards here made Widget/layout refreshes
        // expose the archive scale before the transfer actually started.
        hand.parent = holdLayer;
        this.transientHands.add(hand);
        setPdkRetainedPlayIndex(hand, request.playIndex);
        hand.addComponent(UITransform).setContentSize(0, 0);
        for (const card of cards) card.parent = hand;
        cards.forEach((card, index) => {
            card.setWorldPosition(landingPoses[index].position);
            const parentScale = hand.worldScale;
            card.setScale(
                landingPoses[index].scale.x / (parentScale.x || 1),
                landingPoses[index].scale.y / (parentScale.y || 1),
                landingPoses[index].scale.z / (parentScale.z || 1),
            );
        });

        // A following operation can now reuse Out_Card immediately without
        // affecting this operation's independent landing timeline.
        request.outCard.active = request.outCard.children.some((child) =>
            child.isValid && child.name !== 'PlayCount');
        await new Promise<void>((resolve) => {
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
        if (!request.isCurrent() || !request.tableCards.isValid || !hand.isValid) {
            if (hand.isValid) {
                hand.removeFromParent();
                hand.destroy();
            }
            this.transientHands.delete(hand);
            return false;
        }

        const starts = cards.map((card) => ({
            position: card.worldPosition.clone(),
            scale: card.worldScale.clone(),
        }));
        request.tableCards.active = true;
        const outerLayout = request.tableCards.getComponent(Layout) ?? request.tableCards.addComponent(Layout);
        outerLayout.enabled = false;
        hand.parent = request.tableCards;
        // Archive card size is authored by Table_Cards' own scale. Never carry a
        // temporary hold-layer compensation into the retained local transform.
        for (const card of cards) card.setScale(1, 1, 1);
        layoutPdkRetainedHand(hand, cards, request.outCard.getComponent(Layout)?.spacingX ?? 0);
        layoutPdkRetainedHands(request.tableCards);
        const targets = cards.map((card) => ({ position: card.position.clone(), scale: card.scale.clone() }));
        // Only now does the operation enter the scaled archive hierarchy. Restore
        // its landing world pose after calculating the destination so the user
        // sees exactly one continuous Out_Card -> Table_Cards movement.
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
                this.pendingTransferFinishes.delete(finish);
                if (card.isValid) {
                    Tween.stopAllByTarget(card);
                    card.setPosition(targets[index].position);
                    card.setScale(targets[index].scale);
                }
                resolve();
            };
            const timeout = globalThis.setTimeout(finish, 700);
            this.pendingTransferFinishes.add(finish);
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
        this.transientHands.delete(hand);
        // Settlement/new-deal cleanup can run while the 0.45-second transfer is
        // already in progress. The tween finishers resolve normally, so validate
        // ownership again before adding PlayCount or reporting a successful move.
        if (!request.isCurrent() || !request.tableCards.isValid || !hand.isValid) {
            if (hand.isValid) {
                hand.removeFromParent();
                hand.destroy();
            }
            return false;
        }
        // Pointer belongs to a completed retained hand. Keep it hidden throughout
        // Out_Card hold and transfer; create it only after every card has stopped
        // in Table_Cards, then anchor it to the final rightmost card.
        this.addStoppedPlayCount(hand, request.playCountTemplate, request.playIndex);
        request.outCard.active = request.outCard.children.some((child) =>
            child.isValid && child.name !== 'PlayCount');
        return true;
    }

    public addStoppedPlayCount(hand: Node, countTemplate: Node | null, playIndex: number): void {
        if (!countTemplate || !Number.isSafeInteger(playIndex) || playIndex <= 0) return;
        const cards = hand.children.filter((child) => child.isValid);
        if (cards.length === 0) return;
        const nodeName = `PlayCount_${playIndex}`;
        // Reuse an existing nested node for idempotent authority recovery.
        const tableCards = hand.parent;
        const count = hand.children
            .find((child) => child.name === 'PlayCount' || child.name.startsWith('PlayCount_'))
            ?? tableCards?.getChildByName(nodeName)
            ?? instantiate(countTemplate);
        count.name = nodeName;
        count.active = true;
        positionPdkPlayCount(count, cards);
        const label = count.getComponent(Label) ?? count.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = String(playIndex);
    }
}
