import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const asset = (...parts) => path.join(clientRoot, 'assets', ...parts);
const read = (file) => fs.readFileSync(file, 'utf8');

function nodeNames(prefabPath) {
    return JSON.parse(read(prefabPath)).filter((entry) => entry?.__type__ === 'cc.Node').map((entry) => entry._name);
}

test('Common owns social prefabs and PDK exposes only gameplay adapters', () => {
    const commonRuntime = read(asset('Games/Common/Code/Runtime/GameRuntimeEntries.ts'));
    const magic = read(asset('Games/Common/Code/Room/CommonRoomMagicPanelController.ts'));
    const social = read(asset('Games/Common/Code/Room/CommonRoomSocialController.ts'));
    const pdk = read(asset('Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts'));
    assert.match(commonRuntime, /CommonRoomMagicPanelController/);
    assert.match(commonRuntime, /room\.magic_expression/);
    assert.match(magic, /formHost\.show\(MAGIC_PANEL_FORM, targetSeat\)/);
    assert.match(magic, /social\.send\(\s*'magic\.expression'/);
    assert.match(social, /command === 'magic\.expression'/);
    assert.doesNotMatch(pdk, /common\.room\.dispatch/);
    assert.doesNotMatch(pdk, /PdkMagicExpressionPanelController/);
    assert.doesNotMatch(pdk, /socialRenderer:/);
});

test('Common owns avatar hit testing and PDK does not bind SeatHost social clicks', () => {
    const commonRuntime = read(asset('Games/Common/Code/Runtime/GameRuntimeEntries.ts'));
    const pdk = read(asset('Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts'));
    assert.match(commonRuntime, /bindMagicHead/);
    assert.match(commonRuntime, /onMagicHeadPointer/);
    assert.doesNotMatch(pdk, /onSeatAvatarTouchEnd/);
    assert.doesNotMatch(pdk, /openMagicPanelForCommonHead/);
});

test('Common chat and canonical public prefabs remain available', () => {
    const controller = read(asset('Games/Common/Code/Room/CommonRoomChatController.ts'));
    const registry = read(asset('Common/Code/Runtime/ui/CommonPrefabRegistry.ts'));
    const names = nodeNames(asset('Games/Common/Prefab/MagicPanel.prefab'));
    assert.match(controller, /sendExpression: identity => this\.send\('chat\.expression'/);
    assert.match(registry, /MagicExpressionPanel: \{ bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab\/MagicPanel' \}/);
    for (const name of ['MagicPanel', 'MagicList', 'Magic01', 'Magic15']) {
        assert.ok(names.includes(name), `missing magic panel node ${name}`);
    }
});

test('PDK still keeps gameplay presentation and Common shell layout port only', () => {
    const play = read(asset('Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts'));
    const runtime = read(asset('Games/Poker/PDK/Common/Code/Runtime/PdkRuntime.ts'));
    const seats = read(asset('Games/Poker/PDK/Common/Code/Runtime/Room/PdkSeatPresenter.ts'));
    const pdk = read(asset('Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts'));
    assert.match(play, /bindCommonRoomMountedView/);
    assert.doesNotMatch(play, /playMagicExpression|EmojiExpressionPresenter|PdkMagicExpressionPresenter/);
    assert.doesNotMatch(runtime, /RoomQuickText|RoomVoice|RoomMagicExpression/);
    assert.doesNotMatch(seats, /CommonHeadController|showQuickText|showEmoji|showVoice/);
    assert.match(pdk, /seatLayout:/);
    assert.match(pdk, /settlementHistoryWindow:/);
    assert.doesNotMatch(pdk, /new CommonHeadController|instantiate\([^\n]*CommonHead/);
});
