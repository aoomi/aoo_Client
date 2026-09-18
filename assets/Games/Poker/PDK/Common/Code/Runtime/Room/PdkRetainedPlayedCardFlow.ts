import { Layout, Node, UITransform } from 'cc';

export const PDK_RETAINED_HAND_GAP = 2;
export const PDK_PLAY_COUNT_RIGHT_INSET = 10;

/**
 * Attach the play index to the visual rightmost physical card. Once parented to
 * that card its position is stable through every hand/table move and seat scale.
 */
export function positionPdkPlayCount(count: Node, cards: readonly Node[]): void {
    const lastCard = [...cards].sort((left, right) => {
        const leftTransform = left.getComponent(UITransform);
        const rightTransform = right.getComponent(UITransform);
        const leftEdge = left.position.x + (leftTransform?.contentSize.width ?? 0)
            * (1 - (leftTransform?.anchorPoint.x ?? 0.5)) * Math.abs(left.scale.x);
        const rightEdge = right.position.x + (rightTransform?.contentSize.width ?? 0)
            * (1 - (rightTransform?.anchorPoint.x ?? 0.5)) * Math.abs(right.scale.x);
        return leftEdge - rightEdge;
    }).at(-1);
    if (!lastCard) return;
    const cardTransform = lastCard.getComponent(UITransform);
    const countTransform = count.getComponent(UITransform);
    if (!cardTransform || !countTransform) return;
    count.parent = lastCard;
    const cardRight = cardTransform.contentSize.width * (1 - cardTransform.anchorPoint.x);
    const cardTop = cardTransform.contentSize.height * (1 - cardTransform.anchorPoint.y);
    const countX = cardRight - PDK_PLAY_COUNT_RIGHT_INSET
        - countTransform.contentSize.width * (1 - countTransform.anchorPoint.x) * Math.abs(count.scale.x);
    const countY = cardTop
        - countTransform.contentSize.height * (1 - countTransform.anchorPoint.y) * Math.abs(count.scale.y);
    count.setPosition(countX, countY, 1);
}

/** Arrange one completed play without leaving its coordinates to a deferred Layout pass. */
export function layoutPdkRetainedHand(hand: Node, cards: readonly Node[], cardSpacing: number): void {
    const transform = hand.getComponent(UITransform) ?? hand.addComponent(UITransform);
    const firstSize = cards[0]?.getComponent(UITransform)?.contentSize;
    if (!firstSize || cards.length === 0) {
        transform.setContentSize(0, 0);
        return;
    }
    const step = firstSize.width + cardSpacing;
    const width = firstSize.width + Math.max(0, cards.length - 1) * Math.abs(step);
    const firstCenter = -((cards.length - 1) * step) / 2;
    transform.setContentSize(width, firstSize.height);
    cards.forEach((card, index) => {
        card.setPosition(firstCenter + index * step, card.position.y, card.position.z);
    });
}

/** Lay out complete played hands with an exact gap between their visible bounds. */
export function layoutPdkRetainedHands(tableCards: Node, gap = PDK_RETAINED_HAND_GAP): void {
    const automatic = tableCards.getComponent(Layout);
    const rightToLeft = automatic?.horizontalDirection === Layout.HorizontalDirection.RIGHT_TO_LEFT;
    if (automatic) automatic.enabled = false;
    const hands = tableCards.children.filter((child) =>
        child.active && child.name.startsWith('Play_') && child.getComponent(UITransform));
    if (hands.length === 0) return;
    const widths = hands.map((hand) => hand.getComponent(UITransform)!.contentSize.width);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0)
        + Math.max(0, hands.length - 1) * gap;
    // The authored Table_Cards position is the fixed edge. Left-to-right seats
    // grow only to its right; right-to-left seats grow only to its left.
    let cursor = 0;
    hands.forEach((hand, index) => {
        const width = widths[index];
        const center = rightToLeft ? cursor - width / 2 : cursor + width / 2;
        hand.setPosition(center, hand.position.y, hand.position.z);
        cursor += (width + gap) * (rightToLeft ? -1 : 1);
    });
    const tableTransform = tableCards.getComponent(UITransform);
    if (tableTransform) tableTransform.setContentSize(totalWidth, tableTransform.contentSize.height);
}

export interface PdkRetainedPlayedCardMove {
    outCard: Node;
    tableCards: Node;
    playCountTemplate: Node | null;
    operationId: string;
    playIndex: number;
    isCurrent: () => boolean;
}

/** Regional extension for moving a completed live play into a retained round archive. */
export interface PdkRetainedPlayedCardFlow {
    moveAfterLiveHold(request: PdkRetainedPlayedCardMove): Promise<boolean>;
    /** A new local play ends any preceding live hold, without skipping its move animation. */
    flushPendingHolds(releaseNextHold?: boolean): void;
    /** Lifecycle drain used only at hard round/settlement boundaries, never as an input barrier. */
    waitForPendingTransfers(): Promise<void>;
    addStoppedPlayCount(hand: Node, countTemplate: Node | null, playIndex: number): void;
}
