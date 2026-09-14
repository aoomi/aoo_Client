import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(new URL('../../../assets/Games/LongCard/Common/Code/ZigongLongCardAdapters.ts', import.meta.url));
const source = await readFile(adapterPath, 'utf8');

test('ZGDSS has a distinct concrete adapter, route and FAN intent', () => {
    assert.match(source, /class ZgdssGameplayAdapter/);
    assert.match(source, /super\(wire, roomId, 'zgdss', rules\)/);
    assert.match(source, /fan\(seatId: number\) \{ return this\.operate\(seatId, 125\); \}/);
    assert.match(source, /connect\(onSnapshot:/);
    assert.match(source, /state\(seatId = 0\)/);
});

test('ZGDSS carries exact legacy room-rule selections and keeps snapshots opaque', () => {
    for (const field of ['fanshushangxian', 'chaofanjiadi', 'laizishuliang']) {
        assert.match(source, new RegExp(field));
    }
    assert.match(source, /laizishuliang: 0 \| 1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 7 \| 8/);
    assert.match(source, /readonly \[field: string\]: unknown/);
    assert.doesNotMatch(source, /calculateScore|isLegalMove|resolveWinner/);
});

test('ZGDSS covers join, ready, start, operation and reconnect state commands', () => {
    for (const action of ["'state'", "'join'", "'ready'", "'start'", "'operation'"]) {
        assert.match(source, new RegExp(action));
    }
    for (const method of ['discard', 'fan', 'chi', 'peng', 'steal', 'ba', 'call', 'hu', 'pass']) {
        assert.match(source, new RegExp(`${method}\\(seatId:`));
    }
});
