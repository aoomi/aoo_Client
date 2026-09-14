import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(new URL('../../../assets/Games/LongCard/Common/Code/ZigongLongCardAdapters.ts', import.meta.url));
const source = await readFile(adapterPath, 'utf8');

test('ZGCP has a concrete authoritative adapter and its own route', () => {
    assert.match(source, /class ZgcpGameplayAdapter/);
    assert.match(source, /super\(wire, roomId, 'zgcp', rules\)/);
    assert.match(source, /`longcard\.\$\{this\.code\}\.dispatch`/);
    assert.match(source, /gameCode !== this\.code/);
    assert.match(source, /view\.stateVersion < this\.current\.stateVersion/);
});

test('ZGCP models source-derived room rules without making them gameplay commands', () => {
    for (const field of ['fanshushangxian', 'chaofanjiadi']) assert.match(source, new RegExp(field));
    assert.match(source, /immutableRules\(\): Readonly<Rules>/);
    const sendBody = source.match(/private async send[\s\S]*?return this\.accept\(raw\);/)?.[0] ?? '';
    assert.doesNotMatch(sendBody, /rules:/, 'rules are immutable room creation input, not client-side command authority');
});

test('ZGCP exposes the old gameplay intents but no client scoring or legality engine', () => {
    for (const method of ['piao', 'discard', 'chi', 'peng', 'steal', 'ba', 'call', 'hu', 'pass']) {
        assert.match(source, new RegExp(`${method}\\(seatId:`));
    }
    assert.match(source, /\{ opType, cardID: \[\.\.\.cards\] \}/);
    assert.match(source, /'piao', \{ piaoHua: value \}/);
    assert.doesNotMatch(source, /calculateScore|isLegalMove|resolveWinner/);
});
