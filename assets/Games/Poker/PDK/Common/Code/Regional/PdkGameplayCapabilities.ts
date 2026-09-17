import { PDK_BUSINESS_CODES } from './PdkBusinessCodes';

export interface PdkGameplayCapabilities {
    /** Explicit opt-in for variants whose rules retain every played hand on the table. */
    readonly arrangementMode: 'disabled' | 'enabled';
}

const DEFAULT_PDK_GAMEPLAY_CAPABILITIES: PdkGameplayCapabilities = Object.freeze({
    arrangementMode: 'disabled',
});

const PDK_GAMEPLAY_CAPABILITIES: Readonly<Record<string, PdkGameplayCapabilities>> = Object.freeze({
    [PDK_BUSINESS_CODES.LIANGSHAN]: Object.freeze({ arrangementMode: 'enabled' }),
});

/** New regional PDK variants inherit the closed defaults until explicitly enabled. */
export function resolvePdkGameplayCapabilities(gameCode: string): PdkGameplayCapabilities {
    return PDK_GAMEPLAY_CAPABILITIES[gameCode.trim()] ?? DEFAULT_PDK_GAMEPLAY_CAPABILITIES;
}
