import { PDK_BUSINESS_CODES } from '../../Regional/PdkBusinessCodes';
import type { DecompositionPlan } from './PdkHandDecomposer';

export type PdkHintPolicyId = 'COMMON' | typeof PDK_BUSINESS_CODES.LIANGSHAN;

export type PdkPlanMode = 'SELF' | 'RESPONSE';

export type TripleAttachmentMode = 'DISABLED' | 'SINGLES' | 'PAIRS' | 'SINGLE_OR_PAIR' | 'EITHER' | 'EITHER_MATCH_SHAPE';

export type PdkKind = 'SINGLE' | 'PAIR' | 'TRIPLE' | 'TRIPLE_FAMILY' | 'FOUR_FAMILY'
    | 'STRAIGHT' | 'PAIR_RUN' | 'AIRPLANE' | 'BOMB' | 'UNKNOWN';

export const MIN_RANK = 3;

export const MAX_RANK = 15;

export const cardRank = (raw: number): number => {
    const card = Number(raw);
    const value = card > 500 ? card - 500 : card;
    return value >= 100 ? value % 100 : value & 0x0f;
};

export const pdkCardRank = (raw: number): number => cardRank(raw);

export const cardSuit = (raw: number): number => {
    const card = Number(raw);
    const value = card > 500 ? card - 500 : card;
    return value >= 100 ? Math.floor(value / 100) : ((value & 0xf0) >> 4);
};

export const cardSuitPriority = (raw: number): number => 5 - cardSuit(raw);

export const compareCard = (left: number, right: number): number =>
    cardRank(left) - cardRank(right)
    || cardSuitPriority(left) - cardSuitPriority(right)
    || left - right;

export const compareNumberLists = (left: readonly number[], right: readonly number[]): number => {
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
        if (left[index] !== right[index]) return left[index] - right[index];
    }
    return left.length - right.length;
};

export const countsOf = (cards: readonly number[]): number[] => {
    const counts = Array<number>(16).fill(0);
    for (const raw of cards) {
        const value = cardRank(Number(raw));
        if (value >= MIN_RANK && value <= MAX_RANK) counts[value] += 1;
    }
    return counts;
};

export const countCards = (counts: readonly number[]): number =>
    counts.reduce((total, count) => total + count, 0);

export const countsKey = (counts: readonly number[]): string => counts.slice(MIN_RANK).join(',');

export const cardsKey = (cards: readonly number[]): string =>
    cards.map(cardRank).sort((left, right) => left - right).join(',');

export const removalKey = (removal: readonly number[]): string => countsKey(removal);

export const subtract = (hand: readonly number[], played: readonly number[]): number[] | null => {
    const remaining = [...hand];
    for (const card of played) {
        const index = remaining.indexOf(card);
        if (index < 0) return null;
        remaining.splice(index, 1);
    }
    return remaining;
};

export const containsCards = (hand: readonly number[], cards: readonly number[]): boolean =>
    subtract(hand, cards) !== null;

export const runs = (
    counts: readonly number[], copies: number, minimum: number, allowTwo: boolean,
): Array<[number, number]> => {
    const result: Array<[number, number]> = [];
    const maximum = allowTwo ? MAX_RANK : 14;
    for (let start = MIN_RANK; start <= maximum; start += 1) {
        if ((counts[start] ?? 0) < copies) continue;
        for (let end = start; end <= maximum && (counts[end] ?? 0) >= copies; end += 1) {
            if (end - start + 1 >= minimum) result.push([start, end]);
        }
    }
    return result;
};

export const isStraightCandidate = (cards: readonly number[], rules: PdkHintRules): boolean => {
    if (cards.length < rules.minimumStraightLength) return false;
    const counts = countsOf(cards);
    const ranks = counts.map((count, value) => count === 1 ? value : 0).filter(Boolean);
    if (ranks.length !== cards.length) return false;
    const maximum = rules.allowTwoInRuns ? MAX_RANK : 14;
    return ranks[ranks.length - 1] <= maximum
        && ranks.every((value, index) => index === 0 || value === ranks[index - 1] + 1);
};

export const pairRunBounds = (
    cards: readonly number[], rules: PdkHintRules,
): [number, number] | null => {
    const counts = countsOf(cards);
    const ranks = counts.map((count, value) => count === 2 ? value : 0).filter(Boolean);
    if (ranks.length < rules.minimumPairRunLength || ranks.length * 2 !== cards.length) return null;
    const maximum = rules.allowTwoInRuns ? MAX_RANK : 14;
    if (ranks[ranks.length - 1] > maximum) return null;
    if (ranks.some((value, index) => index > 0 && value !== ranks[index - 1] + 1)) return null;
    return [ranks[0], ranks[ranks.length - 1]];
};

export interface PdkHintRuleContext {
    leading: boolean;
    previousType: number;
    previousCardCount: number;
    previousCards?: readonly number[];
}

export interface PdkHintRuleIdentity {
    policyId: PdkHintPolicyId;
    workbookIdentity: string;
}

export interface PdkHintRules {
    minimumStraightLength: number;
    minimumPairRunLength: number;
    allowTwoInRuns: boolean;
    protectedBombs?: readonly (readonly number[])[];
    tripleAttachmentMode?: TripleAttachmentMode;
    fourAttachmentMode?: TripleAttachmentMode;
    airplaneAttachmentMode?: TripleAttachmentMode;
    compareTripleAttachments?: boolean;
    allowFourWithThree?: boolean;
    allowFourBombWithOne?: boolean;
    responseTargetType?: number;
    responseTargetCount?: number;
    responseTargetCards?: readonly number[];
    /**
     * Authoritative reported-single constraint for this exact response turn.
     * When present, a single response must use this rank before the fixed
     * response decomposition is selected.
     */
    requiredResponseSingleRank?: number;
    preserveScoringBombs?: boolean;
    specialTripleBombRanks?: readonly number[];
    standardBombTier?: number;
    specialBombTier?: number;
    fourBombWithOneTier?: number;
    allowSpecialTripleBombWithOne?: boolean;
    allowConsecutiveBomb?: boolean;
    allowAirplaneWithTwo?: boolean;
    allowTerminalAttachmentShortage?: boolean;
    tripleWithoutAttachmentTiming?: unknown;
    airplaneWithoutAttachmentTiming?: unknown;
    handCardCount?: number;
    attachmentlessPlayPrivilege?: boolean;
    /** True while classifying a response to the current trick. */
    responseTurn?: boolean;
    maximumSingleRanks?: readonly number[];
    deckCards?: readonly number[];
    playedRankCounts?: readonly number[];
    decompositionPlanMode?: PdkPlanMode;
    requiredFirstCard?: number;
    isFirstPlayOfRound?: boolean;
    allowSingle?: boolean;
    allowPair?: boolean;
    /** The decomposition selected before candidate ordering. Ranking never recomputes it. */
    fixedDecomposition?: DecompositionPlan;
}

export interface PdkHintRulePlan {
    policyId: PdkHintPolicyId;
    rules: PdkHintRules;
    ruleSources: Readonly<Record<string, { source: string; value: unknown }>>;
}

/** Normalize boolean room options consistently across Authority packet shapes. */
export const pdkRuleBoolean = (raw: unknown, fallback: boolean): boolean => {
    if (raw === undefined || raw === null) return fallback;
    if (raw === true || raw === 1) return true;
    if (raw === false || raw === 0) return false;
    const value = String(raw).trim().toLowerCase();
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return fallback;
};

export function resolvePdkHintRulePlan(
    snapshot: Readonly<Record<string, unknown>>,
    identity: PdkHintRuleIdentity,
    context: PdkHintRuleContext,
): PdkHintRulePlan {
    const minimumStraightLength = Number(snapshot.minimumStraightLength);
    const minimumPairRunLength = Number(snapshot.minimumPairRunLength);
    if (!Number.isSafeInteger(minimumStraightLength) || minimumStraightLength < 3
        || !Number.isSafeInteger(minimumPairRunLength) || minimumPairRunLength < 2) {
        throw new Error('CommonPdk authoritative run rules are invalid');
    }
    const mode = context.leading ? 'SELF' : 'RESPONSE';
    const requiredFirstCardValue = snapshot.activeRequiredFirstCard ?? snapshot.requiredFirstCard;
    const rules: PdkHintRules = {
        minimumStraightLength,
        minimumPairRunLength,
        allowTwoInRuns: Boolean(snapshot.allowTwoInRuns),
        protectedBombs: Array.isArray(snapshot.protectedBombs)
            ? snapshot.protectedBombs
                .filter((group): group is unknown[] => Array.isArray(group))
                .map((group) => group.map(Number).filter(Number.isFinite)) : [],
        tripleAttachmentMode: String(snapshot.tripleAttachmentMode ?? 'DISABLED') as TripleAttachmentMode,
        fourAttachmentMode: String(snapshot.fourAttachmentMode ?? 'DISABLED') as TripleAttachmentMode,
        airplaneAttachmentMode: String(snapshot.airplaneAttachmentMode ?? snapshot.tripleAttachmentMode ?? 'DISABLED') as TripleAttachmentMode,
        compareTripleAttachments: snapshot.compareTripleAttachments === true,
        allowFourWithThree: snapshot.allowFourWithThree === true,
        allowFourBombWithOne: snapshot.allowFourBombWithOne === true,
        responseTargetType: context.leading ? 0 : context.previousType,
        responseTargetCount: context.leading ? 0 : context.previousCardCount,
        responseTargetCards: context.leading ? [] : [...(context.previousCards ?? [])],
        decompositionPlanMode: mode,
        preserveScoringBombs: String(snapshot.bombScoreMode ?? 'DISABLED') !== 'DISABLED',
        specialTripleBombRanks: Array.isArray(snapshot.specialTripleBombRanks)
            ? snapshot.specialTripleBombRanks.map(Number).filter(Number.isFinite) : [],
        standardBombTier: Number(snapshot.standardBombTier ?? 1),
        specialBombTier: Number(snapshot.specialBombTier ?? 2),
        fourBombWithOneTier: Number(snapshot.fourBombWithOneTier ?? 1),
        allowSpecialTripleBombWithOne: snapshot.allowSpecialTripleBombWithOne === true,
        allowConsecutiveBomb: snapshot.allowConsecutiveBomb === true,
        allowAirplaneWithTwo: snapshot.allowAirplaneWithTwo === true,
        allowTerminalAttachmentShortage: snapshot.allowTerminalAttachmentShortage === true,
        tripleWithoutAttachmentTiming: snapshot.tripleWithoutAttachmentTiming,
        airplaneWithoutAttachmentTiming: snapshot.airplaneWithoutAttachmentTiming,
        handCardCount: Number(snapshot.handCardCount ?? 0),
        attachmentlessPlayPrivilege: snapshot.attachmentlessPlayPrivilege === true,
        responseTurn: !context.leading,
        maximumSingleRanks: Array.isArray(snapshot.maximumSingleRanks)
            ? snapshot.maximumSingleRanks.map(Number).filter(Number.isFinite) : [],
        deckCards: Array.isArray(snapshot.deckCards)
            ? snapshot.deckCards.map(Number).filter(Number.isFinite) : [],
        playedRankCounts: Array.isArray(snapshot.playedRankCounts)
            ? snapshot.playedRankCounts.map(Number).filter(Number.isFinite) : [],
        requiredFirstCard: requiredFirstCardValue === undefined || requiredFirstCardValue === null
            ? undefined
            : Number.isSafeInteger(Number(requiredFirstCardValue))
                ? Number(requiredFirstCardValue) : undefined,
        isFirstPlayOfRound: Boolean(snapshot.isFirstPlayOfRound),
        allowSingle: pdkRuleBoolean(snapshot.allowSingle, true),
        allowPair: pdkRuleBoolean(snapshot.allowPair, true),
    };
    return {
        policyId: identity.policyId,
        rules,
        ruleSources: {
            firstCard: { source: 'round.requiredFirstCard', value: rules.requiredFirstCard ?? 0 },
            leading: { source: 'authority.comparisonState', value: context.leading },
            bombScoreMode: { source: 'ruleOptions.bombScoreMode', value: snapshot.bombScoreMode ?? 'DISABLED' },
            workbookIdentity: { source: 'regional profile roomRuleWorkbook', value: identity.workbookIdentity },
        },
    };
}

export function pdkSelectionMask(
    hand: readonly number[], selected: readonly number[],
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

export function largestLegalPdkSubsets(
    cards: readonly number[], rankLegal: (candidates: number[][]) => number[][] | boolean,
): number[][] {
    const source = [...cards];
    for (let size = source.length; size >= 1; size -= 1) {
        const result: number[][] = [];
        const visit = (start: number, selected: number[]): void => {
            if (selected.length === size) {
                result.push([...selected]);
                return;
            }
            const need = size - selected.length;
            for (let index = start; index <= source.length - need; index += 1) {
                selected.push(source[index]);
                visit(index + 1, selected);
                selected.pop();
            }
        };
        visit(0, []);
        if (result.length > 0) {
            const filtered = rankLegal(result);
            // The callback evaluates one exact size tier. An empty array means
            // this tier has no legal complete shape, so keep searching smaller
            // subsets instead of treating the array object as a valid answer.
            if (Array.isArray(filtered)) {
                if (filtered.length > 0) return filtered;
                continue;
            }
            if (filtered) return result;
        }
    }
    return [];
}

export function isStrictlyHigherPdkSingle(candidate: number, target: number): boolean {
    return cardRank(Number(candidate)) > cardRank(Number(target));
}

export function effectivePdkMaximumSingleRanks(
    deck: readonly number[], hand: readonly number[], playedRankCounts: readonly number[],
): number[] {
    const deckCounts = countsOf(deck);
    const knownCounts = countsOf(hand);
    for (let value = MIN_RANK; value <= MAX_RANK; value += 1) {
        knownCounts[value] = Math.min(deckCounts[value], knownCounts[value]
            + Math.max(0, Math.trunc(Number(playedRankCounts[value] ?? 0))));
    }
    return Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, index) => index + MIN_RANK)
        .filter((value) => deckCounts[value] > 0)
        .filter((value, index, ranks) => ranks.slice(index + 1)
            .every((higher) => knownCounts[higher] >= deckCounts[higher]));
}

export interface ShapeDescriptor {
    kind: PdkKind;
    start: number;
    end: number;
    bodyRanks: number[];
    attachments: number[];
    cards: number;
}

export const bodyRanksOf = (cards: readonly number[], rules: PdkHintRules): number[] => {
    const counts = countsOf(cards);
    const triples = runs(counts, 3, 1, false);
    if (triples.length === 0) return [];
    const longest = triples.sort((left, right) => (right[1] - right[0]) - (left[1] - left[0])
        || left[0] - right[0])[0];
    return Array.from({ length: longest[1] - longest[0] + 1 }, (_, index) => longest[0] + index)
        .filter((value) => (counts[value] ?? 0) >= 3 && value !== 15);
};

export const describeShape = (cards: readonly number[], rules: PdkHintRules): ShapeDescriptor => {
    const sorted = [...cards].sort(compareCard);
    const counts = countsOf(sorted);
    const ranks = Array.from({ length: 13 }, (_, index) => index + MIN_RANK)
        .filter((value) => counts[value] > 0);
    const start = ranks[0] ?? 0;
    const end = ranks[ranks.length - 1] ?? 0;
    if (sorted.length === 1) return { kind: 'SINGLE', start, end, bodyRanks: [], attachments: [], cards: 1 };
    if (sorted.length === 4 && counts[start] === 4) {
        return { kind: 'BOMB', start, end, bodyRanks: [start], attachments: [], cards: 4 };
    }
    if (sorted.length === 2 && counts[start] === 2) {
        return { kind: 'PAIR', start, end, bodyRanks: [], attachments: [], cards: 2 };
    }
    if (sorted.length === 3 && counts[start] === 3) {
        return { kind: 'TRIPLE', start, end, bodyRanks: [start], attachments: [], cards: 3 };
    }
    const fourBody = ranks.find((value) => counts[value] === 4);
    if (fourBody !== undefined) {
        const bodySet = new Set([fourBody]);
        return {
            kind: 'FOUR_FAMILY', start: fourBody, end: fourBody,
            bodyRanks: [fourBody],
            attachments: sorted.filter((card) => !bodySet.has(cardRank(card))),
            cards: sorted.length,
        };
    }
    if (isStraightCandidate(sorted, rules)) {
        return { kind: 'STRAIGHT', start, end, bodyRanks: [], attachments: [], cards: sorted.length };
    }
    const pairRun = pairRunBounds(sorted, rules);
    if (pairRun) {
        return { kind: 'PAIR_RUN', start: pairRun[0], end: pairRun[1], bodyRanks: [], attachments: [], cards: sorted.length };
    }
    const body = bodyRanksOf(sorted, rules);
    if (body.length > 0) {
        const bodySet = new Set(body);
        const attachments = sorted.filter((card) => !bodySet.has(cardRank(card)));
        return {
            kind: body.length >= 2 ? 'AIRPLANE' : 'TRIPLE_FAMILY',
            start: body[0], end: body[body.length - 1], bodyRanks: body,
            attachments, cards: sorted.length,
        };
    }
    return { kind: 'UNKNOWN', start, end, bodyRanks: [], attachments: sorted, cards: sorted.length };
};

export interface Inventory {
    deckCounts: number[];
    knownCounts: number[];
}

export const buildInventory = (
    hand: readonly number[], deck: readonly number[], playedRankCounts: readonly number[],
): Inventory => {
    const deckCounts = countsOf(deck);
    const knownCounts = countsOf(hand);
    for (let value = MIN_RANK; value <= MAX_RANK; value += 1) {
        knownCounts[value] = Math.min(deckCounts[value], knownCounts[value]
            + Math.max(0, Math.trunc(Number(playedRankCounts[value] ?? 0))));
    }
    return { deckCounts, knownCounts };
};

export const higherBodyExists = (
    descriptor: ShapeDescriptor, inventory: Inventory, rules: PdkHintRules,
): boolean => {
    if (inventory.deckCounts.every((count) => count === 0)) return false;
    const copies = descriptor.kind === 'SINGLE' ? 1
        : descriptor.kind === 'PAIR' ? 2
            : descriptor.kind === 'TRIPLE' || descriptor.kind === 'TRIPLE_FAMILY' ? 3
                : descriptor.kind === 'FOUR_FAMILY' ? 4
                : descriptor.kind === 'BOMB' ? 4 : 1;
    const allowTwo = descriptor.kind === 'STRAIGHT' || descriptor.kind === 'PAIR_RUN'
        || descriptor.kind === 'AIRPLANE' ? rules.allowTwoInRuns : true;
    const maximum = allowTwo ? MAX_RANK : 14;
    if (descriptor.kind === 'SINGLE' || descriptor.kind === 'PAIR'
        || descriptor.kind === 'TRIPLE' || descriptor.kind === 'BOMB'
        || descriptor.kind === 'TRIPLE_FAMILY' || descriptor.kind === 'FOUR_FAMILY') {
        for (let value = descriptor.start + 1; value <= maximum; value += 1) {
            if ((inventory.deckCounts[value] ?? 0) < copies) continue;
            if ((inventory.knownCounts[value] ?? 0) + copies <= inventory.deckCounts[value]) return true;
        }
        return false;
    }
    const length = descriptor.bodyRanks.length || descriptor.cards / copies;
    for (let start = descriptor.start + 1; start + length - 1 <= maximum; start += 1) {
        let possible = true;
        for (let value = start; value < start + length; value += 1) {
            if ((inventory.deckCounts[value] ?? 0) < copies
                || (inventory.knownCounts[value] ?? 0) + copies > inventory.deckCounts[value]) {
                possible = false;
                break;
            }
        }
        if (possible) return true;
    }
    return false;
};

export const isAbsoluteShape = (
    descriptor: ShapeDescriptor, inventory: Inventory, rules: PdkHintRules,
): boolean => descriptor.kind !== 'UNKNOWN' && !higherBodyExists(descriptor, inventory, rules);

export const defaultRules = (deck: readonly number[] = []): PdkHintRules => ({
    minimumStraightLength: 5,
    minimumPairRunLength: 2,
    allowTwoInRuns: false,
    deckCards: [...deck],
    maximumSingleRanks: [15],
    tripleAttachmentMode: 'EITHER',
    fourAttachmentMode: 'DISABLED',
    decompositionPlanMode: 'SELF',
});

export const consecutiveFourBombRanks = (cards: readonly number[]): number[] | null => {
    if (cards.length < 8 || cards.length % 4 !== 0) return null;
    const counts = countsOf(cards);
    const ranks = Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, index) => index + MIN_RANK)
        .filter((rank) => counts[rank] === 4);
    if (ranks.length !== cards.length / 4 || ranks[ranks.length - 1] > 14) return null;
    if (ranks.some((rank, index) => index > 0 && rank !== ranks[index - 1] + 1)) return null;
    return ranks;
};

export const bombPrimaryRank = (cards: readonly number[], rules: PdkHintRules): number => {
    const counts = countsOf(cards);
    const consecutive = rules.allowConsecutiveBomb === true
        ? consecutiveFourBombRanks(cards) : null;
    if (consecutive) {
        return Math.max(...consecutive);
    }
    return Math.max(...Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, index) => index + MIN_RANK)
        .filter((rank) => counts[rank] >= 3));
};

export const bombTierForCards = (cards: readonly number[], rules: PdkHintRules): number => {
    const counts = countsOf(cards);
    if ((cards.length === 3 || (cards.length === 4 && rules.allowSpecialTripleBombWithOne === true))
        && counts.some((count, rank) => count === 3
            && (rules.specialTripleBombRanks ?? []).includes(rank))) {
        return Number(rules.specialBombTier ?? 2);
    }
    if (cards.length === 5 && counts.some((count) => count === 4)) {
        return Number(rules.fourBombWithOneTier ?? 1);
    }
    if (cards.length === 4 && counts.some((count) => count === 4)) {
        return Number(rules.standardBombTier ?? 1);
    }
    if (rules.allowConsecutiveBomb === true && consecutiveFourBombRanks(cards)) {
        return (cards.length / 4) * 2 - 1;
    }
    return 0;
};

export const isBombLike = (cards: readonly number[], rules: PdkHintRules): boolean =>
    bombTierForCards(cards, rules) > 0;

export const attachmentShape = (descriptor: ShapeDescriptor): string => {
    if (descriptor.attachments.length === 0) return 'NONE';
    const counts = new Map<number, number>();
    for (const card of descriptor.attachments) {
        const rank = cardRank(card);
        counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    if (descriptor.attachments.length === 1) return 'SINGLE';
    if ([...counts.values()].some((count) => count === 2)) return 'PAIR';
    return 'SINGLES';
};

export const targetMatches = (
    removal: readonly number[], target: { type: number; count: number }, rules: PdkHintRules,
): boolean => {
    const cards = Array.from({ length: 16 }, (_, value) =>
        Array<number>(removal[value] ?? 0).fill(value)).flat();
    const descriptor = describeShape(cards, rules);
    if (isBombLike(cards, rules)) return true;
    if (target.count > 0 && cards.length !== target.count) return false;
    if (target.type === 2) return descriptor.kind === 'SINGLE';
    if (target.type === 3) return descriptor.kind === 'PAIR';
    if (target.type === 4) return descriptor.kind === 'STRAIGHT';
    if (target.type === 5) return descriptor.kind === 'TRIPLE';
    if (target.type === 11) return isBombLike(cards, rules);
    if (target.type === 14) return descriptor.kind === 'PAIR_RUN';
    if ([6, 7, 15].includes(target.type)) {
        return descriptor.kind === 'TRIPLE_FAMILY';
    }
    if ([8, 9, 10, 20].includes(target.type)) {
        return descriptor.kind === 'FOUR_FAMILY';
    }
    if ([12, 13, 16, 17, 18, 19].includes(target.type)) {
        return descriptor.kind === 'AIRPLANE';
    }
    return true;
};

/**
 * Maps an authoritative operation type to the physical shape that must answer
 * it. The mapping belongs beside shape recognition so decomposition, candidate
 * generation, ordering and the controller share one response contract.
 */
export const responseShapeKind = (targetType: number): PdkKind | null => {
    if (targetType === 2) return 'SINGLE';
    if (targetType === 3) return 'PAIR';
    if (targetType === 4) return 'STRAIGHT';
    if (targetType === 5) return 'TRIPLE';
    if (targetType === 11) return 'BOMB';
    if (targetType === 14) return 'PAIR_RUN';
    if ([6, 7, 15].includes(targetType)) return 'TRIPLE_FAMILY';
    if ([8, 9, 10, 20].includes(targetType)) return 'FOUR_FAMILY';
    if ([12, 13, 16, 17, 18, 19].includes(targetType)) return 'AIRPLANE';
    return null;
};

/**
 * Verifies a concrete candidate against the concrete upper play. A response
 * cannot be admitted to a fixed decomposition merely because it has the same
 * type and size: it must already beat the cards that are actually on the
 * table. Legal bomb escalation remains governed by the established bomb-tier
 * rules.
 */
export const responseBeatsTarget = (
    cards: readonly number[], rules: PdkHintRules,
): boolean => {
    const targetType = Number(rules.responseTargetType ?? 0);
    const targetCards = rules.responseTargetCards ?? [];
    if (targetType <= 0 || targetCards.length === 0) return true;
    const candidate = describeShape(cards, rules);
    const target = describeShape(targetCards, rules);
    const expected = responseShapeKind(targetType);
    if (!expected) return false;
    const candidateBomb = isBombLike(cards, rules);
    const targetBomb = isBombLike(targetCards, rules) || target.kind === 'BOMB';
    if (candidateBomb && !targetBomb) return true;
    if (targetBomb) {
        if (!candidateBomb) return false;
        const candidateTier = bombTierForCards(cards, rules);
        const targetTier = bombTierForCards(targetCards, rules);
        return candidateTier > targetTier
            || candidateTier === targetTier
                && bombPrimaryRank(cards, rules) > bombPrimaryRank(targetCards, rules);
    }
    if (candidate.kind !== expected || target.kind !== expected) return false;
    if (candidate.cards !== target.cards) return false;
    if (candidate.kind === 'AIRPLANE'
        && candidate.bodyRanks.length !== target.bodyRanks.length) return false;
    const matchingShape = rules.compareTripleAttachments === true
        || (candidate.kind === 'TRIPLE_FAMILY'
            && rules.tripleAttachmentMode === 'EITHER_MATCH_SHAPE')
        || (candidate.kind === 'AIRPLANE'
            && rules.airplaneAttachmentMode === 'EITHER_MATCH_SHAPE');
    if (matchingShape && attachmentShape(candidate) !== attachmentShape(target)) return false;
    if (rules.compareTripleAttachments && candidate.kind === 'TRIPLE_FAMILY'
        && Math.max(...candidate.attachments.map(cardRank), 0)
            <= Math.max(...target.attachments.map(cardRank), 0)) return false;
    return candidate.start > target.start;
};

export const normalizeHintRules = (plan: PdkHintRulePlan | PdkHintRules): PdkHintRules => {
    const planRecord = plan as PdkHintRulePlan;
    const rawRules = planRecord.rules ?? plan as PdkHintRules;
    return {
        minimumStraightLength: Math.max(3, Math.trunc(rawRules.minimumStraightLength)),
        minimumPairRunLength: Math.max(2, Math.trunc(rawRules.minimumPairRunLength)),
        allowTwoInRuns: Boolean(rawRules.allowTwoInRuns),
        protectedBombs: rawRules.protectedBombs?.map((group) => [...group]) ?? [],
        tripleAttachmentMode: rawRules.tripleAttachmentMode ?? 'EITHER',
        fourAttachmentMode: rawRules.fourAttachmentMode ?? 'DISABLED',
        airplaneAttachmentMode: rawRules.airplaneAttachmentMode ?? rawRules.tripleAttachmentMode ?? 'DISABLED',
        compareTripleAttachments: Boolean(rawRules.compareTripleAttachments),
        allowFourWithThree: Boolean(rawRules.allowFourWithThree),
        allowFourBombWithOne: Boolean(rawRules.allowFourBombWithOne),
        responseTargetType: Number(rawRules.responseTargetType ?? 0),
        responseTargetCount: Number(rawRules.responseTargetCount ?? 0),
        responseTargetCards: [...(rawRules.responseTargetCards ?? [])].map(Number),
        requiredResponseSingleRank: Number.isSafeInteger(Number(rawRules.requiredResponseSingleRank))
            ? Number(rawRules.requiredResponseSingleRank) : undefined,
        preserveScoringBombs: Boolean(rawRules.preserveScoringBombs),
        specialTripleBombRanks: [...(rawRules.specialTripleBombRanks ?? [])].map(Number),
        standardBombTier: Number(rawRules.standardBombTier ?? 1),
        specialBombTier: Number(rawRules.specialBombTier ?? 2),
        fourBombWithOneTier: Number(rawRules.fourBombWithOneTier ?? 1),
        allowSpecialTripleBombWithOne: Boolean(rawRules.allowSpecialTripleBombWithOne),
        allowConsecutiveBomb: Boolean(rawRules.allowConsecutiveBomb),
        allowAirplaneWithTwo: Boolean(rawRules.allowAirplaneWithTwo),
        allowTerminalAttachmentShortage: Boolean(rawRules.allowTerminalAttachmentShortage),
        tripleWithoutAttachmentTiming: rawRules.tripleWithoutAttachmentTiming,
        airplaneWithoutAttachmentTiming: rawRules.airplaneWithoutAttachmentTiming,
        handCardCount: Number(rawRules.handCardCount ?? 0),
        attachmentlessPlayPrivilege: Boolean(rawRules.attachmentlessPlayPrivilege),
        responseTurn: rawRules.responseTurn === true,
        maximumSingleRanks: [...(rawRules.maximumSingleRanks ?? [15])],
        deckCards: [...(rawRules.deckCards ?? [])],
        playedRankCounts: [...(rawRules.playedRankCounts ?? [])],
        decompositionPlanMode: rawRules.decompositionPlanMode
            ?? (Number(rawRules.responseTargetType ?? 0) > 0 ? 'RESPONSE' : 'SELF'),
        requiredFirstCard: rawRules.requiredFirstCard,
        isFirstPlayOfRound: rawRules.isFirstPlayOfRound,
        allowSingle: rawRules.allowSingle,
        allowPair: rawRules.allowPair,
        fixedDecomposition: rawRules.fixedDecomposition,
    };
};

export const pdkRulesForRecognition = (
    rawRules: Readonly<Record<string, unknown>> | PdkHintRules = {},
): PdkHintRules => {
    const raw = rawRules as Record<string, unknown>;
    return normalizeHintRules({
        minimumStraightLength: Number(raw.minimumStraightLength ?? 5),
        minimumPairRunLength: Number(raw.minimumPairRunLength ?? 2),
        allowTwoInRuns: raw.allowTwoInRuns === true,
        tripleAttachmentMode: String(raw.tripleAttachmentMode ?? 'EITHER') as TripleAttachmentMode,
        fourAttachmentMode: String(raw.fourAttachmentMode ?? 'DISABLED') as TripleAttachmentMode,
        airplaneAttachmentMode: String(raw.airplaneAttachmentMode ?? raw.tripleAttachmentMode ?? 'DISABLED') as TripleAttachmentMode,
        compareTripleAttachments: raw.compareTripleAttachments === true,
        allowFourWithThree: raw.allowFourWithThree === true,
        allowFourBombWithOne: raw.allowFourBombWithOne === true,
        allowSpecialTripleBombWithOne: raw.allowSpecialTripleBombWithOne === true,
        specialTripleBombRanks: Array.isArray(raw.specialTripleBombRanks)
            ? raw.specialTripleBombRanks.map(Number).filter(Number.isFinite) : [],
        standardBombTier: Number(raw.standardBombTier ?? 1),
        specialBombTier: Number(raw.specialBombTier ?? 2),
        fourBombWithOneTier: Number(raw.fourBombWithOneTier ?? 1),
        allowConsecutiveBomb: raw.allowConsecutiveBomb === true,
        allowAirplaneWithTwo: raw.allowAirplaneWithTwo === true,
        allowTerminalAttachmentShortage: raw.allowTerminalAttachmentShortage === true,
        tripleWithoutAttachmentTiming: raw.tripleWithoutAttachmentTiming,
        airplaneWithoutAttachmentTiming: raw.airplaneWithoutAttachmentTiming,
        allowSingle: pdkRuleBoolean(raw.allowSingle, true),
        allowPair: pdkRuleBoolean(raw.allowPair, true),
        handCardCount: Number(raw.handCardCount ?? 0),
        attachmentlessPlayPrivilege: raw.attachmentlessPlayPrivilege === true,
        responseTurn: raw.responseTurn === true,
        requiredResponseSingleRank: Number.isSafeInteger(Number(raw.requiredResponseSingleRank))
            ? Number(raw.requiredResponseSingleRank) : undefined,
    });
};

export const attachmentIsPair = (attachments: readonly number[]): boolean => {
    if (attachments.length === 0 || attachments.length % 2 !== 0) return false;
    const counts = countsOf(attachments);
    return counts.every((count) => count === 0 || count === 2);
};

export const timingAllowsAttachmentless = (
    timing: unknown, cards: readonly number[], rules: PdkHintRules,
): boolean => {
    const value = String(timing ?? 'ANYTIME').toUpperCase();
    if (value === 'ANYTIME') return true;
    const isFinalHand = Number(rules.handCardCount ?? 0) > 0
        && Number(rules.handCardCount) === cards.length;
    if (isFinalHand && (value === 'FINAL_ONLY' || value === 'DEALER_RESPONSE_OR_FINAL')) return true;
    return value === 'DEALER_RESPONSE_OR_FINAL'
        && (rules.responseTurn === true || rules.attachmentlessPlayPrivilege === true);
};

export const modeAllowsSingles = (mode: string): boolean =>
    mode === 'SINGLES' || mode === 'SINGLE_OR_PAIR' || mode === 'EITHER'
    || mode === 'EITHER_MATCH_SHAPE';

export const modeAllowsPairs = (mode: string): boolean =>
    mode === 'PAIRS' || mode === 'SINGLE_OR_PAIR' || mode === 'EITHER'
    || mode === 'EITHER_MATCH_SHAPE';

export function pdkOperationTypeForCards(
    cards: readonly number[],
    rawRules: Readonly<Record<string, unknown>> | PdkHintRules = {},
): number {
    if (!Array.isArray(cards) || cards.length === 0) return 0;
    const rules = pdkRulesForRecognition(rawRules);
    const descriptor = describeShape(cards, rules);
    if (bombTierForCards(cards, rules) > 0) return 11;
    if (descriptor.kind === 'SINGLE') return rules.allowSingle === false ? 0 : 2;
    if (descriptor.kind === 'PAIR') return rules.allowPair === false ? 0 : 3;
    if (descriptor.kind === 'STRAIGHT') return 4;
    if (descriptor.kind === 'PAIR_RUN') return 14;
    if (descriptor.kind === 'TRIPLE') {
        return timingAllowsAttachmentless(rules.tripleWithoutAttachmentTiming, cards, rules) ? 5 : 0;
    }
    if (descriptor.kind === 'TRIPLE_FAMILY') {
        const attachments = descriptor.attachments.length;
        const mode = String(rules.tripleAttachmentMode ?? 'DISABLED');
        if (attachments === 0) {
            return timingAllowsAttachmentless(rules.tripleWithoutAttachmentTiming, cards, rules) ? 5 : 0;
        }
        if (attachments === 1 && modeAllowsSingles(mode)) return 6;
        if (attachments === 2) {
            if (attachmentIsPair(descriptor.attachments) && modeAllowsPairs(mode)) return 15;
            if (!attachmentIsPair(descriptor.attachments)
                && (mode === 'EITHER' || mode === 'EITHER_MATCH_SHAPE')) return 7;
        }
        return 0;
    }
    if (descriptor.kind === 'FOUR_FAMILY') {
        const attachments = descriptor.attachments.length;
        const mode = String(rules.fourAttachmentMode ?? 'DISABLED');
        if (attachments === 1 && (rules.allowFourBombWithOne === true || modeAllowsSingles(mode))) return 8;
        if (attachments === 4 && attachmentIsPair(descriptor.attachments) && modeAllowsPairs(mode)) return 20;
        if (attachments === 2 && !attachmentIsPair(descriptor.attachments) && modeAllowsSingles(mode)) return 9;
        if (attachments === 3 && rules.allowFourWithThree === true) return 10;
        return 0;
    }
    if (descriptor.kind === 'AIRPLANE') {
        const bodyCount = descriptor.bodyRanks.length;
        const attachments = descriptor.attachments.length;
        const mode = String(rules.airplaneAttachmentMode ?? 'DISABLED');
        if (attachments === 0) {
            return timingAllowsAttachmentless(rules.airplaneWithoutAttachmentTiming, cards, rules)
                ? 19 : 0;
        }
        if (attachments === bodyCount && modeAllowsSingles(mode)) return 16;
        if (attachments === bodyCount * 2) {
            if (attachmentIsPair(descriptor.attachments) && modeAllowsPairs(mode)) return 17;
            if (!attachmentIsPair(descriptor.attachments)
                && (mode === 'EITHER' || mode === 'EITHER_MATCH_SHAPE'
                    || rules.allowAirplaneWithTwo === true)) return 18;
        }
        return 0;
    }
    return 0;
}
