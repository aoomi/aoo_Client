import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const history = fs.readFileSync(path.join(root,
    'assets/Games/Common/Code/Room/RoomSettlementHistory.ts'), 'utf8');

test('settlement history deduplicates only opaque authoritative identity', () => {
    assert.match(history, /readonly identity: string/);
    assert.match(history, /readonly payload: unknown/);
    assert.match(history, /if \(this\.identities\.has\(identity\)\) return false/);
    assert.match(history, /this\.entries\.push\(Object\.freeze\(\{ identity, payload: entry\.payload \}\)\)/);
});

test('history window is single instance and supports close reopen and destroy', () => {
    assert.match(history, /if \(this\.openPending\) return this\.openPending/);
    assert.match(history, /public toggle\(\): Promise<void>/);
    assert.match(history, /this\.renderer\.close\(\)/);
    assert.match(history, /this\.renderer\.destroy\(\)/);
    assert.match(history, /this\.openPending = null/);
});

test('common history never owns game settlement fields', () => {
    assert.doesNotMatch(history, /remainingCards|replayCode|cardType|fanType|scoreDelta|winScore|loseScore|PDK|CD101|Mahjong/i);
    assert.doesNotMatch(history, /Games\/Poker|Games\/Mahjong/);
});
