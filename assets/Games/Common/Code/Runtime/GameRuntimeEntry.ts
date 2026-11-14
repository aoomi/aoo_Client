import type { LegacySubgameTicket } from '../../../../Common/Code/Runtime/subgame/AuthoritativeSubgameHandoff';
import type { CommonRoomChatWindowPort } from '../Room/CommonRoomChatController';
import type { CommonRoomSocialRenderer } from '../Room/CommonRoomSocialController';
import type { CommonRoomVoiceCapturePort, CommonRoomVoiceWindowPort } from '../Room/CommonRoomVoiceController';
import type {
    CommonRoomSettlementWindowPort,
    RoomSettlementHistoryFeed,
    RoomSettlementHistoryRenderer,
} from '../Room/RoomSettlementHistory';
import type { CommonRoomSeatSlot } from '../../../../Common/Code/Runtime/state/SeatPerspective';
import type { Node } from 'cc';
import type { CommonRoomDefaultSocialMediaPorts } from '../Room/RoomNetworkControllerMount';
import type { CommonRoomMoreMenuLayout } from '../Room/CommonRoomCapabilityController';
import type { CommonRoomDissolvePort } from '../Room/CommonRoomDissolveController';
import { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';

export interface CommonRoomPublicSeat {
    readonly seatId: number;
    readonly occupied: boolean;
    readonly playerId?: number;
    readonly displayName?: string;
    readonly score?: string | number;
    readonly avatarUrl?: string;
}

export interface CommonRoomPublicView {
    readonly seatCount: number;
    readonly localSeatId: number;
    readonly seats: readonly CommonRoomPublicSeat[];
}

/**
 * The composition root is the only publisher of the shared public-seat
 * contract. Gameplay adapters may provide an authoritative projection, but
 * they must not maintain a second CommonRoom transport or snapshot store.
 */
export function publishCommonRoomPublicView(roomId: number, view: CommonRoomPublicView,
    cursor?: Readonly<{ stateVersion: number; roundNo: number }>): void {
    ProtocolClient.publishCommonRoomSnapshot(roomId, view, cursor);
}

export const COMMON_ROOM_QUICK_TEXTS: Readonly<Record<number, string>> = Object.freeze({
    1: '大家好，很高兴见到各位！', 2: '快点吧，我等得花儿都谢了！',
    3: '不要走，决战到天亮！', 4: '你的牌打得也太好了！',
    5: '和你合作真是太愉快了！', 6: '不好意思，我有事先走了。',
    7: '再见了，我会想念大家的！',
});

/** Gameplay-owned render/media differences only; transport, root and public snapshots belong to Common. */
export interface CommonRoomFeaturePorts {
    /** A scene-switching game may lend its already mounted shell to Common. Common never destroys a lent root. */
    readonly mountedRoot?: Node;
    /** Scene-local UI/media dependencies for a lent root; ordinary games use Common's default factory. */
    readonly mountedRootDefaults?: () => CommonRoomDefaultSocialMediaPorts;
    /** Gameplay-only inbound rendering difference; missing authority fails closed at first inbound event. */
    readonly socialRenderer?: CommonRoomSocialRenderer;
    /** Optional typed gameplay difference; Common supplies the production default. */
    readonly chatWindow?: CommonRoomChatWindowPort;
    /** Optional typed gameplay difference; Common supplies the production default. */
    readonly voiceCapture?: CommonRoomVoiceCapturePort;
    /** Optional typed gameplay difference; Common supplies the production default. */
    readonly voiceWindow?: CommonRoomVoiceWindowPort;
    /** Gameplay-only settlement rendering difference; missing authority fails closed when opened. */
    readonly settlementHistoryRenderer?: RoomSettlementHistoryRenderer;
    /** Gameplay supplies payload preparation; Common owns the form window lifecycle. */
    readonly settlementHistoryWindow?: CommonRoomSettlementWindowPort;
    /** Common-owned buffering, dedupe and subscriptions for authoritative round results. */
    readonly settlementHistoryFeed?: RoomSettlementHistoryFeed;
    /** Gameplay decides stand/leave semantics; Common owns the single Back binding. */
    readonly exit?: CommonRoomExitPort;
    /** Gameplay renders its rules; Common owns the More-menu rule button lifecycle. */
    readonly openRoomRule?: () => Promise<void>;
    /** Gameplay decides ready/start authority; Common owns both waiting-button lifecycles. */
    readonly waitingActions?: CommonRoomWaitingActionsPort;
    /** Existing shell menu actions are bound once by Common; unsupported actions stay hidden. */
    readonly menuActions?: CommonRoomMenuActionsPort;
    /** Optional gameplay-only layout/render adjustment over a capability-limited Common view. */
    readonly mounted?: (view: CommonRoomMountedView) => void | (() => void);
    /** Optional pure-data seat layout difference; Common retains every Node and Head lifecycle. */
    readonly seatLayout?: CommonRoomSeatLayoutPort;
    readonly report?: (error: unknown) => void;
}

export interface CommonRoomSeatLayoutRequest {
    readonly seatCount: number;
    readonly slots: readonly CommonRoomSeatSlot[];
}

export interface CommonRoomSeatPosition {
    readonly slot: CommonRoomSeatSlot;
    readonly x: number;
    readonly y: number;
    readonly z?: number;
}

export type CommonRoomSeatLayoutPort = (
    request: CommonRoomSeatLayoutRequest,
) => readonly CommonRoomSeatPosition[];

export interface CommonRoomExitPort {
    readonly request: () => Promise<void>;
}

export interface CommonRoomWaitingActionsPort {
    readonly ready?: () => Promise<void>;
    readonly start?: () => Promise<void>;
}

export interface CommonRoomMenuActionsPort {
    readonly settings?: () => Promise<void> | void;
    /** Common owns the dissolve form/window/transport; gameplay supplies state and callbacks. */
    readonly dissolve?: CommonRoomDissolvePort;
}

/**
 * Deliberately exposes no Node, event or destroy capability. Gameplay may only
 * adjust its real layout/render differences; Common retains the shell root.
 */
export interface CommonRoomMountedView {
    /** Common owns the WaitingActions nodes; gameplay supplies only authoritative availability. */
    readonly setWaitingActions: (ready: boolean, start: boolean) => void;
    /** Common owns MoreItems state; gameplay may request a semantic close only. */
    readonly closeMoreMenu: () => void;
    /** Common owns MoreMenu Widget/position; gameplay supplies only layout intent. */
    readonly setMoreMenuLayout: (layout: CommonRoomMoreMenuLayout) => void;
    readonly setVisible: (path: string, visible: boolean) => void;
    readonly setPosition: (path: string, x: number, y: number, z?: number) => void;
    readonly setLabel: (path: string, value: string) => void;
    readonly setRootLayout: (width: number, height: number, x?: number, y?: number, z?: number) => void;
    readonly setLayer: (layer: number) => void;
}

export function normalizeCommonRoomSocialEvents(events: readonly string[] = []): readonly string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const value of events) {
        const event = String(value ?? '').trim();
        if (!event) throw new Error('COMMON_ROOM_SOCIAL_EVENT_REQUIRED');
        if (seen.has(event)) continue;
        seen.add(event);
        normalized.push(event);
    }
    return Object.freeze(normalized);
}

/** A feature-owned bridge from an authoritative Hall handoff into one game runtime. */
export interface GameRuntimeEntry {
    readonly id: string;
    readonly canonicalGameCodes: readonly string[];
    readonly families: readonly string[];
    /** Runtime-owned allow-list for the handoff adapter version. */
    supportsPlayVersion?(playVersion: string, handoff: LegacySubgameTicket): boolean;
    preload?(handoff?: LegacySubgameTicket): Promise<void>;
    enter(handoff: LegacySubgameTicket): Promise<void>;
    enterReplay?(handoff: LegacySubgameTicket): Promise<void>;
    /** Only authority-backed gameplay differences; Common installs and owns the shell automatically. */
    commonRoomPorts?(): CommonRoomFeaturePorts | null;
    /** Re-reads the gameplay authority after Common reconnects the room transport. */
    restoreAfterReconnect?(): Promise<void>;
    destroy(): void;
}

export function parseCommonRoomPublicView(value: unknown): CommonRoomPublicView {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('COMMON_ROOM_PUBLIC_VIEW_REQUIRED');
    }
    const source = value as Record<string, unknown>;
    const seatCount = Number(source.seatCount);
    const localSeatId = Number(source.localSeatId);
    if (!Number.isSafeInteger(seatCount) || seatCount < 2 || seatCount > 10) {
        throw new Error('COMMON_ROOM_SEAT_COUNT_INVALID');
    }
    if (!Number.isSafeInteger(localSeatId) || localSeatId < -1 || localSeatId >= seatCount) {
        throw new Error('COMMON_ROOM_LOCAL_SEAT_INVALID');
    }
    if (!Array.isArray(source.seats) || source.seats.length !== seatCount) {
        throw new Error('COMMON_ROOM_SEATS_INCOMPLETE');
    }
    const seen = new Set<number>();
    const seats = source.seats.map(raw => parseCommonRoomPublicSeat(raw, seatCount, seen));
    if (localSeatId >= 0 && !seats.find(seat => seat.seatId === localSeatId)?.occupied) {
        throw new Error('COMMON_ROOM_LOCAL_SEAT_VACANT');
    }
    return Object.freeze({ seatCount, localSeatId, seats: Object.freeze(seats) });
}

function parseCommonRoomPublicSeat(value: unknown, seatCount: number, seen: Set<number>): CommonRoomPublicSeat {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('COMMON_ROOM_SEAT_INVALID');
    }
    const source = value as Record<string, unknown>;
    const seatId = Number(source.seatId);
    if (!Number.isSafeInteger(seatId) || seatId < 0 || seatId >= seatCount || seen.has(seatId)) {
        throw new Error('COMMON_ROOM_SEAT_ID_INVALID');
    }
    seen.add(seatId);
    if (typeof source.occupied !== 'boolean') throw new Error('COMMON_ROOM_SEAT_OCCUPIED_REQUIRED');
    const identityFields = ['playerId', 'displayName', 'avatarUrl', 'score'] as const;
    if (!source.occupied) {
        if (identityFields.some(field => source[field] !== undefined)) throw new Error('COMMON_ROOM_VACANT_IDENTITY');
        return Object.freeze({ seatId, occupied: false });
    }
    const playerId = Number(source.playerId);
    if (!Number.isSafeInteger(playerId) || playerId <= 0) throw new Error('COMMON_ROOM_PLAYER_ID_INVALID');
    const text = (field: 'displayName' | 'avatarUrl'): string | undefined => {
        const raw = source[field];
        if (raw === undefined) return undefined;
        if (typeof raw !== 'string' || !raw.trim()) throw new Error(`COMMON_ROOM_${field.toUpperCase()}_INVALID`);
        return raw.trim();
    };
    const score = source.score;
    if (score !== undefined && typeof score !== 'string' && typeof score !== 'number') {
        throw new Error('COMMON_ROOM_SCORE_INVALID');
    }
    return Object.freeze({ seatId, occupied: true, playerId,
        displayName: text('displayName'), avatarUrl: text('avatarUrl'), score });
}

export function canonicalGameCode(handoff: LegacySubgameTicket): string {
    return String(handoff.gameName ?? '').trim().toUpperCase();
}

export function canonicalGameFamily(handoff: LegacySubgameTicket): string {
    return String(handoff.playFamily ?? '').trim().toLowerCase().replace(/_/g, '-').replace(/:/g, '-');
}
