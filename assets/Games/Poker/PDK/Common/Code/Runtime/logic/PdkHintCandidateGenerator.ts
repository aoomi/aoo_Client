import * as recognition from './PdkCardRecognition';
import * as decomposer from './PdkHandDecomposer';
import type { PdkHintRules, PdkKind, PdkHintRulePlan } from './PdkCardRecognition';
import type { DecompositionPlan, DecompositionGroup } from './PdkHandDecomposer';

const { MIN_RANK, MAX_RANK, cardRank, compareCard, countsOf, cardsKey, subtract, describeShape, isBombLike, responseBeatsTarget, targetMatches, normalizeHintRules, buildInventory, isAbsoluteShape } = recognition;
const { decomposePdkHand, protectedScoringBombs, allGroupRemovals, summarizePlan, materializeGroups, planCompare, fourRemovals, airplaneRemovals, tripleRemovals } = decomposer;

export interface PdkHintCandidate {
    cards: number[];
    order: number;
    remainingTurns?: number;
    remainingCovered?: boolean;
    fixedDecomposition?: DecompositionPlan;
}

export const decorateCandidateFromFixedPlan = (
    hand: readonly number[], cards: readonly number[], order: number,
    fixedDecomposition: DecompositionPlan, rules: PdkHintRules,
): PdkHintCandidate => {
    // PDK ranks determine a group; suits are relevant only for a compulsory
    // opening card. When that physical card replaces another copy of the same
    // rank, it leaves the identical rank-plan remainder and must retain the
    // completion proof.
    const exactGroup = fixedDecomposition.groups.some((group) => {
        const groupCounts = countsOf(group.cards);
        const candidateCounts = countsOf(cards);
        return groupCounts.every((count, rank) => count === candidateCounts[rank]);
    });
    return {
        cards: [...cards],
        order,
        fixedDecomposition,
        // A same-body attachment variant is a legal candidate, but it does not
        // inherit the selected plan's completion proof. Only an exact fixed
        // group leaves the recorded remainder unchanged.
        remainingTurns: exactGroup ? Math.max(0, fixedDecomposition.turns - 1) : undefined,
        remainingCovered: exactGroup,
    };
};

export const groupMatchesCandidate = (
    group: DecompositionGroup, cards: readonly number[], rules: PdkHintRules,
): boolean => {
    const candidateDescriptor = describeShape(cards, rules);
    const groupDescriptor = describeShape(group.cards, rules);
    if (candidateDescriptor.kind !== groupDescriptor.kind) return false;
    if (candidateDescriptor.start !== groupDescriptor.start
        || candidateDescriptor.end !== groupDescriptor.end) return false;
    if (candidateDescriptor.kind === 'TRIPLE_FAMILY'
        || candidateDescriptor.kind === 'FOUR_FAMILY' || candidateDescriptor.kind === 'AIRPLANE') {
        // Self lead may cycle legal attachments of the fixed body, but may not
        // consume a 2 or confirmed maximum that the selected plan preserved.
        if (candidateDescriptor.attachments.some((card) => cardRank(card) === 15)
            && !groupDescriptor.attachments.some((card) => cardRank(card) === 15)) return false;
        const maximumRanks = new Set(rules.maximumSingleRanks ?? []);
        if (candidateDescriptor.attachments.some((card) => maximumRanks.has(cardRank(card)))
            && !groupDescriptor.attachments.some((card) => maximumRanks.has(cardRank(card)))) return false;
        return candidateDescriptor.bodyRanks.join(',') === groupDescriptor.bodyRanks.join(',');
    }
    return candidateDescriptor.cards === groupDescriptor.cards;
};

export const isCompletePlanMember = (
    hand: readonly number[], cards: readonly number[], plan: DecompositionPlan, rules: PdkHintRules,
): boolean => plan.groups.some((group) => groupMatchesCandidate(group, cards, rules)
    && subtract(hand, cards) !== null);

export const physicalCardsFromCounts = (
    counts: readonly number[], hand: readonly number[],
): number[] | null => {
    const byRank = new Map<number, number[]>();
    for (const card of [...hand].sort(compareCard)) {
        const rank = cardRank(card);
        const group = byRank.get(rank) ?? [];
        group.push(card);
        byRank.set(rank, group);
    }
    const result: number[] = [];
    for (let value = MIN_RANK; value <= MAX_RANK; value += 1) {
        const need = counts[value] ?? 0;
        const available = byRank.get(value) ?? [];
        if (available.length < need) return null;
        result.push(...available.slice(0, need));
    }
    return result.sort(compareCard);
};

export const planVariantPool = (
    hand: readonly number[], plan: DecompositionPlan, owner: DecompositionGroup,
): number[] => {
    const structural = new Set<PdkKind>([
        'TRIPLE', 'TRIPLE_FAMILY', 'AIRPLANE', 'FOUR_FAMILY', 'BOMB',
    ]);
    const cards: number[] = [];
    for (const group of plan.groups) {
        if (group === owner || !structural.has(group.kind)) cards.push(...group.cards);
    }
    // The plan is authoritative; the physical hand is used only to ensure the
    // materialized group cards are real and unique. No unplanned rank is added.
    return cards.filter((card, index) => cards.indexOf(card) === index
        && hand.includes(card));
};

export const fixedGroupCandidateCards = (
    hand: readonly number[], plan: DecompositionPlan, group: DecompositionGroup,
    rules: PdkHintRules,
): number[][] => {
    const result = new Map<string, number[]>();
    const add = (cards: readonly number[]): void => {
        const physical = [...cards].map(Number).sort(compareCard);
        if (physical.length === 0 || subtract(hand, physical) === null) return;
        result.set(cardsKey(physical), physical);
        // The compulsory opening-card rule is physical-card based. A rank
        // plan may have materialized another copy of the same rank into this
        // group, so also materialize the equivalent group with the mandatory
        // physical card. The rank multiset and legal remainder stay identical.
        const requiredFirstCard = Number(rules.requiredFirstCard);
        if (rules.decompositionPlanMode !== 'SELF' || !rules.isFirstPlayOfRound
            || !Number.isSafeInteger(requiredFirstCard) || physical.includes(requiredFirstCard)) return;
        const replacementIndex = physical.findIndex((card) =>
            cardRank(card) === cardRank(requiredFirstCard));
        if (replacementIndex < 0) return;
        const withRequired = [...physical];
        withRequired[replacementIndex] = requiredFirstCard;
        withRequired.sort(compareCard);
        if (subtract(hand, withRequired) !== null) {
            result.set(cardsKey(withRequired), withRequired);
        }
    };
    add(group.cards);

    const compound = group.kind === 'TRIPLE_FAMILY' || group.kind === 'AIRPLANE'
        || group.kind === 'FOUR_FAMILY';
    if (!compound) return [...result.values()];
    const pool = planVariantPool(hand, plan, group);
    const poolCounts = countsOf(pool);
    const bodyRanks = group.bodyRanks;
    const removals = group.kind === 'FOUR_FAMILY'
        ? fourRemovals(poolCounts, rules)
        : group.kind === 'AIRPLANE'
            ? airplaneRemovals(poolCounts, rules)
            : tripleRemovals(poolCounts, rules);
    for (const removal of removals) {
        const cards = physicalCardsFromCounts(removal, hand);
        if (!cards) continue;
        const descriptor = describeShape(cards, rules);
        if (descriptor.bodyRanks.join(',') !== bodyRanks.join(',')) continue;
        if (!groupMatchesCandidate(group, cards, rules)) continue;
        add(cards);
    }
    return [...result.values()];
};

/**
 * A response is rooted in the exact play that answers the upper cards.  Each
 * legal root receives its own fixed decomposition of the remainder before
 * sorting.  Choosing one globally optimal hand plan first is unsound: it can
 * freeze a low split pair and hide an absolute single, or leave no visible
 * candidate when the only loose response is an attachment in another group.
 */
export const generatePdkResponseRootCandidates = (
    hand: readonly number[], rules: PdkHintRules,
    responseTarget: { type: number; count: number },
): PdkHintCandidate[] => {
    const sourceCounts = countsOf(hand);
    const protectedBombs = protectedScoringBombs(hand, rules);
    const isProtectedPartial = (cards: readonly number[]): boolean => protectedBombs.some((bomb) => {
        const overlap = bomb.filter((card) => cards.includes(card)).length;
        return overlap > 0 && overlap < bomb.length;
    });
    const roots = allGroupRemovals(sourceCounts, rules, responseTarget)
        .map((removal) => ({ removal, cards: physicalCardsFromCounts(removal, hand) }))
        .filter((entry): entry is { removal: number[]; cards: number[] } => entry.cards !== null)
        .filter(({ removal, cards }) => !isProtectedPartial(cards)
            && (isBombLike(cards, rules) || cards.length === responseTarget.count)
            && targetMatches(removal, responseTarget, rules)
            && responseBeatsTarget(cards, rules)
            && (responseTarget.type !== 2 || cards.length !== 1
                || !Number.isSafeInteger(Number(rules.requiredResponseSingleRank))
                || cardRank(cards[0]) === Number(rules.requiredResponseSingleRank)));

    const result: PdkHintCandidate[] = [];
    const seen = new Set<string>();
    const tailRules: PdkHintRules = {
        ...rules,
        decompositionPlanMode: 'SELF',
        responseTurn: false,
        responseTargetType: undefined,
        responseTargetCount: undefined,
        responseTargetCards: undefined,
        requiredResponseSingleRank: undefined,
        fixedDecomposition: undefined,
    };
    for (const { removal, cards } of roots) {
        const key = cardsKey(cards);
        if (seen.has(key)) continue;
        const remainder = subtract(hand, cards);
        if (remainder === null) continue;
        const tail = decomposePdkHand(remainder, tailRules);
        const tailCards = tail.groups.flatMap((group) => group.cards);
        if (tailCards.length !== remainder.length || subtract(remainder, tailCards) === null) continue;
        const rankPlan = summarizePlan([
            removal,
            ...tail.groups.map((group) => countsOf(group.cards)),
        ], sourceCounts, rules);
        const fixedDecomposition = materializeGroups(rankPlan, hand, []);
        if (fixedDecomposition.groups.some((group) => group.cards.length === 0)) continue;
        seen.add(key);
        result.push({
            cards: [...cards],
            order: result.length,
            remainingTurns: tail.turns,
            remainingCovered: true,
            fixedDecomposition,
        });
    }
    if (responseTarget.type !== 2) return result;

    // A normal single response keeps pairs and triples intact whenever an
    // originally loose response can beat the upper card. For each permitted
    // root, compare the complete remainder plan: this retains Q when it keeps
    // KKK/88 intact, instead of exposing every isolated rank from that hand.
    const loose = result.filter((candidate) => !isBombLike(candidate.cards, rules)
        && candidate.cards.length === 1
        && (sourceCounts[cardRank(candidate.cards[0])] ?? 0) === 1);
    const rootsForSingle = loose.length > 0 ? loose : result;
    const ordinary = rootsForSingle.filter((candidate) => !isBombLike(candidate.cards, rules));
    const comparable = ordinary.length > 0 ? ordinary : rootsForSingle;
    const best = comparable.reduce((chosen, candidate) =>
        planCompare(candidate.fixedDecomposition as DecompositionPlan,
            chosen.fixedDecomposition as DecompositionPlan) < 0 ? candidate : chosen,
    );
    const inventory = buildInventory(hand, rules.deckCards ?? [], rules.playedRankCounts ?? []);
    return comparable.filter((candidate) => {
        const descriptor = describeShape(candidate.cards, rules);
        const absoluteRecovery = candidate.remainingCovered === true
            && descriptor.kind === 'SINGLE'
            && isAbsoluteShape(descriptor, inventory, rules);
        return absoluteRecovery || planCompare(
            candidate.fixedDecomposition as DecompositionPlan,
            best.fixedDecomposition as DecompositionPlan,
        ) === 0;
    }).map((candidate, order) => ({ ...candidate, order }));
};

export function generatePdkFixedPlanCandidates(
    hand: readonly number[], plan: PdkHintRulePlan | PdkHintRules,
): PdkHintCandidate[] {
    const rules = normalizeHintRules(plan);
    const responseTarget = rules.decompositionPlanMode === 'RESPONSE'
        && Number(rules.responseTargetType) > 0
        && Number(rules.responseTargetCount) > 0
        ? { type: Number(rules.responseTargetType), count: Number(rules.responseTargetCount) }
        : undefined;
    if (responseTarget) return generatePdkResponseRootCandidates(hand, rules, responseTarget);

    const decomposition = rules.fixedDecomposition
        ?? decomposePdkHand(hand, {
            ...rules,
            fixedDecomposition: undefined,
        });
    const result: PdkHintCandidate[] = [];
    const seen = new Set<string>();
    let order = 0;
    const addCandidate = (cards: readonly number[]): void => {
        if (rules.decompositionPlanMode === 'SELF' && rules.isFirstPlayOfRound
            && Number.isSafeInteger(rules.requiredFirstCard)
            && !cards.includes(Number(rules.requiredFirstCard))) return;
        const key = cardsKey(cards);
        if (seen.has(key)) return;
        seen.add(key);
        result.push(decorateCandidateFromFixedPlan(hand, cards, order, decomposition, rules));
        order += 1;
    };
    for (const group of decomposition.groups) {
        for (const cards of fixedGroupCandidateCards(hand, decomposition, group, rules)) {
            addCandidate(cards);
        }
    }
    return result;
}
