import { ProtocolClient } from '../../../../Common/Code/Runtime/network/ProtocolClient';
export interface RoomAuthorityContext { roomId: string; seatId: number; playVersion: string; stateVersion: number }
export interface RoomAuthorityResult { accepted: boolean; stateVersion: number; targetSeatId?: number; authorityCommitted?: boolean }
export interface RoomExitState { cardsDealt?: boolean; phase?: unknown; legacyState?: unknown }

/** Ready and other pre-deal choices never prevent leaving; only an active dealt round does. */
export function canLeaveRoom(state: RoomExitState): boolean {
  if (typeof state.cardsDealt === 'boolean') return !state.cardsDealt;
  const phase = String(state.phase ?? '').trim().toUpperCase();
  if (phase) return !['PLAYING', 'RESPONDING'].includes(phase);
  return Number(state.legacyState ?? 0) !== 1;
}
/** Common V2 room controller. Admin writes have no legacy protocol fallback. */
export class RoomController {
  private commitTail: Promise<void> = Promise.resolve();
  public constructor(private readonly client: ProtocolClient, private context: RoomAuthorityContext) {}
  public updateContext(context: RoomAuthorityContext): void { this.context = context; }
  enter(roomId: string): Promise<unknown> { return this.request('room.join', { roomId: this.text(roomId, 'roomId'), action: 'join' }); }
  state(): Promise<unknown> { return this.request('room.state', { action: 'state' }); }
  exit(): Promise<unknown> { return this.request('room.leave', { action: 'leave' }); }
  ready(ready = true): Promise<RoomAuthorityResult> {
    return this.commit(ready ? 'room.ready' : 'room.unready', { action: ready ? 'ready' : 'unready' });
  }
  start(): Promise<RoomAuthorityResult> { return this.commit('room.start', { action: 'start' }); }
  requestDismiss(): Promise<RoomAuthorityResult> { return this.commit('room.dissolve_apply', { action: 'dissolve_apply' }); }
  voteDismiss(voteId: string, agree: boolean): Promise<RoomAuthorityResult> {
    return this.commit('room.dissolve_vote', { action: 'dissolve_vote', voteId: this.text(voteId, 'voteId'), agree });
  }
  reconnect(lastServerSeq: number, reconnectToken: string): Promise<unknown> {
    if (!Number.isSafeInteger(lastServerSeq) || lastServerSeq < 0) throw new Error('ROOM_RECOVERY_CURSOR_INVALID');
    return this.request('room.reconnect', { action: 'reconnect', lastServerSeq,
      reconnectToken: this.text(reconnectToken, 'reconnectToken'), expectedStateVersion: this.context.stateVersion });
  }
  sendText(quickId: number): Promise<RoomAuthorityResult> {
    return this.commit('room.quick_text', { action: 'quick_text', quickId: this.integer(quickId, 'quickId', 0, 9999) });
  }
  sendVoice(assetId: number): Promise<RoomAuthorityResult> {
    return this.commit('room.voice', { action: 'voice', assetId: this.integer(assetId, 'assetId', 1, Number.MAX_SAFE_INTEGER) });
  }
  sendMagicExpression(expressionId: number, targetSeatId: number): Promise<RoomAuthorityResult> {
    return this.commit('room.magic_expression', { action: 'magic_expression',
      expressionId: this.integer(expressionId, 'expressionId', 1, 9999),
      targetSeatId: this.integer(targetSeatId, 'targetSeatId', 0, 99) });
  }
  invite(): Promise<unknown> { return this.request('room.invite', { action: 'invite' }); }
  updateSettings(settings: Readonly<Record<string, unknown>>): Promise<RoomAuthorityResult> {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).length > 32) {
      throw new Error('ROOM_SETTINGS_INVALID');
    }
    return this.commit('room.settings', { action: 'settings', settings: { ...settings } });
  }
  setTrusteeship(enabled: boolean): Promise<RoomAuthorityResult> {
    return this.commit('room.trustee', { action: 'trustee', enabled });
  }
  heartbeat(): Promise<unknown> { return this.request('room.heartbeat', { action: 'heartbeat' }); }
  async shuffle(): Promise<RoomAuthorityResult> { return this.commit('room.shuffle', { action: 'shuffle' }); }
  async kick(targetSeatId: number): Promise<RoomAuthorityResult> {
    return this.commit('room.kick', { action: 'kick', targetSeatId: this.integer(targetSeatId, 'targetSeatId', 0, 99) });
  }
  private request<T = unknown>(event: string, extra: Record<string, unknown>): Promise<T> {
    const { stateVersion, ...transportIdentity } = this.context;
    return this.client.request<T>(event, { ...transportIdentity, ...extra, expectedStateVersion: stateVersion });
  }
  private commit(event: string, extra: Record<string, unknown>): Promise<RoomAuthorityResult> {
    // Serialize writes so two UI gestures cannot reuse one expectedStateVersion.
    const operation = this.commitTail.then(async () => {
      const result = await this.request<RoomAuthorityResult>(event, extra);
      if (!result.accepted || !Number.isSafeInteger(result.stateVersion) || result.stateVersion <= this.context.stateVersion) {
        throw new Error('ROOM_AUTHORITY_RESULT_INVALID');
      }
      this.context = { ...this.context, stateVersion: result.stateVersion };
      return result;
    });
    this.commitTail = operation.then(() => undefined, () => undefined);
    return operation;
  }
  private text(value: string, field: string): string {
    const normalized = value.trim();
    if (!normalized) throw new Error(`ROOM_${field.toUpperCase()}_INVALID`);
    return normalized;
  }
  private integer(value: number, field: string, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`ROOM_${field.toUpperCase()}_INVALID`);
    return value;
  }
}
