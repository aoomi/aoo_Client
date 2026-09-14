export interface PdkHintRules {
    minimumStraightLength: number;
    minimumPairRunLength: number;
    allowTwoInRuns: boolean;
}

export interface PdkHintCandidate {
    cards: number[];
    order: number;
}

/**
 * Projects an exact card multiset onto hand slots. A Set/Array.includes projection
 * raises every duplicate-valued node even when the hint contains only one card.
 */
export function pdkSelectionMask(
    hand: readonly number[],
    selected: readonly number[],
): boolean[] {
    const remaining = new Map<number, number>();
    for (const raw of selected) {
        const card = Number(raw);
        remaining.set(card, (remaining.get(card) ?? 0) + 1);
    }
    return hand.map((raw) => {
        const card = Number(raw);
        const count = remaining.get(card) ?? 0;
        if (count <= 0) return false;
        if (count === 1) remaining.delete(card);
        else remaining.set(card, count - 1);
        return true;
    });
}

/** Multiset union capped by the physical cards in hand, preserving hand order. */
export function unionPdkSelection(
    current: readonly number[],
    added: readonly number[],
    hand: readonly number[],
): number[] {
    const wanted = new Map<number, number>();
    for (const source of [current, added]) {
        const counts = new Map<number, number>();
        for (const raw of source) {
            const card = Number(raw);
            counts.set(card, (counts.get(card) ?? 0) + 1);
        }
        for (const [card, count] of counts) wanted.set(card, Math.max(wanted.get(card) ?? 0, count));
    }
    const selected: number[] = [];
    for (const raw of hand) {
        const card = Number(raw);
        const count = wanted.get(card) ?? 0;
        if (count <= 0) continue;
        selected.push(card);
        if (count === 1) wanted.delete(card);
        else wanted.set(card, count - 1);
    }
    return selected;
}

export function isPdkResponseShape(
    candidateType: number,
    candidateCount: number,
    targetType: number,
    targetCount: number,
    bombType = 11,
): boolean {
    if (targetType <= 0) return candidateType > 0;
    if (candidateType === bombType) return true;
    return candidateType === targetType && candidateCount === targetCount;
}

export function largestLegalPdkSubsets(
    touched: readonly number[],
    rankLegal: (subsets: readonly number[][]) => number[][],
): number[][] {
    for (let size = touched.length; size >= 1; size -= 1) {
        const subsets: number[][] = [];
        const build = (start: number, indices: number[]): void => {
            if (indices.length === size) {
                subsets.push(indices.map((index) => touched[index]));
                return;
            }
            const needed = size - indices.length;
            for (let index = start; index <= touched.length - needed; index += 1) {
                indices.push(index);
                build(index + 1, indices);
                indices.pop();
            }
        };
        build(0, []);
        const legal = rankLegal(subsets);
        if (legal.length > 0) return legal;
    }
    return [];
}

interface HandQuality {
    turns: number;
    bombs: number;
    triples: number;
    runCards: number;
    pairRunCards: number;
    isolated: number;
}

const rank = (card: number): number => {
    const value = card > 500 ? card - 500 : card;
    return value >= 100 ? value % 100 : value & 0x0f;
};

/** Same-rank singles are never a legal response, regardless of suit or card encoding. */
export function isStrictlyHigherPdkSingle(candidate: number, target: number): boolean {
    return rank(Number(candidate)) > rank(Number(target));
}

function countsOf(cards: readonly number[]): number[] {
    const counts = Array<number>(16).fill(0);
    for (const card of cards) {
        const value = rank(Number(card));
        if (value >= 3 && value <= 15) counts[value] += 1;
    }
    return counts;
}

function subtract(hand: readonly number[], played: readonly number[]): number[] | null {
    const remaining = [...hand];
    for (const card of played) {
        const index = remaining.indexOf(card);
        if (index < 0) return null;
        remaining.splice(index, 1);
    }
    return remaining;
}

function splitBombCount(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    let split = 0;
    for (let value = 3; value <= 15; value += 1) {
        if (handCounts[value] === 4 && playedCounts[value] > 0 && playedCounts[value] < 4) split += 1;
    }
    return split;
}

/**
 * Count complete triples damaged only to supply an attachment/pair. A triple
 * played in full is the body of a legal triple family and is not damage.
 */
function splitTripleCount(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    let split = 0;
    for (let value = 3; value <= 15; value += 1) {
        if (handCounts[value] === 3 && playedCounts[value] > 0 && playedCounts[value] < 3) split += 1;
    }
    return split;
}

function completeBombCount(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    let complete = 0;
    for (let value = 3; value <= 15; value += 1) {
        if (handCounts[value] === 4 && playedCounts[value] === 4) complete += 1;
    }
    return complete;
}

function runs(counts: readonly number[], copies: number, minimum: number, allowTwo: boolean): Array<[number, number]> {
    const result: Array<[number, number]> = [];
    const maximum = allowTwo ? 15 : 14;
    for (let start = 3; start <= maximum; start += 1) {
        if (counts[start] < copies) continue;
        for (let end = start; end <= maximum && counts[end] >= copies; end += 1) {
            if (end - start + 1 >= minimum) result.push([start, end]);
        }
    }
    return result;
}

function minimumTurns(initial: readonly number[], rules: PdkHintRules): number {
    const memo = new Map<string, number>();
    const visit = (counts: number[]): number => {
        const key = counts.slice(3).join('');
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        const first = counts.findIndex((count, value) => value >= 3 && count > 0);
        if (first < 0) return 0;
        let best = 1 + visit(withRemoved(counts, first, 1));
        for (let copies = 2; copies <= Math.min(4, counts[first]); copies += 1) {
            best = Math.min(best, 1 + visit(withRemoved(counts, first, copies)));
        }
        for (const [start, end] of runs(counts, 1, rules.minimumStraightLength, rules.allowTwoInRuns)) {
            if (first < start || first > end) continue;
            best = Math.min(best, 1 + visit(withRunRemoved(counts, start, end, 1)));
        }
        for (const [start, end] of runs(counts, 2, rules.minimumPairRunLength, rules.allowTwoInRuns)) {
            if (first < start || first > end) continue;
            best = Math.min(best, 1 + visit(withRunRemoved(counts, start, end, 2)));
        }
        memo.set(key, best);
        return best;
    };
    return visit([...initial]);
}

function withRemoved(source: readonly number[], value: number, amount: number): number[] {
    const next = [...source];
    next[value] -= amount;
    return next;
}

function withRunRemoved(source: readonly number[], start: number, end: number, copies: number): number[] {
    const next = [...source];
    for (let value = start; value <= end; value += 1) next[value] -= copies;
    return next;
}

function quality(cards: readonly number[], rules: PdkHintRules): HandQuality {
    const counts = countsOf(cards);
    const straightCards = runs(counts, 1, rules.minimumStraightLength, rules.allowTwoInRuns)
        .reduce((best, [start, end]) => Math.max(best, end - start + 1), 0);
    const pairRunCards = runs(counts, 2, rules.minimumPairRunLength, rules.allowTwoInRuns)
        .reduce((best, [start, end]) => Math.max(best, (end - start + 1) * 2), 0);
    return {
        turns: minimumTurns(counts, rules),
        bombs: counts.filter((count) => count === 4).length,
        triples: counts.filter((count) => count === 3).length,
        runCards: straightCards,
        pairRunCards,
        isolated: counts.filter((count) => count === 1).length,
    };
}

export function scorePdkRemainingHand(cards: readonly number[], rules: PdkHintRules): HandQuality {
    return quality(cards, rules);
}

export function rankCleanPdkHints(
    hand: readonly number[],
    candidates: readonly PdkHintCandidate[],
    rules: PdkHintRules,
    preferLargest = false,
): number[][] {
    const normalizedRules: PdkHintRules = {
        minimumStraightLength: Math.max(3, Math.trunc(rules.minimumStraightLength)),
        minimumPairRunLength: Math.max(2, Math.trunc(rules.minimumPairRunLength)),
        allowTwoInRuns: Boolean(rules.allowTwoInRuns),
    };
    return candidates
        .map((candidate) => {
            const remaining = subtract(hand, candidate.cards);
            return remaining ? {
                ...candidate,
                splitBombs: splitBombCount(hand, candidate.cards),
                splitTriples: splitTripleCount(hand, candidate.cards),
                completeBombs: completeBombCount(hand, candidate.cards),
                quality: quality(remaining, normalizedRules),
            } : null;
        })
        .filter((value): value is PdkHintCandidate & { splitBombs: number; splitTriples: number; completeBombs: number; quality: HandQuality } => value !== null)
        .sort((left, right) => {
            const a = left.quality;
            const b = right.quality;
            return left.splitBombs - right.splitBombs
                || left.splitTriples - right.splitTriples
                || (!preferLargest ? left.completeBombs - right.completeBombs : 0)
                || (preferLargest ? right.cards.length - left.cards.length : 0)
                || a.turns - b.turns
                || b.bombs - a.bombs
                || b.triples - a.triples
                || b.pairRunCards - a.pairRunCards
                || b.runCards - a.runCards
                || Math.min(...left.cards.map(rank)) - Math.min(...right.cards.map(rank))
                // Across every structurally equivalent hint, prefer the play
                // leaving fewer loose single ranks. This deliberately follows
                // runs/pairs/triples: a card inside a complete straight is not
                // a disposable singleton merely because its rank count is one.
                || a.isolated - b.isolated
                // When the remaining structures are equally clean, consume the
                // lower loose attachments first. For example 101010+5+J keeps A,
                // while 101010+5+A unnecessarily leaves the lower J singleton.
                || left.cards.reduce((sum, card) => sum + rank(card), 0)
                    - right.cards.reduce((sum, card) => sum + rank(card), 0)
                || left.cards.length - right.cards.length
                || left.order - right.order;
        })
        .map((candidate) => candidate.cards);
}
