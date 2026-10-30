import type { LegacySubgameTicket } from '../../../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';

const LEGACY_GAME_CODES = new Set(['CD201', 'NJ201', 'LS201', 'MN201', 'AY201', 'PZ201', 'WN201', 'FZ201']);

export type PdkCompatibilityAdmission = Readonly<{
    mode: 'compatibility' | 'production' | 'rejected';
    gameCode: string;
    reason?: string;
}>;

type CompatibilityTicket = LegacySubgameTicket & { readonly compatibilityOnly?: boolean };

/**
 * Compatibility is an explicit admission mode, never a fallback from an
 * unknown production identity.  The compatibility-code list is intentionally isolated
 * here so the runtime shell and its caller cannot drift apart.
 */
export function isLegacyCompatibilityTicket(ticket: LegacySubgameTicket | null | undefined): boolean {
    if (!ticket) return false;
    const candidate = ticket as CompatibilityTicket;
    if (candidate.compatibilityOnly === true) return true;
    const gameId = Number(candidate.gameId ?? 0);
    const gameCode = String(candidate.gameName ?? '').trim().toUpperCase();
    return gameId === 516 || LEGACY_GAME_CODES.has(gameCode);
}

export function assertLegacyCompatibilityTicket(ticket: LegacySubgameTicket | null | undefined): asserts ticket is CompatibilityTicket {
    if (!isLegacyCompatibilityTicket(ticket)) throw new Error('INVALID_COMPATIBILITY_ENTRY');
}

/** Resolve the admission mode before canonical production validation runs. */
export function admitPdkCompatibilityTicket(
    ticket: LegacySubgameTicket,
    isCurrentBusinessCode: (gameCode: string) => boolean,
): PdkCompatibilityAdmission {
    const gameCode = String(ticket.gameName ?? '').trim().toLowerCase();
    if (isLegacyCompatibilityTicket(ticket)) {
        assertLegacyCompatibilityTicket(ticket);
        return Object.freeze({ mode: 'compatibility' as const, gameCode });
    }
    if (isCurrentBusinessCode(gameCode)) {
        return Object.freeze({ mode: 'production' as const, gameCode });
    }
    return Object.freeze({ mode: 'rejected' as const, gameCode, reason: 'INVALID_PDK_BUSINESS_CODE' });
}
