import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const common = read('assets/Games/Common/Code/Room/CommonRoomDissolveController.ts');
const protocol = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');
const entry = read('assets/Games/Common/Code/Runtime/GameRuntimeEntry.ts');
const entries = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
const coordinator = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts');
const adapter = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkDissolveController.ts');
const play = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts');
const lifecycle = read('assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkRoomLifecycleController.ts');
const paths = read('assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkRoomNodePaths.ts');

test('Common owns dissolve window lifecycle and canonical wire messages', () => {
    assert.match(common, /COMMON_ROOM_DISSOLVE_FORM/);
    assert.match(common, /session\.dispatch\('dissolve\.request'/);
    assert.match(common, /session\.dispatch\(command/);
    for (const message of ['common.room.dissolve_req', 'common.room.dissolve_agree_req',
        'common.room.dissolve_refuse_req']) assert.match(protocol, new RegExp(message.replaceAll('.', '\\.')));
    assert.doesNotMatch(common, /common\.room\.dissolve_(?:req|agree_req|refuse_req)/);
});

test('PDK dissolve surface is a typed semantic adapter, not a Common UI or wire owner', () => {
    assert.match(entry, /dissolve\?: CommonRoomDissolvePort/);
    assert.match(entries, /new CommonRoomDissolveController/);
    assert.match(coordinator, /new PdkDissolveAdapter/);
    assert.match(coordinator, /commonDissolvePort\(\)/);
    assert.match(adapter, /CommonRoomDissolvePort/);
    assert.match(adapter, /notifyStartVote|notifyVote|notifyRejected|notifyTerminal/);
    for (const source of [adapter, coordinator, play, lifecycle]) {
        assert.doesNotMatch(source, /common\.room\.dissolve_(?:req|agree_req|refuse_req)/);
        assert.doesNotMatch(source, /forms\.register\([^\n]*DISSOLVE_ROOM_FORM/);
        assert.doesNotMatch(source, /room\/DissolveRoom/);
    }
    assert.doesNotMatch(paths, /DISSOLVE_ROOM_FORM|dissolveRoom/);
});

test('Common menu capability binds dissolve through the port and closes More first', () => {
    assert.match(entries, /bindMenuAction\('dissolve'/);
    assert.match(entries, /this\.capability\.closeWindows\(\)/);
    assert.match(entries, /this\.dissolve \? \(\) => this\.dissolve!\.open\(\)/);
    assert.match(coordinator, /menuActions:[\s\S]*dissolve: this\.roomCapabilities\.supportsDissolve/);
    assert.doesNotMatch(play, /Canvas\/CommonRoom|Btn\/Btn_More|MoreItems|CardCounter\/MoreMenu/);
});

test('Dissolve terminal and rejection callbacks remain gameplay callbacks behind the port', () => {
    assert.match(coordinator, /CommonPdk_DissolveRoom[\s\S]*dissolveAdapter\?\.notifyTerminal/);
    assert.match(coordinator, /CommonPdk_StartVoteDissolve[\s\S]*dissolveAdapter\?\.notifyStartVote/);
    assert.match(coordinator, /CommonPdk_DissolveVoteRejected[\s\S]*dissolveAdapter\?\.notifyRejected/);
    assert.match(adapter, /terminal: \(result: unknown\): void => this\.onTerminal\(result\)/);
});
