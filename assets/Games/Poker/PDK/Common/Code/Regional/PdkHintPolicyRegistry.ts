import type { PdkHintPolicyId } from '../Runtime/logic/PdkCleanHintRanker';
import { resolvePdkRegionalProfile } from './PdkRegionalProfileRegistry';

const DEFAULT_PDK_HINT_POLICY: PdkHintPolicyId = 'COMMON';

/**
 * Resolve policy from published configuration first, then the authoritative
 * workbook identity. No card/hand feature and no game-code policy table is used.
 */
export function resolvePdkHintPolicy(
    gameCode: string,
    ruleOptions: Readonly<Record<string, unknown>>,
): { policyId: PdkHintPolicyId; workbookIdentity: string } {
    const profile = resolvePdkRegionalProfile(gameCode);
    const workbookIdentity = String(ruleOptions.workbookIdentity
        ?? ruleOptions.roomRuleWorkbook ?? profile?.roomRuleWorkbook ?? '');
    const publishedPolicy = String(ruleOptions.hintPolicyId ?? '').trim();
    const policyId: PdkHintPolicyId = publishedPolicy === 'LS201'
        || /(^|[/\\])凉山跑得快\.xlsx$/u.test(workbookIdentity)
        ? 'LS201' : DEFAULT_PDK_HINT_POLICY;
    return { policyId, workbookIdentity };
}
