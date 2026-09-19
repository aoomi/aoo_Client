import type { LegacySubgameTicket } from '../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import {
    canonicalGameCode,
    canonicalGameFamily,
    type GameRuntimeEntry,
} from './GameRuntimeEntry';

const LOG_PREFIX = '[GameRuntimeEntryRegistry]';

export class GameRuntimeEntryResolutionError extends Error {
    public constructor(
        readonly code: 'DUPLICATE_GAME_CODE' | 'AMBIGUOUS_GAME_FAMILY' | 'UNSUPPORTED_GAME_RUNTIME',
        message: string,
    ) {
        super(message);
        this.name = 'GameRuntimeEntryResolutionError';
    }
}

/** Resolves a single feature runtime. Exact canonical game codes always outrank family fallback. */
export class GameRuntimeEntryRegistry {
    private readonly entries: GameRuntimeEntry[] = [];
    private readonly byGameCode = new Map<string, GameRuntimeEntry>();

    public register(entry: GameRuntimeEntry): this {
        for (const rawCode of entry.canonicalGameCodes) {
            const gameCode = rawCode.trim().toUpperCase();
            const existing = this.byGameCode.get(gameCode);
            if (existing) {
                const error = new GameRuntimeEntryResolutionError(
                    'DUPLICATE_GAME_CODE',
                    `canonical gameCode ${gameCode} is owned by both ${existing.id} and ${entry.id}`,
                );
                console.error(LOG_PREFIX, { action: 'register', gameCode, entries: [existing.id, entry.id], error });
                throw error;
            }
            this.byGameCode.set(gameCode, entry);
        }
        this.entries.push(entry);
        return this;
    }

    public resolveUnique(handoff: LegacySubgameTicket): GameRuntimeEntry | null {
        const gameCode = canonicalGameCode(handoff);
        const exact = gameCode ? this.byGameCode.get(gameCode) : undefined;
        if (exact) return exact;

        const family = canonicalGameFamily(handoff);
        if (!family) return null;
        const matches = this.entries.filter(entry => entry.families.some(value =>
            value.trim().toLowerCase().replace(/_/g, '-').replace(/:/g, '-') === family));
        if (matches.length <= 1) return matches[0] ?? null;

        const context = this.context(handoff, gameCode, family);
        const error = new GameRuntimeEntryResolutionError(
            'AMBIGUOUS_GAME_FAMILY',
            `family ${family} matched multiple runtime entries: ${matches.map(entry => entry.id).join(', ')}`,
        );
        console.error(LOG_PREFIX, { action: 'resolve', ...context, entries: matches.map(entry => entry.id), error });
        throw error;
    }

    public resolveRequired(handoff: LegacySubgameTicket): GameRuntimeEntry {
        const resolved = this.resolveUnique(handoff);
        if (resolved) return resolved;
        const gameCode = canonicalGameCode(handoff);
        const family = canonicalGameFamily(handoff);
        const context = this.context(handoff, gameCode, family);
        const error = new GameRuntimeEntryResolutionError(
            'UNSUPPORTED_GAME_RUNTIME',
            `no runtime entry is registered for gameCode=${gameCode || 'unknown'}, family=${family || 'unknown'}`,
        );
        console.error(LOG_PREFIX, { action: 'resolve', ...context, error });
        throw error;
    }

    public all(): readonly GameRuntimeEntry[] {
        return Object.freeze([...this.entries]);
    }

    public destroy(): void {
        for (const entry of this.entries.splice(0)) entry.destroy();
        this.byGameCode.clear();
    }

    private context(handoff: LegacySubgameTicket, gameCode: string, family: string): Record<string, unknown> {
        const trace = handoff as LegacySubgameTicket & { operationId?: unknown; stateVersion?: unknown };
        return {
            gameCode,
            family,
            roomId: Number(handoff.roomId ?? handoff.roomID ?? 0),
            operationId: String(trace.operationId ?? ''),
            stateVersion: Number(trace.stateVersion ?? 0),
        };
    }
}
