import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('game runtime registry resolves canonical codes before family fallback and rejects ambiguity', () => {
    const registry = read('assets/Games/Common/Code/Runtime/GameRuntimeEntryRegistry.ts');
    assert.match(registry, /public resolveUnique\(handoff: LegacySubgameTicket\)/);
    assert.match(registry, /const exact = gameCode \? this\.byGameCode\.get\(gameCode\)/);
    assert.ok(registry.indexOf('if (exact) return exact') < registry.indexOf('const family = canonicalGameFamily'));
    assert.match(registry, /DUPLICATE_GAME_CODE/);
    assert.match(registry, /AMBIGUOUS_GAME_FAMILY/);
    assert.match(registry, /public resolveRequired\(handoff: LegacySubgameTicket\)/);
    assert.match(registry, /UNSUPPORTED_GAME_RUNTIME/);
    for (const field of ['roomId', 'operationId', 'stateVersion']) assert.ok(registry.includes(field), field);
});

test('startup room recovery dispatches through the same production runtime registry', () => {
    const router = read('assets/Login/Code/Navigation/SceneRouter.ts');
    assert.match(router, /createProductionGameRuntimeEntryRegistry\(\{/);
    assert.match(router, /registry\.resolveRequired\(handoff\)/);
    assert.match(router, /await runtime\.enter\(handoff\)/);
    assert.doesNotMatch(router, /playFamily !== 'poker-pao-de-kuai'/);
    assert.match(router, /playerId: role\.playerId/);
    assert.match(router, /accountId: account\.accountId/);
});

test('lobby delegates native PDK entry and replay to one feature adapter', () => {
    const lobby = read('assets/Lobby/Code/LobbyScreenController.ts');
    const adapter = read('assets/Games/Poker/PDK/Common/Code/Runtime/CommonPdkRuntimeEntry.ts');
    assert.match(lobby, /createProductionGameRuntimeEntryRegistry\(\{/);
    assert.match(lobby, /this\.gameRuntimeEntries\?\.resolveUnique\(handoff\)/);
    assert.match(lobby, /await runtimeEntry\.enter\(handoff\)/);
    assert.match(lobby, /commonPdkRuntimeEntry\?\.enterReplay/);
    assert.match(adapter, /return this\.launcher\.launch\(handoff\)/);
    assert.match(adapter, /return this\.coordinator\.enterReplay/);
    assert.doesNotMatch(adapter, /CD299|CN298|CN297/);
});

test('production composition registers CD299, CN298 and CN297 exactly once', () => {
    const composition = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
    for (const factory of [
        'createCD299GameRuntimeEntry', 'createCN298GameRuntimeEntry', 'createCN297GameRuntimeEntry',
    ]) {
        assert.equal(composition.match(new RegExp(`${factory}\\(`, 'g'))?.length, 1, factory);
    }
    for (const source of ['CD299GameRuntimeEntry', 'CN298RuntimeEntry', 'CN297GameRuntimeEntry']) {
        assert.ok(composition.includes(source), source);
    }
    assert.match(composition, /options\.pdk,[\s\S]*createCD299GameRuntimeEntry[\s\S]*createCN298GameRuntimeEntry[\s\S]*createCN297GameRuntimeEntry/);
});

test('all production runtimes share one successful-entry presentation lifecycle', () => {
    const composition = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
    assert.match(composition, /\.map\(entry => withPresentationLifecycle\(entry, presentation\)\)/);
    assert.match(composition, /const roomHost = options\.lobbyNode/);
    assert.doesNotMatch(composition, /options\.lobbyNode\.parent \?\?/);
    assert.ok(composition.indexOf('presentation.preparing()') < composition.indexOf('await entry.enter(handoff)'));
    assert.match(composition, /await entry\.enter\(handoff\);[\s\S]*presentation\.entered\(entry\.id\)/);
    assert.ok(composition.indexOf('await entry.enter(handoff)') < composition.indexOf('presentation.entered(entry.id)'));
    assert.match(composition, /node\.getComponent\(Camera\) \?\? node\.getComponentInChildren\(Camera\)/);
    assert.match(composition, /if \(node\.isValid\) node\.active = active/);
    assert.doesNotMatch(composition, /onEntered:\s*\(\)\s*=>\s*\{\s*options\.lobbyNode\.active = false/);
});

test('three new Poker families retain canonical dispatch identity and M5 routing', () => {
    const protocol = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');
    assert.match(protocol, /CD299\|CN298\|CN297/);
    assert.match(protocol, /CANONICAL_POKER_MESSAGE\.test\(event\)/);
    assert.match(protocol, /CANONICAL_POKER_STAGE\.test\(msgId\).*'M5'/);
    assert.match(protocol, /canonicalPokerDispatch \? authority/);
    assert.match(protocol, /roomId: authoritative \? roomId/);
    assert.match(protocol, /roundNo: authoritative \? Number\(authority\.roundNo/);
    assert.match(protocol, /playVersion: authoritative \? playVersion/);
});

test('CN297 owner-only actions are derived from authoritative snapshots', () => {
    const composition = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
    const entry = read('assets/Games/Poker/ZJH/Common/Code/CN297GameRuntimeEntry.ts');
    const presenter = read('assets/Games/Poker/ZJH/Common/Code/CN297RoomPresenter.ts');
    const state = read('assets/Games/Poker/ZJH/Common/Code/CN297RoomState.ts');
    assert.doesNotMatch(composition, /ownerPlayerId:\s*options\.playerId/);
    assert.doesNotMatch(entry, /identity\.ownerPlayerId/);
    assert.match(presenter, /this\.localPlayerId === snapshot\.ownerPlayerId/);
    assert.match(state, /ownerPlayerId/);
    assert.match(state, /Number\.isSafeInteger\(incoming\.ownerPlayerId\)/);
});
