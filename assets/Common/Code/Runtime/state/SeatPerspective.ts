/**
 * Maps immutable server seat IDs to local presentation slots. This module intentionally
 * contains no room state, so reconnect can rebuild the same mapping from a fresh snapshot.
 */
export const SeatVisualSlot = Object.freeze({
    SELF: 'self', RIGHT: 'right', OPPOSITE: 'opposite', LEFT: 'left', INDEXED: 'indexed',
});

export type CommonRoomSeatSlot = 'self' | 'right' | 'opposite' | 'left' | `indexed:${number}`;

export function commonRoomSeatSlots(playerCount: number): readonly CommonRoomSeatSlot[] {
    if (playerCount === 2) return Object.freeze(['self', 'opposite']);
    if (playerCount === 3) return Object.freeze(['self', 'right', 'left']);
    if (playerCount === 4) return Object.freeze(['self', 'right', 'opposite', 'left']);
    if (Number.isInteger(playerCount) && playerCount >= 5 && playerCount <= 10) {
        return Object.freeze(['self', ...Array.from({ length: playerCount - 1 }, (_, index) => `indexed:${index + 1}` as const)]);
    }
    throw new Error('common room playerCount must be 2..10');
}

export function createSeatPerspective(seatCount: number, localSeatId: number) {
    if (!Number.isInteger(seatCount) || seatCount < 2 || seatCount > 10) throw new Error('seatCount must be 2..10');
    if (!Number.isInteger(localSeatId) || localSeatId < 0 || localSeatId >= seatCount) throw new Error('invalid localSeatId');
    const localIndexOf = (absoluteSeatId: number): number => {
        if (!Number.isInteger(absoluteSeatId) || absoluteSeatId < 0 || absoluteSeatId >= seatCount) throw new Error('invalid absoluteSeatId');
        return (absoluteSeatId - localSeatId + seatCount) % seatCount;
    };
    const absoluteSeatOf = (localIndex: number): number => {
        if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= seatCount) throw new Error('invalid localIndex');
        return (localSeatId + localIndex) % seatCount;
    };
    const visualSlotOf = (absoluteSeatId: number): string => {
        const index = localIndexOf(absoluteSeatId);
        if (index === 0) return SeatVisualSlot.SELF;
        if (seatCount === 2) return SeatVisualSlot.OPPOSITE;
        if (seatCount === 3) return index === 1 ? SeatVisualSlot.RIGHT : SeatVisualSlot.LEFT;
        if (seatCount === 4) return [SeatVisualSlot.SELF, SeatVisualSlot.RIGHT, SeatVisualSlot.OPPOSITE, SeatVisualSlot.LEFT][index];
        return `${SeatVisualSlot.INDEXED}:${index}`;
    };
    return Object.freeze({ seatCount, localSeatId, localIndexOf, absoluteSeatOf, visualSlotOf });
}
