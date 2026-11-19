import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const sourceUrl = new URL('../../assets/Games/Common/Code/Runtime/GameRuntimeEntry.ts', import.meta.url);
const source = ts.transpileModule(await readFile(sourceUrl, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseCommonRoomPublicView } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const occupied = seatId => ({ seatId, occupied: true, playerId: seatId + 11 });
const vacant = seatId => ({ seatId, occupied: false });

test('strict public view accepts seated and spectator snapshots from 2 through 10', () => {
    for (let seatCount = 2; seatCount <= 10; seatCount += 1) {
        const seats = Array.from({ length: seatCount }, (_, seatId) => seatId === 0 ? occupied(seatId) : vacant(seatId));
        assert.equal(parseCommonRoomPublicView({ seatCount, localSeatId: 0, seats }).seats.length, seatCount);
        assert.equal(parseCommonRoomPublicView({ seatCount, localSeatId: -1, seats }).localSeatId, -1);
    }
});

test('strict public view rejects missing duplicate out-of-range and spectator conflicts', () => {
    assert.throws(() => parseCommonRoomPublicView({ seatCount: 2, localSeatId: 0, seats: [occupied(0)] }), /INCOMPLETE/);
    assert.throws(() => parseCommonRoomPublicView({ seatCount: 2, localSeatId: 0, seats: [occupied(0), vacant(0)] }), /SEAT_ID/);
    assert.throws(() => parseCommonRoomPublicView({ seatCount: 2, localSeatId: 0, seats: [occupied(0), vacant(2)] }), /SEAT_ID/);
    assert.throws(() => parseCommonRoomPublicView({ seatCount: 2, localSeatId: -2, seats: [occupied(0), vacant(1)] }), /LOCAL_SEAT/);
    assert.throws(() => parseCommonRoomPublicView({ seatCount: 2, localSeatId: 1, seats: [occupied(0), vacant(1)] }), /LOCAL_SEAT_VACANT/);
});

test('vacant seats cannot expose identity or score and occupied seats require player identity', () => {
    assert.throws(() => parseCommonRoomPublicView({ seatCount: 2, localSeatId: -1,
        seats: [{ ...vacant(0), displayName: 'ghost' }, vacant(1)] }), /VACANT_IDENTITY/);
    assert.throws(() => parseCommonRoomPublicView({ seatCount: 2, localSeatId: -1,
        seats: [{ seatId: 0, occupied: true }, vacant(1)] }), /PLAYER_ID/);
});
