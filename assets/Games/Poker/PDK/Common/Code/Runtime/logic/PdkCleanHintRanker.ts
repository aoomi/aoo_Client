export type PdkHintPolicyId = 'COMMON' | 'LS201';

export interface PdkHintRules {
    /** Explicit regional strategy identity. Never infer it from cards or rule switches. */
    policyId?: PdkHintPolicyId;
    minimumStraightLength: number;
    minimumPairRunLength: number;
    allowTwoInRuns: boolean;
    /** Exact physical card groups that the active regional rules classify as bombs. */
    protectedBombs?: readonly (readonly number[])[];
    /** Loose singles that one preserved triple can legally absorb on a later play. */
    singleAttachmentCapacityPerTriple?: number;
    /** Exact authoritative triple attachment family used by future-hand planning. */
    tripleAttachmentMode?: 'DISABLED' | 'SINGLES' | 'PAIRS' | 'SINGLE_OR_PAIR' | 'EITHER';
    /** Regional maximum leads whenever exactly one ordinary legal play remains. */
    prioritizeMaximumWithOneOrdinaryPlay?: boolean;
    /** Regional self-lead uses the legal play with most cards when no maximum is held. */
    prioritizeLargestLeadWithoutMaximum?: boolean;
    /** Regional self-lead keeps a longest connected run ahead of the maximum single. */
    prioritizeMaximumLeadUnlessConnectedRun?: boolean;
    /** Within a three-play finish, regional responses spend the maximum control first. */
    prioritizeMaximumResponseWithinThreePlays?: boolean;
    /** Regional lead sheds the largest legal shape unless a straight reaches the maximum. */
    prioritizeLargestLeadUnlessMaximumStraight?: boolean;
    /** Multi-card responses rank the resulting loose-single count before structures. */
    prioritizeLooseSingles?: boolean;
    /** Hint ranking plans the whole hand instead of maximizing the current play. */
    optimizeWholeHand?: boolean;
    /** Regional rule compares triple-family attachments instead of body ranks only. */
    compareTripleAttachments?: boolean;
    /** A complete bomb earns an independent score and must be played as a bomb. */
    preserveScoringBombs?: boolean;
    /** Rank values that are immutable regional maximum singles. */
    maximumSingleRanks?: readonly number[];
    /** Immutable regional deck used to derive maximum hands for each multiplicity. */
    deckCards?: readonly number[];
    /** Whether the local player won the current round's dealer competition. */
    didCompeteDealer?: boolean;
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
 * Resolve the aircraft body from the required number of consecutive triples.
 * Extra non-consecutive triples are legal attachments in the arbitrary-wing
 * family; they must not be forced into the body. For example, in
 * 666,999,101010,JJJ,8,K,A the body is 999-JJJ and 666 belongs to its six
 * attachments. The legacy type fixes the body length through the total card
 * count, so recognition remains deterministic.
 */
export function isAuthorityCompatiblePdkAircraft(
    cards: readonly number[],
    legacyType: number,
): boolean {
    if (![16, 17, 18, 19].includes(legacyType)) return true;
    const counts = Array<number>(16).fill(0);
    for (const raw of cards) {
        const value = Number(raw) % 100;
        if (value < 3 || value > 15) return false;
        counts[value] += 1;
    }
    const cardsPerBodyRank = legacyType === 19 ? 3 : legacyType === 16 ? 4 : 5;
    if (cards.length % cardsPerBodyRank !== 0) return false;
    const bodyLength = cards.length / cardsPerBodyRank;
    if (bodyLength < 2) return false;
    for (let start = 3; start + bodyLength - 1 <= 14; start += 1) {
        const end = start + bodyLength - 1;
        if (Array.from({ length: bodyLength }, (_, index) => start + index)
            .some((value) => counts[value] < 3)) continue;
        const attachments = [...counts];
        for (let value = start; value <= end; value += 1) attachments[value] -= 3;
        if (legacyType === 19) return attachments.every((count) => count === 0);
        if (legacyType === 17) {
            if (attachments.every((count) => count === 0 || count === 2)) return true;
            continue;
        }
        return true;
    }
    return false;
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

/**
 * Final-hand autoplay may submit one complete bomb, but it must never reinterpret
 * a bomb plus extra cards as a triple/four-card attachment family. This rule is
 * based on the physical bomb groups supplied by the active region, not scoring:
 * AAA+Q is therefore blocked even when the legacy classifier calls it legal.
 */
export function isAtomicPdkWholeHandCandidate(
    cards: readonly number[],
    protectedBombs: readonly (readonly number[])[],
): boolean {
    const bombs = [...protectedBombs.map((group) => [...group]), ...ordinaryBombGroups(cards)];
    return bombs.every((bomb) =>
        !containsCards(cards, bomb) || isCompleteProtectedBomb(cards, [bomb]));
}

/** Expand one exact clicked card to the body size currently required for a response. */
export function pdkClickedResponseGroup(
    hand: readonly number[],
    clicked: number,
    targetType: number,
    targetCount: number,
): number[] {
    const required = targetType === 3 && targetCount === 2
        ? 2
        : targetType === 5 && targetCount === 3 ? 3 : 0;
    if (required === 0) return [];
    const rank = Number(clicked) % 100;
    const sameRank = hand.map(Number).filter((card) => card % 100 === rank);
    if (!sameRank.includes(clicked) || sameRank.length < required) return [];
    const chosen = new Set([clicked, ...sameRank.filter((card) => card !== clicked).slice(0, required - 1)]);
    return hand.map(Number).filter((card) => chosen.has(card));
}

/** Manual triple-body swipes consume genuine loose singles before splitting pairs. */
export function rankPdkManualAttachmentCandidates(
    hand: readonly number[],
    candidates: readonly (readonly number[])[],
): number[][] {
    const handCounts = new Map<number, number>();
    for (const card of hand) {
        const rank = Number(card) % 100;
        handCounts.set(rank, (handCounts.get(rank) ?? 0) + 1);
    }
    const scored = candidates.map((raw, order) => {
        const cards = [...raw].map(Number);
        const candidateCounts = new Map<number, number>();
        for (const card of cards) {
            const rank = card % 100;
            candidateCounts.set(rank, (candidateCounts.get(rank) ?? 0) + 1);
        }
        const bodyRanks = new Set([...candidateCounts.entries()]
            .filter(([, count]) => count >= 3)
            .map(([rank]) => rank));
        const attachments = bodyRanks.size > 0
            ? cards.filter((card) => !bodyRanks.has(card % 100)) : [];
        const ranks = [...candidateCounts.keys()].sort((left, right) => left - right);
        const straight = cards.length >= 5
            && ranks.length === cards.length
            && ranks[ranks.length - 1] < 15
            && ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);
        const looseSingles = attachments.filter((card) => handCounts.get(card % 100) === 1).length;
        const splitStructure = attachments.length - looseSingles;
        const attachmentRankSum = attachments.reduce((sum, card) => sum + card % 100, 0);
        return { cards, order, straight, hasBody: bodyRanks.size > 0, looseSingles, splitStructure, attachmentRankSum };
    });
    return scored.sort((left, right) => {
        if (left.straight !== right.straight) return left.straight ? -1 : 1;
        if (left.hasBody !== right.hasBody) return left.hasBody ? -1 : 1;
        if (!left.hasBody) return left.order - right.order;
        return right.looseSingles - left.looseSingles
            || left.splitStructure - right.splitStructure
            || left.attachmentRankSum - right.attachmentRankSum
            || left.order - right.order;
    }).map((item) => item.cards);
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
    if (requiredCard > 0 && !hand.includes(requiredCard)) return [];
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
        // The opening-card rule is a hard legality constraint, not a late hint
        // preference. Since the exact required physical card is sorted first in
        // its rank group above, starting that group at one makes every generated
        // decomposition consume it before any legality or whole-hand ranking.
        const minimum = requiredCard > 0 && group.includes(requiredCard) ? 1 : 0;
        for (let count = minimum; count <= group.length; count += 1) {
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

/**
 * Ranks that no opponent can beat with a single card, based only on the
 * immutable deck plus authoritative public cards and the local hand. A lower
 * rank joins the control chain only when every physical higher card is known.
 */
export function effectivePdkMaximumSingleRanks(
    deck: readonly number[], hand: readonly number[], playedCards: readonly number[],
): number[] {
    const deckCounts = new Map<number, number>();
    const knownCounts = new Map<number, number>();
    for (const card of deck) {
        const cardRank = rank(Number(card));
        deckCounts.set(cardRank, (deckCounts.get(cardRank) ?? 0) + 1);
    }
    for (const card of [...hand, ...playedCards]) {
        const cardRank = rank(Number(card));
        if (!deckCounts.has(cardRank)) continue;
        knownCounts.set(cardRank, Math.min(deckCounts.get(cardRank) ?? 0,
            (knownCounts.get(cardRank) ?? 0) + 1));
    }
    const ranks = [...deckCounts.keys()].sort((left, right) => left - right);
    return ranks.filter((candidate) => ranks
        .filter((higher) => higher > candidate)
        .every((higher) => (knownCounts.get(higher) ?? 0) >= (deckCounts.get(higher) ?? 0)));
}

/** Count intact same-rank hands that are maximal for their deck multiplicity. */
function regionalMaximumAtomicPlayCount(
    hand: readonly number[],
    deck: readonly number[],
): number {
    if (deck.length === 0) return 0;
    const byRank = new Map<number, number[]>();
    for (const card of hand) {
        const cards = byRank.get(rank(card)) ?? [];
        cards.push(Number(card));
        byRank.set(rank(card), cards);
    }
    return [...byRank.values()].filter((cards) =>
        isRegionalMaximumPdkCombination(cards, deck)).length;
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

function pairRunSegmentForRank(
    counts: readonly number[], value: number, rules: PdkHintRules,
): { start: number; end: number; length: number } | null {
    if (counts[value] < 2) return null;
    const maximum = rules.allowTwoInRuns ? 15 : 14;
    let start = value;
    let end = value;
    while (start > 3 && counts[start - 1] >= 2) start -= 1;
    while (end < maximum && counts[end + 1] >= 2) end += 1;
    const length = end - start + 1;
    return length >= rules.minimumPairRunLength ? { start, end, length } : null;
}

function isPairOnlyCandidate(cards: readonly number[]): boolean {
    if (cards.length < 2 || cards.length % 2 !== 0) return false;
    const counts = countsOf(cards);
    return counts.every((count, value) => value < 3 || count === 0 || count === 2);
}

/**
 * A complete pair run is one atomic hint structure. Its constituent pair and
 * shortened-run subsets remain legal manual plays, but exposing them later in
 * the Hint cycle appears to dismantle the preserved run. Remove only candidates
 * fully covered by a strictly longer pair run; disjoint lower/higher pair runs
 * remain independent recovery choices.
 */
function isCoveredByLongerPairRun(
    candidate: readonly number[],
    candidates: readonly PdkHintCandidate[],
    rules: PdkHintRules,
    hand: readonly number[],
    protectedBombs: readonly (readonly number[])[],
): boolean {
    if (!isPairOnlyCandidate(candidate)) return false;
    return candidates.some((other) => other.cards.length > candidate.length
        && pairRunBounds(other.cards, rules) !== null
        && containsCards(other.cards, candidate)
        // A theoretical longer run cannot hide an intact shorter run when the
        // extra pair comes from a bomb. That longer candidate is discarded by
        // the bomb gate below, so using it here would erase both choices.
        && protectedBombImpact(hand, other.cards, protectedBombs).split === 0);
}

function retainsHigherPairRun(
    hand: readonly number[],
    played: readonly number[],
    rules: PdkHintRules,
): boolean {
    const bounds = pairRunBounds(played, rules);
    const remaining = subtract(hand, played);
    if (!remaining) return false;
    // An independent low pair can start the same recovery chain as a lower
    // pair run. In 2,AA,KK,J,1010,6,55, leading 55 retains the complete KKAA
    // pair run to regain control. Without this branch the later equal-turn
    // "shed more cards" rule promotes KKAA back ahead of 55.
    const handCounts = countsOf(hand);
    const intactPairRank = played.length === 2
        && rank(played[0]) === rank(played[1])
        && handCounts[rank(played[0])] === 2
        ? rank(played[0]) : null;
    if (intactPairRank !== null) {
        return runs(countsOf(remaining), 2, rules.minimumPairRunLength, rules.allowTwoInRuns)
            // Only a high pair run is a reliable recovery body. Treating low
            // 8899 as equivalent to KKAA would incorrectly make 33 precede
            // the larger low combination despite the <=10 lead policy.
            .some(([start]) => start > 10 && start > intactPairRank);
    }
    if (!bounds) return false;
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

function pairAttachmentVariants(
    counts: readonly number[],
    excludedRanks: ReadonlySet<number>,
    pairAmount: number,
): number[][] {
    if (pairAmount <= 0) return [Array<number>(16).fill(0)];
    const result: number[][] = [];
    const current = Array<number>(16).fill(0);
    const build = (value: number, remainingPairs: number): void => {
        if (remainingPairs === 0) {
            result.push([...current]);
            return;
        }
        if (value > 15) return;
        if (excludedRanks.has(value) || counts[value] < 2) {
            build(value + 1, remainingPairs);
            return;
        }
        build(value + 1, remainingPairs);
        current[value] = 2;
        build(value + 1, remainingPairs - 1);
        current[value] = 0;
    };
    build(3, pairAmount);
    return result;
}

interface MinimumPlanQuality {
    singles: number;
    turns: number;
}

function minimumPlanQuality(
    initial: readonly number[],
    rules: PdkHintRules,
    memo: Map<string, MinimumPlanQuality> = new Map<string, MinimumPlanQuality>(),
): MinimumPlanQuality {
    const visit = (counts: number[]): MinimumPlanQuality => {
        const key = counts.slice(3).join('');
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        const first = counts.findIndex((count, value) => value >= 3 && count > 0);
        if (first < 0) return { singles: 0, turns: 0 };
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
        const attachmentMode = rules.tripleAttachmentMode
            ?? ((rules.singleAttachmentCapacityPerTriple ?? 0) >= 2 ? 'EITHER'
                : (rules.singleAttachmentCapacityPerTriple ?? 0) >= 1 ? 'SINGLES' : 'DISABLED');
        for (const [start, end] of tripleRuns) {
            const body = Array<number>(16).fill(0);
            const bodyRanks = new Set<number>();
            for (let value = start; value <= end; value += 1) {
                body[value] = 3;
                bodyRanks.add(value);
            }
            addRemoval(body);
            const bodyLength = end - start + 1;
            const withoutBody = counts.map((count, value) => count - body[value]);
            const remainingCardCount = withoutBody.reduce((total, count) => total + count, 0);
            const attachmentPlans: Array<{ cards: number; pairsOnly: boolean }> = [];
            if (attachmentMode === 'SINGLES' || attachmentMode === 'SINGLE_OR_PAIR'
                || attachmentMode === 'EITHER') {
                attachmentPlans.push({ cards: bodyLength, pairsOnly: false });
            }
            if (attachmentMode === 'PAIRS' || attachmentMode === 'SINGLE_OR_PAIR') {
                attachmentPlans.push({ cards: bodyLength * 2, pairsOnly: true });
            } else if (attachmentMode === 'EITHER') {
                attachmentPlans.push({ cards: bodyLength * 2, pairsOnly: false });
            }
            for (const plan of attachmentPlans) {
                const attachmentRanks = new Set(bodyRanks);
                // A regional maximum may be attached only when this triple
                // family empties the complete remainder. Otherwise it must stay
                // available to recapture the lead.
                if (remainingCardCount > plan.cards) {
                    for (const value of rules.maximumSingleRanks ?? [15]) {
                        attachmentRanks.add(value);
                    }
                }
                const variants = plan.pairsOnly
                    ? pairAttachmentVariants(withoutBody, attachmentRanks, bodyLength)
                    : attachmentVariants(withoutBody, attachmentRanks, plan.cards);
                for (const attachments of variants) {
                    addRemoval(body.map((amount, value) => amount + attachments[value]));
                }
            }
        }
        let best: MinimumPlanQuality = {
            singles: Number.POSITIVE_INFINITY,
            turns: Number.POSITIVE_INFINITY,
        };
        for (const removal of removals.values()) {
            const next = counts.map((count, value) => count - removal[value]);
            if (next.some((count) => count < 0)) continue;
            const tail = visit(next);
            const candidate = {
                singles: tail.singles
                    + (removal.reduce((total, count) => total + count, 0) === 1 ? 1 : 0),
                turns: tail.turns + 1,
            };
            if (candidate.turns < best.turns
                || (candidate.turns === best.turns && candidate.singles < best.singles)) {
                best = candidate;
            }
        }
        memo.set(key, best);
        return best;
    };
    return visit([...initial]);
}

function quality(
    cards: readonly number[],
    rules: PdkHintRules,
    planMemo?: Map<string, MinimumPlanQuality>,
): HandQuality {
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
    // Evaluate loose cards from a complete legal decomposition. Raw rank count
    // cannot distinguish the surplus 9 in 99,10,J,Q,K,A from the 9 used by the
    // straight, and local longest-run coverage misses combinations of several
    // triples, pair runs and straights.
    const plan = minimumPlanQuality(counts, rules, planMemo);
    const isolated = plan.singles;
    return {
        turns: remainingBombs.length + plan.turns,
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

function tripleFamilyBodyRanks(hand: readonly number[], played: readonly number[]): number[] {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    const eligibleCounts = playedCounts.map((count, value) =>
        value <= 14 && count >= 3 && handCounts[value] >= count ? count : 0);
    const longest = runs(eligibleCounts, 3, 1, false)
        .sort((left, right) => (right[1] - right[0]) - (left[1] - left[0])
            || left[0] - right[0])[0];
    if (!longest) return [];
    return Array.from({ length: longest[1] - longest[0] + 1 },
        (_, index) => longest[0] + index);
}

function tripleFamilyAttachments(hand: readonly number[], played: readonly number[]): number[] {
    const bodyRanks = new Set(tripleFamilyBodyRanks(hand, played));
    if (bodyRanks.size === 0) return [];
    return played.filter((card) => !bodyRanks.has(rank(card)));
}

function tripleAttachmentCardCount(hand: readonly number[], played: readonly number[]): number {
    const handCounts = countsOf(hand);
    const playedCounts = countsOf(played);
    const bodyRanks = new Set(tripleFamilyBodyRanks(hand, played));
    return playedCounts.reduce((total, count, value) =>
        total + (handCounts[value] === 3 && !bodyRanks.has(value) ? count : 0), 0);
}

function tripleFamilyBodyRank(hand: readonly number[], played: readonly number[]): number {
    return tripleFamilyBodyRanks(hand, played)[0] ?? Number.MAX_SAFE_INTEGER;
}

function tripleFamilyBodyCount(hand: readonly number[], played: readonly number[]): number {
    return tripleFamilyBodyRanks(hand, played).length;
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

/**
 * When the regional rules do not enable “三带比带”, triple-family wings are
 * always shed from the lowest rank upward. This is not an endgame heuristic: a
 * regional maximum card must never jump ahead merely because it would leave an
 * attractive two-play remainder. Structural bomb/triple protection is applied
 * before this tie breaker, so choosing the lowest wing cannot split an
 * otherwise protected body.
 */
function compareTripleAttachmentRanks(
    hand: readonly number[],
    left: readonly number[],
    right: readonly number[],
): number {
    const leftRanks = tripleFamilyAttachments(hand, left).map(rank).sort((a, b) => a - b);
    const rightRanks = tripleFamilyAttachments(hand, right).map(rank).sort((a, b) => a - b);
    if (leftRanks.length !== rightRanks.length) return 0;
    for (let index = 0; index < leftRanks.length; index += 1) {
        if (leftRanks[index] !== rightRanks[index]) return leftRanks[index] - rightRanks[index];
    }
    return 0;
}

/**
 * Special low-pair cleanup rule for a triple-with-two.
 *
 * The general case requires at least two intact pairs below rank 10 (10 itself
 * is excluded) and only high loose singles. There is one narrow control-card
 * endgame exception: one triple, one independent low pair and exactly two high
 * singles, one of which is the regional maximum. In that seven-card shape the
 * triple carries the pair (333+99, then K, then 2) instead of leading 99 and
 * being forced to waste the maximum 2 as the final triple attachment.
 */
function usesPreferredLowPairAttachment(
    hand: readonly number[], played: readonly number[], rules: PdkHintRules,
): boolean {
    const attachments = tripleFamilyAttachments(hand, played);
    if (attachments.length !== 2 || tripleFamilyBodyCount(hand, played) !== 1) return false;
    const handCounts = countsOf(hand);
    const lowPairs = handCounts.map((count, value) => count === 2 && value < 10 ? value : 0)
        .filter(Boolean);
    const looseSingles = handCounts.map((count, value) => count === 1 ? value : 0).filter(Boolean);
    const maximumSingles = new Set(rules.maximumSingleRanks ?? [15]);
    const singlePairMaximumControlEndgame = hand.length === 7
        && lowPairs.length === 1
        && looseSingles.length === 2
        && handCounts.filter((count) => count === 3).length === 1
        && handCounts.every((count) => count !== 4)
        && looseSingles.some((value) => maximumSingles.has(value));
    if ((lowPairs.length < 2 && !singlePairMaximumControlEndgame)
        || looseSingles.length === 0
        || looseSingles.some((value) => value < 10)) return false;
    const minimumLowPair = Math.min(...lowPairs);
    // The low-pair attachment exception applies only to an independent pair.
    // A pair that belongs to a legal pair run was already classified as an
    // atomic body and must not be borrowed as wings. Example: 77+88 remains
    // the four-card pair run in A,QQ,JJJ,88,77 instead of becoming JJJ+77.
    if (pairRunSegmentForRank(handCounts, minimumLowPair, rules) !== null) return false;
    if (singlePairMaximumControlEndgame) {
        const body = subtract(played, attachments) ?? [];
        if (isCompleteProtectedBomb(body, rules.protectedBombs ?? [])) return false;
    }
    return attachments.every((card) => rank(card) === minimumLowPair);
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

function attachmentPairPolicyCost(
    hand: readonly number[],
    played: readonly number[],
    rules: PdkHintRules,
): number {
    const attachments = tripleFamilyAttachments(hand, played);
    if (attachments.length !== 2 || tripleFamilyBodyCount(hand, played) !== 1) return 0;
    const handCounts = countsOf(hand);
    const attachmentCounts = countsOf(attachments);
    const maximumSingles = new Set(rules.maximumSingleRanks ?? [15]);
    const singles = handCounts.map((count, value) => count === 1 && !maximumSingles.has(value) ? value : 0)
        .filter(Boolean);
    const pairs = handCounts.map((count, value) => count === 2 ? value : 0).filter(Boolean);
    if (singles.length === 0 || pairs.length === 0) return 0;
    // Two genuine loose cards already satisfy triple-with-two without damaging
    // any structure. They must both be consumed before the older one-single
    // fallback is allowed to open a pair. Example: 777,44,3,5 carries 3+5;
    // choosing 3+4 would manufacture two avoidable loose cards in the remainder.
    if (singles.length >= 2) {
        const twoSmallestSingles = [...singles].sort((left, right) => left - right).slice(0, 2);
        const matchesLooseSingles = twoSmallestSingles.every((value) => attachmentCounts[value] >= 1);
        if (matchesLooseSingles) return 0;
        return attachments.some((card) => maximumSingles.has(rank(card))) ? 100 : 1;
    }
    const minimumSingle = Math.min(...singles);
    const minimumPair = Math.min(...pairs);
    const matches = minimumSingle > minimumPair
        ? attachmentCounts[minimumPair] === 2
        : attachmentCounts[minimumSingle] >= 1 && attachmentCounts[minimumPair] >= 1;
    if (matches) return 0;
    return attachments.some((card) => maximumSingles.has(rank(card))) ? 100 : 1;
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
    planMemo?: Map<string, MinimumPlanQuality>,
): number {
    const attachments = tripleFamilyAttachments(hand, played);
    if (attachments.length === 0) return 0;
    const body = played.filter((card) => !attachments.includes(card));
    const base = subtract(hand, body);
    const remaining = subtract(hand, played);
    if (!base || !remaining) return Number.MAX_SAFE_INTEGER;
    const before = quality(base, rules, planMemo);
    const after = quality(remaining, rules, planMemo);
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
    const policyId: PdkHintPolicyId = rules.policyId ?? 'COMMON';
    const liangshanPolicy = policyId === 'LS201';
    const normalizedRules: PdkHintRules = {
        policyId,
        minimumStraightLength: Math.max(3, Math.trunc(rules.minimumStraightLength)),
        minimumPairRunLength: Math.max(2, Math.trunc(rules.minimumPairRunLength)),
        allowTwoInRuns: Boolean(rules.allowTwoInRuns),
        protectedBombs,
        singleAttachmentCapacityPerTriple: Math.max(0,
            Math.trunc(rules.singleAttachmentCapacityPerTriple ?? 0)),
        tripleAttachmentMode: rules.tripleAttachmentMode
            ?? ((rules.singleAttachmentCapacityPerTriple ?? 0) >= 2 ? 'EITHER'
                : (rules.singleAttachmentCapacityPerTriple ?? 0) >= 1 ? 'SINGLES' : 'DISABLED'),
        prioritizeMaximumWithOneOrdinaryPlay:
            liangshanPolicy && Boolean(rules.prioritizeMaximumWithOneOrdinaryPlay),
        prioritizeLargestLeadWithoutMaximum:
            liangshanPolicy && Boolean(rules.prioritizeLargestLeadWithoutMaximum),
        prioritizeMaximumLeadUnlessConnectedRun:
            liangshanPolicy && Boolean(rules.prioritizeMaximumLeadUnlessConnectedRun),
        prioritizeMaximumResponseWithinThreePlays:
            liangshanPolicy && Boolean(rules.prioritizeMaximumResponseWithinThreePlays),
        prioritizeLargestLeadUnlessMaximumStraight:
            liangshanPolicy && Boolean(rules.prioritizeLargestLeadUnlessMaximumStraight),
        prioritizeLooseSingles: Boolean(rules.prioritizeLooseSingles),
        optimizeWholeHand: Boolean(rules.optimizeWholeHand),
        compareTripleAttachments: Boolean(rules.compareTripleAttachments),
        preserveScoringBombs: Boolean(rules.preserveScoringBombs),
        maximumSingleRanks: [...(rules.maximumSingleRanks ?? [15])],
        deckCards: [...(rules.deckCards ?? [])],
        didCompeteDealer: liangshanPolicy ? rules.didCompeteDealer : undefined,
    };
    const deckMaximumRank = normalizedRules.deckCards?.length
        ? Math.max(...normalizedRules.deckCards.map(rank)) : 15;
    const liangshanMaximumPairResponse = liangshanPolicy && deckMaximumRank === 14
        && hand.filter((card) => rank(card) === deckMaximumRank).length === 2;
    // Bomb recognition is shared by every regional game. Whether that bomb is
    // protected is decided separately by the authoritative scoring switch:
    // scoring bombs stay atomic, while non-scoring four-card bombs may only be
    // consumed through a legal four-with attachment candidate.
    const hintBombs = [...(normalizedRules.protectedBombs ?? []), ...ordinaryBombGroups(hand)]
        .filter((group, index, groups) => groups.findIndex((candidate) =>
            [...candidate].sort((left, right) => left - right).join(',')
                === [...group].sort((left, right) => left - right).join(',')) === index);
    // All candidate remainders share most recursive sub-hands. Reusing this
    // memo for one Hint calculation removes repeated exponential planning work
    // from the UI thread without persisting state across hands or rule sets.
    const planMemo = new Map<string, MinimumPlanQuality>();
    const visibleCandidates = candidates.filter((candidate) =>
        !isCoveredByLongerPairRun(candidate.cards, candidates, normalizedRules,
            hand, hintBombs));
    const scored = visibleCandidates
        .map((candidate) => {
            const remaining = subtract(hand, candidate.cards);
            const protectedImpact = protectedBombImpact(hand, candidate.cards, normalizedRules.protectedBombs ?? []);
            const hintBombImpact = protectedBombImpact(hand, candidate.cards, hintBombs);
            const completeBomb = isCompleteProtectedBomb(candidate.cards, hintBombs);
            const legalNonScoringFourWith = !normalizedRules.preserveScoringBombs
                && Boolean(candidate.usesFourCardBody);
            // A non-scoring bomb may be opened only by the regional engine's
            // legal four-with attachment shape. It must not leak cards into a
            // straight, pair, triple body or aircraft wing.
            if ((hintBombImpact.split > 0 || hintBombImpact.consumed > 0)
                && !completeBomb && !legalNonScoringFourWith) return null;
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
            if (!remaining) return null;
            // Complete-hand planning is the expensive part of hint ranking.
            // Compute it once per candidate and reuse both its turn count and
            // isolated-card count; evaluating quality twice caused avoidable
            // main-thread spikes on large opening hands.
            const remainingQuality = quality(remaining, normalizedRules, planMemo);
            return {
                ...candidate,
                splitBombs: candidate.usesFourCardBody ? 0
                    : Math.max(splitBombCount(hand, candidate.cards), protectedImpact.split),
                splitTriples: splitTripleCount(hand, candidate.cards),
                splitPairs: splitPairCount(hand, candidate.cards),
                // Bomb identity is independent from score mode. Scoring only
                // changes settlement/endgame priority; it must never turn an
                // exact regional AAA bomb into an ordinary triple candidate.
                completeBombs: candidate.usesFourCardBody ? 0
                    : Math.max(completeBombCount(hand, candidate.cards), hintBombImpact.consumed),
                consumesFourCardBody: Boolean(candidate.usesFourCardBody),
                wholeHandBombFinish: Boolean(candidate.usesFourCardBody
                    && remaining.length === 0 && protectedImpact.consumed > 0),
                earlyAceBomb: hand.length > 10
                    && consumesProtectedAceBomb(candidate.cards, normalizedRules.protectedBombs ?? []),
                remainingCount: remaining.length,
                remainingHighestRank: remaining.reduce((highest, card) => Math.max(highest, rank(card)), 0),
                quality: remainingQuality,
                planLooseSingles: remainingQuality.isolated
                    + (candidate.cards.length === 1 ? 1 : 0),
                attachmentDamage: attachmentStructureDamage(
                    hand, candidate.cards, normalizedRules, planMemo,
                ),
                attachmentSourceCost: attachmentSourceCost(hand, candidate.cards),
                attachmentPairPolicyCost: attachmentPairPolicyCost(hand, candidate.cards, normalizedRules),
                attachmentControlCost: attachmentControlCost(hand, candidate.cards),
                usesTwoAttachment: tripleFamilyAttachments(hand, candidate.cards)
                    .some((card) => rank(card) === 15),
                usesMaximumAttachment: tripleFamilyAttachments(hand, candidate.cards)
                    .some((card) => (normalizedRules.maximumSingleRanks ?? []).includes(rank(card))),
                tripleBodyRank: tripleFamilyBodyRank(hand, candidate.cards),
                tripleBodyCount: tripleFamilyBodyCount(hand, candidate.cards),
                straightBody: isStraightCandidate(candidate.cards, normalizedRules),
                leavesStraightBody: runs(countsOf(remaining), 1,
                    normalizedRules.minimumStraightLength, normalizedRules.allowTwoInRuns).length > 0,
                retainsHigherStraight: isStraightCandidate(candidate.cards, normalizedRules)
                    && runs(countsOf(remaining), 1,
                        normalizedRules.minimumStraightLength, normalizedRules.allowTwoInRuns)
                        .some(([start, end]) => end - start + 1 === candidate.cards.length
                            && start > Math.min(...candidate.cards.map(rank))),
                retainsHigherPairRun: retainsHigherPairRun(hand, candidate.cards, normalizedRules),
                retainsHigherLooseSingle: candidate.cards.length === 1
                    && countsOf(hand)[rank(candidate.cards[0])] === 1
                    && countsOf(remaining).some((count, value) => count === 1
                        && value > rank(candidate.cards[0])),
            };
        })
        .filter((value): value is PdkHintCandidate & { splitBombs: number; splitTriples: number; splitPairs: number; completeBombs: number; consumesFourCardBody: boolean; wholeHandBombFinish: boolean; earlyAceBomb: boolean; remainingCount: number; remainingHighestRank: number; quality: HandQuality; planLooseSingles: number; attachmentDamage: number; attachmentSourceCost: number; attachmentPairPolicyCost: number; attachmentControlCost: number; usesTwoAttachment: boolean; usesMaximumAttachment: boolean; tripleBodyRank: number; tripleBodyCount: number; straightBody: boolean; leavesStraightBody: boolean; retainsHigherStraight: boolean; retainsHigherPairRun: boolean; retainsHigherLooseSingle: boolean } => value !== null);
    // An intact pair is a complete legal wing source. If the same triple body
    // can carry the same number of cards without touching another complete
    // triple, never keep the variant that peels cards from that triple. Generic
    // loose-single scoring otherwise prefers 333+4+Q from 333,4,QQQ,KK because
    // it leaves two pairs, even though 333+KK leaves the complete QQQ+4 final
    // hand and finishes in fewer plays.
    const attachmentSafeScored = scored.filter((candidate) => {
        const tripleAttachmentCards = tripleAttachmentCardCount(hand, candidate.cards);
        if (candidate.tripleBodyCount > 0 && tripleAttachmentCards > 0
            && scored.some((alternative) =>
            alternative.tripleBodyCount === candidate.tripleBodyCount
            && alternative.tripleBodyRank === candidate.tripleBodyRank
            && alternative.cards.length === candidate.cards.length
            && tripleAttachmentCardCount(hand, alternative.cards) === 0)) return false;
        if (candidate.tripleBodyCount <= 0 || candidate.splitTriples <= 0) return true;
        return !scored.some((alternative) => alternative.tripleBodyCount === candidate.tripleBodyCount
            && alternative.tripleBodyRank === candidate.tripleBodyRank
            && alternative.cards.length === candidate.cards.length
            && alternative.splitTriples === 0
            && alternative.quality.turns <= candidate.quality.turns
            // Equal one-card endings keep the largest final singleton even
            // when that requires using part of another triple as wings.
            && !(candidate.remainingCount === 1 && alternative.remainingCount === 1
                && candidate.remainingHighestRank > alternative.remainingHighestRank));
    });
    const minimumPlanTurns = Math.min(...attachmentSafeScored
        .map((candidate) => candidate.quality.turns));
    const maximumLeadCardsAtMinimumTurns = Math.max(...attachmentSafeScored
        .filter((candidate) => candidate.quality.turns === minimumPlanTurns)
        .map((candidate) => candidate.cards.length));
    const minimumSinglesAtMinimumTurnsAndSize = Math.min(...attachmentSafeScored
        .filter((candidate) => candidate.quality.turns === minimumPlanTurns
            && candidate.cards.length === maximumLeadCardsAtMinimumTurns)
        .map((candidate) => candidate.planLooseSingles));
    const minimumSingleDecompositionStraight = attachmentSafeScored
        .filter((candidate) => candidate.straightBody
            && candidate.quality.turns === minimumPlanTurns
            && candidate.cards.length === maximumLeadCardsAtMinimumTurns
            && candidate.planLooseSingles === minimumSinglesAtMinimumTurnsAndSize)
        .sort((left, right) => right.cards.length - left.cards.length
            || Math.min(...left.cards.map(rank)) - Math.min(...right.cards.map(rank)))[0];
    const minimumSingleDecompositionLead = attachmentSafeScored
        .filter((candidate) => candidate.quality.turns === minimumPlanTurns
            && candidate.cards.length === maximumLeadCardsAtMinimumTurns
            && candidate.planLooseSingles === minimumSinglesAtMinimumTurnsAndSize
            && candidate.splitBombs === 0
            && candidate.splitTriples === 0
            && candidate.splitPairs === 0
            && !candidate.usesMaximumAttachment
            && !isCompleteProtectedBomb(candidate.cards, hintBombs))
        .sort((left, right) => right.cards.length - left.cards.length
            || Math.min(...left.cards.map(rank)) - Math.min(...right.cards.map(rank)))[0];
    const atomicPairRunLead = attachmentSafeScored
        .filter((candidate) => pairRunBounds(candidate.cards, normalizedRules) !== null
            && candidate.quality.turns === minimumPlanTurns
            && candidate.splitBombs === 0 && candidate.splitTriples === 0)
        .sort((left, right) => right.cards.length - left.cards.length
            || Math.min(...left.cards.map(rank)) - Math.min(...right.cards.map(rank)))[0];
    const multiStraightPool = attachmentSafeScored
        .filter((candidate) => candidate.straightBody && candidate.leavesStraightBody
            && candidate.quality.turns === minimumPlanTurns
            && candidate.splitBombs === 0);
    const multiStraightMinimumTurns = multiStraightPool.length > 0
        ? Math.min(...multiStraightPool.map((candidate) => candidate.quality.turns))
        : Number.POSITIVE_INFINITY;
    const multiStraightMaximumCards = multiStraightPool.length > 0
        ? Math.max(...multiStraightPool
            .filter((candidate) => candidate.quality.turns === multiStraightMinimumTurns)
            .map((candidate) => candidate.cards.length))
        : Number.NEGATIVE_INFINITY;
    const multiStraightMinimumSingles = multiStraightPool.length > 0
        ? Math.min(...multiStraightPool
            .filter((candidate) => candidate.quality.turns === multiStraightMinimumTurns
                && candidate.cards.length === multiStraightMaximumCards)
            .map((candidate) => candidate.planLooseSingles))
        : Number.POSITIVE_INFINITY;
    const multiStraightLead = multiStraightPool
        .filter((candidate) => candidate.planLooseSingles === multiStraightMinimumSingles
            && candidate.quality.turns === multiStraightMinimumTurns
            && candidate.cards.length === multiStraightMaximumCards)
        .sort((left, right) => Math.min(...left.cards.map(rank))
            - Math.min(...right.cards.map(rank)))[0];
    const handHasNoLooseSingle = quality(hand, normalizedRules, planMemo).isolated === 0;
    const originalCounts = countsOf(hand);
    // With several independent pairs and only high loose cards, spending the
    // smallest pair as wings preserves high control cards that can regain the
    // lead. This is deliberately limited to a pair-heavy hand: elsewhere loose
    // attachments remain preferable and complete pairs/runs stay intact.
    const pairHeavyControlHand = originalCounts.filter((count) => count === 2).length >= 3
        && originalCounts.every((count, value) => value < 3 || count !== 1 || value >= 13);
    const hasTripleRecoveryChain = originalCounts.filter((count) => count === 3).length >= 2;
    const originalQuality = quality(hand, normalizedRules, planMemo);
    const regionalMaximumAtomicPlays = regionalMaximumAtomicPlayCount(
        hand, normalizedRules.deckCards ?? [],
    );
    const simpleSinglesAndPairs = originalQuality.triples === 0
        && originalQuality.airplaneCards === 0
        && originalQuality.runCards === 0
        && originalQuality.pairRunCards === 0;
    const pairCount = originalCounts.filter((count) => count === 2).length;
    const rawSingleCount = originalCounts.filter((count) => count === 1).length;
    // A sole ordinary pair and loose singles can probe below an intact maximum
    // triple without spending that control body. Choose the lowest-ranked
    // atomic group, not merely the lowest singleton: AAA,K,Q,8,77 starts from
    // 77, while AAA,Q,JJ,9,7 still starts from 7. This is derived from the deck
    // maximum and hand structure, so it also applies to regional 5-A decks.
    const maximumTripleControlHand = liangshanPolicy
        && originalCounts[deckMaximumRank] === 3
        && pairCount >= 1;
    const maximumTripleProbeHand = maximumTripleControlHand
        && pairCount === 1 && rawSingleCount >= 1;
    const maximumTriplePairDominantHand = maximumTripleControlHand
        && pairCount >= 2 && pairCount * 2 > rawSingleCount;
    const hasMaximumLooseSingle = attachmentSafeScored.some((candidate) => candidate.cards.length === 1
        && originalCounts[rank(candidate.cards[0])] === 1
        && Boolean(candidate.containsRuleMaximum));
    const hasMaximumIntactPair = attachmentSafeScored.some((candidate) => candidate.cards.length === 2
        && rank(candidate.cards[0]) === rank(candidate.cards[1])
        && originalCounts[rank(candidate.cards[0])] === 2
        && Boolean(candidate.containsRuleMaximum));
    const responsePairCandidates = !preferLargest
        ? attachmentSafeScored.filter((candidate) => candidate.cards.length === 2
            && rank(candidate.cards[0]) === rank(candidate.cards[1])
            && originalCounts[rank(candidate.cards[0])] === 2)
        : [];
    const hasIndependentResponsePair = responsePairCandidates.some((candidate) =>
        pairRunSegmentForRank(originalCounts, rank(candidate.cards[0]), normalizedRules) === null);
    // When pairs contain more cards than all loose singles, the hand is pair-
    // dominant and must start from the lowest pair even if one loose card is the
    // regional maximum. Example: 2,J,9,6 + QQ,77,55,33 starts from 33; letting
    // the maximum 2 suppress pair priority incorrectly starts from single 6.
    // Raw intact pairs are also a valid lower-single decomposition when the
    // same ranks could technically form a straight. In 2,Q,99,8,77,6,55 the
    // 5-9 straight leaves more singleton ranks than preserving 99/77/55, so the
    // pair-heavy decomposition must remain eligible during first-stage planning.
    const pairDominantHand = pairCount * 2 > rawSingleCount
        && originalCounts.every((count) => count !== 3);
    // With exactly one regional-maximum pair and at least one loose single,
    // preserve that pair and shed the lowest singleton first. This is narrower
    // than general pair dominance: AAK4 starts from 4, while KKJQ still starts
    // from KK and a multi-pair hand still starts its ordinary recovery chain.
    const singleLeadWithMaximumPairRecapture = simpleSinglesAndPairs
        && pairCount === 1 && rawSingleCount >= 1 && hasMaximumIntactPair;
    const pairLeadWithoutSingleRecapture = (simpleSinglesAndPairs || pairDominantHand)
        && pairCount >= 1
        // A simple hand does not automatically make its only pair the opening
        // play. The pair family must contain at least as many physical cards as
        // the loose singles; otherwise 4,5,7,J,AA incorrectly spends AA before
        // the low singles. Equal counts keep the established KK,J,Q -> KK rule.
        && pairCount * 2 >= rawSingleCount
        && !singleLeadWithMaximumPairRecapture
        && (pairDominantHand || !hasMaximumLooseSingle);
    const singleDominantHand = (simpleSinglesAndPairs
        && rawSingleCount > pairCount * 2)
        || singleLeadWithMaximumPairRecapture;
    // A low straight assembled from several duplicate ranks remains one
    // coherent body even though preserving every raw pair reports fewer loose
    // cards. Under the requested tolerance, ranks below 10 keep that straight
    // instead of letting the final pair-lead invariant peel off its low pair.
    // Example: 55677899 keeps 56789 ahead of 55.
    const maximumStraightCandidateLength = attachmentSafeScored.reduce((maximum, candidate) =>
        candidate.straightBody ? Math.max(maximum, candidate.cards.length) : maximum, 0);
    const lowDuplicateStraight = attachmentSafeScored
        .filter((candidate) => candidate.straightBody
            // This exception may reuse duplicate pairs, but it cannot dismantle
            // an already classified triple body. Otherwise 34567 borrows one 4
            // from 444 and is promoted over the shorter authoritative plan
            // 444+3+7, 5566, 999+10. Pair-only shapes such as 55677899 and
            // 67789910 retain their established straight exception.
            && candidate.splitTriples === 0
            // The duplicate-tolerance exception preserves a low straight; it
            // must never shorten an already connected longer straight such as
            // 5-A merely because the first five ranks also form 5-9.
            && candidate.cards.length === maximumStraightCandidateLength
            && Math.max(...candidate.cards.map(rank)) <= 11
            // One true singleton may appear anywhere. Two are accepted only as
            // the two endpoints (67789910 -> 6-10); interior singleton holes do
            // not qualify, so 2,Q,99,8,77,6,55 still preserves its pairs.
            && (() => {
                const values = candidate.cards.map(rank);
                const singles = values.filter((value) => originalCounts[value] === 1);
                return singles.length <= 1 || (singles.length === 2
                    && singles.includes(Math.min(...values))
                    && singles.includes(Math.max(...values)));
            })())
        .sort((left, right) => right.cards.length - left.cards.length
            || Math.min(...left.cards.map(rank)) - Math.min(...right.cards.map(rank)))[0];
    // A straight may borrow from a bomb only when the hand has no straight that
    // keeps every bomb intact. This is a structural choice, not a rank-specific
    // exception: 7-J must precede 8-Q when QQQQ is present, while a genuinely
    // irreplaceable bomb card may still complete a long whole-hand straight.
    const hasCleanStraightLead = attachmentSafeScored.some((candidate) => candidate.straightBody
        && candidate.splitBombs === 0);
    const structurallyEligible = hasCleanStraightLead
        ? attachmentSafeScored.filter((candidate) => !candidate.straightBody || candidate.splitBombs === 0)
        : attachmentSafeScored;
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
            // LS201 has no rank 2; A is its immutable maximum. When a single is
            // answered from AA plus another singleton, taking control with A
            // outranks the generic minimum-play remainder calculation. Exactly
            // two copies are required so AAA and four-card bombs remain atomic.
            if (liangshanMaximumPairResponse && !preferLargest
                && left.cards.length === 1 && right.cards.length === 1
                && left.containsRuleMaximum !== right.containsRuleMaximum) {
                return left.containsRuleMaximum ? -1 : 1;
            }
            // A hand containing a bomb is never auto-finished through a
            // four-card-body combination. Keep that legal manual choice as the
            // final hint, after loose cards and the standalone bomb have both
            // been exposed by the cycle.
            if (left.wholeHandBombFinish !== right.wholeHandBombFinish) {
                return left.wholeHandBombFinish ? 1 : -1;
            }
            // Response endgame control is resolved before the ordinary pair/
            // structure policy. With AA+QQ answering 88, both choices leave a
            // final legal pair, so the regional-maximum AA must take control.
            // The same applies to a three-play hand only when two intact hands
            // are regional maxima (for example 2 + AA + QQ); a lone maximum in
            // an ordinary three-play hand remains reserved for later recovery.
            const responseEndgameMaximum = (candidate: typeof left): boolean =>
                !preferLargest
                && Boolean(candidate.containsRuleMaximum)
                && !candidate.usesMaximumAttachment
                && (Boolean(candidate.finishesInTwo)
                    || (originalQuality.turns <= 3 && regionalMaximumAtomicPlays >= 2));
            const leftResponseEndgameMaximum = responseEndgameMaximum(left);
            const rightResponseEndgameMaximum = responseEndgameMaximum(right);
            if (leftResponseEndgameMaximum !== rightResponseEndgameMaximum) {
                return leftResponseEndgameMaximum ? -1 : 1;
            }
            // Consecutive-pair responses must compare the complete remainder,
            // just like ordinary pair responses below. Point order is only a
            // final tie-breaker. Otherwise 991010 is selected merely because 9
            // is lower, even though it opens 999 and leaves three later plays;
            // intact QQKK leaves 999+55 and 1010, requiring only two.
            const responsePairRunOrder = (candidate: typeof left): [number, number, number, number, number, number] | null => {
                if (preferLargest || pairRunBounds(candidate.cards, normalizedRules) === null) return null;
                return [
                    candidate.quality.turns,
                    candidate.splitBombs,
                    candidate.splitTriples,
                    candidate.planLooseSingles,
                    -candidate.quality.structuredCards,
                    Math.min(...candidate.cards.map(rank)),
                ];
            };
            const leftPairRunOrder = responsePairRunOrder(left);
            const rightPairRunOrder = responsePairRunOrder(right);
            if (leftPairRunOrder && rightPairRunOrder
                && left.cards.length === right.cards.length) {
                for (let index = 0; index < leftPairRunOrder.length; index += 1) {
                    const difference = leftPairRunOrder[index] - rightPairRunOrder[index];
                    if (difference !== 0) return difference;
                }
            }
            // Pair response decomposition is explicit: consume an intact pair
            // before opening any pair run. If every winning pair belongs to a
            // run, open the higher run first (QQKK before 5566), then its lower
            // pair (QQ before KK) so the larger pair remains able to recapture.
            const responsePairOrder = (candidate: typeof left): [number, number, number, number] | null => {
                // This is strictly a response policy. Applying it while the
                // player leads promoted any standalone pair ahead of a complete
                // aircraft, bypassing the authoritative whole-hand planner.
                if (preferLargest || candidate.cards.length !== 2
                    || rank(candidate.cards[0]) !== rank(candidate.cards[1])
                    || originalCounts[rank(candidate.cards[0])] !== 2) return null;
                const value = rank(candidate.cards[0]);
                const segment = pairRunSegmentForRank(originalCounts, value, normalizedRules);
                // Whole-hand completion remains authoritative for a response.
                // A nominally independent pair may still be essential to a
                // straight: removing 44 from AA,QQ,JJJ,10,88,7,6,5,44,3
                // destroys 34567 and leaves seven plays, while 88 leaves only
                // four. Compare that remainder before the older pair-run and
                // point-order policy, then use 88 as the lowest clean answer.
                if (hasIndependentResponsePair) {
                    return [candidate.quality.turns, segment ? 1 : 0, 0, value];
                }
                return [candidate.quality.turns, 0, -(segment?.start ?? value), value];
            };
            const leftPairOrder = responsePairOrder(left);
            const rightPairOrder = responsePairOrder(right);
            if (leftPairOrder && rightPairOrder) {
                for (let index = 0; index < leftPairOrder.length; index += 1) {
                    const difference = leftPairOrder[index] - rightPairOrder[index];
                    if (difference !== 0) return difference;
                }
            } else if (leftPairOrder || rightPairOrder) {
                return leftPairOrder ? -1 : 1;
            }
            // With scoring enabled, an exact two-play endgame leads the atomic
            // bomb before its ordinary remainder. This is deliberately narrower
            // than general bomb priority: with three or more plays, the bomb is
            // still retained as the late control/score hand.
            const leftTwoHandScoringBomb = normalizedRules.preserveScoringBombs
                && left.finishesInTwo && isCompleteProtectedBomb(left.cards, hintBombs);
            const rightTwoHandScoringBomb = normalizedRules.preserveScoringBombs
                && right.finishesInTwo && isCompleteProtectedBomb(right.cards, hintBombs);
            if (leftTwoHandScoringBomb !== rightTwoHandScoringBomb) {
                return leftTwoHandScoringBomb ? -1 : 1;
            }
            const sameSingleTripleBody = left.tripleBodyCount === 1
                && right.tripleBodyCount === 1
                && left.tripleBodyRank === right.tripleBodyRank;
            if (sameSingleTripleBody) {
                const leftUsesPreferredLowPair = usesPreferredLowPairAttachment(
                    hand, left.cards, normalizedRules,
                );
                const rightUsesPreferredLowPair = usesPreferredLowPairAttachment(
                    hand, right.cards, normalizedRules,
                );
                if (leftUsesPreferredLowPair !== rightUsesPreferredLowPair) {
                    return leftUsesPreferredLowPair ? -1 : 1;
                }
            }
            const sameTripleAttachmentShape = !normalizedRules.compareTripleAttachments
                && left.tripleBodyCount > 0
                && left.tripleBodyCount === right.tripleBodyCount
                && left.tripleBodyRank === right.tripleBodyRank
                && left.cards.length === right.cards.length
                && left.cards.length > left.tripleBodyCount * 3;
            if (sameTripleAttachmentShape) {
                // Finishing in exactly two plays is a whole-hand invariant and
                // must precede local attachment rank. In 101010,JJ,K,A the
                // complete 101010+K+A lead leaves JJ as the final legal hand;
                // comparing attachment points first incorrectly chose
                // 101010+JJ and manufactured two later single plays.
                if (Boolean(left.finishesInTwo) !== Boolean(right.finishesInTwo)) {
                    return left.finishesInTwo ? -1 : 1;
                }
                const attachmentRankDifference = compareTripleAttachmentRanks(
                    hand, left.cards, right.cards,
                );
                // "No attachment comparison" removes only the regional point
                // contest; it does not allow a lower card to destroy an atomic
                // pair. Base grouping has already classified pairs, so two true
                // non-maximum loose singles are consumed before any pair is
                // opened, regardless of whether those singles are below or above
                // rank 10. The explicit low-pair/high-single exception above is
                // intentionally stronger. Example: 33,555,1010,J,K,A,2 carries
                // J+K, retaining both pairs plus A/2 as recovery controls.
                const pairPolicyDifference = left.attachmentPairPolicyCost
                    - right.attachmentPairPolicyCost;
                if (pairPolicyDifference !== 0) return pairPolicyDifference;
                if (attachmentRankDifference !== 0) return attachmentRankDifference;
            }
            // Once the complete hand is exactly two legal plays, spend the
            // maximum control first regardless of the two plays' sizes or
            // families. A maximum used only as a triple-family attachment is
            // not a maximum play and therefore remains excluded.
            const exactTwoHandPlan = left.finishesInTwo && right.finishesInTwo;
            const leftTwoHandMaximum = exactTwoHandPlan && left.containsRuleMaximum
                && !left.usesMaximumAttachment;
            const rightTwoHandMaximum = exactTwoHandPlan && right.containsRuleMaximum
                && !right.usesMaximumAttachment;
            if (leftTwoHandMaximum !== rightTwoHandMaximum) return leftTwoHandMaximum ? -1 : 1;
            const leftScoringBomb = left.completeBombs > 0 || left.consumesFourCardBody;
            const rightScoringBomb = right.completeBombs > 0 || right.consumesFourCardBody;
            if (normalizedRules.preserveScoringBombs && leftScoringBomb !== rightScoringBomb) {
                // Scoring changes how a bomb is protected and settled, not the
                // opening strategy. A player leading a trick keeps every bomb
                // until all ordinary legal plans have been offered. A response
                // may still surface the bomb when it is the required control.
                return preferLargest
                    ? leftScoringBomb ? 1 : -1
                    : leftScoringBomb ? -1 : 1;
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
            const leftBombBody = left.completeBombs > 0
                || (normalizedRules.preserveScoringBombs && left.consumesFourCardBody);
            const rightBombBody = right.completeBombs > 0
                || (normalizedRules.preserveScoringBombs && right.consumesFourCardBody);
            if ((normalizedRules.optimizeWholeHand || !preferLargest) && leftBombBody !== rightBombBody) {
                // A scoring rule makes the bomb atomic; it does not make a
                // self-led bomb strategically preferable. While leading, keep
                // every bomb intact but exhaust ordinary structures first.
                // When responding, a scoring bomb retains its priority because
                // it may be the required control/score play for that response.
                return normalizedRules.preserveScoringBombs
                    ? leftBombBody ? -1 : 1
                    : leftBombBody ? 1 : -1;
            }
            const equalSingleResponsePlan = !preferLargest
                && normalizedRules.prioritizeMaximumResponseWithinThreePlays
                && left.cards.length === 1 && right.cards.length === 1
                && left.quality.turns === right.quality.turns
                && left.quality.structuredCards === right.quality.structuredCards
                && left.quality.isolated === right.quality.isolated;
            if (equalSingleResponsePlan
                && Boolean(left.containsRuleMaximum) !== Boolean(right.containsRuleMaximum)) {
                // Once two legal single responses leave the same number of
                // plays and the same complete structures, spend the larger
                // regional control now. Example: answering from 7899KA uses A
                // and leaves the intact 789 straight; K has no plan advantage.
                return left.containsRuleMaximum ? -1 : 1;
            }
            // Public self-lead rule: evaluate the complete remainder before
            // inserting local shape preferences. The first hint must belong to
            // a decomposition requiring the fewest legal plays. When that count
            // is tied, shed the most cards now; only then compare loose singles,
            // point value and recovery details.
            if (preferLargest && normalizedRules.optimizeWholeHand
                && !leftBombBody && !rightBombBody) {
                const sameTripleCandidate = left.tripleBodyRank < Number.MAX_SAFE_INTEGER
                    && left.tripleBodyRank === right.tripleBodyRank
                    && left.cards.length === right.cards.length;
                if (sameTripleCandidate
                    && left.usesMaximumAttachment !== right.usesMaximumAttachment) {
                    return left.usesMaximumAttachment ? 1 : -1;
                }
                // When two decompositions expose the same kind of intact
                // triple and their current play sizes are equal or differ by
                // only one card, lead the lower body first. The retained higher
                // triple can beat it later and recover initiative. This recovery
                // chain takes precedence over a one-card/one-turn local quality
                // advantage; otherwise a superficially cleaner KKK plan can
                // incorrectly displace 666 and spend the recovery hand first.
                const nearSizedPlays = Math.abs(left.cards.length - right.cards.length) <= 1;
                const leftRecoveryTriple = hasTripleRecoveryChain
                    && left.tripleBodyCount === 1 && left.splitTriples === 0
                    && left.cards.length > 3;
                const rightRecoveryTriple = hasTripleRecoveryChain
                    && right.tripleBodyCount === 1 && right.splitTriples === 0
                    && right.cards.length > 3;
                if (nearSizedPlays && leftRecoveryTriple && rightRecoveryTriple
                    && left.tripleBodyRank !== right.tripleBodyRank) {
                    return left.tripleBodyRank - right.tripleBodyRank;
                }
                // Equal-turn straight decompositions preserve complete groups
                // before maximizing the current body size. After structural
                // damage is tied, lead the lower equal-length run so the higher
                // run remains available to recapture. This derives entirely
                // from the decomposition; it is not tied to ranks or a region.
                if (left.quality.turns === right.quality.turns
                    && left.straightBody && right.straightBody) {
                    const splitPairDifference = left.splitPairs - right.splitPairs;
                    if (splitPairDifference !== 0) return splitPairDifference;
                    if (left.cards.length === right.cards.length) {
                        const lowDifference = Math.min(...left.cards.map(rank))
                            - Math.min(...right.cards.map(rank));
                        if (lowDifference !== 0) return lowDifference;
                    }
                }
                // If either opening empties the hand in exactly two plays, the
                // larger first play is authoritative unless one alternative
                // contains a regional maximum. In 77+QQKK both 77 and QQKK
                // leave one legal final hand, so the four-card pair run must
                // precede the two-card pair. The generic pair-dominant rule
                // below is for longer recovery plans and must not invert this
                // exact two-hand decomposition.
                const equalTwoHandControl = left.finishesInTwo && right.finishesInTwo
                    && Boolean(left.containsRuleMaximum) === Boolean(right.containsRuleMaximum);
                if (equalTwoHandControl && left.cards.length !== right.cards.length) {
                    return right.cards.length - left.cards.length;
                }
                const leftEarlyLooseSingle = singleDominantHand
                    && left.cards.length === 1
                    && originalCounts[rank(left.cards[0])] === 1;
                const rightEarlyLooseSingle = singleDominantHand
                    && right.cards.length === 1
                    && originalCounts[rank(right.cards[0])] === 1;
                if (leftEarlyLooseSingle !== rightEarlyLooseSingle) {
                    return leftEarlyLooseSingle ? -1 : 1;
                }
                if (leftEarlyLooseSingle && rightEarlyLooseSingle) {
                    return rank(left.cards[0]) - rank(right.cards[0]);
                }
                // Pair-dominant singles-and-pairs hands are decided before the
                // generic remainder score. That score naturally drops by one
                // whenever any single is played and therefore incorrectly made
                // Q look cleaner than pair 55 in 2,Q,99,8,77,6,55. The public
                // rule instead sheds the larger shape, starting from the lowest
                // intact pair, unless a loose regional maximum must be retained.
                const leftEarlyIntactPair = pairLeadWithoutSingleRecapture
                    && left.cards.length === 2
                    && rank(left.cards[0]) === rank(left.cards[1])
                    && originalCounts[rank(left.cards[0])] === 2;
                const rightEarlyIntactPair = pairLeadWithoutSingleRecapture
                    && right.cards.length === 2
                    && rank(right.cards[0]) === rank(right.cards[1])
                    && originalCounts[rank(right.cards[0])] === 2;
                if (leftEarlyIntactPair !== rightEarlyIntactPair) {
                    return leftEarlyIntactPair ? -1 : 1;
                }
                if (leftEarlyIntactPair && rightEarlyIntactPair) {
                    const pairRankDifference = rank(left.cards[0]) - rank(right.cards[0]);
                    if (pairRankDifference !== 0) return pairRankDifference;
                }
                // First compare the fully decomposed remainder. Current play
                // size is deliberately ahead of loose-single count: KKK555444
                // must lead 444555+KK, not KKK+4+5, because both plans take the
                // same number of plays and the aircraft sheds more cards now.
                const turnDifference = left.quality.turns - right.quality.turns;
                if (turnDifference !== 0) return turnDifference;
                if (left.retainsHigherStraight !== right.retainsHigherStraight) {
                    return left.retainsHigherStraight ? -1 : 1;
                }
                // With the same total number of plays, near-sized complete
                // combinations lead from the low control band first. This
                // preserves the higher body as a later recapture hand: 7788
                // precedes JJJ+QQ because their sizes differ by one and only
                // the pair run is entirely rank 10 or below. This comparison
                // deliberately sits after minimum turns but before current
                // card count; otherwise the five-card high triple family wins
                // mechanically over the four-card low pair run.
                const nearSizedCompleteBodies = Math.abs(left.cards.length - right.cards.length) <= 2
                    && left.cards.length > 1 && right.cards.length > 1
                    && left.splitBombs === 0 && right.splitBombs === 0
                    && left.splitTriples === 0 && right.splitTriples === 0;
                const leftLowControlBody = nearSizedCompleteBodies
                    && Math.max(...left.cards.map(rank)) <= 10;
                const rightLowControlBody = nearSizedCompleteBodies
                    && Math.max(...right.cards.map(rank)) <= 10;
                if (leftLowControlBody !== rightLowControlBody) {
                    return leftLowControlBody ? -1 : 1;
                }
                const cardCountDifference = right.cards.length - left.cards.length;
                if (cardCountDifference !== 0) return cardCountDifference;
                const looseDifference = left.planLooseSingles - right.planLooseSingles;
                if (looseDifference !== 0) return looseDifference;
                const leftCompleteTripleFamily = left.tripleBodyCount > 0
                    && left.cards.length > left.tripleBodyCount * 3;
                const rightCompleteTripleFamily = right.tripleBodyCount > 0
                    && right.cards.length > right.tripleBodyCount * 3;
                if (leftCompleteTripleFamily !== rightCompleteTripleFamily
                    && (leftCompleteTripleFamily ? right.cards.length <= 2 : left.cards.length <= 2)) {
                    return leftCompleteTripleFamily ? -1 : 1;
                }
                if (!simpleSinglesAndPairs && !sameTripleCandidate
                    && left.cards.length !== right.cards.length) {
                    return right.cards.length - left.cards.length;
                }
            }
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
            const comparablePairPolicyAttachments = sameTripleBody
                && left.cards.length === 5
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
            return (!hasTripleRecoveryChain
                && left.retainsHigherPairRun !== right.retainsHigherPairRun
                ? left.retainsHigherPairRun ? -1 : 1 : 0)
                || (left.cards.length === right.cards.length
                // Equal-card straights are only a generic structure tie-break.
                // They must not displace a complete triple-family recovery
                // chain: 444+33 leads before the independent 5-9 straight so
                // 101010+QQ remains available to beat it and regain the lead.
                && !leftTripleRecoveryLead && !rightTripleRecoveryLead
                && left.straightBody !== right.straightBody
                ? left.straightBody ? -1 : 1 : 0)
                // A triple carrying one card always consumes the lowest loose
                // attachment (except when that deliberately leaves the final
                // card). Regional attachment comparison still applies to the
                // two-wing form, whose pair/control preservation rules differ.
                // This is evaluated before whole-hand decomposition so generic
                // structure scoring cannot turn 888+JQ into 888+KA.
                // Determine actual loose cards from the planned remainder, not
                // raw rank multiplicity. In 99,10,J,Q,K,A one 9 belongs to the
                // straight and the other 9 is loose; carrying A would destroy
                // the straight, while carrying one 9 preserves it. Structural
                // damage must therefore precede raw pair/single source cost.
                || (comparablePairPolicyAttachments
                    ? left.attachmentPairPolicyCost - right.attachmentPairPolicyCost : 0)
                || (ordinarySameBodyAttachments
                    ? left.attachmentDamage - right.attachmentDamage : 0)
                || (ordinarySameBodyAttachments
                    ? left.attachmentSourceCost - right.attachmentSourceCost : 0)
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
                || (sameTripleBody
                    && left.usesMaximumAttachment !== right.usesMaximumAttachment
                    ? left.usesMaximumAttachment ? 1 : -1 : 0)
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
                // When answering with multiple legal triple bodies, retain the
                // decomposition containing the most cards in complete remaining
                // structures. This may use KKK rather than 888 when KKK+clean
                // wings preserves the long straight/pair plan left in hand.
                || (!preferLargest && normalizedRules.optimizeWholeHand
                    && comparableSingleTripleFamilies
                    ? b.structuredCards - a.structuredCards : 0)
                // With several intact triple bodies, lead the smallest one and
                // retain every higher body as a same-shape recovery chain.
                || (comparableSingleTripleFamilies
                    ? left.tripleBodyRank - right.tripleBodyRank : 0)
                // Two exact remaining plays prefer shedding the larger legal
                // combination now. Keep this ahead of the pair-dominant
                // recovery heuristic so 77 cannot displace QQKK.
                || (left.finishesInTwo && right.finishesInTwo
                    && Boolean(left.containsRuleMaximum) === Boolean(right.containsRuleMaximum)
                    ? right.cards.length - left.cards.length : 0)
                || (singleDominantHand
                    && (left.cards.length === 1
                        && originalCounts[rank(left.cards[0])] === 1)
                        !== (right.cards.length === 1
                            && originalCounts[rank(right.cards[0])] === 1)
                    ? left.cards.length === 1
                        && originalCounts[rank(left.cards[0])] === 1 ? -1 : 1 : 0)
                || (singleDominantHand && left.cards.length === 1 && right.cards.length === 1
                    ? rank(left.cards[0]) - rank(right.cards[0]) : 0)
                // In a singles-and-pairs hand, shed the larger legal shape first
                // whenever no loose single is the immutable regional maximum.
                // This applies even with one pair: KK,J,Q starts from KK because
                // neither single can guarantee regaining the lead. With several
                // pairs the smallest pair still starts the recovery chain.
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
                || (preferLargest && normalizedRules.optimizeWholeHand
                    && !leftBombBody && !rightBombBody
                    ? a.turns - b.turns : 0)
                || (preferLargest && normalizedRules.optimizeWholeHand
                    && !leftBombBody && !rightBombBody
                    ? right.cards.length - left.cards.length : 0)
                || (preferLargest && normalizedRules.optimizeWholeHand
                    && !leftBombBody && !rightBombBody
                    ? left.planLooseSingles - right.planLooseSingles : 0)
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
    // A recovery chain of several triples is one whole-hand plan. Allocate its
    // wings once, from the lowest triple body upward, instead of independently
    // ranking every body against the same smallest card. For example the clean
    // decomposition of 99,10,J,Q,K,A + 888 + 6 + 555 + 44 is
    // 555+6, 888+9, 9-A, 44. Without this allocation pass both 555 and 888 offer
    // the same 6 in the Hint cycle and 888 later falls through to A.
    const plannedPool = (() => {
        if (!hasTripleRecoveryChain) return rankedPool;
        const chosen = new Set<typeof rankedPool[number]>();
        const grouped = new Map<number, Map<number, typeof rankedPool>>();
        for (const candidate of rankedPool) {
            if (candidate.tripleBodyCount !== 1 || candidate.splitTriples !== 0
                || candidate.cards.length <= 3) continue;
            const bySize = grouped.get(candidate.cards.length) ?? new Map<number, typeof rankedPool>();
            const bodyCandidates = bySize.get(candidate.tripleBodyRank) ?? [];
            bodyCandidates.push(candidate);
            bySize.set(candidate.tripleBodyRank, bodyCandidates);
            grouped.set(candidate.cards.length, bySize);
        }
        for (const byBody of grouped.values()) {
            const allocated = Array<number>(16).fill(0);
            for (const bodyRank of [...byBody.keys()].sort((left, right) => left - right)) {
                const bodyCandidates = byBody.get(bodyRank) ?? [];
                const available = bodyCandidates.filter((candidate) => {
                    const attachmentCounts = countsOf(tripleFamilyAttachments(hand, candidate.cards));
                    return attachmentCounts.every((count, value) =>
                        allocated[value] + count <= originalCounts[value]);
                });
                // Once the whole-hand decomposition fixes a chain of triple
                // bodies, distribute its wings from the smallest real loose
                // cards. A high control A must never be selected merely because
                // a local remainder score is tied with 6+8 or 6+9.
                const selected = [...(available.length > 0 ? available : bodyCandidates)]
                    .sort((left, right) => Number(left.usesMaximumAttachment)
                        - Number(right.usesMaximumAttachment)
                        || left.planLooseSingles - right.planLooseSingles
                        || (left.remainingCount === 1 && right.remainingCount === 1
                            ? right.remainingHighestRank - left.remainingHighestRank : 0)
                        // Recovery-chain allocation must obey the same wing
                        // source policy as the main sorter. Otherwise 777+3+5
                        // wins locally, then this later pass silently replaces
                        // it with 777+3+4 and opens pair 44.
                        || left.attachmentPairPolicyCost - right.attachmentPairPolicyCost
                        || left.attachmentControlCost - right.attachmentControlCost
                        || left.attachmentDamage - right.attachmentDamage
                        || left.attachmentSourceCost - right.attachmentSourceCost
                        || left.order - right.order)[0];
                if (!selected) continue;
                chosen.add(selected);
                const attachmentCounts = countsOf(tripleFamilyAttachments(hand, selected.cards));
                for (let value = 3; value <= 15; value += 1) allocated[value] += attachmentCounts[value];
            }
        }
        return rankedPool.filter((candidate) => {
            if (candidate.tripleBodyCount !== 1 || candidate.splitTriples !== 0
                || candidate.cards.length <= 3) return true;
            return chosen.has(candidate);
        });
    })();
    const lowestTripleBodyRank = originalCounts
        .map((count, value) => count === 3 ? value : 0)
        .filter(Boolean)
        .sort((left, right) => left - right)[0] ?? Number.MAX_SAFE_INTEGER;
    // Phase two assigns wings only after atomic bodies have been identified.
    // Fill the authoritative attachment capacity from genuine loose singles,
    // ordered from low to high. Rank 10 is not a semantic boundary here: when
    // 555 may carry two cards and the loose singles are 6,K,A,2, the complete
    // 555+6+K play must precede the shortened 555+6 variant. Intact pairs,
    // triples and bombs remain ineligible as "loose" wings; the separate
    // low-pair policy still owns its explicitly configured special case.
    const completeLooseSingleTripleLead = hasTripleRecoveryChain ? plannedPool
        .filter((candidate) => candidate.tripleBodyCount === 1
            && candidate.tripleBodyRank === lowestTripleBodyRank
            && candidate.splitTriples === 0
            && candidate.cards.length > 3
            && tripleFamilyAttachments(hand, candidate.cards).every((card) =>
                originalCounts[rank(card)] === 1))
        .sort((left, right) => right.cards.length - left.cards.length
            || compareTripleAttachmentRanks(hand, left.cards, right.cards))[0] : undefined;
    const hasPreferredLowPairAttachment = plannedPool.some((candidate) =>
        usesPreferredLowPairAttachment(hand, candidate.cards, normalizedRules));
    // Sorting above evaluates strategic value. Hint cycling is a separate phase:
    // the best complete remainder stays primary, then a complete triple family
    // is exposed before overlapping shortened straight windows. Never promote
    // the longest straight over that result: a longer current play may open
    // several pairs and leave more loose singles (for example breaking 99/1010).
    // Scoring changes bomb atomicity, not self-lead order. A clean straight or
    // complete triple family is therefore still exposed before an intact bomb.
    const cyclePool = [...plannedPool];
    for (let index = cyclePool.length - 1; index >= 0; index -= 1) {
        const candidate = cyclePool[index];
        if (!candidate.straightBody || candidate.splitTriples === 0) continue;
        const dominatedByIntactPlan = cyclePool.some((alternative) =>
            alternative !== candidate
            && alternative.splitTriples === 0
            && alternative.splitBombs === 0
            && alternative.quality.turns <= candidate.quality.turns
            && alternative.cards.length > candidate.cards.length);
        if (dominatedByIntactPlan) cyclePool.splice(index, 1);
    }
    const isExactTwoHandMaximum = (candidate: typeof cyclePool[number]): boolean => {
        if (!candidate.finishesInTwo || !candidate.containsRuleMaximum
            || candidate.usesMaximumAttachment) return false;
        return true;
    };
    if (preferLargest) {
        const twoHandMaximumIndex = cyclePool.findIndex((candidate) =>
            isExactTwoHandMaximum(candidate));
        let twoHandSizePriority = false;
        if (twoHandMaximumIndex > 0) {
            const [twoHandMaximum] = cyclePool.splice(twoHandMaximumIndex, 1);
            cyclePool.unshift(twoHandMaximum);
            twoHandSizePriority = true;
        } else if (twoHandMaximumIndex < 0) {
            const twoHandCandidates = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .filter(({ candidate }) => candidate.finishesInTwo);
            const maximumTwoHandSize = twoHandCandidates.reduce((maximum, { candidate }) =>
                Math.max(maximum, candidate.cards.length), 0);
            const minimumTwoHandSize = twoHandCandidates.reduce((minimum, { candidate }) =>
                Math.min(minimum, candidate.cards.length), Number.POSITIVE_INFINITY);
            const largestTwoHand = twoHandCandidates.find(({ candidate }) =>
                candidate.cards.length === maximumTwoHandSize);
            twoHandSizePriority = Boolean(largestTwoHand
                && maximumTwoHandSize > minimumTwoHandSize);
            if (largestTwoHand && largestTwoHand.index > 0) {
                const [largest] = cyclePool.splice(largestTwoHand.index, 1);
                cyclePool.unshift(largest);
            }
        }
        const lowDuplicateStraightIndex = lowDuplicateStraight
            ? cyclePool.findIndex((candidate) => candidate.straightBody
                && candidate.cards.length === lowDuplicateStraight.cards.length
                && Math.min(...candidate.cards.map(rank))
                    === Math.min(...lowDuplicateStraight.cards.map(rank))
                && Math.max(...candidate.cards.map(rank))
                    === Math.max(...lowDuplicateStraight.cards.map(rank)))
            : -1;
        if (twoHandMaximumIndex < 0 && lowDuplicateStraightIndex > 0) {
            const [straight] = cyclePool.splice(lowDuplicateStraightIndex, 1);
            cyclePool.unshift(straight);
        }
        // Pair-dominant lead order is a final queue invariant. A strategic
        // comparator involving several singles and pairs is not transitive:
        // although 55 beats Q directly, intermediate 77/99/2 candidates can
        // cycle Q back to index zero. Pin the lowest intact pair once the exact
        // public singles-and-pairs condition has been established.
        if (pairLeadWithoutSingleRecapture
            && twoHandMaximumIndex < 0 && !twoHandSizePriority && !lowDuplicateStraight) {
            const intactPairLeads = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .filter(({ candidate }) => candidate.cards.length === 2
                    && rank(candidate.cards[0]) === rank(candidate.cards[1])
                    && originalCounts[rank(candidate.cards[0])] === 2);
            const recoveryIntactPairLeads = intactPairLeads
                .filter(({ candidate }) => candidate.retainsHigherPairRun);
            const lowestRecoveryPairRank = recoveryIntactPairLeads.reduce((lowest, { candidate }) =>
                Math.min(lowest, rank(candidate.cards[0])), Number.POSITIVE_INFINITY);
            const recoveryPairRuns = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .filter(({ candidate }) => pairRunBounds(candidate.cards, normalizedRules) !== null
                    && candidate.splitBombs === 0 && candidate.splitTriples === 0
                    // A lower complete pair run belongs to the same lead family
                    // even when the retained high run has fewer pairs and thus
                    // cannot immediately answer the same-length response.
                    // Whole-hand priorities still compare its turns and loose
                    // singles before its larger current card count is used.
                    && (candidate.retainsHigherPairRun
                        || Math.max(...candidate.cards.map(rank)) < lowestRecoveryPairRank));
            const recoveryPairLeads = [
                ...recoveryIntactPairLeads,
                ...recoveryPairRuns,
            ];
            // A low independent pair and a longer low pair run may preserve the
            // same high recovery body. Compare that complete recovery plan in
            // the authoritative order: remaining turns, loose singles, then
            // cards shed now. In 2,AA,KK,Q,J,1010,9,77,66,55 both 1010 and
            // 556677 retain KKAA, so the six-card pair run must lead. The older
            // unconditional "lowest pair" pin incorrectly forced 1010 first.
            const preferredPairLead = (recoveryPairLeads.length > 0
                ? recoveryPairLeads.sort((left, right) =>
                    left.candidate.quality.turns - right.candidate.quality.turns
                    || left.candidate.planLooseSingles - right.candidate.planLooseSingles
                    || right.candidate.cards.length - left.candidate.cards.length
                    || Math.min(...left.candidate.cards.map(rank))
                        - Math.min(...right.candidate.cards.map(rank)))[0]
                : intactPairLeads.sort((left, right) => rank(left.candidate.cards[0])
                    - rank(right.candidate.cards[0]))[0]);
            if (preferredPairLead && preferredPairLead.index > 0) {
                const [pairLead] = cyclePool.splice(preferredPairLead.index, 1);
                cyclePool.unshift(pairLead);
            }
        }
        if (singleDominantHand
            && twoHandMaximumIndex < 0 && !twoHandSizePriority && !lowDuplicateStraight) {
            const lowestLooseSingleIndex = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .filter(({ candidate }) => candidate.cards.length === 1
                    && originalCounts[rank(candidate.cards[0])] === 1)
                .sort((left, right) => rank(left.candidate.cards[0])
                    - rank(right.candidate.cards[0]))[0]?.index ?? -1;
            if (lowestLooseSingleIndex > 0) {
                const [lowestLooseSingle] = cyclePool.splice(lowestLooseSingleIndex, 1);
                cyclePool.unshift(lowestLooseSingle);
            }
        }
        // This low-pair cleanup is a final lead-queue boundary. Comparing it
        // only inside Array.sort is insufficient because unrelated singles,
        // pairs and bare triples can make the strategic comparator
        // non-transitive and let 888+J+A cycle back ahead of 888+33. Once the
        // exact public condition is met, pin the smallest low-pair attachment
        // before every alternative of the same hand.
        const preferredLowPairIndex = normalizedRules.compareTripleAttachments
            ? -1
            : cyclePool.findIndex((candidate) =>
                usesPreferredLowPairAttachment(hand, candidate.cards, normalizedRules));
        if (preferredLowPairIndex > 0) {
            const [preferredLowPair] = cyclePool.splice(preferredLowPairIndex, 1);
            cyclePool.unshift(preferredLowPair);
        }
        const maximumStraightLength = cyclePool.reduce((maximum, candidate) =>
            candidate.straightBody ? Math.max(maximum, candidate.cards.length) : maximum, 0);
        const equalLongestStraights = cyclePool
            .map((candidate, index) => ({ candidate, index }))
            .filter(({ candidate }) => candidate.straightBody
                && candidate.cards.length === maximumStraightLength);
        // Choosing the lowest of equal-length straight windows is only a tie
        // refinement. It must not overwrite a recovery-chain decision such as
        // leading 666 and retaining KKK when the straight differs by at most
        // one card. That late promotion was the reason the real hand displayed
        // 9-J-Q-K-10 even though the strategic sorter had selected 666 first.
        if (equalLongestStraights.length > 1
            && cyclePool[0]?.straightBody
            && cyclePool[0].cards.length === maximumStraightLength) {
            const lowest = equalLongestStraights.sort((left, right) =>
                Math.min(...left.candidate.cards.map(rank))
                    - Math.min(...right.candidate.cards.map(rank)))[0];
            if (lowest.index > 0) {
                cyclePool.splice(lowest.index, 1);
                cyclePool.unshift(lowest.candidate);
            }
        }
    }
    const longestCleanStraightLength = cyclePool.reduce((longest, candidate) =>
        candidate.straightBody && candidate.splitTriples === 0
            ? Math.max(longest, candidate.cards.length) : longest, 0);
    const longestCleanStraightIndex = cyclePool.findIndex((candidate) =>
        candidate.straightBody && candidate.splitTriples === 0
        && candidate.cards.length === longestCleanStraightLength);
    const strategicPrimary = cyclePool[0];
    const longestCleanStraight = cyclePool[longestCleanStraightIndex];
    const strategicTripleRecoveryLead = Boolean(strategicPrimary
        && hasTripleRecoveryChain
        && strategicPrimary.tripleBodyCount === 1
        && strategicPrimary.splitTriples === 0
        && strategicPrimary.cards.length > strategicPrimary.tripleBodyCount * 3
        && cyclePool.some((candidate) => candidate !== strategicPrimary
            && candidate.tripleBodyCount === 1
            && candidate.splitTriples === 0
            && candidate.cards.length === strategicPrimary.cards.length
            && candidate.tripleBodyRank > strategicPrimary.tripleBodyRank));
    // Card count is a tie-breaker only after the remainder is at least as clean.
    // This retains the existing long-straight preference when it costs no hand
    // structure, but prevents 4-10 from breaking both 99 and 1010 when 4-8 keeps
    // those pairs intact.
    if (longestCleanStraightIndex > 0 && strategicPrimary && longestCleanStraight
        // A rule-qualified exact two-hand maximum is already the authoritative
        // control lead; the later long-straight queue refinement cannot replace it.
        && !isExactTwoHandMaximum(strategicPrimary)
        // The strategic sorter may deliberately lead a low pair run so a
        // higher recovery structure remains. Longest-straight promotion is
        // only a tie refinement and must never overwrite that decision.
        && !(strategicPrimary.retainsHigherPairRun && !hasTripleRecoveryChain)
        // A clean straight is not allowed to overwrite a complete lower
        // triple-family lead when another complete higher triple family stays
        // available to beat it and recover initiative. For example, retain
        // 101010+QQ behind 444+33 instead of promoting the independent 5-9
        // straight over the already-resolved recovery chain.
        && !strategicTripleRecoveryLead
        && !(strategicPrimary.straightBody
            && strategicPrimary.cards.length === longestCleanStraight.cards.length)
        // The decomposition order is authoritative: first keep the minimum
        // number of loose singles, then the minimum remaining plays; only then
        // prefer the current play with more cards. Requiring at least as many
        // residual "structured cards" here incorrectly kept 1010 ahead of the
        // equally clean 5-9 straight in A,K,Q,1010,9,888,7,6,5,44,33.
        && longestCleanStraight.quality.turns <= strategicPrimary.quality.turns) {
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
    // This is the final self-lead queue boundary. Earlier strategic refinements
    // may promote a long straight or triple family, but none may move a complete
    // bomb ahead of an ordinary play. Stable-partition here so QQQQ remains the
    // final hint even when it is the highest legal four-of-a-kind in the deck.
    if (preferLargest) {
        const bombs = cyclePool.filter((candidate) =>
            isCompleteProtectedBomb(candidate.cards, hintBombs))
            // Hint cycling is ascending inside the bomb family. Regional
            // special bombs (for example AAA) remain atomic bombs, but their
            // protected identity must not preserve an earlier generator order
            // ahead of a lower ordinary bomb such as 6666.
            .sort((left, right) =>
                Math.max(...left.cards.map(rank)) - Math.max(...right.cards.map(rank))
                || left.order - right.order);
        const twoHandScoringBombs = normalizedRules.preserveScoringBombs
            ? bombs.filter((candidate) => candidate.finishesInTwo)
            : [];
        const delayedBombs = bombs.filter((candidate) => !twoHandScoringBombs.includes(candidate));
        const ordinary = cyclePool.filter((candidate) =>
            !isCompleteProtectedBomb(candidate.cards, hintBombs));
        cyclePool.splice(0, cyclePool.length, ...twoHandScoringBombs, ...ordinary, ...delayedBombs);
        // Keep the low duplicate-straight rule at the true final lead boundary.
        // Pair-run and bomb queue normalization above must not move 778899 back
        // ahead of 678910 (or the corresponding straight ending at J). Exact
        // two-hand public-maximum and scoring-bomb endgames remain stronger.
        const hasExactTwoHandMaximum = cyclePool.some((candidate) =>
            isExactTwoHandMaximum(candidate));
        const hasTwoHandScoringBomb = twoHandScoringBombs.length > 0;
        const completeLooseSingleTripleIndex = completeLooseSingleTripleLead
            ? cyclePool.indexOf(completeLooseSingleTripleLead) : -1;
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb
            && completeLooseSingleTripleLead && completeLooseSingleTripleIndex !== 0
            && !hasPreferredLowPairAttachment) {
            if (completeLooseSingleTripleIndex > 0) {
                cyclePool.splice(completeLooseSingleTripleIndex, 1);
            }
            cyclePool.unshift(completeLooseSingleTripleLead);
        }
        const finalLowStraightIndex = lowDuplicateStraight
            ? cyclePool.findIndex((candidate) => candidate.straightBody
                && candidate.cards.length === lowDuplicateStraight.cards.length
                && Math.min(...candidate.cards.map(rank))
                    === Math.min(...lowDuplicateStraight.cards.map(rank))
                && Math.max(...candidate.cards.map(rank))
                    === Math.max(...lowDuplicateStraight.cards.map(rank)))
            : -1;
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb && finalLowStraightIndex > 0) {
            const [straight] = cyclePool.splice(finalLowStraightIndex, 1);
            cyclePool.unshift(straight);
        }
        // Global decomposition invariant: after minimum remaining turns and
        // then minimum loose singles are fixed, the largest legal body is the
        // lead unless an explicit recovery-chain decision outranks it. This is
        // evaluated from the complete candidate set so an intermediate queue
        // refinement cannot discard 5-9 and leave 1010 as the first prompt.
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb
            && minimumSingleDecompositionStraight
            && !(cyclePool[0]?.retainsHigherPairRun)
            && minimumSingleDecompositionStraight.cards.length > (cyclePool[0]?.cards.length ?? 0)) {
            const sameStraightIndex = cyclePool.findIndex((candidate) => candidate.straightBody
                && candidate.cards.length === minimumSingleDecompositionStraight.cards.length
                && Math.min(...candidate.cards.map(rank))
                    === Math.min(...minimumSingleDecompositionStraight.cards.map(rank))
                && Math.max(...candidate.cards.map(rank))
                    === Math.max(...minimumSingleDecompositionStraight.cards.map(rank)));
            if (sameStraightIndex >= 0) cyclePool.splice(sameStraightIndex, 1);
            cyclePool.unshift(minimumSingleDecompositionStraight);
        }
        // Apply the same final whole-decomposition comparison to every atomic
        // non-bomb body, not only straights. With AAA | 5566 | 99 | 2 | K,
        // playing 5566 and playing 99 leave the same loose-card/turn score, so
        // the four-card pair run must win the final "most cards" tie-breaker.
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb
            && minimumSingleDecompositionLead
            && !singleDominantHand
            && !lowDuplicateStraight && !completeLooseSingleTripleLead
            && !(cyclePool[0]?.retainsHigherPairRun)
            && minimumSingleDecompositionLead.cards.length > (cyclePool[0]?.cards.length ?? 0)) {
            const exactIndex = cyclePool.indexOf(minimumSingleDecompositionLead);
            if (exactIndex > 0) cyclePool.splice(exactIndex, 1);
            cyclePool.unshift(minimumSingleDecompositionLead);
        }
        const atomicPairRunIndex = atomicPairRunLead ? cyclePool.indexOf(atomicPairRunLead) : -1;
        const currentLead = cyclePool[0];
        const currentLeadSplitsAtomicPairRun = Boolean(atomicPairRunLead && currentLead
            && atomicPairRunLead.cards.some((card) => currentLead.cards.includes(card))
            && !atomicPairRunLead.cards.every((card) => currentLead.cards.includes(card)));
        const atomicPairRunHasCleanerEqualTurnPlan = Boolean(atomicPairRunLead && currentLead
            && currentLeadSplitsAtomicPairRun
            && atomicPairRunLead.quality.turns === currentLead.quality.turns
            && atomicPairRunLead.planLooseSingles < currentLead.planLooseSingles);
        const atomicPairRunWinsEqualCleanupBySize = Boolean(atomicPairRunLead && currentLead
            && currentLeadSplitsAtomicPairRun
            && atomicPairRunLead.quality.turns === currentLead.quality.turns
            && atomicPairRunLead.planLooseSingles === currentLead.planLooseSingles
            && atomicPairRunLead.cards.length > currentLead.cards.length);
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb
            && atomicPairRunLead && !lowDuplicateStraight && !completeLooseSingleTripleLead
            && !(cyclePool[0]?.retainsHigherPairRun)
            // A longest-straight refinement cannot reverse the authoritative
            // decomposition order. In 2,A,JJ,10,99,88,7,6,55,44,3 both 3-J
            // and intact 4455 finish in the same number of plays, but the long
            // straight leaves seven loose singles while 4455 leaves five. Keep
            // the cleaner atomic pair run; compare current size only when the
            // future loose-single count is also tied.
            && (atomicPairRunHasCleanerEqualTurnPlan
                || atomicPairRunWinsEqualCleanupBySize)) {
            if (atomicPairRunIndex > 0) cyclePool.splice(atomicPairRunIndex, 1);
            cyclePool.unshift(atomicPairRunLead);
        }
        const multiStraightIndex = multiStraightLead ? cyclePool.indexOf(multiStraightLead) : -1;
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb
            && multiStraightLead && multiStraightIndex > 0) {
            cyclePool.splice(multiStraightIndex, 1);
            cyclePool.unshift(multiStraightLead);
        }
        // A high straight assembled from one card of several intact pairs is
        // not a cleaner decomposition than a complete low pair run. Once both
        // plans have already reached the minimum remaining turn count, apply
        // the established two-card tolerance: shed the <=10 pair run first
        // when it leaves no more loose singles. This keeps 556677 intact in
        // 2,AA,KK,Q,J,1010,9,77,66,55 instead of opening 1010/KK/AA for 9-A.
        // Genuinely longer clean straights and straights that improve the
        // residual singles remain governed by the normal straight rules.
        const refinedLead = cyclePool[0];
        const lowPairRunBeatsPairSplittingHighStraight = Boolean(atomicPairRunLead
            && refinedLead
            && refinedLead.straightBody
            && refinedLead.splitPairs > 0
            && Math.max(...refinedLead.cards.map(rank)) > 10
            && Math.max(...atomicPairRunLead.cards.map(rank)) <= 10
            && Math.abs(refinedLead.cards.length - atomicPairRunLead.cards.length) <= 2
            && atomicPairRunLead.quality.turns <= refinedLead.quality.turns
            && atomicPairRunLead.planLooseSingles <= refinedLead.planLooseSingles);
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb
            && lowPairRunBeatsPairSplittingHighStraight && atomicPairRunLead) {
            const lowPairRunIndex = cyclePool.indexOf(atomicPairRunLead);
            if (lowPairRunIndex > 0) cyclePool.splice(lowPairRunIndex, 1);
            cyclePool.unshift(atomicPairRunLead);
        }
        // Base grouping treats pairs and regional maxima as atomic recovery
        // resources while assigning triple-family wings. A triple candidate
        // that opens one card from a pair, or spends the maximum as a wing,
        // cannot become the first prompt while an undamaged ordinary body is
        // available. Keep it in the later Hint cycle for manual alternatives.
        const firstLead = cyclePool[0];
        const isUnsafeTripleAttachment = (candidate: typeof firstLead): boolean => {
            if (!candidate || candidate.tripleBodyCount !== 1
                || candidate.cards.length <= candidate.tripleBodyCount * 3) return false;
            const opensHighPair = candidate.splitPairs > 0
                && tripleFamilyAttachments(hand, candidate.cards)
                    .some((card) => originalCounts[rank(card)] === 2 && rank(card) >= 10);
            return opensHighPair
                || (!normalizedRules.compareTripleAttachments
                    && candidate.usesMaximumAttachment && candidate.remainingCount > 0);
        };
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb
            && isUnsafeTripleAttachment(firstLead)) {
            const safeLeadIndex = cyclePool.findIndex((candidate, index) => index > 0
                && candidate.splitBombs === 0
                && !isCompleteProtectedBomb(candidate.cards, hintBombs)
                && !isUnsafeTripleAttachment(candidate));
            if (safeLeadIndex > 0) {
                const [safeLead] = cyclePool.splice(safeLeadIndex, 1);
                cyclePool.unshift(safeLead);
            }
        }
        // This is the final self-lead boundary. When a simple hand contains
        // more true loose singles than all pair cards combined, lead the
        // lowest loose single regardless of whether the remaining pair is KK,
        // AA, or another rank. Earlier whole-hand refinements may still rank a
        // two-card pair above a one-card single by body size, so enforce the
        // resolved decomposition rule only after every other promotion.
        if (singleDominantHand && !hasExactTwoHandMaximum && !hasTwoHandScoringBomb) {
            const lowestLooseSingleIndex = cyclePool.reduce((bestIndex, candidate, index) => {
                if (candidate.cards.length !== 1
                    || originalCounts[rank(candidate.cards[0])] !== 1) return bestIndex;
                if (bestIndex < 0) return index;
                return rank(candidate.cards[0]) < rank(cyclePool[bestIndex].cards[0])
                    ? index : bestIndex;
            }, -1);
            if (lowestLooseSingleIndex > 0) {
                const [lowestLooseSingle] = cyclePool.splice(lowestLooseSingleIndex, 1);
                cyclePool.unshift(lowestLooseSingle);
            }
        }
        // An exact one-card remainder is a proven two-play plan, unlike the
        // general `quality.turns` value which is only a decomposition estimate.
        // Promote that verifiable finish without letting an estimate override
        // established straight, pair-run, bomb and attachment rules. When more
        // than one exact finish exists, retain the highest final singleton.
        // The near-sized maximum-first rule remains stronger for 332.
        if (!hasExactTwoHandMaximum && !hasTwoHandScoringBomb) {
            const exactTwoPlay = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                // This correction targets a complete aircraft family. Plain
                // straights already have an authoritative low-first order;
                // promoting every straight that leaves one card would invert
                // 34567 / 10-J-Q-K-A and the <=J duplicate-preservation rule.
                .filter(({ candidate }) => candidate.remainingCount === 1
                    && candidate.tripleBodyCount >= 2)
                .sort((left, right) => right.candidate.remainingHighestRank
                    - left.candidate.remainingHighestRank
                    || left.index - right.index)[0];
            if (exactTwoPlay && exactTwoPlay.index > 0) {
                const [bestExactFinish] = cyclePool.splice(exactTwoPlay.index, 1);
                cyclePool.unshift(bestExactFinish);
            }
        }
        // LS201 has no rank 2 and treats A as its immutable control card. When
        // the complete hand has no A, its regional policy is deliberately
        // direct: lead the legal candidate that sheds the most cards. Apply it
        // at the final queue boundary so generic single/pair refinements cannot
        // move a shorter play back ahead of the selected complete body.
        const handContainsRegionalMaximum = hand.some((card) =>
            (normalizedRules.maximumSingleRanks ?? []).includes(rank(card)));
        if (normalizedRules.prioritizeLargestLeadWithoutMaximum
            && !handContainsRegionalMaximum) {
            const largestLead = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .sort((left, right) => left.candidate.quality.turns
                    - right.candidate.quality.turns
                    || right.candidate.cards.length - left.candidate.cards.length
                    || left.index - right.index)[0];
            if (largestLead && largestLead.index > 0) {
                const [candidate] = cyclePool.splice(largestLead.index, 1);
                cyclePool.unshift(candidate);
            }
        }
        // LS201's A is the absolute single-card control. Keep it as the first
        // lead unless the hand can shed a connected straight/pair-run of at
        // least four cards. Triple attachments are not a connected recovery
        // body, so hands such as A,K,Q,999,77 still lead A; KKQQ remains the
        // larger coherent lead in A,KK,QQ,10,88.
        if (normalizedRules.prioritizeMaximumLeadUnlessConnectedRun
            && handContainsRegionalMaximum) {
            const connectedLead = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .filter(({ candidate }) => candidate.cards.length >= 4
                    && (candidate.straightBody
                        || pairRunBounds(candidate.cards, normalizedRules) !== null))
                .sort((left, right) => right.candidate.cards.length
                    - left.candidate.cards.length || left.index - right.index)[0];
            const maximumSingle = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .find(({ candidate }) => candidate.cards.length === 1
                    && Boolean(candidate.containsRuleMaximum));
            const preferred = connectedLead ?? maximumSingle;
            if (preferred && preferred.index > 0) {
                const [candidate] = cyclePool.splice(preferred.index, 1);
                cyclePool.unshift(candidate);
            }
        }
        // Final LS201 lead boundary. A straight reaching A remains a complete
        // control shape; otherwise shed the legal shape with the most cards.
        // Equal-size choices use the complete remainder first, then preserve
        // an atomic triple family. This selects QQQ+77, 777+88 and 777+A over
        // shorter/split alternatives while keeping JJQQKK ahead of single A.
        if (normalizedRules.prioritizeLargestLeadUnlessMaximumStraight) {
            const maximumStraight = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .filter(({ candidate }) => candidate.straightBody
                    && candidate.cards.some((card) =>
                        (normalizedRules.maximumSingleRanks ?? []).includes(rank(card))))
                .sort((left, right) => right.candidate.cards.length
                    - left.candidate.cards.length
                    || left.candidate.quality.turns - right.candidate.quality.turns
                    || left.index - right.index)[0];
            const pairDominantRun = pairCount * 2 > rawSingleCount
                ? cyclePool
                    .map((candidate, index) => ({ candidate, index }))
                    .filter(({ candidate }) =>
                        pairRunBounds(candidate.cards, normalizedRules) !== null
                        && candidate.splitTriples === 0
                        && candidate.splitBombs === 0)
                    .sort((left, right) => right.candidate.cards.length
                        - left.candidate.cards.length
                        || left.candidate.quality.turns - right.candidate.quality.turns
                        || left.index - right.index)[0]
                : undefined;
            const largestShape = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .sort((left, right) => left.candidate.quality.turns
                    - right.candidate.quality.turns
                    || right.candidate.cards.length - left.candidate.cards.length
                    || Number(right.candidate.tripleBodyCount > 0)
                        - Number(left.candidate.tripleBodyCount > 0)
                    || left.candidate.planLooseSingles - right.candidate.planLooseSingles
                    || left.index - right.index)[0];
            // When pair cards strictly outnumber loose singles, their complete
            // consecutive run is the larger preserved structure even if a
            // one-card-longer straight could be formed by peeling both pairs.
            // Equality keeps the ordinary largest-shape rule (K,QQ,JJ,10,9,7
            // still leads the 9-K straight).
            const preferred = maximumStraight ?? pairDominantRun ?? largestShape;
            if (preferred && preferred.index > 0) {
                const [candidate] = cyclePool.splice(preferred.index, 1);
                cyclePool.unshift(candidate);
            }

            const promote = (candidate: (typeof cyclePool)[number] | undefined): void => {
                if (!candidate) return;
                const index = cyclePool.indexOf(candidate);
                if (index <= 0) return;
                cyclePool.splice(index, 1);
                cyclePool.unshift(candidate);
            };
            const maximumRanks = new Set(normalizedRules.maximumSingleRanks ?? []);
            const maximumSingle = cyclePool.find((candidate) => candidate.cards.length === 1
                && maximumRanks.has(rank(candidate.cards[0])));
            const maximumPair = cyclePool.find((candidate) => candidate.cards.length === 2
                && rank(candidate.cards[0]) === rank(candidate.cards[1])
                && maximumRanks.has(rank(candidate.cards[0])));

            // If the same physical hand retains a higher equal-length straight,
            // lead the lower straight and keep the maximum run as a recovery.
            // A,KK,Q,1010,9,8 therefore leads 8-10 and keeps Q-K-A. This is
            // different from a hand whose only complete straight reaches A.
            const maximumStraights = cyclePool.filter((candidate) => candidate.straightBody
                && candidate.cards.some((card) => maximumRanks.has(rank(card))));
            const recoveryLead = cyclePool
                .filter((candidate) => candidate.straightBody
                    && candidate.splitTriples === 0
                    && !candidate.cards.some((card) => maximumRanks.has(rank(card))))
                .filter((candidate) => {
                    const remaining = subtract(hand, candidate.cards);
                    return Boolean(remaining && maximumStraights.some((maximum) =>
                        maximum.cards.length === candidate.cards.length
                        && containsCards(remaining, maximum.cards)));
                })
                .sort((left, right) => Math.min(...left.cards.map(rank))
                    - Math.min(...right.cards.map(rank)))[0];
            if (recoveryLead) promote(recoveryLead);

            // AAA is an ordinary maximum triple in LS201. When carrying the
            // lowest loose card leaves one complete play (for example 1010JJ),
            // it is the two-play lead rather than the remaining pair run.
            const maximumTripleLead = cyclePool
                .filter((candidate) => candidate.quality.turns === 1)
                .filter((candidate) => {
                    const counts = countsOf(candidate.cards);
                    return [...maximumRanks].some((value) => counts[value] === 3)
                        && candidate.cards.length === 4;
                })
                .sort((left, right) => left.planLooseSingles - right.planLooseSingles
                    || left.order - right.order)[0];
            if (maximumTripleLead) promote(maximumTripleLead);

            // Complete two-play A + pair spends A first. With three simple
            // plays, retain the unique A as recapture and shed the other loose
            // card; if AA is the retained control pair, shed the lowest loose
            // card. An all-single hand likewise starts from its minimum.
            const simpleMaximumPlan = originalCounts.every((count) => count <= 2)
                && ((originalQuality.runCards === 0 && originalQuality.pairRunCards === 0)
                    || pairCount >= 3);
            if (simpleMaximumPlan && (maximumPair || maximumSingle) && originalQuality.turns === 2
                && hand.length === 3 && pairCount === 1 && rawSingleCount === 1) {
                // Two-play tail always spends the complete maximum control:
                // A+77 leads A, while AA+7 leads the intact AA pair.
                promote(maximumPair ?? maximumSingle);
            } else if (simpleMaximumPlan && pairCount === 1 && rawSingleCount === 2
                && maximumSingle && rank(maximumSingle.cards[0]) < deckMaximumRank) {
                // An effective control below the immutable deck top must stay
                // available to regain the lead. K,9,88 therefore sheds 88; this
                // precedes the generic three-atomic-play middle-card policy.
                promote(cyclePool
                    .filter((candidate) => candidate.cards.length === 2
                        && rank(candidate.cards[0]) === rank(candidate.cards[1])
                        && originalCounts[rank(candidate.cards[0])] === 2)
                    .sort((left, right) => rank(left.cards[0]) - rank(right.cards[0]))[0]);
            } else if (simpleMaximumPlan && originalQuality.turns === 3) {
                // Three complete atomic plays spend the middle control first:
                // the highest play is retained for recapture and the lowest
                // play remains the tail. This is the shared endgame ordering
                // for A,10,7; AA,9,7; and A,J,77, rather than a hand-specific
                // card combination exception.
                const completeAtomicPlays = cyclePool
                    .filter((candidate) => {
                        if (candidate.cards.length === 1) {
                            const value = rank(candidate.cards[0]);
                            return originalCounts[value] === 1
                                || maximumRanks.has(value);
                        }
                        return candidate.cards.every((card) =>
                            rank(card) === rank(candidate.cards[0]))
                            && candidate.cards.length === originalCounts[rank(candidate.cards[0])];
                    })
                    .sort((left, right) => rank(right.cards[0]) - rank(left.cards[0])
                        || right.cards.length - left.cards.length
                        || left.order - right.order);
                promote(completeAtomicPlays[1]);
            } else if (simpleMaximumPlan && pairCount === 1 && rawSingleCount === 2) {
                const maximumIsDeckTop = maximumSingle
                    && rank(maximumSingle.cards[0]) === deckMaximumRank;
                if (!maximumIsDeckTop) {
                    // When the effective control has fallen below the deck's
                    // natural maximum (for example K after all aces are
                    // visible), keep it for recovery and shed the intact pair.
                    // K,9,88 therefore starts from 88; the absolute-A case
                    // A,J,JJ,7 still probes with 7 and lets A recapture.
                    promote(cyclePool
                        .filter((candidate) => candidate.cards.length === 2
                            && rank(candidate.cards[0]) === rank(candidate.cards[1])
                            && originalCounts[rank(candidate.cards[0])] === 2)
                        .sort((left, right) => rank(left.cards[0]) - rank(right.cards[0]))[0]);
                } else {
                const ordinarySingles = cyclePool
                    .filter((candidate) => candidate.cards.length === 1
                        && !maximumRanks.has(rank(candidate.cards[0])))
                    .sort((left, right) => {
                        const maximumIsLoose = [...maximumRanks]
                            .some((value) => originalCounts[value] === 1);
                        return maximumIsLoose
                            ? rank(right.cards[0]) - rank(left.cards[0])
                            : rank(left.cards[0]) - rank(right.cards[0]);
                    });
                promote(ordinarySingles[0]);
                }
            } else if (simpleMaximumPlan && pairCount === 0 && rawSingleCount > 3) {
                const minimumSingle = cyclePool
                    .filter((candidate) => candidate.cards.length === 1)
                    .sort((left, right) => rank(left.cards[0]) - rank(right.cards[0]))[0];
                promote(minimumSingle);
            }
        }
    } else if (normalizedRules.prioritizeMaximumResponseWithinThreePlays
        && originalQuality.turns <= 3) {
        const maximumResponseIndex = cyclePool.findIndex((candidate) =>
            Boolean(candidate.containsRuleMaximum) && !candidate.usesMaximumAttachment);
        if (maximumResponseIndex > 0) {
            const [maximumResponse] = cyclePool.splice(maximumResponseIndex, 1);
            cyclePool.unshift(maximumResponse);
        } else if (maximumResponseIndex < 0 && cyclePool[0]?.cards.length === 1) {
            // Without A, minimize newly exposed singles first and only then use
            // the lowest legal point to answer. This keeps response splitting
            // aligned with the complete-hand decomposition.
            const bestSingle = cyclePool
                .map((candidate, index) => ({ candidate, index }))
                .filter(({ candidate }) => candidate.cards.length === 1)
                .sort((left, right) => left.candidate.planLooseSingles
                    - right.candidate.planLooseSingles
                    || rank(left.candidate.cards[0]) - rank(right.candidate.cards[0])
                    || left.index - right.index)[0];
            if (bestSingle && bestSingle.index > 0) {
                const [candidate] = cyclePool.splice(bestSingle.index, 1);
                cyclePool.unshift(candidate);
            }
        }
    }
    if (preferLargest && !normalizedRules.preserveScoringBombs) {
        // Public non-scoring-bomb rule: a regionally legal four-with attachment
        // is an ordinary shedding shape, not a protected bomb. Prefer the plan
        // that leaves the fewest plays, then sheds the most cards now.
        const fourWith = cyclePool
            .map((candidate, index) => ({ candidate, index }))
            .filter(({ candidate }) => candidate.consumesFourCardBody)
            .sort((left, right) => left.candidate.quality.turns - right.candidate.quality.turns
                || right.candidate.cards.length - left.candidate.cards.length
                || left.index - right.index)[0];
        if (fourWith && fourWith.index > 0) {
            const [candidate] = cyclePool.splice(fourWith.index, 1);
            cyclePool.unshift(candidate);
        }
    }
    // Final ordering invariant for near-sized, equal-turn straights: do not
    // lengthen the current run by peeling one card from a complete pair when an
    // intact alternative keeps a higher equal-length run for recapture.
    cyclePool.sort((left, right) => {
        if (!left.straightBody || !right.straightBody
            || left.quality.turns !== right.quality.turns
            || Math.abs(left.cards.length - right.cards.length) > 1
            || (!left.retainsHigherStraight && !right.retainsHigherStraight)) return 0;
        const maximumRanks = new Set(normalizedRules.maximumSingleRanks ?? []);
        // A longer straight that spends the only maximum control is the
        // current hand's largest safe shedding shape. Do not demote it merely
        // to preserve a pair: A,KK,Q,J,9,8,7 leads J-Q-K-A rather than 7-8-9.
        // The ordinary lower-run recovery rule still applies when both runs
        // are equal length or the maximum remains independently available.
        const leftReachesMaximum = left.cards.some((card) => maximumRanks.has(rank(card)));
        const rightReachesMaximum = right.cards.some((card) => maximumRanks.has(rank(card)));
        if (left.cards.length !== right.cards.length
            && leftReachesMaximum !== rightReachesMaximum) return 0;
        const splitPairDifference = left.splitPairs - right.splitPairs;
        if (splitPairDifference !== 0) return splitPairDifference;
        return 0;
    });
    if (preferLargest && normalizedRules.prioritizeLargestLeadUnlessMaximumStraight) {
        const maximumRanks = new Set(normalizedRules.maximumSingleRanks ?? []);
        const maximumStraight = cyclePool
            .filter((candidate) => candidate.straightBody
                && candidate.cards.some((card) => maximumRanks.has(rank(card))))
            .sort((left, right) => right.cards.length - left.cards.length
                || left.quality.turns - right.quality.turns
                || left.order - right.order)[0];
        const hasEqualLengthRecoveryLead = maximumStraight && cyclePool
            .filter((candidate) => candidate.straightBody
                && candidate.splitTriples === 0
                && candidate.cards.length === maximumStraight.cards.length
                && !candidate.cards.some((card) => maximumRanks.has(rank(card))))
            .some((candidate) => {
                const remaining = subtract(hand, candidate.cards);
                return Boolean(remaining && containsCards(remaining, maximumStraight.cards));
            });
        // Reassert the longest maximum-reaching run after the generic stable
        // sort. A chain of shorter overlapping runs can otherwise move 789
        // ahead of JQKA even though no equal-length recovery plan exists.
        if (maximumStraight && !hasEqualLengthRecoveryLead) {
            const index = cyclePool.indexOf(maximumStraight);
            if (index > 0) {
                cyclePool.splice(index, 1);
                cyclePool.unshift(maximumStraight);
            }
        }
    }
    const highRecoveryPairCount = originalCounts
        .filter((count, value) => value >= 11 && count === 2).length;
    if (preferLargest && pairCount >= 3 && pairCount * 2 > rawSingleCount
        && highRecoveryPairCount >= 1) {
        const completePairRunExists = cyclePool.some((candidate) =>
            pairRunBounds(candidate.cards, normalizedRules) !== null
            && candidate.splitTriples === 0 && candidate.splitBombs === 0);
        if (!completePairRunExists) {
            // A pair-dominant hand uses an intact J-or-higher pair as its
            // recovery chain. Pair quantity alone is insufficient: low pairs
            // cannot reliably take the lead back and must not activate this.
            // Lead the lowest intact pair instead of peeling high pairs into a
            // straight: AA,K,Q,JJ,99 starts from 99, not J-Q-K-A.
            const lowestPair = cyclePool
                .filter((candidate) => candidate.cards.length === 2
                    && rank(candidate.cards[0]) === rank(candidate.cards[1])
                    && originalCounts[rank(candidate.cards[0])] === 2)
                .sort((left, right) => rank(left.cards[0]) - rank(right.cards[0])
                    || left.order - right.order)[0];
            if (lowestPair) {
                const index = cyclePool.indexOf(lowestPair);
                if (index > 0) {
                    cyclePool.splice(index, 1);
                    cyclePool.unshift(lowestPair);
                }
            }
        }
    }
    // A complete consecutive-pair body that leaves exactly one legal hand is a
    // proven two-play decomposition. It precedes a destructive straight whose
    // remainder needs more plays; ordinary low-straight preservation remains
    // unchanged when the pair run does not actually finish in two.
    const exactTwoPlayPairRun = cyclePool
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) => pairRunBounds(candidate.cards, normalizedRules) !== null
            && rawSingleCount === 0
            && candidate.quality.turns === 1
            && candidate.splitBombs === 0
            && candidate.splitTriples === 0)
        .sort((left, right) => right.candidate.cards.length - left.candidate.cards.length
            || left.candidate.order - right.candidate.order)[0];
    if (exactTwoPlayPairRun && exactTwoPlayPairRun.index > 0
        && (cyclePool[0]?.quality.turns ?? Number.MAX_SAFE_INTEGER) > 1) {
        const [candidate] = cyclePool.splice(exactTwoPlayPairRun.index, 1);
        cyclePool.unshift(candidate);
    }
    if (preferLargest && normalizedRules.prioritizeLargestLeadUnlessMaximumStraight
        && normalizedRules.didCompeteDealer !== undefined) {
        const tripleLeads = cyclePool
            .filter((candidate) => candidate.tripleBodyCount === 1
                && candidate.splitTriples === 0 && candidate.cards.length > 3)
            .sort((left, right) => left.tripleBodyRank - right.tripleBodyRank);
        const preferred = normalizedRules.didCompeteDealer
            ? tripleLeads.at(-1) : tripleLeads[0];
        const index = preferred ? cyclePool.indexOf(preferred) : -1;
        if (index > 0) {
            cyclePool.splice(index, 1);
            cyclePool.unshift(preferred!);
        }
    }
    if (preferLargest && normalizedRules.optimizeWholeHand
        && !normalizedRules.prioritizeLargestLeadUnlessMaximumStraight
        && !maximumTripleProbeHand && !maximumTriplePairDominantHand) {
        const promote = (candidate: typeof cyclePool[number] | undefined): void => {
            if (!candidate) return;
            const index = cyclePool.indexOf(candidate);
            if (index <= 0) return;
            cyclePool.splice(index, 1);
            cyclePool.unshift(candidate);
        };
        const current = cyclePool[0];
        const currentIsPair = current?.cards.length === 2
            && rank(current.cards[0]) === rank(current.cards[1]);
        const currentIsBareTripleFamily = Boolean(current?.tripleBodyCount > 0
            && current.cards.length === current.tripleBodyCount * 3);
        if (currentIsPair || currentIsBareTripleFamily) {
            const tripleFamily = cyclePool
                .filter((candidate) => candidate.tripleBodyCount > 0
                    && candidate.cards.length > candidate.tripleBodyCount * 3
                    && candidate.splitBombs === 0 && candidate.splitTriples === 0
                    && (candidate.tripleBodyCount > 1 || candidate.splitPairs === 0)
                    && candidate.completeBombs === 0
                    && candidate.quality.turns <= current.quality.turns
                    && (currentIsPair || (candidate.tripleBodyCount === current.tripleBodyCount
                        && candidate.tripleBodyRank === current.tripleBodyRank)))
                .sort((left, right) => Number(usesPreferredLowPairAttachment(
                    hand, right.cards, normalizedRules,
                )) - Number(usesPreferredLowPairAttachment(hand, left.cards, normalizedRules))
                    || left.quality.turns - right.quality.turns
                    || left.planLooseSingles - right.planLooseSingles
                    || left.splitPairs - right.splitPairs
                    || right.cards.length - left.cards.length
                    || left.attachmentPairPolicyCost - right.attachmentPairPolicyCost
                    || left.attachmentDamage - right.attachmentDamage
                    || left.attachmentSourceCost - right.attachmentSourceCost
                    || left.attachmentControlCost - right.attachmentControlCost
                    || left.tripleBodyRank - right.tripleBodyRank
                    || left.order - right.order)[0];
            promote(tripleFamily);
        }
        const afterTriple = cyclePool[0];
        if ((afterTriple.cards.length <= 2 || afterTriple.quality.turns > minimumPlanTurns)
            && !afterTriple.retainsHigherPairRun) {
            const decisiveStraight = cyclePool
                .filter((candidate) => candidate.straightBody
                    && candidate.cards.length >= 7
                    && candidate.splitBombs === 0
                    && candidate.quality.turns < afterTriple.quality.turns)
                .sort((left, right) => left.quality.turns - right.quality.turns
                    || left.planLooseSingles - right.planLooseSingles
                    || right.cards.length - left.cards.length
                    || left.order - right.order)[0];
            promote(decisiveStraight);
        }
        const currentLead = cyclePool[0];
        if (!strategicTripleRecoveryLead) {
            const sameTurnLongStraight = cyclePool
                .filter((candidate) => candidate.straightBody
                    && candidate.cards.length >= 7
                    && candidate.splitBombs === 0
                    && candidate.quality.turns <= currentLead.quality.turns
                    && (!currentLead.retainsHigherPairRun || candidate.leavesStraightBody
                        || candidate.planLooseSingles <= currentLead.planLooseSingles)
                    && candidate.cards.length >= currentLead.cards.length + 3)
                .sort((left, right) => left.quality.turns - right.quality.turns
                    || right.cards.length - left.cards.length
                    || left.order - right.order)[0];
            promote(sameTurnLongStraight);
        }
    }
    if (normalizedRules.compareTripleAttachments
        && cyclePool[0]?.tripleBodyCount === 1
        && cyclePool[0].splitBombs === 0
        && !cyclePool[0].consumesFourCardBody
        && cyclePool[0].cards.length > cyclePool[0].tripleBodyCount * 3) {
        const primary = cyclePool[0];
        const variants = cyclePool.filter((candidate) =>
            candidate.tripleBodyCount === 1
            && candidate.splitBombs === 0
            && !candidate.consumesFourCardBody
            && candidate.tripleBodyRank === primary.tripleBodyRank
            && candidate.cards.length === primary.cards.length);
        if (variants.length > 1) {
            const attachmentCount = primary.cards.length - primary.tripleBodyCount * 3;
            const isRegionalLeadPolicy = Boolean(
                normalizedRules.prioritizeLargestLeadUnlessMaximumStraight,
            );
            const highRegionalTriple = isRegionalLeadPolicy
                && primary.tripleBodyCount === 1
                && primary.tripleBodyRank >= deckMaximumRank - 2;
            const preserveMaximumForStraight = variants.some((candidate) =>
                !candidate.usesMaximumAttachment && candidate.leavesStraightBody);
            const preferredLowPairExists = variants.some((candidate) =>
                usesPreferredLowPairAttachment(hand, candidate.cards, normalizedRules));
            const selected = [...variants].sort((left, right) => {
                if (preferredLowPairExists) {
                    const leftPreferred = usesPreferredLowPairAttachment(
                        hand, left.cards, normalizedRules,
                    );
                    const rightPreferred = usesPreferredLowPairAttachment(
                        hand, right.cards, normalizedRules,
                    );
                    if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
                }
                if (Boolean(left.containsRuleMaximum) !== Boolean(right.containsRuleMaximum)) {
                    return left.containsRuleMaximum ? 1 : -1;
                }
                if (attachmentCount === 1) {
                    if (!highRegionalTriple) {
                        const turnDifference = left.quality.turns - right.quality.turns;
                        if (turnDifference !== 0) return turnDifference;
                        const looseDifference = left.planLooseSingles - right.planLooseSingles;
                        if (looseDifference !== 0) return looseDifference;
                        if (preserveMaximumForStraight
                            && left.usesMaximumAttachment !== right.usesMaximumAttachment) {
                            return left.usesMaximumAttachment ? 1 : -1;
                        }
                    }
                    const rankDifference = compareTripleAttachmentRanks(
                        hand, left.cards, right.cards,
                    );
                    return highRegionalTriple ? rankDifference : -rankDifference;
                }
                if (pairCount >= 3) {
                    const turnDifference = left.quality.turns - right.quality.turns;
                    if (turnDifference !== 0) return turnDifference;
                    const looseDifference = left.planLooseSingles - right.planLooseSingles;
                    if (looseDifference !== 0) return looseDifference;
                } else if (left.usesMaximumAttachment !== right.usesMaximumAttachment) {
                    return left.usesMaximumAttachment ? 1 : -1;
                }
                const pairPolicyDifference = left.attachmentPairPolicyCost
                    - right.attachmentPairPolicyCost;
                if (pairPolicyDifference !== 0) return pairPolicyDifference;
                return -compareTripleAttachmentRanks(hand, left.cards, right.cards)
                    || left.order - right.order;
            })[0];
            const index = cyclePool.indexOf(selected);
            if (index > 0) {
                cyclePool.splice(index, 1);
                cyclePool.unshift(selected);
            }
        }
    }
    if (preferLargest && liangshanPolicy
        && normalizedRules.minimumStraightLength === 3) {
        const maximumRanks = new Set(normalizedRules.maximumSingleRanks ?? []);
        // LS201 can make a complete straight from only three cards. When that
        // minimum run leaves one intact, non-maximum triple-with-pair hand, lead
        // the run and retain the larger five-card control family. This compares
        // complete decompositions instead of named ranks: QQQ,88,J,10,9 therefore
        // selects 9-10-J, while AAA+pair keeps the established maximum-control
        // endgame. COMMON never enters this regional branch.
        const minimumStraightBeforeTriplePair = cyclePool
            .filter((candidate) => candidate.straightBody
                && candidate.cards.length === normalizedRules.minimumStraightLength
                && candidate.finishesInTwo
                && candidate.splitBombs === 0
                && candidate.splitTriples === 0
                && candidate.splitPairs === 0)
            .filter((candidate) => {
                const remaining = subtract(hand, candidate.cards);
                if (!remaining || remaining.length !== 5) return false;
                const remainingCounts = countsOf(remaining);
                const tripleRank = remainingCounts.findIndex((count) => count === 3);
                return tripleRank >= 0 && !maximumRanks.has(tripleRank)
                    && remainingCounts.some((count) => count === 2)
                    && remainingCounts.filter((count) => count > 0).length === 2;
            })
            .sort((left, right) => Math.min(...left.cards.map(rank))
                - Math.min(...right.cards.map(rank))
                || left.order - right.order)[0];
        const index = minimumStraightBeforeTriplePair
            ? cyclePool.indexOf(minimumStraightBeforeTriplePair) : -1;
        if (index > 0) {
            cyclePool.splice(index, 1);
            cyclePool.unshift(minimumStraightBeforeTriplePair!);
        }
    }
    const hasExactTwoHandLead = cyclePool.some((candidate) => candidate.finishesInTwo);
    if (preferLargest && !hasExactTwoHandLead
        && (maximumTripleProbeHand || maximumTriplePairDominantHand)) {
        // This is a hand-level opening policy, so apply it after every generic
        // decomposition reorder. Keeping it inside the pairwise comparator can
        // create a non-transitive cycle between a singleton, a pair and a
        // triple-with-attachment candidate. An exact two-hand decomposition is
        // stronger and must never be replaced by a low-card probe.
        const probe = cyclePool
            .map((candidate, index) => ({ candidate, index }))
            .filter(({ candidate }) => (!maximumTriplePairDominantHand
                && candidate.cards.length === 1
                && originalCounts[rank(candidate.cards[0])] === 1)
                || (candidate.cards.length === 2
                    && rank(candidate.cards[0]) === rank(candidate.cards[1])
                    && originalCounts[rank(candidate.cards[0])] === 2))
            .sort((left, right) => rank(left.candidate.cards[0]) - rank(right.candidate.cards[0])
                || right.candidate.cards.length - left.candidate.cards.length
                || left.index - right.index)[0];
        if (probe && probe.index > 0) {
            const [candidate] = cyclePool.splice(probe.index, 1);
            cyclePool.unshift(candidate);
        }
    }
    if (preferLargest && !hasExactTwoHandLead
        && normalizedRules.prioritizeLargestLeadUnlessMaximumStraight
        && pairCount === 0 && originalCounts[deckMaximumRank] === 1) {
        const highControlTripleRank = originalCounts
            .map((count, value) => count === 3 && value >= deckMaximumRank - 2 ? value : 0)
            .find(Boolean) ?? 0;
        if (highControlTripleRank > 0) {
            const lowestLooseSingle = cyclePool
                .filter((candidate) => candidate.cards.length === 1
                    && originalCounts[rank(candidate.cards[0])] === 1)
                .sort((left, right) => rank(left.cards[0]) - rank(right.cards[0])
                    || left.order - right.order)[0];
            const index = lowestLooseSingle ? cyclePool.indexOf(lowestLooseSingle) : -1;
            if (index > 0) {
                cyclePool.splice(index, 1);
                cyclePool.unshift(lowestLooseSingle!);
            }
        }
    }
    if (preferLargest && normalizedRules.prioritizeLargestLeadUnlessMaximumStraight
        && cyclePool.length > 1) {
        const remainingAfterPrimary = subtract(hand, cyclePool[0].cards);
        if (remainingAfterPrimary && remainingAfterPrimary.length > 0
            && quality(remainingAfterPrimary, normalizedRules, planMemo).turns <= 2) {
            const continuation = cyclePool
                .slice(1)
                .filter((candidate) => containsCards(remainingAfterPrimary, candidate.cards))
                .filter((candidate) => (candidate.containsRuleMaximum
                    || (candidate.cards.length > 0 && candidate.cards.every((card) =>
                        (normalizedRules.maximumSingleRanks ?? []).includes(rank(card)))))
                    && !candidate.usesMaximumAttachment)
                .sort((left, right) => right.cards.length - left.cards.length
                    || right.cards.reduce((sum, card) => sum + rank(card), 0)
                        - left.cards.reduce((sum, card) => sum + rank(card), 0)
                    || left.order - right.order)[0];
            const index = continuation ? cyclePool.indexOf(continuation) : -1;
            if (index > 1) {
                cyclePool.splice(index, 1);
                cyclePool.splice(1, 0, continuation!);
            }
        }
    }
    if (preferLargest && liangshanPolicy && pairCount >= 3
        && pairCount * 2 > rawSingleCount) {
        // A complete multi-pair run is the playable body; the loose singles are
        // its tail, not probes that should precede it. Keep this final boundary
        // after the older LS201 recovery refinements so JJQQKK,10,7 is exposed
        // as JJQQKK -> 7 -> 10. Exact two-hand maximum control remains stronger.
        const completePairRun = cyclePool
            .filter((candidate) => pairRunBounds(candidate.cards, normalizedRules) !== null
                && candidate.splitBombs === 0 && candidate.splitTriples === 0)
            .sort((left, right) => right.cards.length - left.cards.length
                || left.quality.turns - right.quality.turns
                || Math.min(...left.cards.map(rank)) - Math.min(...right.cards.map(rank))
                || left.order - right.order)[0];
        const pairRunIndex = completePairRun ? cyclePool.indexOf(completePairRun) : -1;
        if (pairRunIndex > 0 && !isExactTwoHandMaximum(cyclePool[0])) {
            cyclePool.splice(pairRunIndex, 1);
            cyclePool.unshift(completePairRun!);
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
