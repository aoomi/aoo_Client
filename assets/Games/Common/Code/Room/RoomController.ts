export interface RoomExitState { cardsDealt?: boolean; phase?: unknown; legacyState?: unknown }

/** Ready and other pre-deal choices never prevent leaving; only an active dealt round does. */
export function canLeaveRoom(state: RoomExitState): boolean {
  if (typeof state.cardsDealt === 'boolean') return !state.cardsDealt;
  const phase = String(state.phase ?? '').trim().toUpperCase();
  if (phase) return !['PLAYING', 'RESPONDING'].includes(phase);
  return Number(state.legacyState ?? 0) !== 1;
}
