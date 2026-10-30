import { Node } from 'cc';









import { resolvePdkHintPolicy } from '../Regional/PdkHintPolicyRegistry';

import { effectivePdkMaximumSingleRanks, generatePdkFixedPlanCandidates, pdkCardRank, pdkOperationTypeForCards, rankCleanPdkHints, rankPdkDragCandidates, resolvePdkHintRulePlan, responseBeatsTarget, type PdkHintCandidate, type PdkHintRulePlan } from './logic/PdkCleanHintRanker';







const PDK_HINT_PIPELINE_VERSION = '2026-10-04-state-only-logic-v1';

/** Internal behavior module; state remains in its PdkPlayController host. */
export class PdkHintController {
    public constructor(private readonly host: any) {}

public tip(): void {
        this.host.selectionIntentRevision += 1;
        const startedAt = globalThis.performance?.now?.() ?? Date.now();
        const diagnostics = globalThis as typeof globalThis & {
            __PDK_E2E_LOGS__?: unknown[];
            __PDK_PLAY_CONTROLLER__?: unknown;
        };
        if (Array.isArray(diagnostics.__PDK_E2E_LOGS__)) diagnostics.__PDK_PLAY_CONTROLLER__ = this.host;
        if (this.host.playInFlight || this.host.keepOperationsVisibleDuringPlay) {
            // The visual hand has already removed the submitted cards, while the
            // rules engine still owns the preceding authority hand. Remember the
            // click and consume it immediately after play_resp commits the next
            // local turn; calculating here would select cards that were just played.
            this.host.hintRequestedDuringPlay = true;
            console.info('[CommonRoomHintQueuedDuringPlay]', {
                roomId: this.host.roomId(),
                playerId: this.host.runtime.getPlayerId(),
                stateVersion: Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
                operationId: String(this.host.record(
                    (this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {}).operationDeadline,
                )?.operationId ?? ''),
            });
            return;
        }
        // Cache identity must be derived after the committed table comparison is
        // synchronized. Otherwise an earlier empty response cache can match the
        // stale local target and hide a newly committed pair such as 77 from 99.
        this.synchronizeAuthorityComparison();
        const key = this.promptKey();
        const continuingManualCycle = this.host.promptCycleKey === key;
        if (!continuingManualCycle) {
            this.host.promptCycleKey = key;
            this.host.tipIndex = 0;
        }
        if (this.host.hintCacheKey !== key) this.prepareHintCache();
        const tips = this.host.hintCache;
        if (!tips.length) { this.host.showMessage('没有可出的牌'); return; }
        const selected = [...(this.host.logic.GetSelectCard() ?? [])].map(Number);
        const currentIndex = tips.findIndex((candidate: number[]) => this.sameCards(selected, candidate));
        // An authoritative response turn preselects tips[0] for convenience.
        // That automatic selection is not a manual Hint cycle: the player's
        // first click must still show the best candidate, and only later clicks
        // advance through K/A/2 or other legal alternatives.
        if (continuingManualCycle && currentIndex >= 0) {
            this.host.tipIndex = (currentIndex + 1) % tips.length;
        }
        else if (this.host.tipIndex >= tips.length) this.host.tipIndex = 0;
        this.host.logic.ChangeSelectCard(tips[this.host.tipIndex]);
        this.host.tipIndex = (this.host.tipIndex + 1) % tips.length;
        this.host.updateSelection();
        const selectedCards = [...(this.host.logic.GetSelectCard() ?? [])].map(Number);
        const diagnosticGameCode = this.host.runtime.getGameCode();
        const diagnosticPolicyId = this.host.activeHintPlan?.policyId ?? 'COMMON';
        this.host.traceOutCards('hint-selection', {
            gameCode: diagnosticGameCode,
            policyId: diagnosticPolicyId,
            minimumStraightLength: Number(this.host.activeHintPlan?.rules.minimumStraightLength),
            selectedCardCount: selectedCards.length,
            candidateCount: tips.length,
        });
        const computedAt = globalThis.performance?.now?.() ?? Date.now();
        globalThis.requestAnimationFrame?.(() => {
            const paintedAt = globalThis.performance?.now?.() ?? Date.now();
            console.info('[CommonRoomHintLatency]', {
                roomId: this.host.roomId(),
                playerId: this.host.runtime.getPlayerId(),
                gameCode: diagnosticGameCode,
                policyId: diagnosticPolicyId,
                minimumStraightLength: Number(this.host.activeHintPlan?.rules.minimumStraightLength),
                candidateCount: tips.length,
                selectedCardCount: selectedCards.length,
                computeMs: Number((computedAt - startedAt).toFixed(2)),
                nextFrameMs: Number((paintedAt - startedAt).toFixed(2)),
            });
        });
    }

public prepareHintCache(): void {
        this.synchronizeAuthorityComparison();
        const key = this.promptKey();
        const leading = this.isAuthoritativeLeadingTurn();
        // A trick reset is authoritative. Clear stale response data before the
        // ranker builds the next fixed decomposition.
        if (leading && (this.host.logic.GetLastCardType() !== 0 || this.host.logic.lastCardList.length > 0)) {
            this.host.logic.ClearCardData();
        }
        this.host.hintCacheKey = key;
        // The ranker performs fixed decomposition, candidate generation and
        // ordering as one pipeline. The controller only stores its result.
        const legal = this.sortedLegalTipCandidates(leading);
        const required = leading ? this.activeRequiredFirstCard() : 0;
        this.host.hintCache = required > 0 ? legal.filter((cards) => cards.includes(required)) : legal;
        const rules = this.authoritativeRuleOptions();
        const gameCode = this.host.runtime.getGameCode();
        const shapeCounts: Record<string, number> = {};
        const activeRules = this.host.activeHintPlan?.rules;
        for (const cards of this.host.hintCache) {
            const operation = activeRules ? pdkOperationTypeForCards(cards, activeRules) : 0;
            const key = `${operation}:${cards.length}`;
            shapeCounts[key] = (shapeCounts[key] ?? 0) + 1;
        }
        this.host.traceOutCards('hint-cache', {
            hintPipelineVersion: PDK_HINT_PIPELINE_VERSION,
            gameCode,
            policyId: this.host.activeHintPlan?.policyId ?? 'COMMON',
            minimumStraightLength: Number(rules.minimumStraightLength),
            leading,
            targetType: Number(this.host.logic.GetLastCardType()),
            targetCardCount: Array.isArray(this.host.logic.lastCardList)
                ? this.host.logic.lastCardList.length : 0,
            candidateCount: this.host.hintCache.length,
            candidateShapeCounts: shapeCounts,
        });
    }

public consumeQueuedHintAfterPlay(): boolean {
        if (!this.host.hintRequestedDuringPlay || this.host.playInFlight
            || this.host.keepOperationsVisibleDuringPlay) return false;
        const setInfo = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const deadline = this.host.record(setInfo.operationDeadline);
        const turnSeat = Number(setInfo.opPos ?? deadline?.seatId ?? -1);
        if (turnSeat !== this.host.clientSeat()) return false;
        this.host.hintRequestedDuringPlay = false;
        this.resetPromptCycle();
        this.tip();
        return true;
    }

public resetPromptCycle(): void {
        this.host.tipIndex = 0;
        this.host.promptCycleKey = '';
        this.host.hintCacheKey = '';
        this.host.hintCache = [];
        this.host.activeHintPlan = null;
    }

public authoritativeRuleOptions(): Record<string, unknown> {
        const config = this.host.runtime.getRoom().GetRoomConfig() ?? {};
        const rules = this.host.record(config.ruleOptions);
        if (!rules) throw new Error('CommonPdk 权威 ruleOptions 缺失');
        return rules;
    }

public recognitionRules(
        handCardCount = (this.host.logic.GetHandCard() ?? []).length,
        responseTurn = !this.isAuthoritativeLeadingTurn(),
    ): Record<string, unknown> {
        const rules = this.authoritativeRuleOptions();
        return {
            ...rules,
            handCardCount,
            responseTurn,
            attachmentlessPlayPrivilege: rules.attachmentlessPlayPrivilege === true,
        };
    }

public tripleAttachmentPermissions(): { oneSingle: boolean; twoSingles: boolean; pairs: boolean } {
        const mode = String(this.authoritativeRuleOptions().tripleAttachmentMode ?? '');
        if (!['DISABLED', 'SINGLES', 'PAIRS', 'SINGLE_OR_PAIR', 'EITHER', 'EITHER_MATCH_SHAPE'].includes(mode)) {
            throw new Error('CommonPdk 权威 tripleAttachmentMode 无效');
        }
        return {
            oneSingle: mode === 'SINGLES' || mode === 'SINGLE_OR_PAIR' || mode === 'EITHER'
                || mode === 'EITHER_MATCH_SHAPE',
            twoSingles: mode === 'EITHER' || mode === 'EITHER_MATCH_SHAPE',
            pairs: mode === 'PAIRS' || mode === 'SINGLE_OR_PAIR' || mode === 'EITHER'
                || mode === 'EITHER_MATCH_SHAPE',
        };
    }

public fourAttachmentPermissions(): { singles: boolean; pairs: boolean } {
        const mode = String(this.authoritativeRuleOptions().fourAttachmentMode ?? '');
        if (!['DISABLED', 'SINGLES', 'PAIRS', 'EITHER', 'EITHER_MATCH_SHAPE'].includes(mode)) {
            throw new Error('CommonPdk 权威 fourAttachmentMode 无效');
        }
        return {
            singles: mode === 'SINGLES' || mode === 'EITHER' || mode === 'EITHER_MATCH_SHAPE',
            pairs: mode === 'PAIRS' || mode === 'EITHER' || mode === 'EITHER_MATCH_SHAPE',
        };
    }

public activeRequiredFirstCard(): number {
        const setInfo = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        const roundNo = Number(setInfo.roundNo ?? setInfo.setID ?? 0);
        if (!Number.isSafeInteger(roundNo) || roundNo <= 0) return 0;
        // Both the first-player marker and the compulsory opening card belong
        // to the first play of the round only. A later trick may become a new
        // lead after everyone passes, but it must never inherit either rule.
        if (!this.isFirstPlayOfRound(setInfo)) return 0;
        // The authority may publish a card that determined who received the
        // opening turn. That marker is not a play constraint by itself. Only an
        // explicit must-carry rule may turn it into a required physical card.
        if (!this.isMandatoryFirstCardRule(this.authoritativeRuleOptions())) return 0;
        // Authority has already applied requiredFirstCardRounds to this exact
        // round. A zero marker means this round has no compulsory opening card;
        // never reconstruct it from stale room properties or historical plays.
        const value = Number(setInfo.activeRequiredFirstCard ?? 0);
        if (!Number.isSafeInteger(value) || value <= 0) return 0;
        return (this.host.logic.GetHandCard() as number[]).includes(value) ? value : 0;
    }

public isFirstPlayOfRound(setInfo: Readonly<Record<string, unknown>>): boolean {
        if (setInfo.firstPlayOfRound === true || setInfo.roundFirstPlay === true) return true;
        if (setInfo.firstPlayOfRound === false || setInfo.roundFirstPlay === false) return false;
        const counts = setInfo.publicPlayedRankCounts;
        if (Array.isArray(counts) && counts.length === 16) {
            return counts.every((value) => Number.isSafeInteger(Number(value)) && Number(value) === 0);
        }
        // Older authoritative snapshots omitted the explicit round marker and
        // rank ledger. Authority still publishes the resolved physical card
        // only while the opening operation is pending, so this fallback is
        // safe when the current trick is empty and that marker is positive.
        const activeRequired = Number(setInfo.activeRequiredFirstCard ?? 0);
        return setInfo.isFirstOp === true
            && Number.isSafeInteger(activeRequired) && activeRequired > 0;
    }

public isMandatoryFirstCardRule(rules: Readonly<Record<string, unknown>>): boolean {
        if (rules.mustCarryFirstCard === true || rules.requireFirstCard === true
            || rules.requiredFirstCard === true) return true;
        // Published PDK options carry the configured physical card as a
        // numeric value (for example 103 for spade three), not a boolean.
        // Treat only a positive card id as the mandatory-rule signal; the
        // actual card to include still comes from activeRequiredFirstCard.
        const configuredCard = rules.requiredFirstCard;
        const configuredCardText = typeof configuredCard === 'number'
            || typeof configuredCard === 'string' ? String(configuredCard).trim() : '';
        if (/^\d+$/u.test(configuredCardText) && Number(configuredCardText) > 0) return true;
        const explicit = [rules.requiredFirstCardRule, rules.firstPlayMode]
            .map((value) => String(value ?? '').trim().toLowerCase())
            .filter(Boolean);
        if (explicit.some((value) => /(?:required|mandatory|must)/u.test(value))) return true;
        // `playRule` is a checkbox list in published regional profiles. Only
        // the explicit card-requirement vocabulary is accepted here; generic
        // response rules such as `must_beat_with_big` and `must_beat_on_run`
        // must never turn into an opening-card constraint.
        const playRules = Array.isArray(rules.playRule) ? rules.playRule : [rules.playRule];
        return playRules.some((value) => /^require_(?:spade|heart|club|diamond)_(?:three|four|five|six|seven|eight|nine|ten|jack|queen|king|ace|two|\d+)$/u
            .test(String(value ?? '').trim().toLowerCase()));
    }

public authoritativeDeckCards(): number[] {
        const rawDeck = this.authoritativeRuleOptions().deckCards;
        if (!Array.isArray(rawDeck) || rawDeck.length === 0) {
            throw new Error('CommonPdk 权威 deckCards 缺失');
        }
        const deckCards = rawDeck.map(Number);
        if (deckCards.some((card) => !Number.isSafeInteger(card))) {
            throw new Error('CommonPdk 权威 deckCards 含无效牌');
        }
        return deckCards;
    }

public authoritativePlayedRankCounts(deckCards: readonly number[]): number[] {
        const setInfo = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {};
        // The visible playedCardList is intentionally empty under LAST_ONLY.
        // Authority publishes cumulative public rank counts independently of
        // table presentation, so hints remain correct after reconnect too.
        const counts = setInfo.publicPlayedRankCounts;
        if (!Array.isArray(counts) || counts.length !== 16) {
            throw new Error('CommonPdk 权威 publicPlayedRankCounts 缺失或长度无效');
        }
        const deckCounts = new Map<number, number>();
        for (const card of deckCards) {
            const cardRank = this.cardRank(card);
            deckCounts.set(cardRank, (deckCounts.get(cardRank) ?? 0) + 1);
        }
        return counts.map((value: unknown, cardRank: number) => {
            const count = Number(value);
            const available = deckCounts.get(cardRank) ?? 0;
            if (!Number.isSafeInteger(count) || count < 0 || count > available
                || (available === 0 && count !== 0)) {
                throw new Error(`CommonPdk 权威已出牌点数计数无效: rank=${cardRank}`);
            }
            return count;
        });
    }

public validateHintRuleContext(): void {
        const rules = this.authoritativeRuleOptions();
        const deckCards = this.authoritativeDeckCards();
        this.authoritativePlayedRankCounts(deckCards);
        const identity = resolvePdkHintPolicy(this.host.runtime.getGameCode(), rules);
        const targetType = Number(this.host.logic.GetLastCardType());
        const targetCards = Array.isArray(this.host.logic.lastCardList)
            ? this.host.logic.lastCardList.map(Number).filter(Number.isFinite) : [];
        if ((targetType > 0 && targetCards.length === 0)
            || (targetType <= 0 && targetCards.length > 0)) {
            throw new Error('CommonPdk 权威上家牌型或牌张不完整');
        }
        const targetCount = targetType === 2 ? 1 : targetCards.length;
        resolvePdkHintRulePlan(rules, identity, {
            leading: targetType === 0,
            previousType: targetType,
            previousCardCount: targetCount,
            previousCards: targetCards,
        });
    }

public sortedLegalTipCandidates(
        leading: boolean,
        strategy: 'HINT' | 'DRAG' | 'HOST' = 'HINT',
        dragSource: readonly number[][] = [],
    ): number[][] {
        // Stage 1: validate the active room's physical deck and public ledger,
        // then resolve all authoritative rules before reading/splitting the hand.
        const rules = this.authoritativeRuleOptions();
        const deckCards = this.authoritativeDeckCards();
        const authoritativePlayedRankCounts = this.authoritativePlayedRankCounts(deckCards);
        const gameCode = this.host.runtime.getGameCode();
        const identity = resolvePdkHintPolicy(gameCode, rules);
        const targetType = Number(this.host.logic.GetLastCardType());
        const targetCards = Array.isArray(this.host.logic.lastCardList)
            ? this.host.logic.lastCardList.map(Number).filter(Number.isFinite) : [];
        // A response type without its comparison cards is an incomplete
        // authority snapshot. Do not guess a target count or fall back to lead.
        if ((!leading && targetType <= 0) || (targetType > 0 && targetCards.length === 0)
            || (leading && targetType > 0)) return [];
        const targetCount = targetType === 2 ? 1 : targetCards.length;
        const plan = resolvePdkHintRulePlan(rules, identity, {
            leading,
            previousType: targetType,
            previousCardCount: targetCount,
            previousCards: targetCards,
        });
        this.host.activeHintPlan = plan;

        // Stage 2: the ranker decomposes the complete hand first. HINT never
        // receives an arbitrary hand-subset source from the controller.
        const hand = this.host.logic.GetHandCard() ?? [];
        const recognitionRules = this.recognitionRules(hand.length, !leading);
        const activeRequired = leading ? this.activeRequiredFirstCard() : 0;
        // This server-enforced rule constrains a response root. It must be
        // available to the fixed decomposition before candidate generation,
        // instead of deleting ordinary loose-single candidates afterwards.
        const requiredResponseSingleRank = !leading && targetType === 2
            ? this.requiredReportedSingleRank() : null;
        // Absolute maximum ranks are decomposition inputs. Resolve them before
        // any triple/airplane attachment is selected; injecting them after
        // candidate generation allowed A/2 to be consumed as a wing.
        const effectiveMaximumRanks = effectivePdkMaximumSingleRanks(
            deckCards, hand, authoritativePlayedRankCounts,
        );
        const maximumSingleRank = Math.max(...deckCards.map((card) => this.cardRank(card)));
        const fixedPlan: PdkHintRulePlan = {
            ...plan,
            rules: {
                ...plan.rules,
                handCardCount: hand.length,
                responseTurn: !leading,
                attachmentlessPlayPrivilege: recognitionRules.attachmentlessPlayPrivilege === true,
                isFirstPlayOfRound: leading,
                requiredFirstCard: activeRequired > 0 ? activeRequired : undefined,
                requiredResponseSingleRank: requiredResponseSingleRank ?? undefined,
                maximumSingleRanks: effectiveMaximumRanks.length > 0
                    ? effectiveMaximumRanks : [maximumSingleRank],
                deckCards,
                playedRankCounts: authoritativePlayedRankCounts,
                protectedBombs: this.scoringBombGroups(),
            },
        };
        const keyed = new Map<string, {
            cards: number[];
            order: number;
            remainingTurns?: number;
            remainingCovered?: boolean;
            fixedDecomposition?: PdkHintCandidate['fixedDecomposition'];
        }>();
        const fixed = strategy === 'DRAG'
            ? dragSource.map((cards, order) => ({ cards: [...cards], order }))
            : generatePdkFixedPlanCandidates(hand, fixedPlan);
        const values: unknown[] = fixed;
        for (let order = 0; order < values.length; order += 1) {
            const value = values[order];
            const sourceCandidate = value && typeof value === 'object'
                ? value as Partial<PdkHintCandidate> : undefined;
            const rawCards = Array.isArray(value)
                ? value
                : (sourceCandidate && Array.isArray(sourceCandidate.cards)
                    ? sourceCandidate.cards : []);
            if (!rawCards.length) continue;
            const cards = this.cardsInHandOrder(rawCards.map(Number).filter(Number.isFinite));
            if (!cards.length) continue;
            const cardType = pdkOperationTypeForCards(cards, recognitionRules);
            if (cardType <= 0) continue;
            if (!leading && !responseBeatsTarget(cards, fixedPlan.rules)) continue;
            const key = `${cardType}:${cards.map((card) => pdkCardRank(card)).sort((a, b) => a - b).join(',')}`;
            if (!keyed.has(key)) keyed.set(key, {
                cards,
                order,
                remainingTurns: sourceCandidate?.remainingTurns,
                remainingCovered: sourceCandidate?.remainingCovered,
                fixedDecomposition: sourceCandidate?.fixedDecomposition,
            });
        }
        // The authoritative PDK rule requires the highest single when the
        // next seat has reported one card. Apply that rule before every local
        // consumer ranks, drags, hosts, or submits a candidate.
        const candidates = [...keyed.values()].filter((candidate) =>
            this.obeysReportedSingleRule(candidate.cards),
        );
        if (strategy === 'DRAG') {
            // Drag only orders physical subsets of the current gesture. Pass the
            // complete authority plan so response validation stays identical to
            // normal play, but never hand it to the fixed-plan prompt ranker.
            return rankPdkDragCandidates(hand, candidates, fixedPlan);
        }
        if (strategy === 'HOST') {
            // Trusteeship has no prompt strategy. It submits the lowest-point
            // legal response from the fixed response source.
            return candidates.sort((left, right) => {
                const leftShape = this.lowestResponseBodyRank(left.cards, targetType);
                const rightShape = this.lowestResponseBodyRank(right.cards, targetType);
                if (leftShape !== rightShape) return leftShape - rightShape;
                const leftRanks = left.cards.map((card) => this.cardRank(card)).sort((a, b) => a - b);
                const rightRanks = right.cards.map((card) => this.cardRank(card)).sort((a, b) => a - b);
                for (let index = 0; index < Math.min(leftRanks.length, rightRanks.length); index += 1) {
                    if (leftRanks[index] !== rightRanks[index]) return leftRanks[index] - rightRanks[index];
                }
                return left.order - right.order;
            }).map((candidate) => [...candidate.cards]);
        }
        const rankingPlan: PdkHintRulePlan = { ...fixedPlan, rules: {
            ...fixedPlan.rules,
            protectedBombs: this.scoringBombGroups(),
            maximumSingleRanks: effectiveMaximumRanks.length > 0
                ? effectiveMaximumRanks : [maximumSingleRank],
            deckCards,
            playedRankCounts: authoritativePlayedRankCounts,
        } };
        // Stage 3: rank solely through the ordered priorities in the resolved plan.
        const rankCandidates = (values: typeof candidates): number[][] => rankCleanPdkHints(
            this.host.logic.GetHandCard() ?? [], values, rankingPlan,
        );
        // The ranker owns same-shape filtering and bomb fallback ordering. The
        // controller must not split candidates into a second, competing queue.
        const ranked = rankCandidates(candidates);
        const diagnostics = {
            hintPipelineVersion: PDK_HINT_PIPELINE_VERSION,
            strategy,
            policyId: identity.policyId,
            leading,
            targetType,
            targetCardCount: targetCards.length,
            handCardCount: hand.length,
            deckHasTwo: deckCards.some((card) => this.cardRank(card) === 15),
            maximumSingleRanks: [...(rankingPlan.rules.maximumSingleRanks ?? [])],
            rootCandidateCount: fixed.length,
            physicalCandidateCount: keyed.size,
            authorityFilteredCandidateCount: candidates.length,
            rankedCandidateCount: ranked.length,
            emptyReason: ranked.length > 0 ? 'NONE'
                : fixed.length === 0 ? 'NO_LEGAL_RESPONSE_ROOT'
                    : keyed.size === 0 ? 'PHYSICAL_OR_SHAPE_FILTER'
                        : candidates.length === 0 ? 'AUTHORITY_CONSTRAINT_FILTER'
                            : 'FIXED_PLAN_RANK_FILTER',
        };
        this.host.traceOutCards('hint-pipeline', diagnostics);
        if (ranked.length === 0) console.warn('[CommonRoomHintUnavailable]', diagnostics);
        return ranked;
    }

public requiredReportedSingleRank(): number | null {
        const nextSeat = (this.host.clientSeat() + 1) % this.host.authoritativePlayerCount();
        if (this.host.remainingCards.get(nextSeat) !== 1) return null;
        const hand = (this.host.logic.GetHandCard() ?? []).map(Number);
        if (hand.length === 0) return null;
        return Math.max(...hand.map((card: number) => this.cardRank(card)));
    }

public obeysReportedSingleRule(cards: readonly number[]): boolean {
        if (cards.length !== 1) return true;
        const requiredRank = this.requiredReportedSingleRank();
        return requiredRank === null || this.cardRank(cards[0]) === requiredRank;
    }

public scoringBombGroups(): number[][] {
        const rules = this.authoritativeRuleOptions();
        if (String(rules.bombScoreMode ?? 'DISABLED') === 'DISABLED') return [];
        return this.allBombGroups();
    }

public allBombGroups(): number[][] {
        const hand = (this.host.logic.GetHandCard() ?? []).map(Number);
        const rules = this.authoritativeRuleOptions();
        const groups = new Map<number, number[]>();
        for (const card of hand) {
            const rank = this.cardRank(card);
            const group = groups.get(rank) ?? [];
            group.push(card);
            groups.set(rank, group);
        }
        const bombs = [...groups.values()].filter((group) => group.length >= 4);
        const specialRanks = new Set<number>();
        const rawSpecial = rules.specialTripleBombRanks;
        if (Array.isArray(rawSpecial)) {
            for (const value of rawSpecial) specialRanks.add(Number(value));
        }
        const singleSpecial = Number(rules.specialTripleBombRank ?? 0);
        if (Number.isSafeInteger(singleSpecial) && singleSpecial > 0) specialRanks.add(singleSpecial);
        for (const [rank, group] of groups) {
            if (group.length === 3 && specialRanks.has(rank)) bombs.push(group);
        }
        return bombs;
    }

public cardsInHandOrder(cards: number[]): number[] {
        const counts = new Map<number, number>();
        for (const value of cards) counts.set(value, (counts.get(value) ?? 0) + 1);
        const ordered: number[] = [];
        for (const value of this.host.logic.GetHandCard() ?? []) {
            const card = Number(value);
            const count = counts.get(card) ?? 0;
            if (count <= 0) continue;
            ordered.push(card);
            if (count === 1) counts.delete(card);
            else counts.set(card, count - 1);
        }
        return ordered;
    }

public isLocalTrusteeship(setInfo: Record<string, unknown>): boolean {
        const positions = Array.isArray(setInfo.posInfo) ? setInfo.posInfo : [];
        const localSeat = this.host.clientSeat();
        const local = positions.find((entry: unknown) => {
            const value = this.host.record(entry);
            return Number(value?.pos ?? value?.posID ?? -1) === localSeat;
        });
        return Boolean(this.host.record(local)?.trusteeship);
    }

public cardRank(card: number): number {
        return pdkCardRank(card);
    }

public lowestResponseBodyRank(cards: readonly number[], targetType: number): number {
        const counts = new Map<number, number>();
        for (const card of cards) {
            const rank = this.cardRank(card);
            counts.set(rank, (counts.get(rank) ?? 0) + 1);
        }
        const bodyMinimum = [6, 7, 8, 9, 10, 12, 13, 15, 16, 17, 18, 19, 20].includes(targetType)
            ? Math.min(...Array.from(counts.entries())
                .filter(([, count]) => count >= (targetType >= 8 && targetType <= 10 || targetType === 20 ? 4 : 3))
                .map(([rank]) => rank))
            : Math.min(...cards.map((card) => this.cardRank(card)));
        return Number.isFinite(bodyMinimum) ? bodyMinimum : Number.MAX_SAFE_INTEGER;
    }

public cardDisplayName(card: number): string {
        const normalized = card > 500 ? card - 500 : card;
        const suit = Math.floor(normalized / 100);
        const rank = normalized % 100;
        if (suit === 5 && rank === 16) return '小王';
        if (suit === 5 && rank === 17) return '大王';
        const suits: Record<number, string> = { 1: '方块', 2: '梅花', 3: '红桃', 4: '黑桃' };
        const ranks: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
        return `${suits[suit] ?? ''}${ranks[rank] ?? rank}`;
    }

public missingRequiredFirstCard(cards: readonly number[]): number {
        if (!this.isAuthoritativeLeadingTurn()) return 0;
        const required = this.activeRequiredFirstCard();
        return required > 0 && !cards.includes(required) ? required : 0;
    }

public promptKey(): string {
        const hand = (this.host.logic.GetHandCard() ?? []).join(',');
        const last = (this.host.logic.lastCardList ?? []).join(',');
        return [hand, this.host.logic.GetLastCardType(), last, this.isAuthoritativeLeadingTurn(), this.host.activeOpPos,
            this.activeRequiredFirstCard(),
            Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? 0)].join('|');
    }

public isAuthoritativeLeadingTurn(
        setInfo: Record<string, unknown> = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {},
    ): boolean {
        const { cards, type } = this.authorityComparison(setInfo);
        if (type === -1) return false;
        return cards.length === 0 || type <= 0;
    }

public async autoHintForAuthoritativeTurn(
        setInfo: Record<string, unknown>,
        expectedSelectionRevision: number,
        authorityProjectionStartedAt = globalThis.performance?.now?.() ?? Date.now(),
    ): Promise<void> {
        if (expectedSelectionRevision !== this.host.selectionIntentRevision) {
            console.info('[CommonRoomAutoHintSkipped]', {
                reason: 'MANUAL_SELECTION_OWNS_TURN',
                roomId: this.host.roomId(),
                playerId: this.host.runtime.getPlayerId(),
                stateVersion: Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1),
                expectedSelectionRevision,
                currentSelectionRevision: this.host.selectionIntentRevision,
            });
            return;
        }
        if (!this.host.view || this.host.cardNodes.length === 0) return;
        // During dealer competition Authority deliberately exposes the current
        // responder as opPos. That seat owns only the rob/pass decision; it does
        // not yet own a card-play turn. In particular, a whole-hand straight
        // must wait until competition resolves and PLAYING names the final
        // dealer as currentSeat.
        if (!this.isFormalCardPlayPhase(setInfo)) {
            return;
        }
        const roomId = this.host.roomId();
        const stateVersion = Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -1);
        const deadline = this.host.record(setInfo.operationDeadline);
        const operationId = String(deadline?.operationId ?? '');
        const turnSeat = Number(setInfo.opPos ?? deadline?.seatId ?? -1);
        const trick = this.host.record(setInfo.comparisonState);
        const trickId = Number(setInfo.trickId ?? trick?.trickId ?? 0);
        const tableOperations = Array.isArray(setInfo.tableOperations) ? setInfo.tableOperations : [];
        const localTurn = Number(this.host.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1
            && this.host.activeOpPos === this.host.clientSeat()
            && turnSeat === this.host.clientSeat();
        if (!localTurn || this.host.autoPassInFlight) return;
        this.synchronizeAuthorityComparison(setInfo);
        const lastCardType = Number(this.host.logic.GetLastCardType());
        const lastCards = [...(this.host.logic.lastCardList ?? [])];
        const leading = this.isAuthoritativeLeadingTurn(setInfo);
        const key = [
            roomId,
            Number(setInfo.roundNo ?? this.host.runtime.getRoom().GetRoomProperty('setID') ?? 0),
            stateVersion,
            operationId,
            turnSeat,
            trickId,
            tableOperations.length,
            lastCardType,
            lastCards.join(','),
        ].join(':');
        if (!operationId || stateVersion < 0 || this.host.autoHintTurnKey === key) return;
        this.host.autoHintTurnKey = key;
        this.host.autoPassInFlight = true;
        let autoActionFailed = false;
        try {
            const latestSet = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {};
            const latestDeadline = this.host.record(latestSet.operationDeadline);
            const stillCurrent = Number(this.host.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1
                && this.host.roomId() === roomId
                && Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -2) === stateVersion
                && this.host.activeOpPos === turnSeat
                && String(latestDeadline?.operationId ?? '') === operationId
                && this.host.autoHintTurnKey === key;
            if (!stillCurrent) return;

            // A complete final hand has no subsequent decision for the player.
            // Verify its exact physical cards against the authoritative candidate
            // source, then submit it directly. This is deliberately narrower
            // than the removed whole-hand strategy: a proper subset, or a hand
            // that cannot answer the current comparison, never reaches outCard.
            const finalHand = [...(this.host.logic.GetHandCard() ?? [])].map(Number);
            const finalCandidate = finalHand.length > 0
                ? this.sortedLegalTipCandidates(leading, 'HINT')
                    .find((cards) => this.sameCards(cards, finalHand))
                : undefined;
            if (finalCandidate) {
                const finalType = this.intrinsicOperationTypeForCards(finalCandidate);
                if (finalType <= 0) throw new Error('最后一手候选不是合法牌型');
                this.host.logic.ChangeSelectCard(finalCandidate);
                this.host.updateSelection();
                console.info('[CommonRoomFinalHandPlay]', {
                    roomId, stateVersion, operationId, turnSeat, trickId,
                    opType: finalType, cardCount: finalCandidate.length,
                });
                await this.host.outCard(finalType);
                return;
            }
            const hostedResponse = !leading && this.isLocalTrusteeship(latestSet);
            if (hostedResponse) {
                // Trusteeship is an execution path, not a prompt path: ask the
                // fixed response source for legal plays and submit its lowest
                // point response immediately. No whole-hand finish proof,
                // prompt cache, or ordinary hint ranking is consulted here.
                const legal = this.sortedLegalTipCandidates(false, 'HOST');
                const automatic = legal[0];
                if (!automatic) {
                    this.host.logic.ChangeSelectCard([]);
                    this.host.updateSelection();
                    this.host.operations?.hide();
                    this.host.view?.visible('Players/Seat_0/Tip/Pass', true);
                    return;
                }
                const hostedType = this.intrinsicOperationTypeForCards(automatic);
                if (hostedType <= 0) throw new Error('托管接牌候选不是合法牌型');
                this.host.logic.ChangeSelectCard(automatic);
                this.host.updateSelection();
                console.info('[CommonRoomTrusteeshipPlay]', {
                    roomId, stateVersion, operationId, turnSeat, trickId,
                    opType: hostedType, cardCount: automatic.length,
                });
                await this.host.outCard(hostedType);
                return;
            }
            // Outside trusteeship, the player owns every non-final card-play
            // decision. The exact complete-final-hand case returned above is
            // the sole automatic exception.
            if (leading) {
                this.host.logic.ChangeSelectCard([]);
                this.host.updateSelection();
                return;
            }
            const hintComputeStartedAt = globalThis.performance?.now?.() ?? Date.now();
            this.validateHintRuleContext();
            const legal = this.sortedLegalTipCandidates(
                leading,
                'HINT',
            );
            const tips = legal;
            const hintComputedAt = globalThis.performance?.now?.() ?? Date.now();
            if (tips.length > 0) {
                const automatic = tips[0];
                // Keep the automatic convenience selection outside the manual
                // cycle. The first physical Hint click must reassert tips[0],
                // not skip directly to tips[1].
                this.host.promptCycleKey = '';
                this.host.tipIndex = 0;
                this.host.hintCacheKey = this.promptKey();
                this.host.hintCache = tips;
                this.host.logic.ChangeSelectCard(automatic);
                this.host.updateSelection();
                console.info('[CommonRoomAutoHintSelection]', {
                    roomId, stateVersion, operationId, turnSeat, trickId,
                    cardCount: automatic.length,
                    authorityToHintMs: Number((hintComputedAt - authorityProjectionStartedAt).toFixed(2)),
                    hintComputeMs: Number((hintComputedAt - hintComputeStartedAt).toFixed(2)),
                });
                return;
            }
            // A normal player owns the decision to pass.  An empty local hint
            // list is diagnostic state, never authorization to submit PASS:
            // Authority may still recognize a legal response that this client
            // has filtered incorrectly.  Only trusteeship above may submit an
            // automatic response, and a complete final hand may auto-play.
            this.host.logic.ChangeSelectCard([]);
            this.host.updateSelection();
            console.info('[CommonRoomAutoHintUnavailable]', {
                roomId, stateVersion, operationId, turnSeat, trickId,
                targetType: lastCardType, targetCardCount: lastCards.length,
            });
            return;
        } catch (error: unknown) {
            autoActionFailed = true;
            if (this.host.view && this.host.roomId() === roomId
                && Number(this.host.runtime.getRoom().GetRoomProperty('state') ?? 0) === 1
                && Number(this.host.runtime.getRoom().GetRoomProperty('stateVersion') ?? -2) === stateVersion) {
                // Automatic final-hand or trusteeship actions retain only a
                // turn-scoped diagnostic; the ordinary Hint UI owns its own
                // feedback and never submits PASS automatically.
                console.error('[CommonRoomAutoActionError]', {
                    roomId, stateVersion, operationId, turnSeat, trickId,
                    targetType: lastCardType, targetCardCount: lastCards.length,
                }, error);
            }
        } finally {
            this.host.autoPassInFlight = false;
            if (autoActionFailed) this.host.refresh();
        }
    }

public operationTypeForCards(cards: readonly number[], responseTurn = !this.isAuthoritativeLeadingTurn()): number {
        return pdkOperationTypeForCards(cards, this.recognitionRules(cards.length, responseTurn));
    }

public intrinsicOperationTypeForCards(cards: readonly number[], responseTurn = !this.isAuthoritativeLeadingTurn()): number {
        return pdkOperationTypeForCards(cards, this.recognitionRules(cards.length, responseTurn));
    }

public synchronizeAuthorityComparison(
        setInfo: Record<string, unknown> = this.host.runtime.getRoomSet().GetRoomSetInfo() ?? {},
    ): void {
        const { cards, type } = this.authorityComparison(setInfo);
        if (cards.length > 0 && type > 0) this.host.logic.SetCardData(type, cards);
        else this.host.logic.ClearCardData();
    }

public authorityComparison(setInfo: Record<string, unknown>): { cards: number[]; type: number } {
        // `comparisonState` may still describe the winning hand from the
        // completed trick. The explicit boundary flags own the next action and
        // therefore suppress that historical comparison for every consumer.
        // Keeping this rule here prevents Hint, automatic Hint and Play from
        // independently disagreeing about whether the local turn is a lead.
        if (Boolean(setInfo.trickReset)) {
            return { cards: [], type: 0 };
        }
        const comparison = this.host.record(setInfo.comparisonState);
        if (!comparison) return { cards: [], type: 0 };
        const cards = Array.isArray(comparison.cards) ? comparison.cards.map(Number) : [];
        const declaredType = this.host.legacyOperationType(comparison.cardType ?? comparison.type);
        // Numeric operation enums can differ between an upstream packet and
        // the common PDK client. The physical comparison cards are immutable
        // public state, so derive their current-room shape first. A pair of J
        // must remain a pair even when a legacy numeric value denotes SINGLE.
        const physicalType = cards.length > 0
            ? pdkOperationTypeForCards(cards, this.recognitionRules(cards.length, false))
            : 0;
        const type = physicalType > 0 ? physicalType : declaredType;
        // `isFirstOp` is a presentation marker, not a replacement for the
        // committed comparison. If the same authority snapshot carries a
        // valid 777, keep it so a 999 response is not silently turned into a
        // self-lead. Only an empty/invalid comparison is a reset.
        if (Boolean(setInfo.isFirstOp) && (cards.length === 0 || type <= 0)) {
            return { cards: [], type: 0 };
        }
        if ((type > 0 && cards.length === 0) || (type <= 0 && cards.length > 0)) {
            return { cards: [], type: -1 };
        }
        return { cards, type };
    }

public isFormalCardPlayPhase(setInfo: Record<string, unknown>): boolean {
        const phase = String(setInfo.authorityPhase ?? '').toUpperCase();
        return !this.host.competeDealerPhase && phase === 'PLAYING';
    }

public sameCards(left: readonly number[], right: readonly number[]): boolean {
        if (left.length !== right.length) return false;
        const sortedLeft = [...left].map(Number).sort((a, b) => a - b);
        const sortedRight = [...right].map(Number).sort((a, b) => a - b);
        return sortedLeft.every((card, index) => card === sortedRight[index]);
    }
}
