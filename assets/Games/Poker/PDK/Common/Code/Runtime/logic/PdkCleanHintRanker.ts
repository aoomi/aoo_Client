export interface PdkHintRules {
    minimumStraightLength: number;
    minimumPairRunLength: number;
    allowTwoInRuns: boolean;
    /** Exact physical card groups that the active regional rules classify as bombs. */
    protectedBombs?: readonly (readonly number[])[];
    /** Loose singles that one preserved triple can legally absorb on a later play. */
    singleAttachmentCapacityPerTriple?: number;
    /** Multi-card responses rank the resulting loose-single count before structures. */
    prioritizeLooseSingles?: boolean;
}

export interface PdkHintCandidate {
    cards: number[];
    order: number;
    /** This legal regional shape deliberately consumes all four cards as its body. */
    usesFourCardBody?: boolean;
    /** Playing this candidate leaves one complete legal play. */
    finishesInTwo?: boolean;
    /** Candidate contains a rank that is maximal for its multiplicity in the regional deck. */
    containsRuleMaximum?: boolean;
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
    airplaneCards: number;
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

/** Single-response candidates never split a complete regional bomb. */
export function pdkSingleResponseCandidates(
    hand: readonly number[],
    target: number,
    protectedBombs: readonly (readonly number[])[],
): number[][] {
    const protectedCards = new Set(protectedBombs.flatMap((group) => group.map(Number)));
    return hand.map(Number)
        .filter((card) => isStrictlyHigherPdkSingle(card, target) && !protectedCards.has(card))
        .map((card) => [card]);
}

export function isRegionalMaximumPdkCombination(
    cards: readonly number[],
    deck: readonly number[],
): boolean {
    const deckCounts = new Map<number, number>();
    for (const card of deck) {
        const cardRank = rank(Number(card));
        deckCounts.set(cardRank, (deckCounts.get(cardRank) ?? 0) + 1);
    }
    const playedCounts = new Map<number, number>();
    for (const card of cards) {
        const cardRank = rank(Number(card));
        playedCounts.set(cardRank, (playedCounts.get(cardRank) ?? 0) + 1);
    }
    return [...playedCounts].some(([cardRank, count]) => {
        const maximum = Math.max(-Infinity, ...[...deckCounts]
            .filter(([, available]) => available >= count)
            .map(([candidateRank]) => candidateRank));
        return cardRank === maximum;
    });
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

function containsCards(source: readonly number[], wanted: readonly number[]): boolean {
    return subtract(source, wanted) !== null;
}

function protectedBombImpact(
    hand: readonly number[],
    played: readonly number[],
    protectedBombs: readonly (readonly number[])[],
): { split: number; consumed: number } {
    let split = 0;
    let consumed = 0;
    for (const group of protectedBombs) {
        if (group.length < 3 || !containsCards(hand, group)) continue;
        const remainingPlayed = [...played];
        let overlap = 0;
        for (const card of group) {
            const index = remainingPlayed.indexOf(card);
            if (index < 0) continue;
            overlap += 1;
            remainingPlayed.splice(index, 1);
        }
        if (overlap > 0 && overlap < group.length) split += 1;
        else if (overlap === group.length) consumed += 1;
    }
    return { split, consumed };
}

function ordinaryBombGroups(cards: readonly number[]): number[][] {
    const groups = new Map<number, number[]>();
    for (const card of cards) {
        const value = rank(Number(card));
        const group = groups.get(value) ?? [];
        group.push(Number(card));
        groups.set(value, group);
    }
    return [...groups.values()].filter((group) => group.length === 4);
}

function withoutCompleteBombs(
    cards: readonly number[],
    protectedBombs: readonly (readonly number[])[],
): number[] {
    let remaining = [...cards];
    for (const group of protectedBombs) {
        const next = subtract(remaining, group);
        if (next) remaining = next;
    }
    return remaining;
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
    // Bomb cards are atomic and cannot simultaneously improve a straight or
    // pair-run score. Counting four 6s as the pair 66 made a spare 7 look more
    // valuable than it was and produced the wrong screenshot hint.
    const protectedBombs = rules.protectedBombs ?? [];
    const counts = countsOf(withoutCompleteBombs(cards, protectedBombs));
    const airplaneCards = runs(counts, 3, 2, rules.allowTwoInRuns)
        .reduce((best, [start, end]) => Math.max(best, (end - start + 1) * 3), 0);
    const straightCards = runs(counts, 1, rules.minimumStraightLength, rules.allowTwoInRuns)
        .reduce((best, [start, end]) => Math.max(best, end - start + 1), 0);
    const pairRunCards = runs(counts, 2, rules.minimumPairRunLength, rules.allowTwoInRuns)
        .reduce((best, [start, end]) => Math.max(best, (end - start + 1) * 2), 0);
    const triples = counts.filter((count) => count === 3).length;
    const rawSingles = counts.filter((count) => count === 1).length;
    const singleAttachmentCapacity = triples
        * Math.max(0, Math.trunc(rules.singleAttachmentCapacityPerTriple ?? 0));
    return {
        turns: minimumTurns(counts, rules),
        bombs: protectedBombs.filter((group) => containsCards(cards, group)).length,
        triples,
        airplaneCards,
        runCards: straightCards,
        pairRunCards,
        isolated: Math.max(0, rawSingles - singleAttachmentCapacity),
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
    preferFewestLooseSinglesOnEqualSize = false,
): number[][] {
    const protectedBombs = [...(rules.protectedBombs ?? []).map((group) => [...group])];
    for (const group of ordinaryBombGroups(hand)) {
        const key = [...group].sort((left, right) => left - right).join(',');
        if (!protectedBombs.some((candidate) => [...candidate].sort((left, right) => left - right).join(',') === key)) {
            protectedBombs.push(group);
        }
    }
    const normalizedRules: PdkHintRules = {
        minimumStraightLength: Math.max(3, Math.trunc(rules.minimumStraightLength)),
        minimumPairRunLength: Math.max(2, Math.trunc(rules.minimumPairRunLength)),
        allowTwoInRuns: Boolean(rules.allowTwoInRuns),
        protectedBombs,
        singleAttachmentCapacityPerTriple: Math.max(0,
            Math.trunc(rules.singleAttachmentCapacityPerTriple ?? 0)),
        prioritizeLooseSingles: Boolean(rules.prioritizeLooseSingles),
    };
    const scored = candidates
        .map((candidate) => {
            const remaining = subtract(hand, candidate.cards);
            const protectedImpact = protectedBombImpact(hand, candidate.cards, normalizedRules.protectedBombs ?? []);
            return remaining ? {
                ...candidate,
                splitBombs: candidate.usesFourCardBody ? 0
                    : Math.max(splitBombCount(hand, candidate.cards), protectedImpact.split),
                splitTriples: splitTripleCount(hand, candidate.cards),
                completeBombs: candidate.usesFourCardBody ? 0
                    : Math.max(completeBombCount(hand, candidate.cards), protectedImpact.consumed),
                quality: quality(remaining, normalizedRules),
            } : null;
        })
        .filter((value): value is PdkHintCandidate & { splitBombs: number; splitTriples: number; completeBombs: number; quality: HandQuality } => value !== null);
    // A protected bomb is indivisible. If any legal candidate keeps every bomb
    // intact, split candidates are not part of the prompt cycle at all.
    const hasTwoHandMaximum = scored.some((candidate) =>
        candidate.finishesInTwo && candidate.containsRuleMaximum);
    const rankedPool = !hasTwoHandMaximum && !preferLargest
        && scored.some((candidate) => candidate.splitBombs === 0)
        ? scored.filter((candidate) => candidate.splitBombs === 0)
        : scored;
    return rankedPool
        .sort((left, right) => {
            // With exactly two legal hands left, expose the regional maximum now.
            // This is evaluated on the complete combination, so a maximum A used
            // as a triple attachment receives the same priority as a body card.
            const leftTwoHandMaximum = left.finishesInTwo && left.containsRuleMaximum;
            const rightTwoHandMaximum = right.finishesInTwo && right.containsRuleMaximum;
            if (leftTwoHandMaximum !== rightTwoHandMaximum) return leftTwoHandMaximum ? -1 : 1;
            const a = left.quality;
            const b = right.quality;
            if (preferLargest) return right.cards.length - left.cards.length
                || (preferFewestLooseSinglesOnEqualSize ? a.isolated - b.isolated : 0)
                || left.order - right.order;
            return left.splitBombs - right.splitBombs
                || left.splitTriples - right.splitTriples
                // A complete bomb is always a fallback hint when any ordinary
                // legal play exists. Lead-mode's "most cards" rule only ranks
                // ordinary shapes against each other; it must not spend a bomb.
                || left.completeBombs - right.completeBombs
                || (normalizedRules.prioritizeLooseSingles ? a.isolated - b.isolated : 0)
                || b.bombs - a.bombs
                || b.airplaneCards - a.airplaneCards
                || b.triples - a.triples
                || b.pairRunCards - a.pairRunCards
                || b.runCards - a.runCards
                || Math.min(...left.cards.map(rank)) - Math.min(...right.cards.map(rank))
                // Remaining-turn estimation is deliberately a late tie-breaker.
                // It cannot outrank preservation of a real straight/airplane or
                // the smallest clean response because regional attachment rules
                // make a generic turn-count heuristic necessarily approximate.
                || a.turns - b.turns
                || a.isolated - b.isolated
                // Across every structurally equivalent hint, prefer the play
                // leaving fewer loose single ranks. This deliberately follows
                // runs/pairs/triples: a card inside a complete straight is not
                // a disposable singleton merely because its rank count is one.
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
