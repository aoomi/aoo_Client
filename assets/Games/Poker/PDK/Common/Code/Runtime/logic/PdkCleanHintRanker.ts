/**
 * Public compatibility entry for Common PDK hinting.
 *
 * Implementations live in four single-responsibility modules: card recognition,
 * fixed decomposition, candidate generation, and ordering. Keeping this file as
 * a barrel preserves the public import path without duplicating any logic.
 */
export {
    pdkCardRank,
    pdkSelectionMask,
    largestLegalPdkSubsets,
    isStrictlyHigherPdkSingle,
    effectivePdkMaximumSingleRanks,
    resolvePdkHintRulePlan,
    pdkOperationTypeForCards,
    responseBeatsTarget,
} from './PdkCardRecognition';
export { decomposePdkHand } from './PdkHandDecomposer';
export { generatePdkFixedPlanCandidates } from './PdkHintCandidateGenerator';
export { rankPdkDragCandidates, rankCleanPdkHints } from './PdkHintSorter';
export type {
    PdkHintPolicyId,
    PdkHintRuleContext,
    PdkHintRuleIdentity,
    PdkHintRules,
    PdkHintRulePlan,
} from './PdkCardRecognition';
export type { DecompositionGroup, DecompositionPlan } from './PdkHandDecomposer';
export type { PdkHintCandidate } from './PdkHintCandidateGenerator';
