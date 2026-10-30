import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const roomView = readFileSync(new URL('../../assets/Games/Mahjong/Chengdu1001/Chengdu1001RoomView.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../../assets/Games/Mahjong/Chengdu1001/Chengdu1001RuntimeEntry.ts', import.meta.url), 'utf8');
const settlement = readFileSync(new URL('../../assets/Games/Mahjong/Chengdu1001/Chengdu1001SmallSettlementAdapter.ts', import.meta.url), 'utf8');

test('CD101 exposes one CommonRoom binding and leaves install destroy to the shared bootstrap', () => {
    assert.match(runtime, /public commonRoomPorts\(\): CommonRoomFeaturePorts/);
    assert.match(runtime, /settlementHistoryRenderer:/);
    assert.match(runtime, /settlementHistoryFeed:/);
    assert.match(runtime, /mounted:/);
    assert.match(runtime, /openRoomRule:/);
    assert.doesNotMatch(runtime, /CommonRoomRuntimeBinding|CommonRoomRuntimePorts|commonRoomBinding/);
    assert.doesNotMatch(runtime, /new CommonRoom(Capability|Social|Chat|Voice)Controller|new RoomSettlementHistory\(/);
    assert.doesNotMatch(runtime, /installCommonRoomCapabilities|\.listen\(event\)|commonRoomBinding/);
    assert.doesNotMatch(roomView, /CommonRoomCapabilityController|installCommonCapabilities|commonCapabilities/);
});

test('CD101 adapts semantic chat and voice commands without copying public controller logic', () => {
    assert.match(runtime, /voicePort\?: Chengdu1001VoicePort/);
    assert.match(runtime, /voiceCapture:/);
    assert.match(runtime, /this\.voicePort\?\.play/);
    assert.doesNotMatch(runtime, /common\.room\.dispatch|command === 'chat\.(text|quick|expression)'/);
    assert.doesNotMatch(runtime, /CommonPdk(Chat|Voice|Social)Controller/);
});

test('CD101 records opaque authoritative round payloads and keeps Mahjong rendering local', () => {
    assert.match(runtime, /recordCommonRoomHistory\(\{/);
    assert.match(runtime, /payload: roundSettlement/);
    assert.match(runtime, /this\.smallSettlement\.render\(latest\)/);
    assert.match(settlement, /scoreDelta: number/);
    assert.match(settlement, /detailLines: readonly string\[\]/);
    assert.doesNotMatch(runtime, /remainingCards|specialCardType|replayCode/);
});

test('CD101 projects authoritative player count local seat and public players to SeatHost', () => {
    assert.match(runtime, /snapshot\.createRules\?\.(playerCount|playerNum)/);
    assert.match(runtime, /localSeatId = this\.findLocalSeat\(snapshot\)/);
    assert.match(runtime, /Array\.from\(\{ length: seatCount \}/);
    assert.match(runtime, /displayName,/);
    assert.match(runtime, /\.\.\.\(avatarUrl \? \{ avatarUrl \}/);
    assert.doesNotMatch(roomView, /requireNode\(player, 'Head'\)/);
    assert.doesNotMatch(roomView, /\['Head', 'PutCard'/);
});

test('CD101 supplies subscriptions and window ports while Common owns their lifecycle', () => {
    assert.match(runtime, /settlementHistoryFeed:/);
    assert.match(runtime, /settlementHistoryRenderer:/);
    assert.match(runtime, /waitingActions:/);
    assert.match(runtime, /mounted:/);
    assert.match(runtime, /voiceCapture: \{/);
});
