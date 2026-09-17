import type { LegacySubgameTicket } from '../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';

/** A feature-owned bridge from an authoritative Hall handoff into one game runtime. */
export interface GameRuntimeEntry {
    readonly id: string;
    readonly canonicalGameCodes: readonly string[];
    readonly families: readonly string[];
    preload?(handoff?: LegacySubgameTicket): Promise<void>;
    enter(handoff: LegacySubgameTicket): Promise<void>;
    enterReplay?(handoff: LegacySubgameTicket): Promise<void>;
    destroy(): void;
}

export function canonicalGameCode(handoff: LegacySubgameTicket): string {
    return String(handoff.gameName ?? '').trim().toUpperCase();
}

export function canonicalGameFamily(handoff: LegacySubgameTicket): string {
    return String(handoff.playFamily ?? '').trim().toLowerCase().replace(/_/g, '-').replace(/:/g, '-');
}
