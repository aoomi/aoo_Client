import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../assets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('replay code input uses explicit server resolution and preserves legacy adapter', () => {
    const controller = read('Modules/Records/Code/ReplayCodeController.ts');
    assert.match(controller, /\^\(\?:\\d\{6\}\|\\d\{7\}\|\\d\{8\}\|\\d\{11\}\)\$/);
    assert.match(controller, /resolveReplayCode\(playBackCode\)/);
    assert.match(controller, /resolution\.type === 'SHORT'/);
    assert.match(controller, /resolution\.type !== 'LEGACY_11'/);
    assert.match(controller, /addEventListener\?\.\('paste'/);
    assert.match(controller, /submitting = true/);
    assert.match(controller, /numpadService\.attach\(form\.node/);
});

test('replay code form resolves to the authoritative shared numpad prefab', () => {
    const registry = read('Common/Code/Runtime/ui/ModulePrefabRegistry.ts');
    assert.match(registry, /UIReplayCode:\s*\{\s*bundle:\s*'common',\s*asset:\s*'Prefab\/Numpad'\s*\}/);
});

test('short replay target opens the authoritative single-round player', () => {
    const lobby = read('Lobby/Code/LobbyScreenController.ts');
    assert.match(lobby, /target\.type === 'SHORT'/);
    assert.match(lobby, /forms\?\.show\('pdk\/AuthoritativeReplay'/);
    assert.match(lobby, /roomId: target\.roomId, setId: target\.setId/);
});

test('authoritative replay keeps the selected round terminal cards visible', () => {
    const replay = read('Modules/Records/Code/PdkReplayController.ts');
    assert.match(replay, /const expectedRound = Number\(setId\) \+ 1/);
    assert.match(replay, /Number\(snapshot\.roundNo \?\? expectedRound\) !== expectedRound/);
    assert.match(replay, /if \(this\.isTerminalSnapshot\(snapshot\)\) break/);
    assert.match(replay, /snapshot\.currentTrick\?\.cards, lastPlay\?\.cards/);
    assert.match(replay, /for \(const play of \[\.\.\.history\]\.sort/);
    assert.match(replay, /phase: 'PLAYING'/);
    assert.match(replay, /scheduleStep\(1200\)/);
    assert.doesNotMatch(replay, /setInterval/);
    assert.match(replay, /Players\/Play_\$\{ui\}\/Card\/Out_Card/);
    assert.match(replay, /Players\/Play_0\/Card\/Hand_Cards/);
    assert.doesNotMatch(replay, /Players\/Sp_Seat_/);
    assert.match(replay, /createSeatEntries\(seatEntries\.length, clientSeat\)/);
    assert.match(replay, /changeRound\(-1\)/);
    assert.match(replay, /changeRound\(1\)/);
    assert.match(replay, /出牌时间/);
    assert.match(replay, /new SeatPresenter\(form\.node\)/);
    assert.match(replay, /remainingHand\(snapshot, dataSeat/);
    assert.match(replay, /Card\/Card_Layout/);
    assert.match(replay, /renderTableCards\(snapshot, layout/);
    assert.match(replay, /PdkAnimationResolver/);
    assert.match(replay, /renderTurnCountdown\(snapshot, layout/);
    assert.match(replay, /Players\/Play_\$\{slot\}\/Clock\/Num/);
    assert.match(replay, /addPlayCount\(hand, index\)/);
    assert.match(replay, /PlayCount_\$\{playIndex\}/);
    assert.match(replay, /clearExcept\(parent, \['Count'\]\)/);
});

test('small settlement fetches displays and copies its stable code', () => {
    const result = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts');
    assert.match(result, /this\.viewSetEnd\.replayCode/);
    assert.match(result, /回放码:\$\{replayCode\}/);
    assert.match(result, /loadReplayCode\(roomId, setId\)/);
    assert.match(result, /roundNo - 1/);
    assert.match(result, /Btn_Share', Boolean\(replayCode\)/);
    assert.match(result, /writeClipboard\(replayCode\)/);
    assert.match(result, /target !== this\.viewSetEnd/);
    assert.doesNotMatch(result, /回放码:生成中/);
});

test('settlement resolves the durable round code but never blocks result presentation', () => {
    const coordinator = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts');
    assert.match(coordinator, /payload = await this\.withReplayCode\(payload, roomId, roundNo\);[\s\S]*forms\.show\(this\.smallSettlementForm, payload\)/);
    assert.match(coordinator, /const setId = Math\.max\(0, roundNo - 1\)/);
    assert.match(coordinator, /return \{ \.\.\.payload, replayCode: '', replaySetId: setId \}/);
    assert.doesNotMatch(coordinator, /throw lastError instanceof Error/);
    assert.match(coordinator, /event === 'CommonPdkSetEnd'[\s\S]*showSettlementAfterPresentation\(false, setEnd\)/);
    assert.match(coordinator, /event === 'RoomEnd'[\s\S]*showSettlementAfterPresentation\(false,/);
});

test('terminal round still opens the eighth small settlement before totals', () => {
    const coordinator = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts');
    assert.match(coordinator, /terminal round is still a completed round/);
    assert.doesNotMatch(coordinator, /settlementPresentation === 'FLOATING' && \(matchFinished \|\| finalSettlement\)/);
    assert.match(coordinator, /forms\.show\(this\.smallSettlementForm, payload\)/);
});

test('small settlement keeps global hand boundaries and completed-round pagination', () => {
    const result = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts');
    assert.match(result, /Bottom\/Page\/Label', `\$\{roundNo\}\/\$\{roundLimit\}`/);
    assert.match(result, /PlayedCard_\$\{hand\.playIndex\}_\$\{index\}/);
    assert.match(result, /: order \+ 1/);
    assert.match(result, /this\.sortedCards\(hand\.cards\)/);
    assert.match(result, /Bottom\/Btn\/Btn_Continue', !roomEnded/);
    assert.match(result, /Bottom\/Btn\/Btn_Final', roomEnded/);
    assert.match(result, /if \(this\.matchFinished\(\)\) return;/);
});

test('final settlement receives the exact terminal payload instead of relying on room cache timing', () => {
    const result = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts');
    const coordinator = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts');
    const record = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkRecordController.ts');
    assert.match(result, /forms\.show\(this\.bigSettlementForm, this\.setEnd\)/);
    assert.match(coordinator, /onShow: \(form, roomEnd\)[\s\S]*recordController\?\.onShow\(form, roomEnd\)/);
    assert.match(record, /this\.terminalPayload = this\.record\(roomEnd\)/);
    assert.match(record, /Array\.isArray\(record\.recordPosInfosList\)/);
});

test('terminal small settlement exposes only summary and cannot overlay it with return lobby', () => {
    const result = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts');
    assert.match(result, /Bottom\/Btn\/Btn_Final', roomEnded/);
    assert.match(result, /Bottom\/Btn\/Btn_Return', false/);
    assert.doesNotMatch(result, /Bottom\/Btn\/Btn_Return', roomEnded/);
});

test('record settlement uses explicit history context and shared rule formatting', () => {
    const history = read('Modules/Records/Code/ReplayController.ts');
    const settlementPrefab = read('Games/Poker/PDK/Common/Prefab/SmallSettlement.prefab');
    const club = read('Club/Code/Runtime/LegacyClubRecordListController.ts');
    const formatter = read('Games/Poker/PDK/Common/Code/Rules/PdkRuleSummaryFormatter.ts');
    assert.match(history, /const HISTORY_SMALL_SETTLEMENT = 'history\/poker\/SmallSettlement'/);
    assert.match(history, /historyReplayTarget/);
    assert.match(history, /roundNo - 1/);
    assert.match(history, /this\.textAt\(form\.node, 'Bottom\/Page\/Label', rounds\.length \? `\$\{index \+ 1\}\/\$\{rounds\.length\}`/);
    assert.match(history, /formatPdkRuleSummary\(detail\.ruleSnapshot, detail\.ruleFields\)/);
    assert.match(history, /source: context\.source \?\? 'HALL'/);
    assert.match(history, /const formPath = HISTORY_SMALL_SETTLEMENT/);
    assert.doesNotMatch(history, /settlementTemplateResolver\.resolve/);
    assert.doesNotMatch(history, /registerGamePrefabForm\(formPath/);
    assert.match(history, /this\.active\(form\.node, 'Btn_Return', true\)/);
    assert.match(history, /this\.active\(form\.node, 'Btn_ReturnLobby', false\)/);
    assert.match(history, /this\.historyRoundIndex = 0/);
    assert.match(history, /Bottom\/Page\/Label/);
    assert.match(history, /Bottom\/Bg_Rule\/Label/);
    assert.match(history, /this\.label\(form\.node, 'Lb_PlaybackCode', hasDirectCode/);
    assert.doesNotMatch(history, /this\.label\(form\.node, 'PlaybackCode'/);
    assert.doesNotMatch(settlementPrefab, /回放码:123456/);
    assert.match(settlementPrefab, /回放码:暂不可用/);
    assert.match(club, /emit\('legacy-replay-room'/);
    assert.match(club, /source: 'CLUB'/);
    assert.doesNotMatch(club, /forms\.show\('UILobbyRecordResult'/);
    assert.match(formatter, /fields = Array\.isArray\(schema\)/);
    assert.match(formatter, /field\.visible !== false && !field\.disabled/);
    assert.match(formatter, /labels\.join\(' '\)/);
    assert.doesNotMatch(formatter, /return ['"]规则['"]/);
});

test('record date navigation and big-winner summary use their unique prefab paths', () => {
    const history = read('Modules/Records/Code/ReplayController.ts');
    const recordsPrefab = read('Modules/Records/Prefab/Records.prefab');
    assert.match(history, /DateFilter\/Page\/Date/);
    assert.match(history, /DateFilter\/Lb_Players', `大赢家次数:\$\{bigWinnerCount\}`/);
    assert.match(history, /readonly bigWinnerCount\?: number/);
    assert.doesNotMatch(recordsPrefab, /大赢家次数:1245/);
    assert.match(recordsPrefab, /大赢家次数:0/);
});

test('client always sends an explicit replay lookup mode', () => {
    const gateway = read('Lobby/Code/HallRoomGateway.ts');
    assert.match(gateway, /lookupType: 'REPLAY_CODE'/);
    assert.match(gateway, /replay-codes\/current/);
});
