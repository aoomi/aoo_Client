import { PDK_BUSINESS_CODES } from './PdkBusinessCodes';

export interface PdkGameplayCapabilities {
    readonly retainPlayedCardsOnTable: boolean;
}

const DEFAULT_PDK_GAMEPLAY_CAPABILITIES: PdkGameplayCapabilities = Object.freeze({
    retainPlayedCardsOnTable: false,
});

const PDK_GAMEPLAY_CAPABILITIES: Readonly<Record<string, PdkGameplayCapabilities>> = Object.freeze({
    [PDK_BUSINESS_CODES.LIANGSHAN]: Object.freeze({ retainPlayedCardsOnTable: true }),
});

/** New regional PDK variants inherit the closed defaults until explicitly enabled. */
export function resolvePdkGameplayCapabilities(gameCode: string): PdkGameplayCapabilities {
    return PDK_GAMEPLAY_CAPABILITIES[gameCode.trim()] ?? DEFAULT_PDK_GAMEPLAY_CAPABILITIES;
}
