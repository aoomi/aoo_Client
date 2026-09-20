import { Layout, Node, UITransform, Vec3 } from 'cc';

export const PDK_RETAINED_HAND_GAP = 2;
export const PDK_PLAY_COUNT_RIGHT_INSET = 0;
const retainedPlayIndexes = new WeakMap<Node, number>();

/** Register Authority's immutable play order before any asynchronous movement. */
export function setPdkRetainedPlayIndex(hand: Node, playIndex: number): void {
    if (!Number.isSafeInteger(playIndex) || playIndex <= 0) return;
    retainedPlayIndexes.set(hand, playIndex);
}

/**
 * Position the play index inside the visual rightmost physical card's lower-right
 * corner, with the badge's bottom and right edges flush with the card. Counts live
 * directly under Table_Cards and are raised after every hand, so a later hand
 * cannot cover an earlier hand's badge on left-to-right local layouts.
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
    const hand = lastCard.parent;
    const tableCards = hand?.parent;
    const tableTransform = tableCards?.getComponent(UITransform);
    if (!hand || !tableCards || !tableTransform) return;
    count.parent = tableCards;
    // Seats may mirror or scale their card containers. Resolve the visible corner
    // from world bounds so "lower-right" always means screen lower-right rather
    // than the card hierarchy's potentially inverted local Y direction.
    const cardBounds = cardTransform.getBoundingBoxToWorld();
    const countWidth = countTransform.contentSize.width * Math.abs(count.worldScale.x);
    const countHeight = countTransform.contentSize.height * Math.abs(count.worldScale.y);
    const worldPosition = new Vec3(
        cardBounds.xMax - PDK_PLAY_COUNT_RIGHT_INSET - countWidth * (1 - countTransform.anchorPoint.x),
        cardBounds.yMin + countHeight * countTransform.anchorPoint.y,
        1,
    );
    count.setPosition(tableTransform.convertToNodeSpaceAR(worldPosition));
    for (const badge of tableCards.children.filter((child) => child.name.startsWith('PlayCount_'))) {
        badge.setSiblingIndex(tableCards.children.length - 1);
    }
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
        child.active && child.name.startsWith('Play_') && child.getComponent(UITransform))
        .map((hand, siblingIndex) => ({
            hand,
            siblingIndex,
            playIndex: retainedPlayIndexes.get(hand) ?? Number.MAX_SAFE_INTEGER,
        }))
        .sort((left, right) => left.playIndex - right.playIndex
            || left.siblingIndex - right.siblingIndex)
        .map(({ hand }) => hand);
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
    // PlayCount nodes live directly under Table_Cards so later hands cannot
    // cover them. Consequently they do not inherit a hand's position change;
    // re-anchor every badge after the complete hand layout has settled.
    for (const hand of hands) {
        const playIndex = retainedPlayIndexes.get(hand);
        if (!playIndex) continue;
        const badge = tableCards.getChildByName(`PlayCount_${playIndex}`);
        if (!badge) continue;
        positionPdkPlayCount(badge, hand.children.filter((child) => child.isValid));
    }
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
    /** A new local play may end holds that are already active; future plays are never pre-released. */
    flushPendingHolds(): void;
    /** Lifecycle drain used only at hard round/settlement boundaries, never as an input barrier. */
    waitForPendingTransfers(): Promise<void>;
    /** End unfinished visual-only holds/moves at their authored destination without delaying gameplay. */
    finishPendingImmediately(): Promise<void>;
    addStoppedPlayCount(hand: Node, countTemplate: Node | null, playIndex: number): void;
}
