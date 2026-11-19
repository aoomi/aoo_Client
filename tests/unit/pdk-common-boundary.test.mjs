import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const coordinator = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts');
const adapter = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkCompatibilityShellAdapter.ts');
const admission = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkCompatibilityAdmission.ts');
const runtime = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkRuntime.ts');
const roomManager = read('assets/Games/Poker/PDK/Common/Code/Runtime/model/PdkRoomManager.ts');
const playController = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkPlayController.ts');
const seats = read('assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkSeatPresenter.ts');
const commonEntry = read('assets/Games/Common/Code/Runtime/GameRuntimeEntry.ts');
const commonEntries = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
const commonCapability = read('assets/Games/Common/Code/Room/CommonRoomCapabilityController.ts');

test('PDK current path never owns CommonRoom shell repair', () => {
    assert.match(coordinator, /PdkCompatibilityShellAdapter/);
    assert.match(coordinator, /isLegacyCompatibilityTicket\(this\.sourceTicket\)/);
    assert.match(coordinator, /production-path-no-shell-repair/);
    assert.doesNotMatch(coordinator, /cleanInvalidCommonRoomShell/);
    assert.doesNotMatch(coordinator, /remove-stale-common-room-before-mount/);
    assert.doesNotMatch(coordinator, /action: 'remove-stale-common-room'/);
});

test('compatibility shell adapter is explicitly gated and has no public capability API', () => {
    assert.match(admission, /gameId === 516/);
    assert.match(admission, /compatibilityOnly === true/);
    assert.match(admission, /INVALID_COMPATIBILITY_ENTRY/);
    assert.match(adapter, /markLegacyGameplayRoomRoot/);
    assert.match(adapter, /cleanLegacyCommonRoomShell/);
    assert.match(adapter, /markLegacyGameplayRoomRoot\([\s\S]*?ticket:[\s\S]*?LegacySubgameTicket/);
    assert.match(adapter, /cleanLegacyCommonRoomShell\([\s\S]*?ticket:[\s\S]*?LegacySubgameTicket/);
    assert.match(adapter, /markLegacyGameplayRoomRoot\([\s\S]*?assertLegacyCompatibilityTicket\(ticket\)/);
    assert.match(adapter, /cleanLegacyCommonRoomShell\([\s\S]*?assertLegacyCompatibilityTicket\(ticket\)/);
    assert.match(coordinator, /markLegacyGameplayRoomRoot\(node, this\.sourceTicket\)/);
    assert.match(coordinator, /cleanLegacyCommonRoomShell\(this\.sourceTicket\)/);
    assert.doesNotMatch(adapter, /CommonRoomFeaturePorts|commonRoomPorts|dispatch|Button/);
});

test('current production identities are absent from the compatibility allow-list', () => {
    for (const code of ['CHENGDU2001', 'NEIJIANG2002', 'LIANGSHAN2003', 'FUZHOU2028']) {
        assert.doesNotMatch(admission, new RegExp(`['"]${code}['"]`));
    }
});

test('compatibility admission reaches the legacy mode before canonical PDK validation', async () => {
    const javascript = ts.transpileModule(admission, {
        compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
    const current = code => code === 'chengdu2001';
    assert.deepEqual(module.admitPdkCompatibilityTicket(
        { gameId: 8, gameName: 'CD201' }, current,
    ), { mode: 'compatibility', gameCode: 'cd201' });
    assert.deepEqual(module.admitPdkCompatibilityTicket(
        { gameId: 2001, gameName: 'chengdu2001' }, current,
    ), { mode: 'production', gameCode: 'chengdu2001' });
    assert.deepEqual(module.admitPdkCompatibilityTicket(
        { gameId: 9999, gameName: 'unknown9999' }, current,
    ), { mode: 'rejected', gameCode: 'unknown9999', reason: 'INVALID_PDK_BUSINESS_CODE' });
});

test('coordinator invokes compatibility admission before rejecting canonical business code', () => {
    const admissionCall = coordinator.indexOf('admitPdkCompatibilityTicket(ticket, isPdkBusinessCode)');
    const rejectBranch = coordinator.indexOf("admission.mode === 'rejected'");
    assert.ok(admissionCall >= 0);
    assert.ok(rejectBranch > admissionCall);
    assert.match(coordinator, /if \(compatibilityAdmission\) \{[\s\S]*?assertLegacyCompatibilityTicket\(ticket\)/);
});

test('PDK normal path delegates room mounting and public social/head lifecycle to CommonRoom', () => {
    assert.doesNotMatch(roomManager, /RegNetPack\(/);
    assert.doesNotMatch(roomManager, /ShowForm\(['"]pdk\/PDK_CommonRoom['"]\)/);
    assert.match(roomManager, /applyAuthoritativeRoomSnapshot\(serverPack\)/);
    assert.doesNotMatch(runtime, /pdk_(?:SceneManager|FormManager)/);
    assert.doesNotMatch(runtime, /PDK_CommonRoom/);
    assert.match(runtime, /manager\.applyAuthoritativeRoomSnapshot\(snapshot\)/);
    assert.match(runtime, /this\.options\.onRoomReady\?\.\(this\.room\)/);
    assert.doesNotMatch(playController, /EmojiExpressionPresenter|PdkMagicExpressionPresenter/);
    assert.match(playController, /public async renderHeads\(\): Promise<void> \{\}/);
    assert.doesNotMatch(playController, /showQuickText|showEmoji|showVoice|playMagicExpression/);
    assert.doesNotMatch(playController, /setCommonRoomRoot/);
    assert.doesNotMatch(seats, /CommonHeadController|showQuickText|showEmoji|showVoice|hideEmoji|hideVoice/);
    assert.doesNotMatch(seats, /commonRoomRoot|SeatHost\/.*CommonHead/);
    assert.match(seats, /createSeatEntries/);
    assert.match(seats, /hideReadyStates\(\): void \{\}/);
    assert.doesNotMatch(runtime, /RoomQuickText|RoomVoice|RoomMagicExpression/);
    assert.match(runtime, /CommonRoomState/);
});

test('PDK magic presenter remains absent while Common owns the effect capability', () => {
    assert.doesNotMatch(playController, /PdkMagicExpressionPresenter|EmojiExpressionPresenter/);
    assert.doesNotMatch(runtime, /PdkMagicExpressionPresenter|EmojiExpressionPresenter/);
    assert.equal(fs.existsSync(path.join(root,
        'assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkMagicExpressionPresenter.ts')),
    false);
    assert.equal(fs.existsSync(path.join(root,
        'assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkMagicExpressionPresenter.ts.meta')),
    false);
    assert.match(read('assets/Games/Common/Code/Room/CommonRoomMagicPanelController.ts'), /magic\.expression/);
});

test('PDK/Common menu boundary uses typed semantic capabilities only', () => {
    assert.match(commonEntry, /readonly closeMoreMenu: \(\) => void/);
    assert.match(commonEntry, /readonly setMoreMenuLayout: \(layout: CommonRoomMoreMenuLayout\) => void/);
    assert.match(commonEntries, /this\.capability\.closeMoreMenu\(\)/);
    assert.match(commonEntries, /this\.capability\.setMoreMenuLayout\(layout\)/);
    assert.match(commonCapability, /public closeMoreMenu\(\): void/);
    assert.match(commonCapability, /public setMoreMenuLayout\(layout: CommonRoomMoreMenuLayout\): void/);
    assert.match(commonCapability, /getComponent\(Widget\)/);
    assert.doesNotMatch(playController, /find\(['"]Canvas\/CommonRoom['"]\)/);
    assert.doesNotMatch(playController, /director\.getScene\(\)/);
    assert.doesNotMatch(playController, /Btn\/Btn_More|MoreItems|CardCounter\/MoreMenu/);
    assert.doesNotMatch(playController, /getComponent\(Widget\)/);
    assert.match(playController, /commonRoomMountedView\?\.closeMoreMenu\(\)/);
    assert.match(playController, /view\.setMoreMenuLayout\(\{ x: 600, y: 410, z: 0 \}\)/);
});

test('Common runtime is the sole reconnect recipe owner', () => {
    assert.doesNotMatch(coordinator, /setGameReconnectRecipe\s*\(|setGameRoomReconnectRecipe\s*\(/);
    assert.match(commonEntries, /setGameRoomReconnectRecipe\(roomId, playVersion, refreshRoomConnection\)/);
    assert.match(commonEntries, /if \(reconnectInstalled\) setGameReconnectRecipe\(null\)/);
    assert.match(commonEntries, /clearRoomReconnect\(\);[\s\S]*?setGameRoomReconnectRecipe\(/);
    assert.match(commonEntries, /await orchestrator\.restore\(\)/);
});

test('legacy compatibility remains explicit and fail-closed while reconnect stays Common-owned', async () => {
    const javascript = ts.transpileModule(admission, {
        compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
    const current = code => code === 'chengdu2001';
    assert.deepEqual(module.admitPdkCompatibilityTicket(
        { gameId: 516, gameName: 'legacy516' }, current,
    ), { mode: 'compatibility', gameCode: 'legacy516' });
    assert.deepEqual(module.admitPdkCompatibilityTicket(
        { gameId: 2003, gameName: 'unknown2003' }, current,
    ), { mode: 'rejected', gameCode: 'unknown2003', reason: 'INVALID_PDK_BUSINESS_CODE' });
    assert.deepEqual(module.admitPdkCompatibilityTicket(
        { gameId: 2006, gameName: 'unknown2006' }, current,
    ), { mode: 'rejected', gameCode: 'unknown2006', reason: 'INVALID_PDK_BUSINESS_CODE' });
    assert.doesNotMatch(coordinator, /setGameReconnectRecipe\s*\(|setGameRoomReconnectRecipe\s*\(/);
});

test('reconnect registration and destroy are idempotent at the Common boundary', () => {
    const registerMatches = commonEntries.match(/setGameRoomReconnectRecipe\(/g) ?? [];
    const clearMatches = commonEntries.match(/clearRoomReconnect\(\)/g) ?? [];
    assert.equal(registerMatches.length, 1, 'Common must have one reconnect registration site');
    assert.ok(clearMatches.length >= 3, 'enter failure, replay, and destroy paths must clear the recipe');
    assert.match(commonEntries, /destroy: \(\) => \{[\s\S]*?clearRoomReconnect\(\);[\s\S]*?orchestrator\.destroy\(\)/);
    assert.doesNotMatch(coordinator, /setGameReconnectRecipe\s*\(|setGameRoomReconnectRecipe\s*\(/);
});
