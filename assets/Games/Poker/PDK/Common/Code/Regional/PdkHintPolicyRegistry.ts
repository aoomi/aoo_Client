import { PDK_BUSINESS_CODES } from './PdkBusinessCodes';
import type { PdkHintPolicyId } from '../Runtime/logic/PdkCleanHintRanker';

const DEFAULT_PDK_HINT_POLICY: PdkHintPolicyId = 'COMMON';

const PDK_HINT_POLICIES: Readonly<Record<string, PdkHintPolicyId>> = Object.freeze({
    [PDK_BUSINESS_CODES.LIANGSHAN]: 'LS201',
});

/**
 * Resolves hint strategy from immutable business identity. Card ranks and
 * optional rule switches are deliberately not accepted as region detectors.
 */
export function resolvePdkHintPolicyId(gameCode: string): PdkHintPolicyId {
    return PDK_HINT_POLICIES[gameCode.trim()] ?? DEFAULT_PDK_HINT_POLICY;
}
