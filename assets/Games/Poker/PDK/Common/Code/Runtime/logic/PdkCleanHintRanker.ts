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
    /** Hint ranking plans the whole hand instead of maximizing the current play. */
    optimizeWholeHand?: boolean;
    /** Regional rule compares triple-family attachments instead of body ranks only. */
    compareTripleAttachments?: boolean;
    /** A complete bomb earns an independent score and must be played as a bomb. */
    preserveScoringBombs?: boolean;
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
 * The legacy client recognizer searches for any consecutive subset of triples
 * and may silently treat another complete triple as wings. Authority does not:
 * every rank occurring at least three times participates in the aircraft body,
 * and the complete body must be one consecutive run. Keep prompt candidates on
 * that authoritative boundary so Hint can never raise a hand that play_req must
 * reject (for example QQQ+999+888+6).
 */
export function isAuthorityCompatiblePdkAircraft(
    cards: readonly number[],
    legacyType: number,
): boolean {
    if (![16, 17, 18, 19].includes(legacyType)) return true;
    const counts = new Map<number, number>();
    for (const raw of cards) {
        const rank = Number(raw) % 100;
        counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    const triples = [...counts.entries()]
        .filter(([, count]) => count >= 3)
        .map(([rank]) => rank)
        .sort((left, right) => left - right);
    if (triples.length < 2 || triples.some((rank) => rank >= 15)) return false;
    for (let index = 1; index < triples.length; index += 1) {
        if (triples[index] !== triples[index - 1] + 1) return false;
    }
    const bodyCards = triples.length * 3;
    if (legacyType === 19) return cards.length === bodyCards;
    if (legacyType === 16) return cards.length === bodyCards + triples.length;
    if (cards.length !== bodyCards + triples.length * 2) return false;
    if (legacyType === 18) return true;
    return [...counts.entries()]
        .filter(([rank]) => !triples.includes(rank))
        .every(([, count]) => count === 2);
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

/**
 * Enumerate every distinct rank multiset once while keeping physical card ids.
 * This is complete for PDK legality because suits never define a card shape,
 * and is substantially smaller than enumerating all 2^N physical subsets when
 * a hand contains pairs, triples or bombs.
 */
export function enumeratePdkRankMultisetCandidates(
    hand: readonly number[],
    requiredCard = 0,
): number[][] {
    const groups = new Map<number, number[]>();
    for (const raw of hand) {
        const card = Number(raw);
        const cardRank = rank(card);
        const group = groups.get(cardRank) ?? [];
        group.push(card);
        groups.set(cardRank, group);
    }
    if (requiredCard > 0) {
        const group = groups.get(rank(requiredCard));
        if (group) group.sort((left, right) => left === requiredCard
            ? -1 : right === requiredCard ? 1 : left - right);
    }
    const rankGroups = [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, cards]) => cards);
    const candidates: number[][] = [];
    const selected: number[] = [];
    const build = (groupIndex: number): void => {
        if (groupIndex >= rankGroups.length) {
            if (selected.length > 0) candidates.push([...selected]);
            return;
        }
        const group = rankGroups[groupIndex];
        for (let count = 0; count <= group.length; count += 1) {
            selected.push(...group.slice(0, count));
            build(groupIndex + 1);
            selected.splice(selected.length - count, count);
        }
    };
    build(0);
    return candidates;
}

interface HandQuality {
    turns: number;
    bombs: number;
    pairs: number;
    triples: number;
    airplaneCards: number;
    runCards: number;
    pairRunCards: number;
    isolated: number;
    /** Cards still participating in a complete structure after the candidate is played. */
    structuredCards: number;
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

function isCompleteProtectedBomb(
    cards: readonly number[],
    protectedBombs: readonly (readonly number[])[],
): boolean {
    const key = [...cards].sort((left, right) => left - right).join(',');
    return protectedBombs.some((group) => group.length === cards.length
        && [...group].sort((left, right) => left - right).join(',') === key);
}

function consumesProtectedAceBomb(
    cards: readonly number[],
    protectedBombs: readonly (readonly number[])[],
): boolean {
    return protectedBombs.some((group) => group.length === 3
        && group.every((card) => rank(card) === 14)
        && containsCards(cards, group));
}

function usesProtectedBombAsTripleBody(
    cards: readonly number[],
    protectedBombs: readonly (readonly number[])[],
): boolean {
    const playedCounts = countsOf(cards);
    return protectedBombs.some((group) => group.length === 3
        && group.every((card) => playedCounts[rank(card)] === 3));
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

/** Count pairs opened by a single-card response. */
function splitPairCount(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    let split = 0;
    for (let value = 3; value <= 15; value += 1) {
        if (handCounts[value] === 2 && playedCounts[value] === 1) split += 1;
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

function isStraightCandidate(cards: readonly number[], rules: PdkHintRules): boolean {
    if (cards.length < rules.minimumStraightLength) return false;
    const counts = countsOf(cards);
    const ranks = counts.map((count, value) => count === 1 ? value : 0).filter(Boolean);
    if (ranks.length !== cards.length) return false;
    const maximum = rules.allowTwoInRuns ? 15 : 14;
    return ranks[ranks.length - 1] <= maximum
        && ranks.every((value, index) => index === 0 || value === ranks[index - 1] + 1);
}

/**
 * Rank-multiset enumeration deliberately keeps one physical representative per
 * shape. Hint cycling still has to visit equivalent straight selections when a
 * rank has more than one physical card, otherwise the second Hint click skips
 * directly to a different shape and appears to dismantle the straight.
 */
function straightPhysicalVariants(
    hand: readonly number[],
    cards: readonly number[],
    rules: PdkHintRules,
): number[][] {
    if (!isStraightCandidate(cards, rules)) return [[...cards]];
    const cardsByRank = new Map<number, number[]>();
    for (const raw of hand) {
        const card = Number(raw);
        const values = cardsByRank.get(rank(card)) ?? [];
        values.push(card);
        cardsByRank.set(rank(card), values);
    }
    let variants: number[][] = [[]];
    for (const card of cards) {
        const physical = cardsByRank.get(rank(card)) ?? [Number(card)];
        variants = variants.flatMap((prefix) => physical.map((value) => [...prefix, value]));
    }
    const originalKey = [...cards].sort((left, right) => left - right).join(',');
    return variants.sort((left, right) => {
        const leftKey = [...left].sort((a, b) => a - b).join(',');
        const rightKey = [...right].sort((a, b) => a - b).join(',');
        return Number(rightKey === originalKey) - Number(leftKey === originalKey);
    });
}

function pairRunBounds(
    cards: readonly number[],
    rules: PdkHintRules,
): [number, number] | null {
    const counts = countsOf(cards);
    const ranks = counts.map((count, value) => count === 2 ? value : 0).filter(Boolean);
    if (ranks.length < rules.minimumPairRunLength || ranks.length * 2 !== cards.length) return null;
    const maximum = rules.allowTwoInRuns ? 15 : 14;
    if (ranks[ranks.length - 1] > maximum
        || ranks.some((value, index) => index > 0 && value !== ranks[index - 1] + 1)) return null;
    return [ranks[0], ranks[ranks.length - 1]];
}

function retainsHigherPairRun(
    hand: readonly number[],
    played: readonly number[],
    rules: PdkHintRules,
): boolean {
    const bounds = pairRunBounds(played, rules);
    const remaining = subtract(hand, played);
    if (!bounds || !remaining) return false;
    const length = bounds[1] - bounds[0] + 1;
    return runs(countsOf(remaining), 2, length, rules.allowTwoInRuns)
        .some(([start, end]) => end - start + 1 >= length && start > bounds[0]);
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

function attachmentVariants(
    counts: readonly number[],
    excludedRanks: ReadonlySet<number>,
    amount: number,
): number[][] {
    if (amount <= 0) return [Array<number>(16).fill(0)];
    const result: number[][] = [];
    const current = Array<number>(16).fill(0);
    const build = (value: number, remaining: number): void => {
        if (remaining === 0) {
            result.push([...current]);
            return;
        }
        if (value > 15) return;
        if (excludedRanks.has(value)) {
            build(value + 1, remaining);
            return;
        }
        const maximum = Math.min(counts[value], remaining);
        for (let take = 0; take <= maximum; take += 1) {
            current[value] = take;
            build(value + 1, remaining - take);
        }
        current[value] = 0;
    };
    build(3, amount);
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
        const removals = new Map<string, number[]>();
        const addRemoval = (removal: number[]): void => {
            if (removal[first] <= 0) return;
            const key = removal.slice(3).join('');
            removals.set(key, removal);
        };
        for (let copies = 1; copies <= Math.min(3, counts[first]); copies += 1) {
            const removal = Array<number>(16).fill(0);
            removal[first] = copies;
            addRemoval(removal);
        }
        for (const [start, end] of runs(counts, 1, rules.minimumStraightLength, rules.allowTwoInRuns)) {
            const removal = Array<number>(16).fill(0);
            for (let value = start; value <= end; value += 1) removal[value] = 1;
            addRemoval(removal);
        }
        for (const [start, end] of runs(counts, 2, rules.minimumPairRunLength, rules.allowTwoInRuns)) {
            const removal = Array<number>(16).fill(0);
            for (let value = start; value <= end; value += 1) removal[value] = 2;
            addRemoval(removal);
        }
        const tripleRuns = runs(counts, 3, 1, rules.allowTwoInRuns);
        const attachmentCapacity = Math.max(0, Math.trunc(rules.singleAttachmentCapacityPerTriple ?? 0));
        for (const [start, end] of tripleRuns) {
            const body = Array<number>(16).fill(0);
            const bodyRanks = new Set<number>();
            for (let value = start; value <= end; value += 1) {
                body[value] = 3;
                bodyRanks.add(value);
            }
            addRemoval(body);
            if (attachmentCapacity <= 0) continue;
            const bodyLength = end - start + 1;
            const withoutBody = counts.map((count, value) => count - body[value]);
            for (const attachments of attachmentVariants(
                withoutBody, bodyRanks, attachmentCapacity * bodyLength,
            )) {
                addRemoval(body.map((amount, value) => amount + attachments[value]));
            }
        }
        let best = Number.POSITIVE_INFINITY;
        for (const removal of removals.values()) {
            const next = counts.map((count, value) => count - removal[value]);
            if (next.some((count) => count < 0)) continue;
            best = Math.min(best, 1 + visit(next));
        }
        memo.set(key, best);
        return best;
    };
    return visit([...initial]);
}

function quality(cards: readonly number[], rules: PdkHintRules): HandQuality {
    // Bomb cards are atomic and cannot simultaneously improve a straight or
    // pair-run score. Counting four 6s as the pair 66 made a spare 7 look more
    // valuable than it was and produced the wrong screenshot hint.
    const protectedBombs = rules.protectedBombs ?? [];
    const remainingBombs = protectedBombs.filter((group) => containsCards(cards, group));
    const counts = countsOf(withoutCompleteBombs(cards, remainingBombs));
    const airplaneCards = runs(counts, 3, 2, rules.allowTwoInRuns)
        .reduce((best, [start, end]) => Math.max(best, (end - start + 1) * 3), 0);
    const straightCards = runs(counts, 1, rules.minimumStraightLength, rules.allowTwoInRuns)
        .reduce((best, [start, end]) => Math.max(best, end - start + 1), 0);
    const pairRunCards = runs(counts, 2, rules.minimumPairRunLength, rules.allowTwoInRuns)
        .reduce((best, [start, end]) => Math.max(best, (end - start + 1) * 2), 0);
    const pairs = counts.filter((count) => count === 2).length;
    const triples = counts.filter((count) => count === 3).length;
    const rawSingles = counts.filter((count) => count === 1).length;
    // A rank occurring once is not a loose single when it belongs to a complete
    // straight. Prompt cleanup must reason about playable structures, not rank
    // multiplicity alone; otherwise 6-7-8-9-10 is incorrectly treated as five
    // disposable singles and Hint breaks the straight at 10.
    const straightSingleCoverage = runs(
        counts, 1, rules.minimumStraightLength, rules.allowTwoInRuns,
    ).reduce((best, [start, end]) => Math.max(best,
        Array.from({ length: end - start + 1 }, (_value, offset) => start + offset)
            .filter((value) => counts[value] === 1).length), 0);
    const singleAttachmentCapacity = triples
        * Math.max(0, Math.trunc(rules.singleAttachmentCapacityPerTriple ?? 0));
    const isolated = Math.max(0, rawSingles - straightSingleCoverage - singleAttachmentCapacity);
    return {
        turns: remainingBombs.length + minimumTurns(counts, rules),
        bombs: remainingBombs.length,
        pairs,
        triples,
        airplaneCards,
        runCards: straightCards,
        pairRunCards,
        isolated,
        structuredCards: cards.length - isolated,
    };
}

function tripleFamilyAttachments(hand: readonly number[], played: readonly number[]): number[] {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    const bodyRanks = new Set<number>();
    for (let value = 3; value <= 15; value += 1) {
        if (playedCounts[value] >= 3 && handCounts[value] >= playedCounts[value]) bodyRanks.add(value);
    }
    if (bodyRanks.size === 0) return [];
    return played.filter((card) => !bodyRanks.has(rank(card)));
}

function tripleFamilyBodyRank(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    for (let value = 3; value <= 15; value += 1) {
        if (playedCounts[value] >= 3 && handCounts[value] >= playedCounts[value]) return value;
    }
    return Number.MAX_SAFE_INTEGER;
}

function tripleFamilyBodyCount(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    let bodies = 0;
    for (let value = 3; value <= 15; value += 1) {
        if (playedCounts[value] >= 3 && handCounts[value] >= playedCounts[value]) bodies += 1;
    }
    return bodies;
}

function attachmentControlCost(hand: readonly number[], played: readonly number[]): number {
    return tripleFamilyAttachments(hand, played).reduce((total, card) => {
        const value = rank(card);
        // Rank 2 is the universal recovery card and is normally attached only
        // when doing so finishes the hand. A is still valuable, but structural
        // preservation (for example keeping 77 intact) outranks retaining it.
        if (value === 15) return total + 100;
        if (value === 14) return total + 50;
        return total + value;
    }, 0);
}

function attachmentSourceCost(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const attachmentCounts = countsOf(tripleFamilyAttachments(hand, played));
    let cost = 0;
    for (let value = 3; value <= 15; value += 1) {
        const taken = attachmentCounts[value];
        if (taken <= 0 || handCounts[value] <= 1) continue;
        // Loose ranks cost nothing. Consuming a complete pair is preferable to
        // opening it, while touching a triple/four-card control body is costlier.
        cost += taken === handCounts[value]
            ? handCounts[value] * 2
            : taken * handCounts[value] * 4;
    }
    return cost;
}

function completePairAttachmentRank(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const attachmentCounts = countsOf(tripleFamilyAttachments(hand, played));
    for (let value = 3; value <= 15; value += 1) {
        if (handCounts[value] === 2 && attachmentCounts[value] === 2) return value;
    }
    return Number.MAX_SAFE_INTEGER;
}

function attachmentStructureDamage(
    hand: readonly number[],
    played: readonly number[],
    rules: PdkHintRules,
): number {
    const attachments = tripleFamilyAttachments(hand, played);
    if (attachments.length === 0) return 0;
    const body = played.filter((card) => !attachments.includes(card));
    const base = subtract(hand, body);
    const remaining = subtract(hand, played);
    if (!base || !remaining) return Number.MAX_SAFE_INTEGER;
    const before = quality(base, rules);
    const after = quality(remaining, rules);
    const openedPairs = splitPairCount(base, attachments);
    return Math.max(0, before.pairRunCards - after.pairRunCards) * 20
        + Math.max(0, before.runCards - after.runCards) * 10
        + Math.max(0, before.airplaneCards - after.airplaneCards) * 30
        + Math.max(0, before.triples - after.triples) * 12
        + Math.max(0, before.pairs - after.pairs) * 4
        + openedPairs * 4;
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
        optimizeWholeHand: Boolean(rules.optimizeWholeHand),
        compareTripleAttachments: Boolean(rules.compareTripleAttachments),
        preserveScoringBombs: Boolean(rules.preserveScoringBombs),
    };
    const scored = candidates
        .map((candidate) => {
            const remaining = subtract(hand, candidate.cards);
            const protectedImpact = protectedBombImpact(hand, candidate.cards, normalizedRules.protectedBombs ?? []);
            if (normalizedRules.preserveScoringBombs
                && !isCompleteProtectedBomb(candidate.cards, normalizedRules.protectedBombs ?? [])
                && protectedImpact.consumed > 0) return null;
            // Manual play may legally interpret QQQQK as QQQ + Q,K. Prompting
            // must not volunteer that exact five-card interpretation. Keep the
            // ordinary bomb candidate and unrelated lead shapes available; only
            // a non-four-card-body five-card candidate that consumes the complete
            // bomb is excluded from the prompt cycle.
            if (!candidate.usesFourCardBody
                && candidate.cards.length === 5
                && protectedImpact.consumed > 0
                && (normalizedRules.preserveScoringBombs
                    || !usesProtectedBombAsTripleBody(candidate.cards,
                        normalizedRules.protectedBombs ?? []))) return null;
            return remaining ? {
                ...candidate,
                splitBombs: candidate.usesFourCardBody ? 0
                    : Math.max(splitBombCount(hand, candidate.cards), protectedImpact.split),
                splitTriples: splitTripleCount(hand, candidate.cards),
                splitPairs: splitPairCount(hand, candidate.cards),
                completeBombs: candidate.usesFourCardBody
                    || (!normalizedRules.preserveScoringBombs
                        && (remaining.length === 0
                            || usesProtectedBombAsTripleBody(candidate.cards,
                                normalizedRules.protectedBombs ?? []))) ? 0
                    : Math.max(completeBombCount(hand, candidate.cards), protectedImpact.consumed),
                consumesFourCardBody: Boolean(candidate.usesFourCardBody),
                wholeHandBombFinish: Boolean(candidate.usesFourCardBody
                    && remaining.length === 0 && protectedImpact.consumed > 0),
                earlyAceBomb: hand.length > 10
                    && consumesProtectedAceBomb(candidate.cards, normalizedRules.protectedBombs ?? []),
                remainingCount: remaining.length,
                remainingHighestRank: remaining.reduce((highest, card) => Math.max(highest, rank(card)), 0),
                quality: quality(remaining, normalizedRules),
                attachmentDamage: attachmentStructureDamage(hand, candidate.cards, normalizedRules),
                attachmentSourceCost: attachmentSourceCost(hand, candidate.cards),
                attachmentControlCost: attachmentControlCost(hand, candidate.cards),
                usesTwoAttachment: tripleFamilyAttachments(hand, candidate.cards)
                    .some((card) => rank(card) === 15),
                tripleBodyRank: tripleFamilyBodyRank(hand, candidate.cards),
                tripleBodyCount: tripleFamilyBodyCount(hand, candidate.cards),
                straightBody: isStraightCandidate(candidate.cards, normalizedRules),
                retainsHigherLooseSingle: candidate.cards.length === 1
                    && countsOf(hand)[rank(candidate.cards[0])] === 1
                    && countsOf(remaining).some((count, value) => count === 1
                        && value > rank(candidate.cards[0])),
            } : null;
        })
        .filter((value): value is PdkHintCandidate & { splitBombs: number; splitTriples: number; splitPairs: number; completeBombs: number; consumesFourCardBody: boolean; wholeHandBombFinish: boolean; earlyAceBomb: boolean; remainingCount: number; remainingHighestRank: number; quality: HandQuality; attachmentDamage: number; attachmentSourceCost: number; attachmentControlCost: number; usesTwoAttachment: boolean; tripleBodyRank: number; tripleBodyCount: number; straightBody: boolean; retainsHigherLooseSingle: boolean } => value !== null);
    const handHasNoLooseSingle = quality(hand, normalizedRules).isolated === 0;
    const originalCounts = countsOf(hand);
    // With several independent pairs and only high loose cards, spending the
    // smallest pair as wings preserves high control cards that can regain the
    // lead. This is deliberately limited to a pair-heavy hand: elsewhere loose
    // attachments remain preferable and complete pairs/runs stay intact.
    const pairHeavyControlHand = originalCounts.filter((count) => count === 2).length >= 3
        && originalCounts.every((count, value) => value < 3 || count !== 1 || value >= 13);
    const hasTripleRecoveryChain = originalCounts.filter((count) => count === 3).length >= 2;
    const originalQuality = quality(hand, normalizedRules);
    const simpleSinglesAndPairs = originalQuality.triples === 0
        && originalQuality.airplaneCards === 0
        && originalQuality.runCards === 0
        && originalQuality.pairRunCards === 0;
    const pairCount = originalCounts.filter((count) => count === 2).length;
    const hasMaximumLooseSingle = scored.some((candidate) => candidate.cards.length === 1
        && originalCounts[rank(candidate.cards[0])] === 1
        && Boolean(candidate.containsRuleMaximum));
    const pairLeadWithoutSingleRecapture = simpleSinglesAndPairs
        && pairCount >= 2 && !hasMaximumLooseSingle;
    // A straight may borrow from a bomb only when the hand has no straight that
    // keeps every bomb intact. This is a structural choice, not a rank-specific
    // exception: 7-J must precede 8-Q when QQQQ is present, while a genuinely
    // irreplaceable bomb card may still complete a long whole-hand straight.
    const hasCleanStraightLead = scored.some((candidate) => candidate.straightBody
        && candidate.splitBombs === 0);
    const structurallyEligible = hasCleanStraightLead
        ? scored.filter((candidate) => !candidate.straightBody || candidate.splitBombs === 0)
        : scored;
    const hasRecapturableIntactLead = structurallyEligible.some((candidate) => candidate.splitBombs === 0
        && retainsHigherPairRun(hand, candidate.cards, normalizedRules));
    // Following another play never opens a protected bomb merely to manufacture
    // an ordinary response. Lead planning may consider a split only when the
    // exact candidate is a complete straight; its whole-hand cost is compared
    // below instead of applying a blanket "never split" rule.
    const leadPool = hasRecapturableIntactLead
        ? structurallyEligible.filter((candidate) => candidate.splitBombs === 0)
        : structurallyEligible.some((candidate) => candidate.splitBombs === 0)
        ? structurallyEligible.filter((candidate) => candidate.splitBombs === 0
            || candidate.straightBody
            || (!normalizedRules.preserveScoringBombs
                && usesProtectedBombAsTripleBody(candidate.cards,
                    normalizedRules.protectedBombs ?? [])))
        : structurallyEligible;
    const rankedPool = !normalizedRules.optimizeWholeHand && !preferLargest
        && leadPool.some((candidate) => candidate.splitBombs === 0)
        ? leadPool.filter((candidate) => candidate.splitBombs === 0)
        : leadPool;
    rankedPool.sort((left, right) => {
            // A hand containing a bomb is never auto-finished through a
            // four-card-body combination. Keep that legal manual choice as the
            // final hint, after loose cards and the standalone bomb have both
            // been exposed by the cycle.
            if (left.wholeHandBombFinish !== right.wholeHandBombFinish) {
                return left.wholeHandBombFinish ? 1 : -1;
            }
            // AAA is a protected late control hand. While more than ten cards
            // remain, every legal ordinary candidate precedes a play consuming
            // it; if no ordinary candidate exists, the AAA candidate remains.
            if (left.earlyAceBomb !== right.earlyAceBomb) {
                return left.earlyAceBomb ? 1 : -1;
            }
            // A complete bomb/four-card body is a control fallback. Ordinary
            // structures are exhausted before it, while a bomb-splitting long
            // straight is assessed by the resulting whole-hand plan.
            const leftBombBody = left.completeBombs > 0 || left.consumesFourCardBody;
            const rightBombBody = right.completeBombs > 0 || right.consumesFourCardBody;
            if ((normalizedRules.optimizeWholeHand || !preferLargest) && leftBombBody !== rightBombBody) {
                // A scoring rule makes the bomb atomic; it does not make a
                // self-led bomb strategically preferable. While leading, keep
                // every bomb intact but exhaust ordinary structures first.
                // When responding, a scoring bomb retains its priority because
                // it may be the required control/score play for that response.
                return normalizedRules.preserveScoringBombs && !preferLargest
                    ? leftBombBody ? -1 : 1
                    : leftBombBody ? 1 : -1;
            }
            // With exactly two legal hands left, expose the regional maximum now.
            // This is evaluated on the complete combination, so a maximum A used
            // as a triple attachment receives the same priority as a body card.
            const leftTwoHandMaximum = left.finishesInTwo && left.containsRuleMaximum;
            const rightTwoHandMaximum = right.finishesInTwo && right.containsRuleMaximum;
            if (leftTwoHandMaximum !== rightTwoHandMaximum) return leftTwoHandMaximum ? -1 : 1;
            // When the original hand has no loose single, a single response must
            // come from a pair instead of breaking a complete run. Among such
            // pair openings the immutable regional maximum is first. This rule
            // precedes remaining-hand structure scoring: 78910QQAA responding
            // to 7 opens AA, even though playing 10 would leave more cards in
            // generic structures.
            const leftOpensMaximumPair = !normalizedRules.optimizeWholeHand
                && !preferLargest && handHasNoLooseSingle
                && left.splitPairs > 0 && Boolean(left.containsRuleMaximum);
            const rightOpensMaximumPair = !normalizedRules.optimizeWholeHand
                && !preferLargest && handHasNoLooseSingle
                && right.splitPairs > 0 && Boolean(right.containsRuleMaximum);
            if (leftOpensMaximumPair !== rightOpensMaximumPair) {
                return leftOpensMaximumPair ? -1 : 1;
            }
            const leftOpensPair = !normalizedRules.optimizeWholeHand
                && !preferLargest && handHasNoLooseSingle && left.splitPairs > 0;
            const rightOpensPair = !normalizedRules.optimizeWholeHand
                && !preferLargest && handHasNoLooseSingle && right.splitPairs > 0;
            if (leftOpensPair !== rightOpensPair) return leftOpensPair ? -1 : 1;
            const a = left.quality;
            const b = right.quality;
            const bothTripleFamilies = Number.isFinite(left.tripleBodyRank)
                && left.tripleBodyRank < Number.MAX_SAFE_INTEGER
                && Number.isFinite(right.tripleBodyRank)
                && right.tripleBodyRank < Number.MAX_SAFE_INTEGER;
            const sameTripleBody = bothTripleFamilies
                && left.tripleBodyRank === right.tripleBodyRank
                && left.cards.length === right.cards.length;
            const ordinarySameBodyAttachments = sameTripleBody
                && (left.cards.length === 4 || !normalizedRules.compareTripleAttachments)
                && left.remainingCount !== 1 && right.remainingCount !== 1;
            const comparableSingleTripleFamilies = bothTripleFamilies
                && left.tripleBodyCount === 1 && right.tripleBodyCount === 1;
            const leftPairAttachment = completePairAttachmentRank(hand, left.cards);
            const rightPairAttachment = completePairAttachmentRank(hand, right.cards);
            const leftHasPairAttachment = leftPairAttachment < Number.MAX_SAFE_INTEGER;
            const rightHasPairAttachment = rightPairAttachment < Number.MAX_SAFE_INTEGER;
            const leftTripleRecoveryLead = hasTripleRecoveryChain
                && left.tripleBodyCount === 1 && left.splitTriples === 0 && left.cards.length > 3;
            const rightTripleRecoveryLead = hasTripleRecoveryChain
                && right.tripleBodyCount === 1 && right.splitTriples === 0 && right.cards.length > 3;
            const leftIntactPairLead = left.cards.length === 2
                && rank(left.cards[0]) === rank(left.cards[1])
                && originalCounts[rank(left.cards[0])] === 2;
            const rightIntactPairLead = right.cards.length === 2
                && rank(right.cards[0]) === rank(right.cards[1])
                && originalCounts[rank(right.cards[0])] === 2;
            if (preferLargest && !normalizedRules.optimizeWholeHand) return right.cards.length - left.cards.length
                || (preferFewestLooseSinglesOnEqualSize ? a.isolated - b.isolated : 0)
                || left.order - right.order;
            // Turning four equal cards into an ordinary triple is never an
            // opening preference while an intact candidate exists. Keep that
            // legal interpretation only as a late hint-cycle fallback. A split
            // bomb may still build a complete straight because that can be the
            // intentional whole-hand decomposition (for example 5-to-A).
            if (!left.straightBody && !right.straightBody
                && (left.splitBombs > 0) !== (right.splitBombs > 0)) {
                return left.splitBombs > 0 ? 1 : -1;
            }
            // One model owns every lead hint: minimize the number of complete
            // legal plays needed to empty the whole hand. Bombs, runs, aircraft
            // and attachments are not independent priorities; they are merely
            // alternative decompositions of that hand.
            return (left.cards.length === right.cards.length
                && left.straightBody !== right.straightBody
                ? left.straightBody ? -1 : 1 : 0)
                // A triple carrying one card always consumes the lowest loose
                // attachment (except when that deliberately leaves the final
                // card). Regional attachment comparison still applies to the
                // two-wing form, whose pair/control preservation rules differ.
                // This is evaluated before whole-hand decomposition so generic
                // structure scoring cannot turn 888+JQ into 888+KA.
                // For the same triple body, wings must come from existing loose
                // singles before an intact pair is consumed.  Rank is only the
                // tie-breaker inside the same source class: otherwise a low pair
                // such as 33 incorrectly outranks loose 8/9 beside 555.
                || (ordinarySameBodyAttachments
                    ? left.attachmentSourceCost - right.attachmentSourceCost : 0)
                || (ordinarySameBodyAttachments
                    ? left.attachmentDamage - right.attachmentDamage : 0)
                || (ordinarySameBodyAttachments
                    ? left.attachmentControlCost - right.attachmentControlCost : 0)
                || (leftTripleRecoveryLead !== rightTripleRecoveryLead
                ? leftTripleRecoveryLead ? -1 : 1 : 0)
                || (pairHeavyControlHand && sameTripleBody
                && leftHasPairAttachment !== rightHasPairAttachment
                ? leftHasPairAttachment ? -1 : 1 : 0)
                // When both candidates carry a complete pair, shed the smallest
                // one first and retain the larger pairs as later control plays.
                || (pairHeavyControlHand && sameTripleBody
                    && leftHasPairAttachment && rightHasPairAttachment
                    ? leftPairAttachment - rightPairAttachment : 0)
                // A same-size triple plan must retain rank 2 as the recovery
                // card even when spending it would reduce the raw turn count.
                || (sameTripleBody && left.usesTwoAttachment !== right.usesTwoAttachment
                    ? left.usesTwoAttachment ? 1 : -1 : 0)
                // Complete triples form a same-shape recovery chain. Wings may
                // use loose cards or a legal pair, but must not open another
                // triple merely to improve the raw remaining-turn estimate.
                || (comparableSingleTripleFamilies ? left.splitTriples - right.splitTriples : 0)
                // A legal complete triple-with-attachments is an actual hand
                // decomposition; a bare triple is only a late fallback. Compare
                // completeness before future turn count so a larger bare body
                // cannot displace 555+7J merely because its remainder happens
                // to score one turn lower.
                || (comparableSingleTripleFamilies
                    ? right.cards.length - left.cards.length : 0)
                // With several intact triple bodies, lead the smallest one and
                // retain every higher body as a same-shape recovery chain.
                || (comparableSingleTripleFamilies
                    ? left.tripleBodyRank - right.tripleBodyRank : 0)
                // Several intact pairs provide a recovery chain only when led
                // from the smallest pair. Loose singles may lead first solely
                // when one of them is the immutable regional maximum; a merely
                // high A cannot guarantee recapture in a deck that still has 2.
                || (pairLeadWithoutSingleRecapture
                    && leftIntactPairLead !== rightIntactPairLead
                    ? leftIntactPairLead ? -1 : 1 : 0)
                || (pairLeadWithoutSingleRecapture
                    && leftIntactPairLead && rightIntactPairLead
                    ? rank(left.cards[0]) - rank(right.cards[0]) : 0)
                // With no larger structure to shed, lead the lowest loose single
                // while retaining a higher loose single to regain initiative.
                // Example: 2,44,3 starts from 3 rather than the pair or rank 2.
                || (simpleSinglesAndPairs
                    && left.retainsHigherLooseSingle !== right.retainsHigherLooseSingle
                    ? left.retainsHigherLooseSingle ? -1 : 1 : 0)
                || a.turns - b.turns
                // If two decompositions finish in the same number of plays,
                // retain an intact bomb/triple before comparing current size.
                // A bomb may still be split when doing so strictly reduces the
                // total play count (for example to build a long straight).
                || left.splitBombs - right.splitBombs
                // Once the future plan is equally clean, play the combination
                // containing the most cards now: long straight, pair run,
                // aircraft and complete attachment forms naturally rise first.
                || (normalizedRules.optimizeWholeHand ? right.cards.length - left.cards.length : 0)
                // When the plan deliberately leaves one final single, retain the
                // highest recovery card. Example: 888999 carries 66QQ and leaves Q,
                // rather than carrying QQQ6 and leaving the low 6.
                || (left.remainingCount === 1 && right.remainingCount === 1
                    ? right.remainingHighestRank - left.remainingHighestRank : 0)
                // Rank 2 is retained as the universal recovery card whenever a
                // same-size triple/aircraft attachment alternative exists.
                || (bothTripleFamilies ? left.attachmentSourceCost - right.attachmentSourceCost : 0)
                || (bothTripleFamilies ? left.attachmentDamage - right.attachmentDamage : 0)
                || (bothTripleFamilies ? left.attachmentControlCost - right.attachmentControlCost : 0)
                // Equal triple-family plans start from the lower body so that a
                // higher body remains available to regain the lead.
                || left.tripleBodyRank - right.tripleBodyRank
                || (normalizedRules.prioritizeLooseSingles ? a.isolated - b.isolated : 0)
                // Preserve the greatest number of cards that still form complete
                // playable structures. This compares the whole remainder rather
                // than preferring a low point card that breaks a longer structure.
                || b.structuredCards - a.structuredCards
                || b.bombs - a.bombs
                || b.airplaneCards - a.airplaneCards
                || b.triples - a.triples
                || b.pairRunCards - a.pairRunCards
                || b.runCards - a.runCards
                // If the original hand has no loose single and equally clean
                // responses must open a pair, expose the regional maximum first.
                // Example: 678910QQAA responding to 7 keeps the same straight and
                // pair after either split, so Liangshan's maximum A precedes Q.
                || (handHasNoLooseSingle && left.splitPairs > 0 && right.splitPairs > 0
                    && left.containsRuleMaximum !== right.containsRuleMaximum
                    ? left.containsRuleMaximum ? -1 : 1 : 0)
                || Math.min(...left.cards.map(rank)) - Math.min(...right.cards.map(rank))
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
        });
    // Sorting above evaluates strategic value. Hint cycling is a separate phase:
    // the best complete remainder stays primary, then a complete triple family
    // is exposed before overlapping shortened straight windows. Never promote
    // the longest straight over that result: a longer current play may open
    // several pairs and leave more loose singles (for example breaking 99/1010).
    // Scoring changes bomb atomicity, not self-lead order. A clean straight or
    // complete triple family is therefore still exposed before an intact bomb.
    const cyclePool = [...rankedPool];
    const longestCleanStraightLength = cyclePool.reduce((longest, candidate) =>
        candidate.straightBody && candidate.splitTriples === 0
            ? Math.max(longest, candidate.cards.length) : longest, 0);
    const longestCleanStraightIndex = cyclePool.findIndex((candidate) =>
        candidate.straightBody && candidate.splitTriples === 0
        && candidate.cards.length === longestCleanStraightLength);
    const strategicPrimary = cyclePool[0];
    const longestCleanStraight = cyclePool[longestCleanStraightIndex];
    // Card count is a tie-breaker only after the remainder is at least as clean.
    // This retains the existing long-straight preference when it costs no hand
    // structure, but prevents 4-10 from breaking both 99 and 1010 when 4-8 keeps
    // those pairs intact.
    if (longestCleanStraightIndex > 0 && strategicPrimary && longestCleanStraight
        && longestCleanStraight.quality.turns <= strategicPrimary.quality.turns
        && longestCleanStraight.quality.isolated <= strategicPrimary.quality.isolated
        && longestCleanStraight.quality.structuredCards >= strategicPrimary.quality.structuredCards) {
        cyclePool.splice(longestCleanStraightIndex, 1);
        cyclePool.unshift(longestCleanStraight);
    }
    const cycleToDifferentStructure = Boolean(cyclePool[0]?.straightBody
        && cyclePool[0].cards.length > normalizedRules.minimumStraightLength);
    if (cycleToDifferentStructure) {
        const completeTripleIndex = cyclePool.findIndex((candidate, index) => index > 0
            && candidate.splitBombs === 0
            && candidate.tripleBodyCount > 0
            && candidate.cards.length > candidate.tripleBodyCount * 3);
        if (completeTripleIndex > 1) {
            const [completeTriple] = cyclePool.splice(completeTripleIndex, 1);
            cyclePool.splice(1, 0, completeTriple);
        }
    }
    const expanded: number[][] = [];
    const deferredPhysicalVariants: number[][] = [];
    const seen = new Set<string>();
    for (const candidate of cyclePool) {
        const variants = straightPhysicalVariants(hand, candidate.cards, normalizedRules);
        for (const [variantIndex, cards] of variants.entries()) {
            const key = [...cards].sort((left, right) => left - right).join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            if (variantIndex === 0 || !cycleToDifferentStructure) expanded.push(cards);
            else deferredPhysicalVariants.push(cards);
        }
    }
    return [...expanded, ...deferredPhysicalVariants];
}
