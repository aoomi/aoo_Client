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

test('PDK room social buttons open canonical shared prefabs', () => {
    const play = read(asset('Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'));
    const switcher = read(asset('Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'));
    const registry = read(asset('Common/Code/Runtime/ui/CommonPrefabRegistry.ts'));
    assert.match(play, /CommonRoomNodePath\.chatButton, this\.capabilities\?\.supportsChat === true, this\.openChat/);
    assert.match(play, /CommonRoomNodePath\.voiceButton, this\.capabilities\?\.supportsVoice === true, this\.openVoice/);
    assert.match(play, /CommonRoomNodePath\.settingsButton, this\.capabilities\?\.supportsSettings === true, this\.openSettings/);
    assert.match(switcher, /CommonPdkChatController\.formKey/);
    assert.match(switcher, /CommonPdkVoiceController\.formKey/);
    assert.match(registry, /ChatPanel: \{ bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab\/ChatPanel' \}/);
    assert.match(registry, /VoiceRecordingPanel: \{ bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab\/VoiceRecordingPanel' \}/);
    assert.match(registry, /SettingsPanel: \{ bundle: COMMON_ASSET_BUNDLE, asset: 'SettingsPanel' \}/);
});

test('every occupied avatar opens MagicPanel and self selection broadcasts', () => {
    const play = read(asset('Games/Poker/PDK/Common/Code/Runtime/CommonPdkPlayController.ts'));
    const panel = read(asset('Games/Poker/PDK/Common/Code/Runtime/MagicExpressionPanelController.ts'));
    const seats = read(asset('Games/Poker/PDK/Common/Code/Runtime/Room/SeatPresenter.ts'));
    const registry = read(asset('Common/Code/Runtime/ui/CommonPrefabRegistry.ts'));
    const names = nodeNames(asset('Games/Common/Prefab/MagicPanel.prefab'));
    assert.match(play, /new SeatPresenter\(form\.node, \(targetSeat\) => this\.openMagicExpression\(targetSeat\)\)/);
    assert.match(seats, /new Node\('HeadButton'\)/);
    assert.match(seats, /headButton\.addComponent\(UITransform\)\.setContentSize/);
    assert.match(seats, /headButton\.on\(Button\.EventType\.CLICK/);
    assert.match(panel, /this\.bindIfPresent\('Popup\/Close'/);
    assert.match(panel, /this\.node\('MagicList'\)\?\.children/);
    assert.match(panel, /if \(!button\) return/);
    assert.match(panel, /sendMagicExpressionToAll\(expressionId\)/);
    assert.match(registry, /MagicExpressionPanel: \{ bundle: COMMON_PREFAB_BUNDLE, asset: 'Prefab\/MagicPanel' \}/);
    for (const name of ['MagicPanel', 'MagicList', 'Magic01', 'Magic15']) {
        assert.ok(names.includes(name), `missing magic panel node ${name}`);
    }
});

test('shared settings panel owns semantic nodes and common preference bindings', () => {
    const switcher = read(asset('Games/Poker/PDK/Common/Code/Runtime/CommonPdkSwitchCoordinator.ts'));
    const controller = read(asset('Common/Code/UI/CommonSettingsController.ts'));
    const names = nodeNames(asset('Common/Prefab/SettingsPanel.prefab'));
    assert.match(switcher, /new CommonSettingsController/);
    assert.match(switcher, /COMMON_SETTINGS_FORM/);
    assert.match(controller, /BackMusic/);
    assert.match(controller, /SpSound/);
    assert.match(controller, /BackVolume/);
    assert.match(controller, /SpVolume/);
    for (const name of ['SettingsPanel', 'CloseButton', 'CategoryTabs', 'GeneralSettings', 'PokerSettings']) {
        assert.ok(names.includes(name), `missing settings node ${name}`);
    }
    for (const legacy of ['Set', 'btn_close', 'sp_setting', 'commo', 'pokerset', 'majiangset', 'changpai']) {
        assert.equal(names.includes(legacy), false, `legacy settings node remains: ${legacy}`);
    }
});

test('shared chat and voice prefabs use canonical files and semantic node names', () => {
    const directory = asset('Games/Common/Prefab');
    const chatNames = nodeNames(path.join(directory, 'ChatPanel.prefab'));
    const voiceNames = nodeNames(path.join(directory, 'VoiceRecordingPanel.prefab'));
    assert.equal(fs.existsSync(asset('Games/Common/Prefab/cha t.prefab')), false);
    assert.equal(fs.existsSync(asset('Games/Common/Prefab/Audio.prefab')), false);
    assert.equal(fs.existsSync(path.join(directory, 'ChatExpressionPanel.prefab')), false);
    for (const name of [
        'ChatPanel', 'Popup', 'MessageComposer', 'MessageInput', 'EmojiGrid',
        'Emoji01', 'Emoji20', 'QuickTextPanel', 'QuickTextList', 'QuickText01', 'SendButton',
    ]) {
        assert.ok(chatNames.includes(name), `missing chat node ${name}`);
    }
    for (const name of ['VoiceRecordingPanel', 'Backdrop', 'VoiceLevel01', 'VoiceLevel04', 'DurationLabel']) {
        assert.ok(voiceNames.includes(name), `missing voice node ${name}`);
    }
});

test('shared chat controller binds all send modes and right-edge transitions', () => {
    const controller = read(asset('Games/Poker/PDK/Common/Code/Runtime/CommonPdkChatController.ts'));
    const formManager = read(asset('Common/Code/Runtime/ui/LegacyFormManager.ts'));
    const runtime = read(asset('Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntime.ts'));
    assert.match(controller, /index <= 20/);
    assert.match(controller, /Popup\/SendButton/);
    assert.match(controller, /Popup\/MessageComposer\/MessageInput/);
    assert.match(controller, /sendQuickText/);
    assert.match(controller, /sendChatText/);
    assert.match(controller, /sendEmoji/);
    assert.match(controller, /sineOut/);
    assert.match(controller, /sineIn/);
    assert.doesNotMatch(controller, /Widget|updateAlignment/);
    assert.match(controller, /\['Popup', 'EmojiGrid', 'QuickTextPanel'\]/);
    assert.match(controller, /target === this\.form\?\.node/);
    assert.match(formManager, /if \(path === 'room\/ChatPanel'\) return;/);
    assert.match(runtime, /event === 'common\.room\.dispatch'/);
    assert.match(runtime, /this\.client\.request<unknown>\(event, \{ \.\.\.authorityBody, action: command \}\)/);
});

test('emoji display uses the authoritative shared Spine animations', () => {
    const controller = read(asset('Common/Code/UI/CommonHeadController.ts'));
    const seats = read(asset('Games/Poker/PDK/Common/Code/Runtime/Room/SeatPresenter.ts'));
    const bundleMeta = JSON.parse(read(asset('Games/Common/Spine/Emoji.meta')));
    const spine = JSON.parse(read(asset('Games/Common/Spine/Emoji/emoji_super.json')));
    assert.equal(bundleMeta.userData.isBundle, true);
    assert.equal(bundleMeta.userData.bundleName, 'games-common-emoji-spine');
    assert.match(controller, /bundle\.load\('emoji_super', sp\.SkeletonData/);
    assert.match(controller, /skeleton\.setAnimation\(0, `emoji_\$\{emojiId\}`, false\)/);
    assert.doesNotMatch(seats.match(/private applyHeadState[\s\S]*?private displayName/)?.[0] ?? '', /hideTransientEffects/);
    assert.match(seats, /previousPlayerId !== undefined && previousPlayerId !== playerId/);
    for (let index = 1; index <= 20; index += 1) {
        assert.ok(spine.animations[`emoji_${index}`], `missing Spine animation emoji_${index}`);
    }
});
