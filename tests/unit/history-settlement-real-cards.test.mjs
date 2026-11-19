import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../assets/Modules/Records/Code/ReplayController.ts', import.meta.url), 'utf8');

test('historical small settlement renders authoritative remaining and played cards', () => {
    assert.match(source, /entry\.remainingCards/);
    assert.match(source, /entry\.playedHands/);
    assert.match(source, /renderHistoryRemainingCards\(item, remaining\)/);
    assert.match(source, /renderHistoryPlayedCards\(item, playedHands\)/);
    assert.match(source, /cumulativeScore\(rounds, index, entry\.playerId\)/);
    assert.match(source, /roundIndex <= index/);
    assert.match(source, /historyCards\.create\(slot, value\)/);
    assert.match(source, /sort\(\(left, right\) => left\.playIndex - right\.playIndex\)/);
    assert.match(source, /HistoryPlayCount_/);
    assert.match(source, /this\.textAt\(form\.node, 'Bottom\/Btn\/Btn_Return\/Label', '返 回'\)/);
    assert.match(source, /Replay chunks are addressed by roomId\/setId/);
});
