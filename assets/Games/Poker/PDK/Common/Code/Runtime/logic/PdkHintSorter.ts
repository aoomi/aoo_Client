import * as recognition from './PdkCardRecognition';
import * as decomposer from './PdkHandDecomposer';
import * as candidates from './PdkHintCandidateGenerator';
import type { PdkHintRules, PdkKind, ShapeDescriptor, Inventory, PdkHintRulePlan } from './PdkCardRecognition';
import type { DecompositionPlan } from './PdkHandDecomposer';
import type { PdkHintCandidate } from './PdkHintCandidateGenerator';

const { MIN_RANK, MAX_RANK, cardRank, compareCard, compareNumberLists, countsOf, cardsKey, subtract, describeShape, buildInventory, isAbsoluteShape, isBombLike, responseBeatsTarget, targetMatches, normalizeHintRules, pdkOperationTypeForCards } = recognition;
const { protectedScoringBombs } = decomposer;
const { groupMatchesCandidate, isCompletePlanMember } = candidates;

export const dragSplitPairCount = (hand: readonly number[], cards: readonly number[]): number => {
    const handCounts = countsOf(hand);
    const selectedCounts = countsOf(cards);
    let splits = 0;
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank += 1) {
        if (handCounts[rank] === 2 && selectedCounts[rank] === 1) splits += 1;
    }
    return splits;
};

export const dragAttachmentRanks = (cards: readonly number[], rules: PdkHintRules): number[] =>
    describeShape(cards, rules).attachments.map(cardRank).sort((left, right) => left - right);

export const dragNonLooseAttachmentCount = (
    hand: readonly number[], cards: readonly number[], rules: PdkHintRules,
): number => {
    const handCounts = countsOf(hand);
    return describeShape(cards, rules).attachments
        .filter((card) => (handCounts[cardRank(card)] ?? 0) > 1).length;
};

export const compareDragCandidates = (
    hand: readonly number[], left: PdkHintCandidate, right: PdkHintCandidate,
    rules: PdkHintRules,
): number => {
    // The swipe itself establishes the primary rule: play the largest complete
    // legal shape inside the covered interval.
    if (left.cards.length !== right.cards.length) return right.cards.length - left.cards.length;

    // On equal size, never turn one card of a pair into a wing if a candidate
    // can keep that pair intact. A whole pair used by a legal pair-wing remains
    // an intact pair and therefore does not count as a split.
    const leftSplits = dragSplitPairCount(hand, left.cards);
    const rightSplits = dragSplitPairCount(hand, right.cards);
    if (leftSplits !== rightSplits) return leftSplits - rightSplits;

    // A complete pair wing is preferable to splitting one card from a pair,
    // but standalone singles are preferred to consuming a pair at all.
    const leftNonLooseAttachments = dragNonLooseAttachmentCount(hand, left.cards, rules);
    const rightNonLooseAttachments = dragNonLooseAttachmentCount(hand, right.cards, rules);
    if (leftNonLooseAttachments !== rightNonLooseAttachments) {
        return leftNonLooseAttachments - rightNonLooseAttachments;
    }

    // Triple/airplane wings use the lowest available loose singles after pair
    // preservation. For non-wing shapes this is an empty, equal list.
    const attachmentOrder = compareNumberLists(
        dragAttachmentRanks(left.cards, rules), dragAttachmentRanks(right.cards, rules),
    );
    if (attachmentOrder !== 0) return attachmentOrder;

    const leftShape = describeShape(left.cards, rules);
    const rightShape = describeShape(right.cards, rules);
    if (leftShape.start !== rightShape.start) return leftShape.start - rightShape.start;
    const physicalOrder = compareNumberLists(
        [...left.cards].sort(compareCard), [...right.cards].sort(compareCard),
    );
    return physicalOrder || left.order - right.order;
};

export function rankPdkDragCandidates(
    hand: readonly number[], candidates: readonly PdkHintCandidate[], plan: PdkHintRulePlan | PdkHintRules,
): number[][] {
    const rules = normalizeHintRules(plan);
    const target = rules.decompositionPlanMode === 'RESPONSE'
        && Number(rules.responseTargetType) > 0
        ? { type: Number(rules.responseTargetType), count: Number(rules.responseTargetCount) }
        : undefined;
    const scoringBombs = protectedScoringBombs(hand, rules);
    const visible = candidates.map((candidate, order) => ({
        cards: [...candidate.cards].map(Number).sort(compareCard),
        order: Number.isFinite(candidate.order) ? candidate.order : order,
    })).filter((candidate) => candidate.cards.length > 0)
        .filter((candidate) => subtract(hand, candidate.cards) !== null)
        .filter((candidate) => pdkOperationTypeForCards(candidate.cards, rules) > 0)
        .filter((candidate) => !target || targetMatches(countsOf(candidate.cards), target, rules))
        .filter((candidate) => rules.decompositionPlanMode !== 'RESPONSE'
            || responseBeatsTarget(candidate.cards, rules))
        .filter((candidate) => rules.decompositionPlanMode !== 'SELF'
            || !rules.isFirstPlayOfRound || !Number.isSafeInteger(rules.requiredFirstCard)
            || candidate.cards.includes(Number(rules.requiredFirstCard)))
        .filter((candidate) => rules.allowSingle !== false || candidate.cards.length !== 1)
        .filter((candidate) => rules.allowPair !== false
            || !(candidate.cards.length === 2 && countsOf(candidate.cards).some((count) => count === 2)))
        .filter((candidate) => !scoringBombs.some((bomb) => {
            const overlap = bomb.filter((card) => candidate.cards.includes(card)).length;
            return overlap > 0 && overlap < bomb.length;
        }));
    const unique = new Map<string, PdkHintCandidate>();
    for (const candidate of visible) {
        const key = cardsKey(candidate.cards);
        if (!unique.has(key)) unique.set(key, candidate);
    }
    const legal = [...unique.values()];
    const ordinary = rules.decompositionPlanMode === 'RESPONSE'
        ? legal.filter((candidate) => !isBombLike(candidate.cards, rules)) : legal;
    const scoped = rules.decompositionPlanMode === 'RESPONSE' && ordinary.length > 0
        ? ordinary : legal;
    return scoped.sort((left, right) => compareDragCandidates(hand, left, right, rules))
        .map((candidate) => candidate.cards);
}

export const candidatePoint = (cards: readonly number[], rules: PdkHintRules): number =>
    describeShape(cards, rules).start || Math.min(...cards.map(cardRank));

export const finalThreeOrder = (
    plan: DecompositionPlan, inventory: Inventory, rules: PdkHintRules,
): Map<string, number> | null => {
    if (plan.groups.length !== 3 || !plan.groups.every((group) =>
        group.kind === 'SINGLE' || group.kind === 'PAIR' || group.kind === 'BOMB')) return null;
    const bombs = plan.groups.filter((group) => group.kind === 'BOMB');
    if (bombs.length > 0) {
        const nonBombs = plan.groups.filter((group) => group.kind !== 'BOMB')
            .sort((left, right) => candidatePoint(right.cards, rules) - candidatePoint(left.cards, rules));
        if (nonBombs.length !== 2) return null;
        return new Map([
            [cardsKey(nonBombs[0].cards), 0],
            [cardsKey(bombs[0].cards), 1],
            [cardsKey(nonBombs[1].cards), 2],
        ]);
    }
    const simpleKinds = plan.groups.map((group) => group.kind);
    if (!simpleKinds.every((kind) => kind === simpleKinds[0])) return null;
    const maxima = plan.groups.filter((group) => isAbsoluteShape(
        describeShape(group.cards, rules), inventory, rules,
    ));
    if (maxima.length !== 1) return null;
    const maximum = maxima[0];
    const others = plan.groups.filter((group) => group !== maximum)
        .sort((left, right) => candidatePoint(right.cards, rules) - candidatePoint(left.cards, rules));
    return new Map([
        [cardsKey(others[0].cards), 0],
        [cardsKey(maximum.cards), 1],
        [cardsKey(others[1].cards), 2],
    ]);
};

export const finalTwoOrder = (
    plan: DecompositionPlan, inventory: Inventory, rules: PdkHintRules,
): Map<string, number> | null => {
    if (plan.groups.length !== 2) return null;
    const entries = plan.groups.map((group) => ({
        group,
        absolute: isAbsoluteShape(describeShape(group.cards, rules), inventory, rules),
    }));
    const maxima = entries.filter((entry) => entry.absolute);
    if (maxima.length === 0) return null;
    const ordered = maxima.length === 1
        ? [...entries].sort((left, right) => Number(right.absolute) - Number(left.absolute))
        : [...entries].sort((left, right) => right.group.cards.length - left.group.cards.length
            || candidatePoint(left.group.cards, rules) - candidatePoint(right.group.cards, rules));
    return new Map(ordered.map((entry, index) => [cardsKey(entry.group.cards), index]));
};

/**
 * In a mixed three-turn lead, a single confirmed absolute group is held as
 * the recovery card.  The first hint is the highest ordinary loose single,
 * leaving the absolute card to regain the lead later and preserving pairs.
 * Homogeneous three-single/three-pair endings keep their own documented
 * second-largest -> maximum -> smallest order.
 */
export const shortRecoveryLeadOrder = (
    plan: DecompositionPlan, inventory: Inventory, rules: PdkHintRules,
): Map<string, number> | null => {
    if (plan.groups.length !== 3) return null;
    const kinds = new Set(plan.groups.map((group) => group.kind));
    if (kinds.size === 1) return null;
    const maxima = plan.groups.filter((group) => isAbsoluteShape(
        describeShape(group.cards, rules), inventory, rules,
    ));
    if (maxima.length !== 1) return null;
    const recoverySingles = plan.groups.filter((group) => group !== maxima[0]
        && group.kind === 'SINGLE')
        .sort((left, right) => candidatePoint(right.cards, rules) - candidatePoint(left.cards, rules));
    if (recoverySingles.length === 0) return null;
    return new Map([[cardsKey(recoverySingles[0].cards), 0]]);
};

export const attachmentOrder = (
    left: ShapeDescriptor, right: ShapeDescriptor,
): number => compareNumberLists(
    left.attachments.map(cardRank).sort((a, b) => a - b),
    right.attachments.map(cardRank).sort((a, b) => a - b),
);

export function rankCleanPdkHints(
    hand: readonly number[], candidates: readonly PdkHintCandidate[], plan: PdkHintRulePlan | PdkHintRules,
): number[][] {
    const rules = normalizeHintRules(plan);
    const scoringBombs = protectedScoringBombs(hand, rules);
    const target = rules.decompositionPlanMode === 'RESPONSE'
        && Number(rules.responseTargetType) > 0
        ? { type: Number(rules.responseTargetType), count: Number(rules.responseTargetCount) }
        : undefined;
    const candidateEntries = candidates.map((candidate, order) => ({
        candidate: { ...candidate, cards: [...candidate.cards] }, order,
    })).filter(({ candidate }) => subtract(hand, candidate.cards) !== null)
        .filter(({ candidate }) => !target || targetMatches(countsOf(candidate.cards), target, rules))
        .filter(({ candidate }) => rules.decompositionPlanMode !== 'RESPONSE'
            || responseBeatsTarget(candidate.cards, rules))
        .filter(({ candidate }) => rules.decompositionPlanMode !== 'SELF'
            || !rules.isFirstPlayOfRound || !Number.isSafeInteger(rules.requiredFirstCard)
            || candidate.cards.includes(Number(rules.requiredFirstCard)))
        .filter(({ candidate }) => rules.allowSingle !== false || candidate.cards.length !== 1)
        .filter(({ candidate }) => rules.allowPair !== false
            || !(candidate.cards.length === 2 && countsOf(candidate.cards).some((count) => count === 2)));
    const visible = candidateEntries.filter(({ candidate }) => {
        if (!rules.preserveScoringBombs || scoringBombs.length === 0) return true;
        const impact = scoringBombs.some((bomb) => {
            const overlap = bomb.filter((card) => candidate.cards.includes(card)).length;
            return overlap > 0 && overlap < bomb.length;
        });
        return !impact;
    });
    const unique: Array<{ candidate: PdkHintCandidate; order: number }> = [];
    const seen = new Set<string>();
    for (const entry of visible) {
        const key = cardsKey(entry.candidate.cards);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(entry);
    }
    const responseOrdinary = rules.decompositionPlanMode === 'RESPONSE'
        ? unique.filter(({ candidate }) => !isBombLike(candidate.cards, rules))
        : unique;
    // A bomb is a fallback response. Keep it out while any same-shape legal
    // response exists; only an all-bomb response set may reach sorting.
    const responseScoped = rules.decompositionPlanMode === 'RESPONSE'
        && responseOrdinary.length > 0 ? responseOrdinary : unique;
    const selfDecomposition = rules.decompositionPlanMode === 'SELF'
        ? rules.fixedDecomposition
            ?? unique.find(({ candidate }) => candidate.fixedDecomposition)?.candidate.fixedDecomposition
            ?? null
        : null;
    if (rules.decompositionPlanMode === 'SELF' && selfDecomposition === null) return [];
    if (rules.decompositionPlanMode === 'RESPONSE'
        && responseScoped.some(({ candidate }) => candidate.fixedDecomposition === undefined)) return [];
    const planned = rules.decompositionPlanMode === 'RESPONSE'
        ? responseScoped
        : unique.filter(({ candidate }) =>
            selfDecomposition !== null
                && isCompletePlanMember(hand, candidate.cards, selfDecomposition, rules));
    // A fixed decomposition is authoritative. If the legal source omitted
    // every member of that plan, fail closed instead of letting sorting invent
    // a second hand plan from local remainders.
    const scoped = planned;
    if (scoped.length === 0) return [];
    const inventory = buildInventory(hand, rules.deckCards ?? [], rules.playedRankCounts ?? []);
    const finalOrder = rules.decompositionPlanMode === 'SELF' && selfDecomposition
        ? finalThreeOrder(selfDecomposition, inventory, rules) : null;
    const finalTwo = rules.decompositionPlanMode === 'SELF' && selfDecomposition
        ? finalTwoOrder(selfDecomposition, inventory, rules) : null;
    const shortRecovery = rules.decompositionPlanMode === 'SELF' && selfDecomposition
        ? shortRecoveryLeadOrder(selfDecomposition, inventory, rules) : null;
    const finalIndex = (order: Map<string, number> | null, cards: readonly number[]): number | undefined => {
        if (!order || !selfDecomposition) return undefined;
        const direct = order.get(cardsKey(cards));
        if (direct !== undefined) return direct;
        const owner = selfDecomposition.groups.find((group) => groupMatchesCandidate(group, cards, rules));
        return owner ? order.get(cardsKey(owner.cards)) : undefined;
    };
    const candidateInfo = scoped.map(({ candidate, order }) => {
        const descriptor = describeShape(candidate.cards, rules);
        const remainingCovered = candidate.remainingCovered === true;
        const planGroup = selfDecomposition?.groups.find((group) =>
            groupMatchesCandidate(group, candidate.cards, rules));
        // An exact fixed-plan group is the only proof that playing it leaves
        // a complete legal remainder. In a response, promote it ahead of
        // smaller answers only when that remainder is one complete final hand:
        // `QKA` answering `789` leaves intact `78910J`. A root that still
        // leaves several turns follows ordinary smallest-point response order.
        const completesInOneRemainingHand = remainingCovered
            && Number(candidate.remainingTurns) === 1;
        const guaranteedFinish = rules.decompositionPlanMode === 'SELF'
            ? remainingCovered : completesInOneRemainingHand;
        const projectedTurns = Number.isSafeInteger(candidate.remainingTurns)
            ? Number(candidate.remainingTurns) + 1
            : (candidate.fixedDecomposition?.groups
                .filter((group) => cardsKey(group.cards) !== cardsKey(candidate.cards)).length ?? 0) + 1;
        const scoringBomb = scoringBombs.some((bomb) => cardsKey(bomb) === cardsKey(candidate.cards));
        return {
            candidate, order, descriptor, guaranteedFinish,
            projectedTurns, scoringBomb,
            planGroupKey: planGroup ? cardsKey(planGroup.cards) : cardsKey(candidate.cards),
            finalOrder: finalIndex(finalOrder, candidate.cards),
            finalTwo: finalIndex(finalTwo, candidate.cards),
            shortRecovery: finalIndex(shortRecovery, candidate.cards),
            responseRecovery: rules.decompositionPlanMode === 'RESPONSE'
                && candidate.remainingCovered === true
                && descriptor.kind === 'SINGLE'
                && isAbsoluteShape(descriptor, inventory, rules),
        };
    });
    const hasGuaranteed = candidateInfo.some((entry) => entry.guaranteedFinish);
    type CandidateInfo = typeof candidateInfo[number];
    const compareFamilies = (left: CandidateInfo, right: CandidateInfo): number => {
        if (left.finalOrder !== undefined && right.finalOrder !== undefined
            && left.finalOrder !== right.finalOrder) return left.finalOrder - right.finalOrder;
        if (left.finalTwo !== undefined && right.finalTwo !== undefined
            && left.finalTwo !== right.finalTwo) return left.finalTwo - right.finalTwo;
        if (left.shortRecovery !== undefined || right.shortRecovery !== undefined) {
            const leftOrder = left.shortRecovery ?? 1;
            const rightOrder = right.shortRecovery ?? 1;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        }
        if (left.scoringBomb !== right.scoringBomb) return left.scoringBomb ? 1 : -1;
        // A confirmed absolute single is held as the response recovery card.
        // It is selected before a smaller legal answer only when the
        // authoritative deck/ledger proves that it is absolute.
        if (left.responseRecovery !== right.responseRecovery) {
            return left.responseRecovery ? -1 : 1;
        }
        // A response that leaves exactly one complete final hand precedes
        // legal slices of another fixed group. Other response roots retain
        // the ordinary smallest-point order.
        if (left.guaranteedFinish !== right.guaranteedFinish) {
            return left.guaranteedFinish ? -1 : 1;
        }
        if (hasGuaranteed && left.candidate.cards.length !== right.candidate.cards.length) {
            return right.candidate.cards.length - left.candidate.cards.length;
        }
        // Absolute-card ordering is limited to the explicit two-hand and
        // three-hand endgame orders above. For a normal multi-single lead,
        // the point order below must keep the smallest single first.
        if (hasGuaranteed && rules.decompositionPlanMode === 'SELF'
            && left.projectedTurns !== right.projectedTurns) {
            return left.projectedTurns - right.projectedTurns;
        }
        if (!hasGuaranteed) {
            if (left.candidate.cards.length !== right.candidate.cards.length) {
                return right.candidate.cards.length - left.candidate.cards.length;
            }
        }
        if (left.descriptor.kind === right.descriptor.kind
            && (left.descriptor.kind === 'TRIPLE_FAMILY'
                || left.descriptor.kind === 'FOUR_FAMILY' || left.descriptor.kind === 'AIRPLANE')
            && left.descriptor.start === right.descriptor.start
            && left.descriptor.end === right.descriptor.end) {
            const attachments = attachmentOrder(left.descriptor, right.descriptor);
            if (attachments !== 0) return attachments;
        }
        if (left.descriptor.start !== right.descriptor.start) {
            return left.descriptor.start - right.descriptor.start;
        }
        const structureRank = (kind: PdkKind): number =>
            kind === 'AIRPLANE' ? 0 : kind === 'PAIR_RUN' ? 1 : kind === 'STRAIGHT' ? 2
                : kind === 'TRIPLE_FAMILY' ? 3 : kind === 'FOUR_FAMILY' ? 4
                    : kind === 'PAIR' ? 5 : kind === 'SINGLE' ? 6 : 7;
        if (structureRank(left.descriptor.kind) !== structureRank(right.descriptor.kind)) {
            return structureRank(left.descriptor.kind) - structureRank(right.descriptor.kind);
        }
        return left.order - right.order;
    };
    const compareFamilyMembers = (left: CandidateInfo, right: CandidateInfo): number => {
        // The exact group selected by decomposition is always the first member
        // of its family. Attachment alternatives are visible on later Hint
        // clicks, but cannot borrow its completion proof or reorder other
        // fixed groups.
        if (left.guaranteedFinish !== right.guaranteedFinish) {
            return left.guaranteedFinish ? -1 : 1;
        }
        // Within one fixed triple/airplane body, keep complete attachment
        // variants ahead of an attachmentless or partially attached form. The
        // latter remains a legal later click, but cannot interrupt the
        // configured 55579 -> 55588 cycle with a bare 5557.
        if (left.candidate.cards.length !== right.candidate.cards.length) {
            return right.candidate.cards.length - left.candidate.cards.length;
        }
        if (left.descriptor.kind === right.descriptor.kind
            && (left.descriptor.kind === 'TRIPLE_FAMILY'
                || left.descriptor.kind === 'FOUR_FAMILY' || left.descriptor.kind === 'AIRPLANE')
            && left.descriptor.start === right.descriptor.start
            && left.descriptor.end === right.descriptor.end) {
            const attachments = attachmentOrder(left.descriptor, right.descriptor);
            if (attachments !== 0) return attachments;
        }
        if (left.descriptor.start !== right.descriptor.start) {
            return left.descriptor.start - right.descriptor.start;
        }
        return left.order - right.order;
    };
    if (rules.decompositionPlanMode !== 'SELF') {
        return candidateInfo.sort(compareFamilies).map((entry) => [...entry.candidate.cards]);
    }
    const byFixedGroup = new Map<string, CandidateInfo[]>();
    for (const entry of candidateInfo) {
        const members = byFixedGroup.get(entry.planGroupKey) ?? [];
        members.push(entry);
        byFixedGroup.set(entry.planGroupKey, members);
    }
    const families = [...byFixedGroup.values()].map((members) => {
        const ordered = [...members].sort(compareFamilyMembers);
        return { primary: ordered[0], ordered };
    }).sort((left, right) => compareFamilies(left.primary, right.primary));
    return families.flatMap((family) => family.ordered.map((entry) => [...entry.candidate.cards]));
}
