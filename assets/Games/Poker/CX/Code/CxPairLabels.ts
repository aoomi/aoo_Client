/**
 * CD299's display names for the authoritative 510042 pair ordering.
 * The rows are rule data, not a second game evaluator: settlement and pair
 * comparison remain exclusively on the server. Keep this projection in sync
 * with Server/server/CD299/.../card-type-order.txt and XQP language_2.txt.
 */
type CardPattern = readonly [firstSuit: number, secondSuit: number, value: number];
type SpecialPair = Readonly<{ type: number; name: string; first: CardPattern; second: CardPattern }>;

const SPECIAL_PAIRS: readonly SpecialPair[] = Object.freeze([
    { type: 1, name: '丁二皇', first: [2, 2, 3], second: [5, 5, 6] },
    { type: 2, name: '天牌', first: [2, 4, 12], second: [2, 4, 12] },
    { type: 3, name: '地牌', first: [2, 4, 2], second: [2, 4, 2] },
    { type: 4, name: '人牌', first: [2, 4, 8], second: [2, 4, 8] },
    { type: 5, name: '和牌', first: [2, 4, 4], second: [2, 4, 4] },
    { type: 6, name: '梅十', first: [1, 3, 10], second: [1, 3, 10] },
    { type: 6, name: '板凳', first: [1, 3, 4], second: [1, 3, 4] },
    { type: 6, name: '长三', first: [1, 3, 6], second: [1, 3, 6] },
    { type: 7, name: '虎头', first: [1, 3, 11], second: [1, 3, 11] },
    { type: 7, name: '苕十', first: [2, 4, 10], second: [2, 4, 10] },
    { type: 7, name: '猫猫', first: [2, 4, 6], second: [2, 4, 6] },
    { type: 7, name: '膏药', first: [2, 4, 7], second: [2, 4, 7] },
    { type: 8, name: '对子', first: [1, 3, 5], second: [1, 3, 5] },
    { type: 8, name: '对子', first: [1, 3, 7], second: [1, 3, 7] },
    { type: 8, name: '对子', first: [1, 3, 8], second: [1, 3, 8] },
    { type: 8, name: '对子', first: [1, 3, 9], second: [1, 3, 9] },
    { type: 9, name: '天九王', first: [2, 4, 12], second: [1, 3, 9] },
    { type: 10, name: '地九王', first: [2, 4, 2], second: [1, 3, 9] },
    { type: 11, name: '天杠', first: [2, 4, 12], second: [1, 3, 8] },
    { type: 11, name: '天杠', first: [2, 4, 12], second: [2, 4, 8] },
    { type: 12, name: '地杠', first: [2, 4, 2], second: [1, 3, 8] },
    { type: 12, name: '地杠', first: [2, 4, 2], second: [2, 4, 8] },
    { type: 13, name: '天关九', first: [2, 4, 12], second: [1, 3, 7] },
    { type: 13, name: '天关九', first: [2, 4, 12], second: [2, 4, 7] },
    { type: 14, name: '地关九', first: [2, 4, 2], second: [1, 3, 7] },
    { type: 14, name: '地关九', first: [2, 4, 2], second: [2, 4, 7] },
    { type: 15, name: '灯笼九', first: [1, 3, 11], second: [2, 4, 8] },
    { type: 16, name: '和五九', first: [2, 4, 4], second: [1, 3, 5] },
    { type: 17, name: '板五九', first: [1, 3, 4], second: [1, 3, 5] },
    { type: 17, name: '丁长九', first: [2, 2, 3], second: [1, 3, 6] },
    { type: 17, name: '梅十九', first: [1, 3, 10], second: [1, 3, 9] },
    { type: 18, name: '丁猫九', first: [2, 2, 3], second: [2, 4, 6] },
    { type: 18, name: '乌龙九', first: [1, 3, 11], second: [1, 3, 8] },
    { type: 18, name: '苕十九', first: [2, 4, 10], second: [1, 3, 9] },
]);

function matches(card: number, pattern: CardPattern): boolean {
    const suit = Math.floor(card / 100);
    return card % 100 === pattern[2] && (suit === pattern[0] || suit === pattern[1]);
}

/** Pure UI projection; invalid cards are rejected instead of mislabeled. */
export function cd299PairTypeLabel(cards: readonly number[], earthNineKing: boolean): string {
    if (cards.length !== 2 || cards[0] === cards[1]
        || cards.some(card => !Number.isInteger(card) || card < 100 || card > 599)) {
        throw new Error(`[CD299] pair label requires two distinct valid cards: ${cards.join(',')}`);
    }
    for (const pair of SPECIAL_PAIRS) {
        if (!earthNineKing && pair.type === 10) continue;
        if (cards.every(card => matches(card, pair.first) || matches(card, pair.second))) {
            return pair.name;
        }
    }
    return `${(cards[0] % 100 + cards[1] % 100) % 10}点`;
}
