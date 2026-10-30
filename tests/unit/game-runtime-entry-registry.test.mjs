import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const generatedProtocolText = () => {
    const generatedDir = fileURLToPath(new URL('../../assets/Common/Code/Runtime/network/', import.meta.url));
    return ['GeneratedProtocolIds.ts', ...readdirSync(generatedDir)
        .filter(name => /^GeneratedProtocolDefinitions\.\d{3}\.ts$/.test(name))
        .sort()]
        .map(name => readFileSync(path.join(generatedDir, name), 'utf8')).join('\n');
};

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
    const adapter = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkRuntimeEntry.ts');
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
    assert.match(composition, /\.map\(entry => withPresentationLifecycle\(entry, presentation, roomHost, options\.requestRoomExit\)\)/);
    assert.match(composition, /function withPresentationLifecycle\(entry: GameRuntimeEntry,[\s\S]*requestRoomExit: \(roomId: number\) => Promise<void>/);
    assert.equal((composition.match(/withPresentationLifecycle\(entry, presentation, roomHost, options\.requestRoomExit\)/g) ?? []).length, 1);
    assert.match(composition, /const roomHost = options\.lobbyNode/);
    assert.doesNotMatch(composition, /options\.lobbyNode\.parent \?\?/);
    assert.ok(composition.indexOf('presentation.preparing()') < composition.indexOf('await entry.enter(handoff)'));
    assert.match(composition, /await entry\.enter\(handoff\);[\s\S]*presentation\.entered\(entry\.id\)/);
    assert.ok(composition.indexOf('await entry.enter(handoff)') < composition.indexOf('presentation.entered(entry.id)'));
    assert.match(composition, /node\.getComponent\(Camera\) \?\? node\.getComponentInChildren\(Camera\)/);
    assert.match(composition, /if \(node\.isValid\) node\.active = active/);
    assert.doesNotMatch(composition, /onEntered:\s*\(\)\s*=>\s*\{\s*options\.lobbyNode\.active = false/);
});

test('production composition resolves Common defaults before installing a runtime', () => {
    const composition = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
    const mount = read('assets/Games/Common/Code/Room/RoomNetworkControllerMount.ts');
    assert.match(composition, /RoomNetworkControllerMount\.createCommonRoomDefaultPorts\(roomHost\)/);
    assert.match(mount, /COMMON_ROOM_DEFAULT_DEPENDENCIES_REQUIRED/);
    assert.match(mount, /COMMON_ROOM_DEFAULT_FACTORY_DUPLICATE/);
    assert.match(composition, /defaults\?\.destroy\(\)[\s\S]*root\?\.isValid[\s\S]*root\.destroy\(\)/);
});

test('three new Poker families retain canonical dispatch identity and M5 routing', () => {
    const protocol = read('assets/Common/Code/Runtime/network/ProtocolClient.ts');
    const generated = generatedProtocolText();
    for (const code of ['CD299', 'CN298', 'CN297']) {
        assert.match(generated, new RegExp(`'poker\\.${code}\\.dispatch': \\{"kind":"req","direction":"client_to_server","transport":"WSS","version":"2\\.0","stage":"M5","auth":"room_session"`));
    }
    assert.match(protocol, /import \{ ProtocolDefinitions \} from '\.\/GeneratedProtocolIds'/);
    assert.match(protocol, /const POKER_BUSINESS_DISPATCH = \/\^\(poker\\\.\[A-Z\]\{2}\[1-5\]\[0-9\]\{2}\)\\\.dispatch\$\//);
    assert.match(protocol, /POKER_BUSINESS_DISPATCH\.test\(msgId\) && registeredDefinitions\[msgId\] !== undefined/);
    assert.match(protocol, /return registeredDefinitions\[`\$\{match\[1\]}\.dispatch`\] \? match\[1\] : undefined/);
    assert.match(protocol, /if \(isCanonicalPokerMessage\(event\)\) return event/);
    const shapedButUnregistered = 'poker.ZZ299.dispatch';
    assert.match(shapedButUnregistered, /^poker\.[A-Z]{2}[1-5][0-9]{2}\.dispatch$/);
    assert.doesNotMatch(generated, new RegExp(`'${shapedButUnregistered.replaceAll('.', '\\.')}':`));
    assert.match(protocol, /const definition = registeredDefinitions\[msgId\] \?\? registeredDefinitions\[`\$\{pokerRegion\}\.dispatch`\]/);
    assert.match(protocol, /if \(definition\) return definition\.stage/);
    assert.match(protocol, /canonicalPokerDispatch \|\| canonicalMahjongDispatch \? authority/);
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
