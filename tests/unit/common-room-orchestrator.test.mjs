import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const orchestrator = read('assets/Games/Common/Code/Runtime/RoomOrchestrator.ts');
const composition = read('assets/Games/Common/Code/Runtime/GameRuntimeEntries.ts');
const sceneRouter = read('assets/Login/Code/Navigation/SceneRouter.ts');
const pdkCodes = read('assets/Games/Poker/PDK/Common/Code/Regional/PdkBusinessCodes.ts');
const pdkEntry = read('assets/Games/Poker/PDK/Common/Code/Runtime/PdkRuntimeEntry.ts');

test('RoomOrchestrator is the only client room lifecycle authority', () => {
    assert.match(orchestrator, /export class RoomOrchestrator/);
    for (const state of ['PREPARING', 'COMMITTING', 'ACTIVE', 'ROLLING_BACK', 'FAILED', 'DESTROYING', 'DESTROYED']) {
        assert.match(orchestrator, new RegExp(`['"]${state}['"]`));
    }
    assert.match(orchestrator, /await this\.prepareChild\(epoch, common/);
    assert.match(orchestrator, /await this\.prepareChild\(epoch, gameplay/);
    assert.match(orchestrator, /await this\.commitChild\(epoch, gameplay/);
    assert.match(orchestrator, /await this\.commitChild\(epoch, common/);
    assert.match(orchestrator, /ROOM_ORCHESTRATOR_\$\{phase\.toUpperCase\(\)\}_TIMEOUT/);
    assert.match(orchestrator, /assertCapabilityHandshake/);
    assert.match(orchestrator, /rollbackChildren/);
});

test('orchestrator exposes generation/epoch and abort listener cleanup guards', () => {
    assert.match(orchestrator, /private generation = 0/);
    assert.match(orchestrator, /const epoch = \+\+this\.generation/);
    assert.match(orchestrator, /if \(epoch !== this\.generation\) throw new Error\('ROOM_ORCHESTRATOR_STALE_EPOCH'\)/);
    assert.match(orchestrator, /signal\.addEventListener\('abort', abortListener, \{ once: true \}\)/);
    assert.match(orchestrator, /signal\.removeEventListener\('abort', abortListener\)/);
    for (const code of ['ROOM_ORCHESTRATOR_DESTROYED', 'ROOM_ORCHESTRATOR_ALREADY_ENTERED', 'ROOM_ORCHESTRATOR_LIFECYCLE_INVALID']) {
        assert.match(orchestrator, new RegExp(code));
    }
});

test('production composition gives Gameplay and Common to one orchestrator', () => {
    assert.match(composition, /new RoomOrchestrator\(roomId, commonRoomReport\(entry\.id\),/);
    assert.match(composition, /await orchestrator\.enter\(common, gameplay\)/);
    assert.match(composition, /orchestrator\?\.destroy\(\)/);
    assert.match(composition, /await orchestrator\.restore\(\)/);
    assert.match(composition, /roomCapabilityContract\(handoff\)/);
    assert.match(composition, /commonRoomCapabilityContract\(\)/);
    assert.match(composition, /gameplayRoomCapabilityContract\(entry, handoff\)/);
    assert.match(composition, /supportsPlayVersion/);
    assert.match(composition, /capabilityScope: 'common'/);
    assert.match(composition, /capabilityScope: 'gameplay'/);
    assert.doesNotMatch(composition, /capabilities: \(\) => capabilityContract/);
    assert.match(composition, /prepare: async context => \{\s*await entry\.preload\?\.\(handoff\);\s*if \(context\.signal\.aborted\) throw new Error\('ROOM_ORCHESTRATOR_ABORTED'\);\s*\}/);
    assert.match(composition, /commit: \(\) => entry\.enter\(handoff\)/);
    assert.match(composition, /prepare: context => prepareCommonRoom\(handoff, context\)/);
    assert.match(composition, /commit: commitCommonRoom/);
    const prepareStart = composition.indexOf('const prepareCommonRoom =');
    const commitStart = composition.indexOf('const commitCommonRoom =');
    const bindStart = composition.indexOf('const bindCommonRoom =');
    assert.doesNotMatch(composition.slice(prepareStart, commitStart), /mountCommonRoomShellCancellable/);
    assert.match(composition.slice(commitStart, bindStart), /mountCommonRoomShellCancellable\(roomHost, context\?\.signal\)/);
    assert.match(composition, /if \(context\.signal\.aborted\) throw new Error\('ROOM_ORCHESTRATOR_ABORTED'\)/);
    assert.doesNotMatch(composition, /await entry\.enter\(handoff\);\s*gameEntered/);
});

test('startup recovery PDK entry has an independent play-version gate', () => {
    assert.match(sceneRouter, /supportsPdkPlayVersion/);
    assert.match(sceneRouter, /id: 'startup-common-pdk'/);
    assert.match(sceneRouter, /supportsPlayVersion:\s*\(playVersion, ticket\)\s*=>/);
    assert.match(sceneRouter, /supportsPdkPlayVersion\(gameCode, playVersion\)/);
    assert.match(pdkEntry, /supportsPdkPlayVersion\(gameCode, playVersion\)/);
});

test('canonical PDK play-version registry covers every current code', () => {
    assert.match(pdkCodes, /PDK_CANONICAL_PLAY_VERSIONS/);
    assert.match(pdkCodes, /Object\.fromEntries\(PDK_BUSINESS_CODE_LIST\.map/);
    assert.match(pdkCodes, /supportsPdkPlayVersion/);
});

test('canonical PDK play-version registry executes for all 28 current codes', async () => {
    const javascript = ts.transpileModule(pdkCodes, {
        compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
    assert.equal(module.PDK_BUSINESS_CODE_LIST.length, 28);
    for (const code of module.PDK_BUSINESS_CODE_LIST) {
        assert.equal(module.PDK_CANONICAL_PLAY_VERSIONS[code], `${code}-v1.0.0`);
        assert.equal(module.supportsPdkPlayVersion(code, `${code}-v1.0.0`), true);
        assert.equal(module.supportsPdkPlayVersion(code, `${code}-v0.0.0`), false);
    }
    assert.equal(module.supportsPdkPlayVersion('CD201', 'CD201-v1.0.0'), false);
});

async function loadOrchestrator() {
    const javascript = ts.transpileModule(orchestrator, {
        compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

test('destroy wins against a late enter rejection and is terminal', async () => {
    const { RoomOrchestrator } = await loadOrchestrator();
    const pending = deferred();
    const destroyed = [];
    const common = { enter: () => pending.promise, destroy: () => destroyed.push('common') };
    const gameplay = { enter: async () => undefined, destroy: () => destroyed.push('gameplay') };
    const room = new RoomOrchestrator(1001);
    const entering = room.enter(common, gameplay);
    room.destroy();
    pending.reject(new Error('late-enter-failure'));
    await assert.rejects(entering, /late-enter-failure|ROOM_ORCHESTRATOR_ABORTED|ROOM_ORCHESTRATOR_LIFECYCLE_INVALID|ROOM_ORCHESTRATOR_STALE_EPOCH/);
    assert.equal(room.currentState, 'DESTROYED');
    assert.deepEqual(destroyed, ['common']);
    await assert.rejects(room.enter(common, gameplay), /ROOM_ORCHESTRATOR_DESTROYED/);
});

test('duplicate mount is rejected while the first room is active', async () => {
    const { RoomOrchestrator } = await loadOrchestrator();
    const events = [];
    const child = {
        enter: async () => events.push('enter'),
        destroy: () => events.push('destroy'),
    };
    const room = new RoomOrchestrator(1001);
    await room.enter(child, child);
    await assert.rejects(room.enter(child, child), /ROOM_ORCHESTRATOR_ALREADY_ENTERED/);
    assert.equal(room.currentState, 'ACTIVE');
    assert.deepEqual(events, ['enter', 'enter']);
    room.destroy();
});

test('destroy before Gameplay connect rejects a stale callback without committing Common', async () => {
    const { RoomOrchestrator } = await loadOrchestrator();
    const pendingConnect = deferred();
    const gameplayStarted = deferred();
    const events = [];
    const common = {
        enter: async () => undefined,
        prepare: async () => events.push('common:prepare'),
        commit: async () => events.push('common:commit'),
        destroy: () => events.push('common:destroy'),
    };
    const gameplay = {
        enter: async () => undefined,
        prepare: async () => events.push('gameplay:prepare'),
        commit: async () => {
            events.push('gameplay:connect');
            gameplayStarted.resolve();
            return pendingConnect.promise;
        },
        destroy: () => events.push('gameplay:destroy'),
    };
    const room = new RoomOrchestrator(1001);
    const entering = room.enter(common, gameplay);
    await gameplayStarted.promise;
    room.destroy();
    pendingConnect.resolve();
    await assert.rejects(entering, /ROOM_ORCHESTRATOR_ABORTED|ROOM_ORCHESTRATOR_LIFECYCLE_INVALID|ROOM_ORCHESTRATOR_STALE_EPOCH/);
    assert.equal(room.currentState, 'DESTROYED');
    assert.equal(events.includes('common:commit'), false);
    assert.deepEqual(events, ['common:prepare', 'gameplay:prepare', 'gameplay:connect', 'gameplay:destroy', 'common:destroy']);
});

test('restore failure rolls back both children and leaves no active room', async () => {
    const { RoomOrchestrator } = await loadOrchestrator();
    const restored = [];
    const destroyed = [];
    const common = {
        enter: async () => undefined,
        restore: async () => { restored.push('common'); },
        destroy: () => destroyed.push('common'),
    };
    const gameplay = {
        enter: async () => undefined,
        restore: async () => { restored.push('gameplay'); throw new Error('restore-failure'); },
        destroy: () => destroyed.push('gameplay'),
    };
    const room = new RoomOrchestrator(1001);
    await room.enter(common, gameplay);
    await assert.rejects(room.restore(), /restore-failure/);
    assert.equal(room.currentState, 'FAILED');
    assert.deepEqual(restored.sort(), ['common', 'gameplay']);
    assert.deepEqual(destroyed, ['gameplay', 'common']);
});

test('children do not receive the orchestration owner', () => {
    const child = orchestrator.slice(orchestrator.indexOf('export interface RoomOrchestratorChild'),
        orchestrator.indexOf('export interface RoomOrchestratorSnapshot'));
    assert.match(child, /readonly enter: \(\) => Promise<void>/);
    assert.match(child, /readonly destroy: \(\) => void/);
    assert.doesNotMatch(child, /readonly root|Node|CommonRoom|GameplayRuntime/);
});

test('phased mount connects Gameplay before committing the Common session and exposes one mount request', async () => {
    const { RoomOrchestrator } = await loadOrchestrator();
    const events = [];
    const capabilities = {
        commonContractVersion: 'common-room-v1', gameAdapterVersion: 'pdk-v1',
        snapshotSchemaVersion: 1, supportedCapabilities: ['reconnect'],
    };
    const child = name => ({
        enter: async () => undefined,
        capabilities: () => capabilities,
        prepare: async context => events.push(`${name}:prepare:${context.mountRequestId}`),
        commit: async context => events.push(`${name}:commit:${context.mountRequestId}`),
        destroy: () => events.push(`${name}:destroy`),
    });
    const room = new RoomOrchestrator(1001, undefined, {
        requiredCapabilities: capabilities, prepareTimeoutMs: 100, commitTimeoutMs: 100,
    });
    await room.enter(child('common'), child('gameplay'));
    assert.equal(room.currentState, 'ACTIVE');
    assert.deepEqual(events, [
        'common:prepare:1001:1', 'gameplay:prepare:1001:1',
        'gameplay:commit:1001:1', 'common:commit:1001:1',
    ]);
});

test('capability mismatch fails before any child preparation', async () => {
    const { RoomOrchestrator } = await loadOrchestrator();
    let prepared = 0;
    const child = {
        enter: async () => undefined,
        capabilities: () => ({
            commonContractVersion: 'common-room-v1', gameAdapterVersion: 'old',
            snapshotSchemaVersion: 1, supportedCapabilities: [],
        }),
        prepare: async () => { prepared += 1; },
        destroy: () => undefined,
    };
    const room = new RoomOrchestrator(1001, undefined, {
        requiredCapabilities: {
            commonContractVersion: 'common-room-v1', gameAdapterVersion: 'pdk-v1',
        },
    });
    await assert.rejects(room.enter(child, child), /ROOM_ORCHESTRATOR_GAME_ADAPTER_UNSUPPORTED/);
    assert.equal(prepared, 0);
    assert.equal(room.currentState, 'FAILED');
});

test('prepare timeout enters rollback and cleans every prepared child', async () => {
    const { RoomOrchestrator } = await loadOrchestrator();
    const pending = deferred();
    const events = [];
    const common = {
        enter: async () => undefined,
        prepare: async () => pending.promise,
        rollback: () => events.push('common:rollback'),
        destroy: () => events.push('common:destroy'),
    };
    const gameplay = { enter: async () => undefined, destroy: () => events.push('gameplay:destroy') };
    const room = new RoomOrchestrator(1001, undefined, { prepareTimeoutMs: 5 });
    await assert.rejects(room.enter(common, gameplay), /ROOM_ORCHESTRATOR_PREPARE_TIMEOUT/);
    assert.equal(room.currentState, 'FAILED');
    assert.deepEqual(events, ['common:rollback', 'common:destroy']);
    pending.resolve();
});

test('late completion from an older generation cannot commit Common out of order', async () => {
    const { RoomOrchestrator } = await loadOrchestrator();
    const latePrepare = deferred();
    const events = [];
    const common = {
        enter: async () => undefined,
        prepare: async context => {
            if (context.lifecycleEpoch === 1) return latePrepare.promise;
        },
        commit: async () => events.push('common:commit'),
        destroy: () => events.push('common:destroy'),
    };
    const gameplay = {
        enter: async () => undefined,
        prepare: async () => undefined,
        commit: async () => events.push('gameplay:commit'),
        destroy: () => events.push('gameplay:destroy'),
    };
    const room = new RoomOrchestrator(1001, undefined, { prepareTimeoutMs: 5 });
    await assert.rejects(room.enter(common, gameplay), /ROOM_ORCHESTRATOR_PREPARE_TIMEOUT/);
    await room.enter(common, gameplay);
    latePrepare.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(room.currentState, 'ACTIVE');
    assert.equal(events.filter(event => event === 'common:commit').length, 1);
    assert.deepEqual(events, ['common:destroy', 'gameplay:commit', 'common:commit']);
    room.destroy();
});
