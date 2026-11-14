import * as recognition from './PdkCardRecognition';
import type { PdkHintRules, PdkKind, TripleAttachmentMode } from './PdkCardRecognition';

const { MIN_RANK, MAX_RANK, cardRank, compareCard, countsOf, countCards, countsKey, cardsKey, removalKey, subtract, containsCards, runs, describeShape, isBombLike, responseBeatsTarget, targetMatches } = recognition;

export interface DecompositionGroup {
    cards: number[];
    kind: PdkKind;
    bodyRanks: number[];
    attachments: number[];
    key: string;
}

export interface DecompositionPlan {
    groups: DecompositionGroup[];
    turns: number;
    singleGroups: number;
    ordinarySingles: number;
    nonLooseAttachments: number;
    pairAttachmentCards: number;
    pairSplitGroups: number;
    airplaneGroups: number;
    pairRunGroups: number;
    straightGroups: number;
    tripleGroups: number;
    pairGroups: number;
    attachmentRankSum: number;
    key: string;
}

export const emptyPlan = (): DecompositionPlan => ({
    groups: [], turns: 0, singleGroups: 0, ordinarySingles: 0,
    nonLooseAttachments: 0, pairAttachmentCards: 0, pairSplitGroups: 0,
    airplaneGroups: 0, pairRunGroups: 0, straightGroups: 0, tripleGroups: 0,
    pairGroups: 0, attachmentRankSum: 0,
    key: '',
});

const largestCompleteGroupCardCount = (plan: DecompositionPlan): number =>
    plan.groups.reduce((largest, group) => Math.max(largest, group.cards.length), 0);

/**
 * A leading fixed plan represents a complete, deterministic way to empty the
 * hand. When two such plans require the same number of turns, the player-facing
 * first decision is the largest complete group, before the structural tie
 * breakers below. This is deliberately a decomposition tie breaker: the hint
 * sorter still receives exactly one fixed plan and never recreates a group.
 */
const leadCompletionCompare = (left: DecompositionPlan, right: DecompositionPlan): number =>
    largestCompleteGroupCardCount(right) - largestCompleteGroupCardCount(left);

export const planCompare = (left: DecompositionPlan, right: DecompositionPlan): number => {
    if (left.turns !== right.turns) return left.turns - right.turns;
    if (left.singleGroups !== right.singleGroups) return left.singleGroups - right.singleGroups;
    if (left.nonLooseAttachments !== right.nonLooseAttachments) {
        return left.nonLooseAttachments - right.nonLooseAttachments;
    }
    if (left.pairAttachmentCards !== right.pairAttachmentCards) {
        return left.pairAttachmentCards - right.pairAttachmentCards;
    }
    if (left.pairSplitGroups !== right.pairSplitGroups) {
        return left.pairSplitGroups - right.pairSplitGroups;
    }
    if (left.airplaneGroups !== right.airplaneGroups) return right.airplaneGroups - left.airplaneGroups;
    if (left.pairRunGroups !== right.pairRunGroups) return right.pairRunGroups - left.pairRunGroups;
    if (left.straightGroups !== right.straightGroups) return right.straightGroups - left.straightGroups;
    if (left.tripleGroups !== right.tripleGroups) return right.tripleGroups - left.tripleGroups;
    if (left.attachmentRankSum !== right.attachmentRankSum) {
        return left.attachmentRankSum - right.attachmentRankSum;
    }
    if (left.ordinarySingles !== right.ordinarySingles) {
        return left.ordinarySingles - right.ordinarySingles;
    }
    if (left.pairGroups !== right.pairGroups) return left.pairGroups - right.pairGroups;
    return left.key.localeCompare(right.key);
};

const planCompareForMode = (
    left: DecompositionPlan, right: DecompositionPlan, rules: PdkHintRules,
): number => {
    if (left.turns !== right.turns) return left.turns - right.turns;
    // Attachment safety is never traded for a visually larger lead: loose
    // singles remain mandatory before a pair or other intact structure is
    // opened as a triple/airplane wing. Once those costs are identical, a
    // deterministic lead may retain the larger complete opening group ahead
    // of the older independent-single tie breaker.
    if (left.nonLooseAttachments !== right.nonLooseAttachments) {
        return left.nonLooseAttachments - right.nonLooseAttachments;
    }
    if (left.pairAttachmentCards !== right.pairAttachmentCards) {
        return left.pairAttachmentCards - right.pairAttachmentCards;
    }
    if (left.pairSplitGroups !== right.pairSplitGroups) {
        return left.pairSplitGroups - right.pairSplitGroups;
    }
    if (rules.decompositionPlanMode === 'SELF') {
        const completion = leadCompletionCompare(left, right);
        if (completion !== 0) return completion;
    }
    return planCompare(left, right);
};

export const isScoringBombGroup = (cards: readonly number[], rules: PdkHintRules): boolean => {
    const counts = countsOf(cards);
    if (cards.length === 3) {
        return counts.some((count, rank) => count === 3
            && (rules.specialTripleBombRanks ?? []).includes(rank));
    }
    if (cards.length === 4 && counts.some((count) => count === 4)) return true;
    if (cards.length === 4 && rules.allowSpecialTripleBombWithOne === true) {
        return counts.some((count, rank) => count === 3
            && (rules.specialTripleBombRanks ?? []).includes(rank));
    }
    if (cards.length === 5 && rules.allowFourBombWithOne === true) {
        return counts.some((count) => count === 4);
    }
    return false;
};

export const protectedScoringBombs = (
    hand: readonly number[], rules: PdkHintRules,
): number[][] => {
    if (!rules.preserveScoringBombs) return [];
    const seen = new Set<string>();
    const result: number[][] = [];
    const add = (group: readonly number[]): void => {
        const cards = [...group].map(Number).sort(compareCard);
        if (!isScoringBombGroup(cards, rules) || !containsCards(hand, cards)) return;
        const key = cardsKey(cards);
        if (!seen.has(key)) { seen.add(key); result.push(cards); }
    };
    for (const group of rules.protectedBombs ?? []) add(group);
    // Special three-card scoring bombs are authoritative even when the
    // snapshot lists only their rank and not a materialized protected group.
    for (const rank of rules.specialTripleBombRanks ?? []) {
        if ((countsOf(hand)[rank] ?? 0) >= 3) {
            const cards = [...hand].filter((card) => cardRank(card) === rank)
                .sort(compareCard).slice(0, 3);
            add(cards);
        }
    }
    return result;
};

export const removeCounts = (counts: readonly number[], removal: readonly number[]): number[] =>
    counts.map((count, value) => count - (removal[value] ?? 0));

export const removalFromRanks = (entries: readonly [number, number][]): number[] => {
    const removal = Array<number>(16).fill(0);
    for (const [value, count] of entries) removal[value] = count;
    return removal;
};

export const addUniqueRemoval = (result: Map<string, number[]>, removal: number[]): void => {
    if (removal.some((count) => count < 0)) return;
    result.set(removalKey(removal), removal);
};

export const attachmentCombinations = (
    counts: readonly number[], bodyRanks: ReadonlySet<number>, amount: number,
    allowPairsAsSingles: boolean, allowMaximum: boolean, allowTwo: boolean,
    maximumRanks: ReadonlySet<number>,
): number[][] => {
    const eligible: Array<{ value: number; capacity: number }> = [];
    for (let value = MIN_RANK; value <= MAX_RANK; value += 1) {
        if (bodyRanks.has(value)) continue;
        if (!allowTwo && value === 15) continue;
        if (!allowMaximum && maximumRanks.has(value)) continue;
        const count = counts[value] ?? 0;
        // Complete triples remain independent three-card bodies. They are not
        // silently opened to supply a wing.
        if (count <= 0 || count >= 3) continue;
        if (!allowPairsAsSingles && count !== 1) continue;
        eligible.push({ value, capacity: count });
    }
    const result: number[][] = [];
    const current = Array<number>(16).fill(0);
    const visit = (index: number, remaining: number): void => {
        if (remaining === 0) { result.push([...current]); return; }
        if (index >= eligible.length) return;
        const { value, capacity } = eligible[index];
        const maximum = Math.min(capacity, remaining);
        for (let take = 0; take <= maximum; take += 1) {
            current[value] = take;
            visit(index + 1, remaining - take);
        }
        current[value] = 0;
    };
    visit(0, amount);
    return result;
};

export const pairAttachmentCombinations = (
    counts: readonly number[], bodyRanks: ReadonlySet<number>, pairAmount: number,
    allowMaximum: boolean, allowTwo: boolean, maximumRanks: ReadonlySet<number>,
): number[][] => {
    const eligible = Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, index) => index + MIN_RANK)
        .filter((value) => !bodyRanks.has(value)
            // A complete triple remains a body. Pair wings may only split an
            // actual pair; never borrow two cards from a triple just to make
            // an attachment.
            && counts[value] === 2
            && (allowTwo || value !== 15)
            && (allowMaximum || !maximumRanks.has(value)));
    const result: number[][] = [];
    const current = Array<number>(16).fill(0);
    const visit = (index: number, remaining: number): void => {
        if (remaining === 0) { result.push([...current]); return; }
        if (index >= eligible.length) return;
        visit(index + 1, remaining);
        const value = eligible[index];
        current[value] = 2;
        visit(index + 1, remaining - 1);
        current[value] = 0;
    };
    visit(0, pairAmount);
    return result;
};

export const attachmentRemovalsForBody = (
    counts: readonly number[], bodyRanks: readonly number[], mode: TripleAttachmentMode,
    rules: PdkHintRules,
    airplane: boolean,
    responseTarget?: { type: number; count: number },
    includeFallbackAlternatives = false,
): number[][] => {
    const body = removalFromRanks(bodyRanks.map((value) => [value, 3] as [number, number]));
    const withoutBody = removeCounts(counts, body);
    const bodySet = new Set(bodyRanks);
    const maximumRanks = new Set(rules.maximumSingleRanks ?? []);
    const variants: number[][] = [];
    const tailCards = countCards(withoutBody);
    const onlyTwoTail = tailCards > 0
        && tailCards <= bodyRanks.length * 2
        && withoutBody.slice(MIN_RANK, 15).every((count) => count === 0);
    const allowTwoAtEnd = rules.allowTerminalAttachmentShortage === true || onlyTwoTail;
    const responseAttachmentCanBeat = (attachment: readonly number[]): boolean => {
        // The root response may require the wing itself to beat the upper
        // wing. Keep exploring past ordinary low attachments until a complete
        // same-shape response can pass the authoritative comparison. Tail
        // decomposition has no response target and remains unrestricted.
        if (!responseTarget || responseTarget.type < 6 || responseTarget.type > 15
            || !rules.responseTargetCards?.length) return true;
        const removal = body.map((count, rank) => count + (attachment[rank] ?? 0));
        const cards = Array.from({ length: 16 }, (_, rank) =>
            Array<number>(removal[rank] ?? 0).fill(rank)).flat();
        return targetMatches(removal, responseTarget, rules)
            && responseBeatsTarget(cards, rules);
    };
    const addSingles = (amount: number): void => {
        // Ordinary散牌 first, then the smallest pair, then a confirmed maximum,
        // and only as the final fallback a 2. The four passes are deliberate.
        const attempts: Array<[boolean, boolean, boolean]> = [
            [false, false, false], [true, false, false],
            [true, true, false], [true, true, allowTwoAtEnd],
        ];
        for (const [allowPairs, allowMaximum, allowTwo] of attempts) {
            const found = attachmentCombinations(withoutBody, bodySet, amount,
                allowPairs, allowMaximum, allowTwo, maximumRanks)
                .filter(responseAttachmentCanBeat);
            // Keep later fallback tiers only while building the complete
            // hand plan. A pair card can become a true loose wing when its
            // mate is kept inside a straight. Fixed-plan candidate variants
            // retain the ordinary first-available attachment tier.
            variants.push(...found);
            if (!includeFallbackAlternatives && found.length > 0) return;
        }
    };
    const addPairs = (pairs: number): void => {
        const attempts: Array<[boolean, boolean, boolean]> = [
            [false, false, false], [true, false, false], [true, true, allowTwoAtEnd],
        ];
        for (const [allowMaximum, allowTwo, _unused] of attempts) {
            const found = pairAttachmentCombinations(withoutBody, bodySet, pairs,
                allowMaximum, allowTwo, maximumRanks)
                .filter(responseAttachmentCanBeat);
            variants.push(...found);
            if (!includeFallbackAlternatives && found.length > 0) return;
        }
    };
    const bodyCount = bodyRanks.length;
    if (!airplane) {
        if (mode === 'SINGLES' || mode === 'SINGLE_OR_PAIR') addSingles(bodyCount);
        if (mode === 'PAIRS' || mode === 'SINGLE_OR_PAIR') addPairs(bodyCount);
        if (mode === 'EITHER' || mode === 'EITHER_MATCH_SHAPE') {
            addSingles(bodyCount);
            addSingles(bodyCount * 2);
            addPairs(bodyCount);
        }
    } else {
        const airplaneMode = rules.airplaneAttachmentMode ?? rules.tripleAttachmentMode ?? 'DISABLED';
        if (airplaneMode === 'SINGLES' || airplaneMode === 'SINGLE_OR_PAIR') addSingles(bodyCount);
        if (airplaneMode === 'PAIRS' || airplaneMode === 'SINGLE_OR_PAIR') addPairs(bodyCount);
        if (airplaneMode === 'EITHER' || airplaneMode === 'EITHER_MATCH_SHAPE') {
            addSingles(bodyCount);
            addPairs(bodyCount);
            addSingles(bodyCount * 2);
        } else if (rules.allowAirplaneWithTwo === true) {
            addSingles(bodyCount * 2);
        }
    }
    return variants.map((attachment) => body.map((count, value) =>
        count + (attachment[value] ?? 0)));
};

export const tripleRemovals = (
    counts: readonly number[], rules: PdkHintRules,
    responseTarget?: { type: number; count: number },
    includeFallbackAlternatives = false,
): number[][] => {
    const result = new Map<string, number[]>();
    for (const [start, end] of runs(counts, 3, 1, false)) {
        if (start !== end) continue;
        const bodyRanks = [start];
        addUniqueRemoval(result, removalFromRanks([[start, 3]]));
        for (const removal of attachmentRemovalsForBody(
            counts, bodyRanks, rules.tripleAttachmentMode ?? 'DISABLED', rules, false,
            responseTarget, includeFallbackAlternatives,
        )) addUniqueRemoval(result, removal);
    }
    return [...result.values()];
};

export const airplaneRemovals = (
    counts: readonly number[], rules: PdkHintRules,
): number[][] => {
    const result = new Map<string, number[]>();
    for (const [start, end] of runs(counts, 3, 2, false)) {
        const bodyRanks = Array.from({ length: end - start + 1 }, (_, index) => start + index);
        // A plane is a separate structure. It never falls through the ordinary
        // triple generator, so its attachment rule cannot silently change shape.
        for (const removal of attachmentRemovalsForBody(
            counts, bodyRanks, rules.airplaneAttachmentMode ?? rules.tripleAttachmentMode ?? 'DISABLED', rules, true,
        )) addUniqueRemoval(result, removal);
        if ((rules.airplaneWithoutAttachmentTiming ?? 'ANYTIME') === 'ANYTIME'
            || rules.attachmentlessPlayPrivilege === true) {
            addUniqueRemoval(result, removalFromRanks(
                bodyRanks.map((value) => [value, 3] as [number, number]),
            ));
        }
    }
    return [...result.values()];
};

export const fourRemovals = (
    counts: readonly number[], rules: PdkHintRules,
): number[][] => {
    const result = new Map<string, number[]>();
    const mode = rules.fourAttachmentMode ?? 'DISABLED';
    const maximumRanks = new Set(rules.maximumSingleRanks ?? []);
    for (let value = MIN_RANK; value <= MAX_RANK; value += 1) {
        if ((counts[value] ?? 0) < 4) continue;
        const body = removalFromRanks([[value, 4]]);
        const withoutBody = removeCounts(counts, body);
        const bodySet = new Set([value]);
        const addSingles = (amount: number): void => {
            const attempts: Array<[boolean, boolean, boolean]> = [
                [false, false, false], [true, false, false],
                [true, true, false], [true, true, true],
            ];
            for (const [allowPairs, allowMaximum, allowTwo] of attempts) {
                const found = attachmentCombinations(withoutBody, bodySet, amount,
                    allowPairs, allowMaximum, allowTwo, maximumRanks);
                if (found.length > 0) {
                    for (const attachment of found) {
                        addUniqueRemoval(result, body.map((count, rank) =>
                            count + (attachment[rank] ?? 0)));
                    }
                    return;
                }
            }
        };
        // Keep the bare four as a bomb. Four-with-one is a scored-bomb option,
        // while the normal four family consumes two or three attachments.
        addUniqueRemoval(result, body);
        if (rules.allowFourBombWithOne) addSingles(1);
        if (mode === 'SINGLES' || mode === 'EITHER' || mode === 'EITHER_MATCH_SHAPE') addSingles(2);
        if (rules.allowFourWithThree) addSingles(3);
        if (mode === 'PAIRS' || mode === 'EITHER' || mode === 'EITHER_MATCH_SHAPE') {
            for (const attachment of pairAttachmentCombinations(
                withoutBody, bodySet, 1, false, false, maximumRanks,
            )) {
                addUniqueRemoval(result, body.map((count, rank) =>
                    count + (attachment[rank] ?? 0)));
            }
        }
    }
    return [...result.values()];
};

export const allGroupRemovals = (
    counts: readonly number[], rules: PdkHintRules, target?: { type: number; count: number },
): number[][] => {
    const result = new Map<string, number[]>();
    const add = (removal: number[]): void => {
        const cards = countCards(removal);
        const physicalCards = Array.from({ length: 16 }, (_, value) =>
            Array<number>(removal[value] ?? 0).fill(value)).flat();
        const bomb = isBombLike(physicalCards, rules);
        if (cards === 0) return;
        if (target && target.count > 0 && cards !== target.count && !bomb) return;
        if (target && !targetMatches(removal, target, rules)) return;
        if (target && rules.decompositionPlanMode === 'RESPONSE'
            && (rules.responseTargetCards?.length ?? 0) > 0
            && !responseBeatsTarget(physicalCards, rules)) return;
        // Reporting one card is an Authority legality constraint, rather than
        // a prompt-order preference. Restrict the response root before the
        // complete hand is decomposed, otherwise a lower loose single can win
        // the plan and be removed later by the controller, leaving no hint.
        const requiredSingleRank = Number(rules.requiredResponseSingleRank);
        if (target?.type === 2 && cards === 1
            && Number.isSafeInteger(requiredSingleRank)
            && physicalCards[0] !== requiredSingleRank) return;
        addUniqueRemoval(result, removal);
    };
    const lowest = counts.findIndex((count, value) => count > 0 && value >= MIN_RANK);
    const anchored = (removal: readonly number[]): boolean =>
        target ? true : lowest < 0 || removal[lowest] > 0;
    for (let value = MIN_RANK; value <= MAX_RANK; value += 1) {
        if ((counts[value] ?? 0) <= 0) continue;
        const single = Array<number>(16).fill(0); single[value] = 1;
        if (rules.allowSingle !== false && anchored(single)) add(single);
        if (rules.allowPair !== false && counts[value] >= 2) {
            const pair = Array<number>(16).fill(0); pair[value] = 2;
            if (anchored(pair)) add(pair);
        }
        if (counts[value] >= 3) {
            const triple = Array<number>(16).fill(0); triple[value] = 3;
            if (anchored(triple)) add(triple);
        }
        if (counts[value] >= 4) {
            const bomb = Array<number>(16).fill(0); bomb[value] = 4;
            if (anchored(bomb)) add(bomb);
        }
    }
    for (const [start, end] of runs(counts, 1, rules.minimumStraightLength, rules.allowTwoInRuns)) {
        const removal = removalFromRanks(Array.from({ length: end - start + 1 }, (_, index) => [start + index, 1] as [number, number]));
        if (anchored(removal)) add(removal);
    }
    for (const [start, end] of runs(counts, 2, rules.minimumPairRunLength, rules.allowTwoInRuns)) {
        const removal = removalFromRanks(Array.from({ length: end - start + 1 }, (_, index) => [start + index, 2] as [number, number]));
        if (anchored(removal)) add(removal);
    }
    for (const removal of tripleRemovals(counts, rules, target, true)) {
        if (anchored(removal)) add(removal);
    }
    for (const removal of airplaneRemovals(counts, rules)) {
        if (anchored(removal)) add(removal);
    }
    for (const removal of fourRemovals(counts, rules)) {
        if (anchored(removal)) add(removal);
    }
    if (rules.allowConsecutiveBomb === true) {
        for (const [start, end] of runs(counts, 4, 2, false)) {
            const removal = removalFromRanks(Array.from(
                { length: end - start + 1 },
                (_, index) => [start + index, 4] as [number, number],
            ));
            if (anchored(removal)) add(removal);
        }
    }
    return [...result.values()];
};

export const attachmentSummary = (
    removal: readonly number[], sourceCounts: readonly number[], rules: PdkHintRules,
    structuralPeerSingles: ReadonlySet<number> = new Set<number>(),
): { nonLoose: number; pairCards: number; pairGroups: number; rankSum: number } => {
    const descriptor = describeShape(
        Array.from({ length: 16 }, (_, value) => Array<number>(removal[value] ?? 0).fill(value)).flat(),
        rules,
    );
    if (descriptor.bodyRanks.length === 0 || removal.reduce((sum, count) => sum + count, 0)
        <= descriptor.bodyRanks.length * 3) {
        return { nonLoose: 0, pairCards: 0, pairGroups: 0, rankSum: 0 };
    }
    const body = new Set(descriptor.bodyRanks);
    let nonLoose = 0;
    let pairCards = 0;
    let pairGroups = 0;
    let rankSum = 0;
    for (let value = MIN_RANK; value <= MAX_RANK; value += 1) {
        if (body.has(value)) continue;
        const amount = removal[value] ?? 0;
        if (amount <= 0) continue;
        rankSum += value * amount;
        // A pair may contribute one card to an intact straight and leave its
        // other physical copy as the triple wing. After that structural split,
        // the wing is a final-plan loose single: charging it as a broken pair
        // would incorrectly prefer QQQ+A over QQQ+7 plus 789.
        const isStructuralPeerSingle = amount === 1
            && (sourceCounts[value] ?? 0) === 2
            && structuralPeerSingles.has(value);
        if ((sourceCounts[value] ?? 0) !== 1 && !isStructuralPeerSingle) nonLoose += amount;
        if ((sourceCounts[value] ?? 0) === 2 && !isStructuralPeerSingle) {
            pairCards += amount;
            // Count each original pair opened for an attachment. A one-card
            // wing still opens that pair and must rank ahead of opening a
            // second pair only when the earlier priorities tie.
            if (amount > 0) pairGroups += 1;
        }
    }
    return { nonLoose, pairCards, pairGroups, rankSum };
};

export const summarizePlan = (
    removals: readonly number[][], sourceCounts: readonly number[], rules: PdkHintRules,
): DecompositionPlan => {
    const groups: DecompositionGroup[] = [];
    let singleGroups = 0;
    let ordinarySingles = 0;
    let nonLooseAttachments = 0;
    let pairAttachmentCards = 0;
    let pairSplitGroups = 0;
    let airplaneGroups = 0;
    let pairRunGroups = 0;
    let straightGroups = 0;
    let tripleGroups = 0;
    let pairGroups = 0;
    let attachmentRankSum = 0;
    const structuralPeerSingles = new Set<number>();
    for (const removal of removals) {
        const cards = Array.from({ length: 16 }, (_, value) =>
            Array<number>(removal[value] ?? 0).fill(value)).flat();
        const descriptor = describeShape(cards, rules);
        if (descriptor.kind !== 'STRAIGHT') continue;
        for (const rank of descriptor.bodyRanks.length > 0
            ? descriptor.bodyRanks : Array.from({ length: descriptor.end - descriptor.start + 1 },
                (_value, index) => descriptor.start + index)) {
            if ((sourceCounts[rank] ?? 0) === 2 && (removal[rank] ?? 0) === 1) {
                structuralPeerSingles.add(rank);
            }
        }
    }
    for (const removal of removals) {
        const cards = Array.from({ length: 16 }, (_, value) =>
            Array<number>(removal[value] ?? 0).fill(value)).flat();
        const descriptor = describeShape(cards, rules);
        const summary = attachmentSummary(removal, sourceCounts, rules, structuralPeerSingles);
        groups.push({
            cards, kind: descriptor.kind, bodyRanks: descriptor.bodyRanks,
            attachments: descriptor.attachments, key: `${descriptor.kind}:${removalKey(removal)}`,
        });
        if (descriptor.kind === 'SINGLE') {
            singleGroups += 1;
            if (descriptor.start !== 15) ordinarySingles += 1;
        }
        if (descriptor.kind === 'PAIR') pairGroups += 1;
        if (descriptor.kind === 'AIRPLANE') airplaneGroups += 1;
        if (descriptor.kind === 'PAIR_RUN') pairRunGroups += 1;
        if (descriptor.kind === 'STRAIGHT') straightGroups += 1;
        if (descriptor.kind === 'TRIPLE' || descriptor.kind === 'TRIPLE_FAMILY'
            || descriptor.kind === 'FOUR_FAMILY') tripleGroups += 1;
        nonLooseAttachments += summary.nonLoose;
        pairAttachmentCards += summary.pairCards;
        pairSplitGroups += summary.pairGroups;
        attachmentRankSum += summary.rankSum;
    }
    const key = groups.map((group) => group.key).sort().join('|');
    return {
        groups, turns: groups.length, singleGroups, ordinarySingles,
        nonLooseAttachments, pairAttachmentCards, pairSplitGroups,
        airplaneGroups, pairRunGroups, straightGroups, tripleGroups, pairGroups,
        attachmentRankSum, key,
    };
};

export const materializeGroups = (
    plan: DecompositionPlan, hand: readonly number[], protectedBombs: readonly number[][],
): DecompositionPlan => {
    const byRank = new Map<number, number[]>();
    for (const raw of hand) {
        const card = Number(raw);
        const group = byRank.get(cardRank(card)) ?? [];
        group.push(card);
        byRank.set(cardRank(card), group.sort(compareCard));
    }
    for (const bomb of protectedBombs) {
        for (const card of bomb) {
            const group = byRank.get(cardRank(card));
            const index = group?.indexOf(card) ?? -1;
            if (group && index >= 0) group.splice(index, 1);
        }
    }
    const groups = plan.groups.map((group) => {
        // A plan stores rank multiplicities. Materialize each physical card
        // exactly once from those multiplicities. Do not consume body and
        // attachment ranks first and then fall back to the full group count:
        // that double-consumed duplicate ranks and produced overlapping groups.
        const needed = countsOf(group.cards);
        const cards: number[] = [];
        for (let value = MIN_RANK; value <= MAX_RANK; value += 1) {
            const source = byRank.get(value) ?? [];
            if (source.length < needed[value]) {
                return { ...group, cards: [] };
            }
            for (let index = 0; index < needed[value]; index += 1) {
                cards.push(source.shift() as number);
            }
        }
        return { ...group, cards: cards.sort(compareCard) };
    });
    if (groups.some((group, index) => group.cards.length !== plan.groups[index].cards.length)) {
        // A rank plan that cannot be mapped back to the physical hand is not
        // a usable decomposition. Fail closed so hinting never exposes a
        // partial or overlapping plan.
        return emptyPlan();
    }
    return { ...plan, groups, turns: groups.length + protectedBombs.length };
};

export function decomposePdkHand(
    hand: readonly number[], rules: PdkHintRules, target?: { type: number; count: number },
): DecompositionPlan {
    const scoringBombs = protectedScoringBombs(hand, rules);
    let working = [...hand];
    for (const bomb of scoringBombs) working = subtract(working, bomb) ?? working;
    const initialCounts = countsOf(working);
    const memo = new Map<string, DecompositionPlan | null>();
    const visit = (counts: readonly number[], root: boolean): DecompositionPlan | null => {
        const key = `${root ? 'root' : 'tail'}:${countsKey(counts)}:${target ? `${target.type}:${target.count}` : ''}`;
        if (memo.has(key)) return memo.get(key) ?? null;
        if (countCards(counts) === 0) {
            const done = emptyPlan();
            memo.set(key, done);
            return done;
        }
        const removals = allGroupRemovals(counts, rules, root && rules.decompositionPlanMode === 'RESPONSE' ? target : undefined);
        let best: DecompositionPlan | null = null;
        for (const removal of removals) {
            const next = removeCounts(counts, removal);
            if (next.some((count) => count < 0)) continue;
            const tail = visit(next, false);
            if (!tail) continue;
            const current = summarizePlan([removal], initialCounts, rules);
            const merged = summarizePlan(
                [...current.groups.map((group) => countsOf(group.cards)),
                    ...tail.groups.map((group) => countsOf(group.cards))],
                initialCounts, rules,
            );
            // summarizePlan above reconstructs all priority metrics from the
            // complete group list, so sorting never evaluates a partial plan.
            if (!best || planCompareForMode(merged, best, rules) < 0) best = merged;
        }
        memo.set(key, best);
        return best;
    };
    const plan = visit(initialCounts, true);
    const withBombs = scoringBombs.map((cards) => ({
        cards: [...cards], kind: 'BOMB' as PdkKind, bodyRanks: [cardRank(cards[0])],
        attachments: [], key: `BOMB:${cardsKey(cards)}`,
    }));
    if (!plan) {
        return {
            ...emptyPlan(), groups: withBombs, turns: withBombs.length,
            key: withBombs.map((group) => group.key).sort().join('|'),
        };
    }
    const materialized = materializeGroups(plan, working, []);
    const allGroups = [...withBombs, ...materialized.groups];
    return {
        ...materialized,
        groups: allGroups,
        turns: allGroups.length,
        key: allGroups.map((group) => group.key).sort().join('|'),
    };
}
