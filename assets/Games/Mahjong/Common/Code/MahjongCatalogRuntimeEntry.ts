import type { LegacySubgameTicket } from '../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';
import {
    CATALOG_FAMILY_BINDINGS,
} from '../../../Common/Code/Catalog/CatalogFamilyBindings';
import type {
    CommonRoomFeaturePorts,
    CommonRoomMountedView,
    GameRuntimeEntry,
} from '../../../Common/Code/Runtime/GameRuntimeEntry';

type MahjongSnapshot = Readonly<Record<string, unknown>>;

const MAHJONG_BINDINGS = Object.freeze(CATALOG_FAMILY_BINDINGS.filter(binding =>
    binding.family.startsWith('mahjong:')));
const MAHJONG_GAME_CODES = Object.freeze(MAHJONG_BINDINGS
    .map(binding => binding.code)
    .filter(code => code !== 'chengdu1001'));
const MAHJONG_FAMILIES = Object.freeze([...new Set(MAHJONG_BINDINGS.map(binding => binding.family))]);

export interface MahjongCatalogRuntimeEntryOptions {
    readonly accountId: number;
    readonly requestRoomExit: (roomId: number) => Promise<void>;
}

/**
 * Catalog-routed Mahjong entry for every profile without a dedicated table
 * renderer. It owns only the authority connection and public projection;
 * CommonRoom owns the shell, buttons, social capabilities, heads and cleanup.
 */
export class MahjongCatalogRuntimeEntry implements GameRuntimeEntry {
    public readonly id = 'mahjong-catalog-common';
    public readonly canonicalGameCodes = MAHJONG_GAME_CODES;
    public readonly families = MAHJONG_FAMILIES;
    public supportsPlayVersion(playVersion: string, handoff: LegacySubgameTicket): boolean {
        const gameCode = String(handoff.gameName ?? '').trim().toLowerCase();
        return Boolean(gameCode) && playVersion.startsWith(`${gameCode}-v`);
    }
    private client: ProtocolClient | null = null;
    private commonMountedView: CommonRoomMountedView | null = null;
    private snapshot: MahjongSnapshot | null = null;
    private roomId = 0;
    private gameCode = '';
    private playVersion = '';
    private sequence = 0;
    private generation = 0;
    private roomRuleVisible = false;

    public constructor(private readonly options: MahjongCatalogRuntimeEntryOptions) {
        if (!Number.isSafeInteger(options.accountId) || options.accountId <= 0) {
            throw new Error('[mahjong-catalog] invalid runtime identity');
        }
    }

    public async enter(handoff: LegacySubgameTicket): Promise<void> {
        this.destroy();
        const generation = ++this.generation;
        this.roomId = Number(handoff.roomId ?? handoff.roomID ?? handoff.roomKey ?? 0);
        this.gameCode = String(handoff.gameName ?? '').trim().toLowerCase();
        this.playVersion = String(handoff.playVersion ?? '').trim();
        const playFamily = String(handoff.playFamily ?? '').trim().toLowerCase().replace(/_/g, '-');
        const authorityRoute = String(handoff.authorityRoute ?? '').trim();
        const gameTicket = String(handoff.gameTicket ?? '').trim();
        if (!Number.isSafeInteger(this.roomId) || this.roomId <= 0 || !this.gameCode
            || !this.playVersion || !authorityRoute || !gameTicket
            // Exact catalog codes are preferred by the registry, while family
            // fallback keeps a newly registered Mahjong profile on the same
            // CommonRoom path without another client entry edit.
            || (!MAHJONG_GAME_CODES.includes(this.gameCode) && !playFamily.startsWith('mahjong:'))) {
            throw new Error('[mahjong-catalog] authoritative handoff is incomplete');
        }
        const client = new ProtocolClient();
        this.client = client;
        try {
            client.setWsTicket(gameTicket);
            client.bindRoomAuthority(this.roomId, this.playVersion);
            client.on(`mahjong.${this.gameCode}.state_push`, body => { void this.accept(body); });
            client.on('common.room.state_push', body => { void this.accept(body); });
            await client.connect(authorityRoute);
            this.assertCurrent(generation);
            const initial = await this.dispatch('state', {}, 0);
            this.assertCurrent(generation);
            await this.applySnapshot(initial);
            if (this.findLocalSeat(initial) < 0) {
                throw new Error('[mahjong-catalog] Hall membership is absent from Mahjong authority');
            }
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    public commonRoomPorts(): CommonRoomFeaturePorts {
        return {
            exit: {
                request: async () => {
                    await this.options.requestRoomExit(this.roomId);
                    this.destroy();
                },
            },
            openRoomRule: () => this.toggleRoomRule(),
            waitingActions: { ready: () => this.run('ready') },
            mounted: view => {
                this.commonMountedView = view;
                this.renderCommonRoomChrome();
                return () => {
                    if (this.commonMountedView === view) this.commonMountedView = null;
                };
            },
            report: error => console.error('[mahjong-catalog]', error),
        };
    }

    public async restoreAfterReconnect(): Promise<void> {
        if (!this.client || this.roomId <= 0) return;
        const generation = this.generation;
        const snapshot = await this.dispatch('state', {}, this.findLocalSeat() >= 0 ? this.findLocalSeat() : 0);
        this.assertCurrent(generation);
        await this.applySnapshot(snapshot);
    }

    public destroy(): void {
        this.generation += 1;
        this.commonMountedView = null;
        this.client?.close();
        this.client = null;
        this.snapshot = null;
        this.roomId = 0;
        this.gameCode = '';
        this.playVersion = '';
        this.sequence = 0;
        this.roomRuleVisible = false;
    }

    private async run(action: string): Promise<void> {
        const client = this.client;
        if (!client) throw new Error('[mahjong-catalog] runtime is not connected');
        const snapshot = await this.dispatch(action, {}, this.findLocalSeat());
        await this.applySnapshot(snapshot);
    }

    private async dispatch(action: string, payload: Readonly<Record<string, unknown>>, seatId: number): Promise<MahjongSnapshot> {
        if (!this.client || seatId < 0) throw new Error('[mahjong-catalog] local player is not seated');
        const raw = await this.client.request<unknown>(`mahjong.${this.gameCode}.dispatch`, {
            roomId: this.roomId,
            playVersion: this.playVersion,
            roundNo: this.roundNumber(this.snapshot),
            sequence: ++this.sequence,
            seatId,
            action,
            payload: Object.freeze({ ...payload }),
        });
        return this.parseSnapshot(raw);
    }

    private async accept(raw: unknown): Promise<void> {
        try {
            const snapshot = this.parseSnapshot(raw);
            if (this.snapshot && this.stateVersion(snapshot) < this.stateVersion(this.snapshot)) return;
            await this.applySnapshot(snapshot);
        } catch (error) {
            console.error('[mahjong-catalog] state push ignored', error);
        }
    }

    private async applySnapshot(snapshot: MahjongSnapshot): Promise<void> {
        this.snapshot = snapshot;
        this.publishCommonRoomSeats(snapshot);
        this.renderCommonRoomChrome();
    }

    private publishCommonRoomSeats(snapshot: MahjongSnapshot): void {
        if (!this.client) return;
        const rawSeats = snapshot.seats;
        const source = rawSeats && typeof rawSeats === 'object' ? rawSeats as Record<string, unknown> : {};
        const configured = Number(this.rules(snapshot).playerNum ?? this.rules(snapshot).playerCount ?? 0);
        const seatIds = Object.keys(source).map(Number).filter(Number.isSafeInteger);
        const seatCount = [2, 3, 4].includes(configured) ? configured : Math.max(2, ...seatIds.map(seat => seat + 1));
        if (seatCount > 4) throw new Error('[mahjong-catalog] public seat count exceeds Mahjong limit');
        const localSeatId = this.findLocalSeat(snapshot);
        const seats = Array.from({ length: seatCount }, (_, seatId) => {
            const raw = source[String(seatId)];
            const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
            const playerId = Number(item.playerId ?? 0);
            if (!Number.isSafeInteger(playerId) || playerId <= 0) return Object.freeze({ seatId, occupied: false });
            const name = String(item.displayName ?? item.name ?? '').trim();
            const avatarUrl = String(item.avatarUrl ?? '').trim();
            const score = item.score ?? item.totalScore;
            return Object.freeze({ seatId, occupied: true, playerId,
                ...(name ? { displayName: name } : {}),
                ...(avatarUrl ? { avatarUrl } : {}),
                ...(typeof score === 'number' || typeof score === 'string' ? { score } : {}),
            });
        });
        ProtocolClient.publishCommonRoomSnapshot(this.roomId, Object.freeze({
            seatCount, localSeatId, seats: Object.freeze(seats),
        }), Object.freeze({ stateVersion: this.stateVersion(snapshot), roundNo: this.roundNumber(snapshot) }));
    }

    private renderCommonRoomChrome(): void {
        const view = this.commonMountedView;
        const snapshot = this.snapshot;
        if (!view || !snapshot) return;
        view.setLabel('RoomInfo/Lb_RoomId', `房间号：${this.roomId}`);
        view.setLabel('RoomInfo/Lb_Round', `第${this.roundNumber(snapshot) || 0}/0局`);
        const localSeat = this.findLocalSeat(snapshot);
        const readySeats = this.numberList(snapshot.readySeats);
        const started = Boolean(snapshot.started) || String(snapshot.phase ?? '').toUpperCase() === 'PLAYING';
        view.setWaitingActions(localSeat >= 0 && !started && !readySeats.includes(localSeat), false);
    }

    private async toggleRoomRule(): Promise<void> {
        const view = this.commonMountedView;
        if (!view) throw new Error('[mahjong-catalog] CommonRoom is not mounted');
        const rules = this.rules(this.snapshot);
        const nextVisible = !this.roomRuleVisible;
        if (nextVisible) {
            const text = Object.entries(rules).map(([key, value]) =>
                `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join('\n');
            view.setLabel('RulePanel/Label', text || '当前玩法规则由服务器权威配置');
        }
        view.setVisible('RulePanel', nextVisible);
        this.roomRuleVisible = nextVisible;
    }

    private findLocalSeat(snapshot = this.snapshot): number {
        const rawSeats = snapshot?.seats;
        if (!rawSeats || typeof rawSeats !== 'object') return -1;
        for (const [rawSeat, raw] of Object.entries(rawSeats as Record<string, unknown>)) {
            if (!raw || typeof raw !== 'object') continue;
            if (Number((raw as Record<string, unknown>).playerId) === this.options.accountId) return Number(rawSeat);
        }
        return -1;
    }

    private parseSnapshot(raw: unknown): MahjongSnapshot {
        let value = raw;
        for (let depth = 0; depth < 3; depth += 1) {
            if (!value || typeof value !== 'object') break;
            const record = value as Record<string, unknown>;
            if (typeof record.gameCode === 'string' && record.seats !== undefined) break;
            const nested = record.payload ?? record.body;
            if (!nested || typeof nested !== 'object') break;
            value = nested;
        }
        if (!value || typeof value !== 'object') throw new Error('[mahjong-catalog] authority snapshot is missing');
        const snapshot = value as MahjongSnapshot;
        if (Number(snapshot.roomId) !== this.roomId || String(snapshot.gameCode ?? '').toLowerCase() !== this.gameCode
            || !Number.isSafeInteger(this.stateVersion(snapshot)) || !snapshot.seats || typeof snapshot.seats !== 'object') {
            throw new Error('[mahjong-catalog] authority snapshot identity mismatch');
        }
        return snapshot;
    }

    private rules(snapshot: MahjongSnapshot | null): Record<string, unknown> {
        const value = snapshot?.createRules;
        return value && typeof value === 'object' ? value as Record<string, unknown> : {};
    }

    private stateVersion(snapshot: MahjongSnapshot | null): number {
        const value = Number(snapshot?.stateVersion ?? 0);
        return Number.isSafeInteger(value) && value >= 0 ? value : -1;
    }

    private roundNumber(snapshot: MahjongSnapshot | null): number {
        const value = Number(snapshot?.roundNo ?? snapshot?.round ?? 0);
        return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }

    private numberList(value: unknown): number[] {
        return Array.isArray(value) ? value.map(Number).filter(Number.isSafeInteger) : [];
    }

    private assertCurrent(generation: number): void {
        if (generation !== this.generation) throw new Error('[mahjong-catalog] runtime entry superseded');
    }
}

export function createMahjongCatalogRuntimeEntry(options: MahjongCatalogRuntimeEntryOptions): GameRuntimeEntry {
    return new MahjongCatalogRuntimeEntry(options);
}
