import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const asset = (...parts) => path.join(clientRoot, 'assets', ...parts);
const read = (...parts) => fs.readFileSync(asset(...parts), 'utf8');

test('Common owns every public room capability entry point', () => {
    const lifecycle = read('Games/Common/Code/Runtime/GameRuntimeEntries.ts');
    const capability = read('Games/Common/Code/Room/CommonRoomCapabilityController.ts');
    const magic = read('Games/Common/Code/Room/CommonRoomMagicPanelController.ts');
    const headMount = read('Games/Common/Code/Room/CommonRoomHeadMount.ts');
    const headLease = read('Games/Common/Code/Room/CommonRoomHeadAssetLease.ts');
    assert.match(lifecycle, /new CommonRoomCapabilityController/);
    assert.match(lifecycle, /new CommonRoomMagicPanelController/);
    assert.match(lifecycle, /bindMagicHead/);
    assert.match(capability, /toggleMore/);
    assert.match(capability, /this\.chat\.open\(\)/);
    assert.match(capability, /this\.history\.toggle\(\)/);
    assert.match(magic, /formHost\.show\(MAGIC_PANEL_FORM, targetSeat\)/);
    assert.match(magic, /social\.send\(\s*'magic\.expression'/);
    assert.match(headMount, /export async function mountCommonRoomHead/);
    assert.match(headMount, /export class CommonRoomHeadRenderer/);
    assert.match(headMount, /CommonRoomHeadAssetLease/);
    assert.match(headLease, /public cancel\(\): void/);
    assert.match(headLease, /releaseOnce/);
    assert.match(headMount, /release\(mount: Node\)/);
    assert.match(headMount, /this\.assets\.releaseAll\(\)/);
    assert.match(headMount, /destroy\(\): void/);
    assert.match(headMount, /instantiate\(prefab\)/);
});

test('PDK has no public social, CommonHead, or shell-repair ownership', () => {
    const coordinator = read('Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts');
    assert.doesNotMatch(coordinator, /PdkMagicExpressionPanelController/);
    assert.doesNotMatch(coordinator, /common\.room\.dispatch/);
    assert.doesNotMatch(coordinator, /socialRenderer\s*:/);
    assert.doesNotMatch(coordinator, /new CommonHeadController|instantiate\([^\n]*CommonHead/);
    assert.doesNotMatch(coordinator, /find\(['"]Canvas\/CommonRoom['"]\)/);
    assert.match(coordinator, /production-path-no-shell-repair/);
    assert.match(coordinator, /cleanLegacyCommonRoomShell/);
});

test('Common form host exposes a structural handle for shared windows', () => {
    const mount = read('Games/Common/Code/Room/RoomNetworkControllerMount.ts');
    const lobby = read('Lobby/Code/LobbyScreenController.ts');
    const router = read('Login/Code/Navigation/SceneRouter.ts');
    assert.match(mount, /export interface CommonRoomFormHandle/);
    assert.match(mount, /show: \(path: string, \.\.\.args: readonly unknown\[\]\).*CommonRoomFormHandle/);
    assert.match(lobby, /return forms\.show\(normalized, \.\.\.args\)/);
    assert.match(router, /return forms\.show\(normalized, \.\.\.args\)/);
});

test('PDK gameplay adapters remain available without the deleted public Magic controller', () => {
    const play = read('Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts');
    const runtime = read('Games/Poker/PDK/Common/Code/Runtime/PdkRuntime.ts');
    const seats = read('Games/Poker/PDK/Common/Code/Runtime/Room/PdkSeatPresenter.ts');
    const coordinator = read('Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts');
    const result = read('Games/Poker/PDK/Common/Code/Runtime/PdkResultController.ts');
    const record = read('Games/Poker/PDK/Common/Code/Runtime/PdkRecordController.ts');
    const staleMagic = asset('Games/Poker/PDK/Common/Code/Runtime/PdkMagicExpressionPanelController.ts');
    assert.match(play, /bindCommonRoomMountedView/);
    assert.doesNotMatch(play, /playMagicExpression|EmojiExpressionPresenter|PdkMagicExpressionPresenter/);
    assert.doesNotMatch(runtime, /RoomQuickText|RoomVoice|RoomMagicExpression/);
    assert.doesNotMatch(seats, /CommonHeadController|showQuickText|showEmoji|showVoice/);
    assert.match(result, /recordSettlement/);
    assert.match(result, /CommonRoomHeadPort/);
    assert.match(result, /setCommonRoomPorts/);
    assert.doesNotMatch(result, /mountCommonRoomHead|COMMON_HEAD_ASSET|instantiate\(prefab\)|new CommonHeadController/);
    assert.doesNotMatch(result, /forms\.(show|close)\(this\.smallSettlementForm/);
    assert.match(record, /CommonRoomHeadPort/);
    assert.match(record, /setCommonRoomHeadPort/);
    assert.doesNotMatch(record, /mountCommonRoomHead|COMMON_HEAD_ASSET|instantiate\(prefab\)|new CommonHeadController/);
    assert.doesNotMatch(coordinator, /forms\.(show|close)\(this\.smallSettlementForm/);
    assert.equal(fs.existsSync(staleMagic), false, 'obsolete PDK public Magic controller must be removed');
});

test('Common owns More menu state and layout while PDK consumes semantic ports', () => {
    const commonEntry = read('Games/Common/Code/Runtime/GameRuntimeEntry.ts');
    const commonEntries = read('Games/Common/Code/Runtime/GameRuntimeEntries.ts');
    const capability = read('Games/Common/Code/Room/CommonRoomCapabilityController.ts');
    const play = read('Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts');
    const coordinator = read('Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts');
    assert.match(commonEntry, /CommonRoomMoreMenuLayout/);
    assert.match(commonEntry, /closeMoreMenu/);
    assert.match(commonEntry, /setMoreMenuLayout/);
    assert.match(commonEntries, /closeMoreMenu: \(\): void/);
    assert.match(commonEntries, /setMoreMenuLayout: \(layout(?:\: CommonRoomMoreMenuLayout)?\): void/);
    assert.match(capability, /moreMenu: node\(COMMON_ROOM_PATHS\.moreMenu\)/);
    assert.match(capability, /this\.nodes\.moreItems\?\.isValid/);
    assert.match(capability, /this\.nodes\.moreItems\.active = false/);
    assert.match(capability, /menu\.getComponent\(Widget\)/);
    assert.doesNotMatch(play, /Canvas\/CommonRoom|Btn\/Btn_More|MoreItems|CardCounter\/MoreMenu/);
    assert.doesNotMatch(play, /getComponent\(Widget\)/);
    assert.match(play, /commonRoomMountedView\?\.closeMoreMenu\(\)/);
    assert.match(play, /setMoreMenuLayout/);
    assert.match(coordinator, /playController\?\.closeCommonRoomMoreMenu\(\)/);
});
