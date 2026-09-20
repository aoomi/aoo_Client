import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
    '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts',
    import.meta.url,
), 'utf8');
const coordinator = readFileSync(new URL(
    '../../assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts',
    import.meta.url,
), 'utf8');

test('live and restored PDK settlements use the same card-bearing view contract', () => {
    assert.match(source, /entry\.remainingCards/);
    assert.match(source, /entry\.playedCards/);
    assert.match(source, /entry\.playedHands/);
    assert.match(source, /entry\.initialPatterns/);
    assert.match(source, /surplusCardList,/);
    assert.match(source, /playedCardList,/);
    assert.match(source, /specialHandList,/);
    assert.match(source, /playHistory: settlementHistory/);
    assert.doesNotMatch(source, /surplusCardList:\s*Array\.from\([^\n]+=>\s*\[\]\)/);
    assert.doesNotMatch(source, /playedCardList:\s*Array\.from\([^\n]+=>\s*\[\]\)/);
    assert.doesNotMatch(source, /playHistory:\s*\[\]/);
});

test('in-progress round snapshots never become completed settlement pages', () => {
    assert.match(source, /isCompletedSettlement\(this\.setEnd\)/);
    assert.match(source, /if \(!this\.isCompletedSettlement\(this\.viewSetEnd\)\)/);
    assert.match(source, /const latestRound = completedRounds\.at\(-1\)/);
    assert.match(source, /if \(this\.openedFromRoomButton\) return true/);
    assert.match(coordinator, /await this\.settlementHistory\(roomId\)/);
    assert.match(coordinator, /const latest = rounds\.at\(-1\)/);
    assert.match(coordinator, /authorityPhase: 'FINISHED'/);
    assert.doesNotMatch(coordinator, /lastSmallSettlementPayload\s*\?\?\s*this\.runtime\?\.getRoomSet\(\)\.GetRoomSetProperty\('setEnd'\)/);
});

test('restored settlements survive missing live seat cache and preserve per-page metadata', () => {
    assert.match(source, /historicalSeatCount/);
    assert.match(source, /posInfo\[seat\]/);
    assert.match(source, /historicalPlayers = this\.viewSetEnd\.posInfo/);
    assert.match(source, /const target = this\.viewSetEnd/);
    assert.match(source, /target !== this\.viewSetEnd/);
    assert.match(source, /target\.replayCode = code/);
    assert.match(source, /if \(!this\.displayedReplayCode\(\)\) void this\.refreshReplayCode\(\)/);
});
