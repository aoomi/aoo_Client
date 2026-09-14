import type { KeyValueStorage } from '../core/Storage';
import type { LegacySubgameTicket } from '../subgame/AuthoritativeSubgameHandoff';

const STORAGE_PREFIX = 'aoo.room.recovery.v1.';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface RecoverableRoomIntent {
    readonly entryOrigin?: 'GAME_LOBBY' | 'CLUB' | 'UNION';
    readonly returnContext?: { clubId?: number; unionId?: number };
    readonly roomId: number;
    readonly gameId: number;
    readonly gameName?: string;
    readonly playFamily?: string;
    readonly playVersion?: string;
    readonly roomKey?: number | string;
    readonly clubId?: number;
    readonly unionId?: number;
    readonly fromClub?: boolean;
    readonly updatedAt: number;
}

/** Stores only enough local intent to ask Hall for a fresh room ticket after reload. */
export class RoomRecoveryStore {
    public constructor(private readonly storage: KeyValueStorage) {}

    public load(accountId: string): RecoverableRoomIntent | null {
        if (!this.validAccountId(accountId)) return null;
        try {
            const value = JSON.parse(this.storage.get(this.key(accountId)) ?? 'null') as Partial<RecoverableRoomIntent> | null;
            if (!value || typeof value !== 'object') return null;
            const updatedAt = Number(value.updatedAt);
            if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > MAX_AGE_MS) {
                this.clear(accountId);
                return null;
            }
            const room = this.normalize(value);
            if (!room) {
                this.clear(accountId);
                return null;
            }
            return room;
        } catch {
            this.clear(accountId);
            return null;
        }
    }

    public save(accountId: string, ticket: LegacySubgameTicket): void {
        if (!this.validAccountId(accountId)) return;
        const room = this.normalize({ ...ticket, updatedAt: Date.now() });
        if (!room) return;
        this.storage.set(this.key(accountId), JSON.stringify(room));
    }

    public clear(accountId: string): void {
        if (this.validAccountId(accountId)) this.storage.remove(this.key(accountId));
    }

    private normalize(value: Partial<RecoverableRoomIntent> | Partial<LegacySubgameTicket>): RecoverableRoomIntent | null {
        const roomId = Number((value as Partial<LegacySubgameTicket>).roomId
            ?? (value as Partial<LegacySubgameTicket>).roomID ?? 0);
        const gameId = Number(value.gameId ?? 0);
        const updatedAt = Number((value as Partial<RecoverableRoomIntent>).updatedAt ?? Date.now());
        if (!Number.isSafeInteger(roomId) || roomId < 100000 || roomId > 999999) return null;
        if (!Number.isSafeInteger(gameId) || gameId < 0) return null;
        return {
            roomId,
            gameId,
            entryOrigin: value.entryOrigin === 'CLUB' || value.entryOrigin === 'UNION' ? value.entryOrigin : 'GAME_LOBBY',
            returnContext: value.returnContext && typeof value.returnContext === 'object' ? {
                clubId: this.optionalNumber(value.returnContext.clubId),
                unionId: this.optionalNumber(value.returnContext.unionId),
            } : undefined,
            gameName: this.optionalText(value.gameName),
            playFamily: this.optionalText(value.playFamily),
            playVersion: this.optionalText(value.playVersion),
            roomKey: typeof value.roomKey === 'number' || typeof value.roomKey === 'string' ? value.roomKey : undefined,
            clubId: this.optionalNumber(value.clubId),
            unionId: this.optionalNumber(value.unionId),
            fromClub: value.fromClub === true,
            updatedAt,
        };
    }

    private key(accountId: string): string {
        return `${STORAGE_PREFIX}${accountId}`;
    }

    private validAccountId(accountId: string): boolean {
        return /^[1-9]\d*$/.test(accountId);
    }

    private optionalNumber(value: unknown): number | undefined {
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }

    private optionalText(value: unknown): string | undefined {
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    }
}
