import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const contract = read('assets/Games/Common/Code/Runtime/GameRuntimeEntry.ts');
const entries = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');

test('runtime entry exposes strict public views and feature-only ports without gameplay nodes', () => {
    assert.match(contract, /interface CommonRoomFeaturePorts/);
    assert.match(contract, /interface CommonRoomMountedView/);
    assert.match(contract, /readonly mountedRoot\?: Node/);
    assert.match(contract, /readonly mounted\?: \(view: CommonRoomMountedView\)/);
    assert.doesNotMatch(contract, /CommonRoomRuntimeBinding|CommonRoomRuntimePorts|commonRoomBinding/);
    assert.doesNotMatch(contract, /moreButton|chatButton|voiceButton|SeatHost/);
    assert.match(contract, /function parseCommonRoomPublicView/);
});

test('enter success installs once and failure or destroy unbinds once', () => {
    assert.match(entries, /if \(commonRoom \|\| preparedCommonRoom\) return/);
    assert.match(entries, /await orchestrator\.enter\(common, gameplay\)/);
    assert.match(entries, /orchestrator\?\.destroy\(\)/);
    assert.match(entries, /destroy: unbindCommonRoom/);
    assert.match(entries, /if \(this\.installed\) return/);
    assert.match(entries, /if \(this\.destroyed\) return/);
    assert.doesNotMatch(entries, /entry\.commonRoomBinding/);
    assert.doesNotMatch(entries, /COMMON_ROOM_FEATURE_PORTS_REQUIRED/);
    assert.match(entries, /const providedOverrides = entry\.commonRoomPorts\?\.\(\) \?\? null/);
    assert.match(entries, /const overrides: CommonRoomFeaturePorts = providedOverrides \?\? Object\.freeze\(\{\}\)/);
    assert.match(entries, /const session = ProtocolClient\.commonRoomSession\(prepared\.roomId\)/);
    const prepareStart = entries.indexOf('const prepareCommonRoom =');
    const commitStart = entries.indexOf('const commitCommonRoom =');
    const bindStart = entries.indexOf('const bindCommonRoom =');
    assert.ok(prepareStart >= 0 && commitStart > prepareStart && bindStart > commitStart);
    assert.doesNotMatch(entries.slice(prepareStart, commitStart), /mountCommonRoomShellCancellable/);
    assert.match(entries.slice(commitStart, bindStart), /mountCommonRoomShellCancellable\(roomHost, context\?\.signal\)/);
});

test('bootstrap owns shared controllers, history and sanitized diagnostics', () => {
    for (const token of ['CommonRoomSocialController', 'CommonRoomChatController', 'CommonRoomVoiceController', 'RoomSettlementHistory']) {
        assert.match(entries, new RegExp(`new ${token}`));
    }
    assert.match(entries, /settlementHistoryFeed/);
    assert.match(entries, /settlementSource\.subscribe/);
    assert.match(entries, /\[CommonRoomBootstrap\].*stage.*entryId/);
    const lifecycle = entries.slice(entries.indexOf('class CommonRoomRuntimeLifecycle'));
    assert.doesNotMatch(lifecycle, /gameTicket|authorityRoute|remainingCards|replayCode|cardType|fanType|scoreDelta/);
});

test('bootstrap owns one normalized inbound social subscription per canonical event', () => {
    assert.match(contract, /function normalizeCommonRoomSocialEvents/);
    assert.match(contract, /if \(!event\) throw new Error\('COMMON_ROOM_SOCIAL_EVENT_REQUIRED'\)/);
    assert.match(contract, /if \(seen\.has\(event\)\) continue/);
    assert.match(contract, /return Object\.freeze\(normalized\)/);
    assert.match(entries, /\['room\.quick_text', 'room\.voice', 'room\.magic_expression'\]/);
    assert.doesNotMatch(entries, /social\.listen\([^e]/);
});

test('bootstrap owns the single fail-closed Back lifecycle', () => {
    assert.match(contract, /interface CommonRoomExitPort/);
    assert.match(contract, /readonly request: \(\) => Promise<void>/);
    assert.match(entries, /exit: overrides\.exit \?\? Object\.freeze\(\{ request: \(\) => requestRoomExit\(roomId\) \}\)/);
    assert.match(entries, /getChildByPath\('Btn\/Btn_Back'\)/);
    assert.match(entries, /node\.on\(Button\.EventType\.CLICK, handler, this\)/);
    assert.match(entries, /node\.off\(Button\.EventType\.CLICK, handler, this\)/);
    assert.match(entries, /this\.exitPending \|\| !button\.interactable/);
    assert.match(entries, /this\.ports\.exit\.request\(\)/);
});

test('mounted hook exposes render capabilities without root node or event ownership', () => {
    const view = contract.slice(contract.indexOf('export interface CommonRoomMountedView'),
        contract.indexOf('/** Gameplay exposes authority snapshots'));
    assert.match(view, /setVisible/);
    assert.match(view, /setPosition/);
    assert.match(view, /setLabel/);
    assert.match(view, /setRootLayout/);
    assert.match(view, /setLayer/);
    assert.doesNotMatch(view, /readonly root\b|readonly destroy|\.(on|off)\(|\bemit\(/);
    assert.match(entries, /COMMON_ROOM_MOUNTED_VIEW_DESTROYED/);
    assert.match(entries, /active = false/);
});

test('bootstrap requires a typed gameplay room-rule renderer without owning rule content', () => {
    assert.match(contract, /readonly openRoomRule\?: \(\) => Promise<void>/);
    assert.match(entries, /COMMON_ROOM_RULE_BUTTON_REQUIRED/);
    assert.match(entries, /CardCounter\/MoreMenu\/MoreItems\/Btn_RoomRule/);
    assert.match(entries, /if \(!this\.ports\.openRoomRule\) return/);
    assert.match(entries, /return this\.ports\.openRoomRule!\(\)/);
    assert.doesNotMatch(entries, /RuleDisplay|ruleContent|roomRules/);
});

test('bootstrap combines Common social-media defaults with field-level gameplay overrides', () => {
    const feature = contract.slice(contract.indexOf('export interface CommonRoomFeaturePorts'),
        contract.indexOf('export interface CommonRoomExitPort'));
    for (const field of ['chatWindow', 'voiceCapture', 'voiceWindow']) {
        assert.match(feature, new RegExp(`readonly ${field}\\?:`));
        assert.equal((entries.match(new RegExp(`overrides\\.${field} \\?\\? defaults\\.${field}`, 'g')) ?? []).length, 1);
    }
    for (const difference of ['socialRenderer', 'settlementHistoryRenderer', 'settlementHistoryWindow']) {
        assert.match(feature, new RegExp(`readonly ${difference}\\?:`));
    }
    assert.match(entries, /type ResolvedCommonRoomFeaturePorts = Omit<CommonRoomFeaturePorts/);
    assert.match(entries, /private readonly ports: ResolvedCommonRoomFeaturePorts/);
    assert.doesNotMatch(entries, /as any|as unknown as/);
});

test('registered entries automatically receive the Common shell while real gameplay differences fail closed', () => {
    assert.match(entries, /await orchestrator\.enter\(common, gameplay\)/);
    const prepareStart = entries.indexOf('const prepareCommonRoom =');
    const commitStart = entries.indexOf('const commitCommonRoom =');
    const bindStart = entries.indexOf('const bindCommonRoom =');
    assert.doesNotMatch(entries.slice(prepareStart, commitStart), /mountCommonRoomShellCancellable/);
    assert.match(entries.slice(commitStart, bindStart), /mountCommonRoomShellCancellable\(roomHost, context\?\.signal\)/);
    assert.match(entries, /ProtocolClient\.commonRoomSession\(prepared\.roomId\)/);
    assert.match(entries, /socialRenderer: overrides\.socialRenderer \?\? defaultRenderer/);
    assert.match(entries, /settlementHistoryRenderer: overrides\.settlementHistoryRenderer\s*\?\?\s*\(overrides\.settlementHistoryWindow/);
    assert.match(entries, /new CommonRoomSettlementWindowRenderer/);
    assert.match(entries, /socialRenderer: overrides\.socialRenderer \?\? defaultRenderer/);
    assert.match(entries, /COMMON_ROOM_SETTLEMENT_RENDERER_REQUIRED/);
    assert.doesNotMatch(entries, /entry\.commonRoomBinding\?\.|entry\.commonRoomBinding\(/);
});

test('public defaults and typed overrides have one field-level precedence path', () => {
    for (const field of ['chatWindow', 'voiceCapture', 'voiceWindow', 'exit', 'socialRenderer', 'settlementHistoryRenderer']) {
        assert.equal((entries.match(new RegExp(`${field}:\\s*overrides\\.${field}\\s*\\?\\?`, 'g')) ?? []).length, 1);
    }
    assert.equal((entries.match(/new CommonRoomRuntimeLifecycle\(/g) ?? []).length, 1);
    assert.doesNotMatch(entries, /commonRoomBinding/);
});

test('default factory lifetime is retained through install failure and Common destroy', () => {
    assert.match(entries, /new CommonRoomRuntimeLifecycle\(entry\.id, root, prepared\.ports, session,\s*prepared\.defaults\.destroy/);
    assert.match(entries, /private readonly destroyDefaults: \(\) => void/);
    assert.match(entries, /this\.destroyDefaults\(\);\s*for \(const dispose of this\.disposers\.splice\(0\)\)/);
    assert.match(entries, /defaults\?\.destroy\(\);\s*if \(!overrides\.mountedRoot && root\?\.isValid\) root\.destroy\(\)/);
});

test('Common session acquisition is deferred until after Gameplay commit', () => {
    const prepareStart = entries.indexOf('const prepareCommonRoom =');
    const commitStart = entries.indexOf('const commitCommonRoom =');
    const bindStart = entries.indexOf('const bindCommonRoom =');
    assert.ok(prepareStart >= 0 && commitStart > prepareStart && bindStart > commitStart);
    assert.doesNotMatch(entries.slice(prepareStart, commitStart), /commonRoomSession/);
    assert.match(entries.slice(commitStart, bindStart), /const session = ProtocolClient\.commonRoomSession\(prepared\.roomId\)/);
    assert.match(entries, /let preparedCommonRoom: PreparedCommonRoom \| null = null/);
    assert.match(entries, /preparedCommonRoom = Object\.freeze\(/);
    assert.match(entries, /if \(prepared\) \{\s*prepared\.defaults\.destroy\(\)/);
});

test('Common lifecycle cleanup and fail-closed machine codes remain explicit', () => {
    for (const code of [
        'COMMON_ROOM_PREPARE_REQUIRED',
        'COMMON_ROOM_MOUNTED_ROOT_INVALID',
        'ROOM_ORCHESTRATOR_ABORTED',
        'COMMON_ROOM_RUNTIME_DESTROYED',
    ]) assert.match(entries, new RegExp(code));
    assert.match(entries, /prepared\.defaults\.destroy\(\)/);
    assert.match(entries, /for \(const dispose of this\.disposers\.splice\(0\)\)/);
    assert.match(entries, /if \(this\.destroyed\) return/);
});
