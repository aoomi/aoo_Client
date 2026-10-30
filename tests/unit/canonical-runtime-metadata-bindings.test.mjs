import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const registryPath = new URL('../../../Server/tools/canonical-identity-registry.json', import.meta.url);
const generatedPath = new URL('../../assets/Games/Common/Code/Catalog/CanonicalRuntimeMetadataBindings.ts', import.meta.url);
const registryBytes = readFileSync(registryPath);
const registry = JSON.parse(registryBytes);
const generated = readFileSync(generatedPath, 'utf8');
const require = createRequire(import.meta.url);
const typescript = require('../../node_modules/typescript/lib/typescript.js');
const NodeModule = require('node:module');
const gatePath = new URL('../../assets/Games/Common/Code/Catalog/CanonicalIdentityRuntimeGate.ts', import.meta.url);
const bindingsPath = new URL('../../assets/Games/Common/Code/Catalog/CanonicalRuntimeMetadataBindings.ts', import.meta.url);
const legacyClubMainPath = new URL('../../assets/Club/Code/Runtime/LegacyClubMainController.ts', import.meta.url);
const joinRoomPath = new URL('../../assets/Lobby/Code/JoinRoomController.ts', import.meta.url);

// Load the real TypeScript gate in-memory for direct behavior tests. No source
// or generated artifact is emitted by this loader; Cocos .meta files are
// produced separately by the official AssetDB importer.
NodeModule._extensions['.ts'] = (module, filename) => {
    const output = typescript.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: {
            module: typescript.ModuleKind.CommonJS,
            target: typescript.ScriptTarget.ES2020,
            esModuleInterop: true,
        },
    }).outputText;
    module._compile(output, filename);
};
const gate = require(gatePath.pathname);
const bindings = require(bindingsPath.pathname);
const canonicalRow = bindings.CANONICAL_RUNTIME_METADATA_BINDINGS.find(row => row.gameId === 9);
assert.ok(canonicalRow);

test('generated client binding carries the exact canonical registry digest and all current identities', () => {
    const digest = createHash('sha256').update(registryBytes).digest('hex');
    assert.equal(registry.rows.length, 32);
    assert.equal(new Set(registry.rows.map(row => row.gameId)).size, 32);
    assert.match(generated, new RegExp(`CANONICAL_RUNTIME_METADATA_MANIFEST_SHA256 = "${digest}"`));
    for (const row of registry.rows) {
        assert.match(generated, new RegExp(`gameId:${row.gameId},gameCode:"${row.gameCode}"`));
        assert.match(generated, new RegExp(`clientRuntimeEntry:"${row.clientRuntimeEntry}"`));
    }
});

test('generated projection consumes proven current contract rows and retains fail-closed guards', () => {
    assert.equal(registry.consumable, true);
    assert.equal(registry.rows.filter(row => row.status === 'CONSUMABLE').length, 32);
    assert.equal(registry.rows.filter(row => row.status === 'FAIL_CLOSED').length, 0);
    assert.ok(registry.rows.every(row => row.contractVersion === 'common-room-v1'));
    assert.equal(registry.rows.find(row => row.gameCode === 'quanguo2997').status, 'CONSUMABLE');
    assert.deepEqual(registry.rows.find(row => row.gameCode === 'quanguo2997').failureCodes, []);
    assert.match(generated, /IDENTITY_CONTRACT_PROJECTION_FAIL_CLOSED/);
    assert.match(generated, /IDENTITY_CONTRACT_COMPATIBILITY_IDENTITY/);
});

test('provider and client runtime evidence is complete wherever source-backed', () => {
    assert.equal(registry.rows.filter(row => row.providerKey !== null).length, 32);
    assert.equal(registry.rows.filter(row => row.clientRuntimeEntry !== null).length, 32);
    assert.equal(registry.rows.find(row => row.gameCode === 'quanguo2997').providerKey, 'cn297-zjh');
    assert.equal(registry.rows.find(row => row.gameCode === 'quanguo2997').clientRuntimeEntry, 'cn297-zjh');
});

test('runtime gate rejects a tuple mismatch before any identity projection is returned', () => {
    assert.throws(() => gate.requireCanonicalIdentityProjection(
        bindings.CANONICAL_RUNTIME_METADATA_MANIFEST_SHA256,
        bindings.CANONICAL_RUNTIME_METADATA_RELEASE_EDITION,
        { ...canonicalRow, playVersion: 'cn297-v9.9.9' },
    ), /IDENTITY_CONTRACT_PROJECTION_MISMATCH/);
});

test('runtime gate rejects manifest/sourceHash drift closed', () => {
    assert.throws(() => gate.requireCanonicalIdentityProjection(
        'deadbeef', bindings.CANONICAL_RUNTIME_METADATA_RELEASE_EDITION, canonicalRow,
    ), /IDENTITY_CONTRACT_MANIFEST_SHA_MISMATCH/);
    assert.throws(() => gate.requireCanonicalIdentityProjection(
        bindings.CANONICAL_RUNTIME_METADATA_MANIFEST_SHA256, 'r9-drift', canonicalRow,
    ), /IDENTITY_CONTRACT_MANIFEST_EDITION_MISMATCH/);
});

test('runtime gate rejects compatibility identity 516 closed', () => {
    assert.throws(() => gate.requireCanonicalIdentityProjection(
        bindings.CANONICAL_RUNTIME_METADATA_MANIFEST_SHA256,
        bindings.CANONICAL_RUNTIME_METADATA_RELEASE_EDITION,
        { ...canonicalRow, gameId: 516 },
    ), /IDENTITY_CONTRACT_COMPATIBILITY_IDENTITY/);
});

test('controller room emits require canonical admission and never emit a bare handoff', () => {
    const legacyClubMain = readFileSync(legacyClubMainPath, 'utf8');
    const joinRoom = readFileSync(joinRoomPath, 'utf8');
    const clubEmitBlocks = [...legacyClubMain.matchAll(
        /this\.mainNode\.emit\('legacy-club-join-room', \{[\s\S]*?\n\s*\}\);/g,
    )].map(match => match[0]);
    assert.equal(clubEmitBlocks.length, 3);
    for (const block of clubEmitBlocks) {
        assert.match(block, /canonicalIdentity:\s*canonicalIdentity\.client/);
    }
    assert.match(legacyClubMain, /requireCanonicalClubRoomProjection\(config\)[\s\S]*legacy-club-join-room/);
    assert.match(legacyClubMain, /requireCanonicalClubRoomProjection\(room\)[\s\S]*legacy-club-join-room/);
    assert.match(joinRoom, /const canonicalIdentity = requireCanonicalHandoffProjection\(handoff\);[\s\S]*canonicalIdentity: canonicalIdentity\.client/);
});
