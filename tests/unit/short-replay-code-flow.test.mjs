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

test('small settlement fetches displays and copies its stable code', () => {
    const result = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts');
    assert.match(result, /this\.setEnd\.replayCode/);
    assert.match(result, /回放码:\$\{this\.replayCode\}/);
    assert.match(result, /loadReplayCode\(roomId, setId\)/);
    assert.match(result, /roundNo - 1/);
    assert.match(result, /Btn_Share', Boolean\(this\.replayCode\)/);
    assert.match(result, /writeClipboard\(this\.replayCode\)/);
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

test('small settlement keeps global hand boundaries and completed-round pagination', () => {
    const result = read('Games/Poker/PDK/Common/Code/Runtime/CommonPdkResultController.ts');
    assert.match(result, /PageLabel', `\$\{roundNo\}\/\$\{roundLimit\}`/);
    assert.match(result, /new Node\(`PlayedHand_\$\{hand\.playIndex\}`\)/);
    assert.match(result, /playIndex: order \+ 1/);
    assert.match(result, /this\.sortedCards\(hand\.cards\)/);
    assert.match(result, /Btn_Continue', !roomEnded/);
    assert.match(result, /Btn_FinalSettlement', roomEnded/);
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
    assert.match(result, /Btn_FinalSettlement', roomEnded/);
    assert.match(result, /Btn_ReturnLobby', false/);
    assert.doesNotMatch(result, /Btn_ReturnLobby', roomEnded/);
});

test('record settlement uses explicit history context and shared rule formatting', () => {
    const history = read('Modules/Records/Code/ReplayController.ts');
    const club = read('Club/Code/Runtime/LegacyClubRecordListController.ts');
    const formatter = read('Games/Poker/PDK/Common/Code/Rules/PdkRuleSummaryFormatter.ts');
    assert.match(history, /const HISTORY_SMALL_SETTLEMENT = 'history\/pdk\/SmallSettlement'/);
    assert.match(history, /historyReplayTarget/);
    assert.match(history, /roundNo - 1/);
    assert.match(history, /PageLabel', rounds\.length \? `\$\{index \+ 1\}\/\$\{rounds\.length\}`/);
    assert.match(history, /formatPdkRuleSummary\(detail\.ruleSnapshot, detail\.ruleFields\)/);
    assert.match(history, /source: context\.source \?\? 'HALL'/);
    assert.match(club, /emit\('legacy-replay-room'/);
    assert.match(club, /source: 'CLUB'/);
    assert.match(formatter, /fields = Array\.isArray\(schema\)/);
    assert.match(formatter, /field\.visible !== false && !field\.disabled/);
    assert.match(formatter, /labels\.join\(' '\)/);
    assert.doesNotMatch(formatter, /return ['"]规则['"]/);
});

test('client always sends an explicit replay lookup mode', () => {
    const gateway = read('Lobby/Code/HallRoomGateway.ts');
    assert.match(gateway, /lookupType: 'REPLAY_CODE'/);
    assert.match(gateway, /replay-codes\/current/);
});
