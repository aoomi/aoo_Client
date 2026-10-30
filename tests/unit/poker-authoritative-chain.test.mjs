import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = fs.readFileSync(path.join(root,
    'assets/Games/Poker/PDK/Common/Code/Runtime/PdkRuntime.ts'), 'utf8');
const lobby = fs.readFileSync(path.join(root, 'assets/Lobby/Code/LobbyScreenController.ts'), 'utf8');
const manager = fs.readFileSync(path.join(root,
    'assets/Games/Poker/PDK/Common/Code/Runtime/model/PdkRoomManager.ts'), 'utf8');
const adapter = fs.readFileSync(path.join(root,
    'assets/Games/Poker/PDK/Common/Code/Runtime/PdkAuthoritativeViewAdapter.ts'), 'utf8');
const lobbySession = fs.readFileSync(path.join(root,
    'assets/Lobby/Code/LobbySessionService.ts'), 'utf8');
const launcher = fs.readFileSync(path.join(root,
    'assets/Games/Poker/PDK/Common/Code/Runtime/PdkGameSceneLauncher.ts'), 'utf8');
const switchCoordinator = fs.readFileSync(path.join(root,
    'assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts'), 'utf8');
const runtimeCodeRoot = path.join(root, 'assets/Games/Poker/PDK/Common/Code/Runtime');
const pdkPlayController = fs.readFileSync(path.join(runtimeCodeRoot, 'PdkPlayController.ts'), 'utf8');
// PDK now splits input, hinting, table presentation and clock code.  Keep these
// source contracts behavior-focused by inspecting the complete public runtime,
// rather than requiring their implementation to remain in one coordinator file.
const playController = [
    'PdkHandInputController.ts', 'PdkHintController.ts',
    'PdkTablePresentationController.ts', 'PdkTurnClockController.ts',
].map((file) => fs.readFileSync(path.join(runtimeCodeRoot, file), 'utf8').replaceAll('this.host.', 'this.'))
    .concat(pdkPlayController)
    .join('\n');
const cardPresenter = fs.readFileSync(path.join(root,
    'assets/Games/Poker/PDK/Common/Code/Runtime/Room/PdkCardPresenter.ts'), 'utf8');
const hintSorter = fs.readFileSync(path.join(root,
    'assets/Games/Poker/PDK/Common/Code/Runtime/logic/PdkHintSorter.ts'), 'utf8');
const recordController = fs.readFileSync(path.join(root,
    'assets/Games/Poker/PDK/Common/Code/Runtime/PdkRecordController.ts'), 'utf8');
const commonHeadMount = fs.readFileSync(path.join(root,
    'assets/Games/Common/Code/Room/CommonRoomHeadMount.ts'), 'utf8');
const commonSettlement = fs.readFileSync(path.join(root,
    'assets/Games/Common/Code/Room/RoomSettlementHistory.ts'), 'utf8');
const legacyFormManager = fs.readFileSync(path.join(root,
    'assets/Common/Code/Runtime/ui/LegacyFormManager.ts'), 'utf8');
const gameRoom2D = JSON.parse(fs.readFileSync(path.join(root,
    'assets/Games/Common/Scenes/GameRoom2D.scene'), 'utf8'));

test('production lobby imports the single Poker pack implementation', () => {
    assert.match(lobby, /Games\/Poker\/PDK\/Common\/Code\/Runtime\/PdkSwitchCoordinator/);
    assert.doesNotMatch(lobby, /CompatibilityApp\/njpdk\/PdkSwitchCoordinator/);
});

test('poker runtime consumes canonical dispatch payloads and reconnects authoritatively', () => {
    assert.match(runtime, /unwrapDispatchPayload\(packet\)/);
    assert.match(runtime, /client\.onReconnect\(\(\) => this\.restoreRoomAfterReconnect\(\)\)/);
    assert.match(runtime, /'common\.room\.state_req'/);
    assert.doesNotMatch(runtime, /CNJPDKGetRoomInfo/);
    assert.match(runtime, /applyAuthoritativePacket\(packet, true\)/);
    assert.match(runtime, /this\.room\.OnRoomEnd\(roomEnd\)/);
    assert.match(runtime, /client\.on\('common\.room\.state_push'/);
    assert.match(runtime, /private authorityStateFingerprint = ''/);
    assert.match(runtime, /view\.stateVersion < this\.authorityStateVersion/);
    assert.match(runtime, /stateFingerprint === this\.authorityStateFingerprint/);
    assert.match(adapter, /projectPdkAuthoritativeView/);
    assert.match(adapter, /roomID: roomId/);
    assert.match(adapter, /key: roomId/);
    assert.match(adapter, /setCount: roundLimit/);
    assert.match(adapter, /posList/);
    assert.match(adapter, /stateVersion/);
    assert.match(adapter, /shuffleSequence/);
    assert.match(adapter, /legacyPatternOptions\(ruleOptions\)/);
    assert.match(adapter, /CommonPdk 权威牌型配置不完整/);
});

test('play response applies its authority snapshot before resolving the UI action', () => {
    const request = runtime.slice(runtime.indexOf('public request<T'), runtime.indexOf('/** One in-flight request'));
    assert.match(request, /event === 'common\.room\.play_req'[\s\S]*this\.applyAuthoritativePacket\(packet, false\)[\s\S]*this\.unwrapDispatchPayload\(packet\)/);
});

test('game room refresh and transport reconnect both re-enter through Hall for fresh room tickets', () => {
    const gateway = fs.readFileSync(path.join(root, 'assets/Lobby/Code/HallRoomGateway.ts'), 'utf8');
    const switcher = fs.readFileSync(path.join(root,
        'assets/Games/Poker/PDK/Common/Code/Runtime/PdkSwitchCoordinator.ts'), 'utf8');
    const socket = fs.readFileSync(path.join(root,
        'assets/Common/Code/Runtime/network/LegacyWebSocketClient.ts'), 'utf8');
    const ownership = fs.readFileSync(path.join(root,
        'assets/Common/Code/Runtime/network/ConnectionOwnership.ts'), 'utf8');
    assert.match(lobby, /RoomRecoveryStore/);
    assert.match(lobby, /restoreRoomAfterReload\(hallRoomGateway\)/);
    assert.match(lobby, /hallRoomGateway\.join\(intent\.roomId\)/);
    assert.match(lobby, /rememberRoomRecoveryIntent\(handoff\)/);
    assert.match(lobby, /reason !== 'reconnect-room-failed'[\s\S]*clearRoomRecoveryIntent\(\)/);
    assert.match(gateway, /refreshRoomConnection\(roomId: number\)/);
    assert.match(gateway, /\/api\/v2\/hall\/rooms\/\$\{roomId\}/);
    assert.match(gateway, /\/api\/v2\/hall\/rooms\/\$\{roomId\}\/ticket/);
    assert.match(switcher, /await gameClient\.connect\(authorityRoute\)[\s\S]*setGameRoomReconnectRecipe\(roomId, playVersion, this\.refreshRoomConnection\)/);
    assert.match(ownership, /const ticket = await refresh\(roomId\)/);
    assert.match(ownership, /client\.setWsTicket\(ticket\.gameTicket\)/);
    assert.match(ownership, /client\.bindRoomAuthority\(roomId, playVersion\)/);
    assert.match(ownership, /await client\.connect\(ticket\.authorityRoute\)/);
    assert.doesNotMatch(socket, /forceReconnect|queuedRequests|queuedNotifies|private async reconnect/);
});

test('lobby bootstrap does not send the removed player-changed action', () => {
    assert.doesNotMatch(lobbySession, /request<unknown>\('player\.CPlayerChanged'/);
});

test('lobby production capabilities use the short-lived access token', () => {
    assert.match(lobby, /const accessToken = \(\) => this\.account\.accessToken \|\| this\.account\.token/);
    assert.doesNotMatch(lobby, /this\.account\.accountToken/);
});

test('room manager consumes only authoritative room-state callbacks', () => {
    for (const token of ['OnPack_ChangeStatus', 'OnPack_SetEnd', 'OnPack_RoomEnd']) {
        assert.match(manager, new RegExp(token));
    }
    assert.doesNotMatch(manager, /SendReady|SendStartRoomGame|SendOpCard|SendRoomRecord/);
});

test('authoritative room pushes rebuild the visible hand through the public card presenter', () => {
    assert.match(playController, /event === 'CommonPdk_AuthoritativeState'/);
    assert.match(playController, /this\.logic\.InitHandCard\(\)/);
    assert.match(playController, /this\.initializeRemainingCards\(\)/);
    assert.match(playController, /this\.renderHand\(\)/);
    assert.match(playController, /private readonly cards = new PdkCardPresenter\(\)/);
});

test('final-settlement rematch closes through the form manager and releases its modal mask', () => {
    assert.match(recordController, /await this\.runtime\.action\('rematch'/);
    assert.match(recordController, /this\.closeSettlement\(\)/);
    assert.match(recordController, /requestLeave\('record-exit'\)/);
    assert.doesNotMatch(recordController, /requestLeave\('authority-left'\)/);
    assert.doesNotMatch(recordController, /this\.form\.node\.active = false/);
    assert.match(switchCoordinator, /\(\) => this\.forms\.close\(this\.bigSettlementForm\)/);
});

test('overlapping authoritative hand renders cannot append duplicate card nodes', () => {
    assert.match(playController, /const generation = \+\+this\.handRenderGeneration/);
    assert.match(playController, /generation !== this\.handRenderGeneration[\s\S]*card\.destroy\(\)/);
    assert.match(playController, /assertHandNodeInvariant\(parent, hand\.length\)/);
    assert.match(playController, /手牌节点数量失配/);
    assert.match(playController, /createFlyingOverlay\(roomRoot\)/);
    assert.match(cardPresenter, /new Node\('PDK_Flying_Cards_Overlay'\)/);
});

test('final settlement reads the authoritative cumulative room record', () => {
    assert.match(runtime, /this\.room\.OnRoomEnd\(roomEnd\)/);
    assert.match(adapter, /winCount: integer\(seat\.winCount\)/);
    assert.match(adapter, /loseCount: integer\(seat\.loseCount\)/);
    assert.match(adapter, /point: typeof seat\.totalScore/);
    assert.match(recordController, /CommonRoomHeadPort/);
    assert.match(recordController, /headPort\.mount\(mount, 'List'/);
    assert.match(recordController, /controller\.showPlayerAvatar/);
    assert.match(commonHeadMount, /class CommonRoomHeadRenderer/);
    assert.match(commonHeadMount, /mountCommonRoomHead/);
    assert.doesNotMatch(recordController, /AvatarImage|BestWinnerNameLabel|PlayerNameLabel/);
    assert.match(recordController, /BestWinnerScoreLabel/);
});

test('round settlement preserves operation timing and truncates unfinished visual effects', () => {
    const settlement = switchCoordinator.slice(switchCoordinator.indexOf('private async showSettlementAfterPresentation'));
    assert.doesNotMatch(settlement, /\? 2000 : 1000/);
    assert.match(settlement, /waitForTerminalCardHold\(1500\)/);
    assert.match(settlement, /await terminalHold;[\s\S]*truncateRoundEndPresentation\(\)[\s\S]*commonRoomHistory\.requestOpen\('terminal'\)/);
    assert.doesNotMatch(settlement, /forms\.show\(this\.smallSettlementForm/);
    assert.match(commonSettlement, /formHost\.show\(this\.port\.path/);
    assert.doesNotMatch(settlement, /waitForRoundEndPresentation\(\)/);
    assert.match(switchCoordinator, /generation !== this\.settlementPresentationGeneration/);
    assert.match(switchCoordinator, /key === this\.settlementPendingKey \|\| key === this\.settlementShownKey/);
    assert.match(switchCoordinator, /stage: 'opened'/);
});

test('non-popup settlement never opens the blocking small-settlement form', () => {
    assert.match(switchCoordinator, /settlementPresentation === 'FLOATING' && !matchFinished && !finalSettlement/);
    const floating = switchCoordinator.slice(
        switchCoordinator.indexOf("settlementPresentation === 'FLOATING'"),
        switchCoordinator.indexOf('// The terminal round is still a completed round'),
    );
    assert.doesNotMatch(floating, /forms\.show\(this\.smallSettlementForm/);
});

test('settlement authority restores terminal snapshots without replaying presentation', () => {
    assert.match(runtime, /'ROUND_SETTLEMENT', 'INTER_ROUND', 'SETTLED'/);
    assert.match(runtime, /staticRestore: force/);
    assert.match(runtime, /\(force \|\| !previousPhase \|\| previousPhase !== view\.phase\)/);
    assert.match(switchCoordinator, /Boolean\(payload\.matchFinished[\s\S]*GetRoomProperty\('matchFinished'\)\)/);
    assert.match(switchCoordinator, /commonRoomHistory\.requestClose\(\)/);
    assert.match(commonSettlement, /formHost\.close\(this\.port\.path\)/);
    assert.doesNotMatch(switchCoordinator, /forms\.close\(this\.smallSettlementForm\)/);
});

test('settlement presentation consumes the latest complete seat payload and Continue clears the old round', () => {
    assert.match(switchCoordinator, /GetRoomSetProperty\('setEnd'\)[\s\S]*payload = \{ \.\.\.payload, \.\.\.latestSetEnd/);
    assert.match(switchCoordinator, /CommonPdk_PosContinueGame[\s\S]*clearCompletedRound\(\)/);
    assert.match(playController, /public clearCompletedRound\(\): void \{[\s\S]*endRoundPresentation\('CONTINUE'\)[\s\S]*clearHandVisuals\('CONTINUE'\)/);
});

test('round-end settlement failures are surfaced instead of silently dropping the popup', () => {
    assert.match(switchCoordinator, /showSettlementAfterPresentation\(false, setEnd\)\.catch/);
});

test('required opening card feedback names the exact authoritative card', () => {
    assert.match(playController, /必须带\$\{this\.cardDisplayName\(required\)\}牌/);
    assert.match(playController, /1: '方块', 2: '梅花', 3: '红桃', 4: '黑桃'/);
    const play = playController.slice(
        playController.indexOf('private async outCard'),
        playController.indexOf('private selectedIntrinsicType'),
    );
    assert.match(play, /const missingRequiredCard = this\.missingRequiredFirstCard\(values\)/);
    assert.match(play, /reason: 'MISSING_REQUIRED_FIRST_CARD'/);
    assert.ok(
        play.indexOf('missingRequiredFirstCard(values)') < play.indexOf('this.playInFlight = true'),
        'the exact required-card feedback must run before presentation and request state mutate',
    );
    assert.match(playController, /private missingRequiredFirstCard\(cards: readonly number\[\]\): number/);
    assert.doesNotMatch(playController, /必包含\$\{this\.cardDisplayName\(required\)\}/);
});

test('each corrected PDK action gets a fresh client intent idempotency key', () => {
    assert.match(runtime, /private actionAttemptSequence = 0/);
    const action = runtime.slice(runtime.indexOf('public action<T'), runtime.indexOf('public reconcileAuthority'));
    assert.match(action, /const pending = this\.pendingActions\.get\(key\)/);
    assert.match(action, /const requestBody = this\.withActionIdempotency\(body\)/);
    assert.match(action, /this\.request<T>\(event, requestBody\)/);
    assert.match(action, /idempotencyKey: `pdk:\$\{this\.authorityRoomId\}:\$\{this\.options\.playerId\}:\$\{nonce\}`/);
    assert.match(action, /globalThis\.crypto\?\.randomUUID\?\.\(\)/);
});

test('authoritative trick reset destroys every stale table presentation', () => {
    assert.match(adapter, /trickId: integer\(source\.trickId\)/);
    assert.match(adapter, /const trickReset = Boolean\(source\.trickReset\) \|\| !hasCurrentComparison/);
    assert.match(playController, /this\.logic\.ClearCardData\(\)/);
    assert.match(playController, /this\.publicProjectionGeneration \+= 1/);
    assert.match(playController, /this\.flyingOverlay\.destroy\(\)/);
    assert.match(playController, /this\.animations\?\.clear\(\)/);
    assert.match(playController, /this\.cards\.clear\(this\.view\.find\(`Players\/Seat_\$\{slot\}\/Card\/Out_Card`\)\)/);
    assert.match(playController, /projectionGeneration !== this\.publicProjectionGeneration/);
});

test('response hints reject same-type candidates with a different card count', () => {
  assert.match(hintSorter, /targetMatches\(countsOf\(candidate\.cards\), target, rules\)/);
  assert.match(hintSorter, /responseBeatsTarget\(candidate\.cards, rules\)/);
  assert.doesNotMatch(playController, /isAuthorityCompatiblePdkAircraft/);
  assert.match(playController, /pdkOperationTypeForCards\(cards, recognitionRules\)/);
});

test('native PDK room uses the authored GameRoom2D Canvas layout', () => {
    assert.match(launcher, /find\('Canvas', scene\)/);
    assert.doesNotMatch(launcher, /setContentSize|setPosition|Widget|updateAlignment/);
    assert.ok(gameRoom2D.some(entry => entry.__type__ === 'cc.Node' && entry._name === 'TableLayer'));
  const canvas = gameRoom2D.find(entry => entry.__type__ === 'cc.Node' && entry._name === 'Canvas');
    const transform = gameRoom2D[canvas._components[0].__id__];
    const widget = gameRoom2D[canvas._components.find(component =>
        gameRoom2D[component.__id__]?.__type__ === 'cc.Widget').__id__];
    assert.deepEqual(transform._contentSize, { __type__: 'cc.Size', width: 1280, height: 720 });
    assert.equal(widget._enabled, false);
});

test('native 1280x720 forms preserve authored landscape background gutters', () => {
    assert.match(legacyFormManager,
        /if \(designWidth === viewportWidth && designHeight === viewportHeight\) return;/);
    const canonicalGuard = legacyFormManager.indexOf(
        'if (designWidth === viewportWidth && designHeight === viewportHeight) return;');
    const backgroundRewrite = legacyFormManager.indexOf('const coverWidth = viewportWidth / scale;');
    assert.ok(canonicalGuard >= 0 && canonicalGuard < backgroundRewrite,
        'canonical form guard must run before legacy child background rewriting');
});

test('ChatPanel preserves its authored popup background size', () => {
    assert.match(legacyFormManager, /if \(path === 'room\/ChatPanel'\) return;/);
    const chatPanelGuard = legacyFormManager.indexOf("if (path === 'room/ChatPanel') return;");
    const backgroundRewrite = legacyFormManager.indexOf('const coverWidth = viewportWidth / scale;');
    assert.ok(chatPanelGuard >= 0 && chatPanelGuard < backgroundRewrite,
        'ChatPanel guard must run before legacy child background rewriting');
});
