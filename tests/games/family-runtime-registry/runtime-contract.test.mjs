import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const clientRoot = new URL('../../..', import.meta.url).pathname;
const catalogRoot = join(clientRoot, 'assets/Games/Common/Code/Catalog');

let runtime;

function loadRuntime() {
  if (runtime) return runtime;
  const typescript = require('typescript');
  const originalTsLoader = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(typescript.transpileModule(
    readFileSync(filename, 'utf8'),
    { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 }, fileName: filename },
  ).outputText, filename);
  try {
    runtime = {
      ...require(join(catalogRoot, 'FamilyRuntimeRegistry.ts')),
      ...require(join(catalogRoot, 'CatalogFamilyBindings.ts')),
    };
  } finally {
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
  }
  return runtime;
}

test('current catalog bindings resolve once through the public family runtime registry', () => {
  const { CATALOG_FAMILY_BINDINGS, CATALOG_GAME_METADATA, FAMILY_RUNTIME_REGISTRY, FAMILY_RUNTIME_SCHEMAS } = loadRuntime();
  const canonicalManifest = JSON.parse(readFileSync(join(clientRoot, '../Server/release-input/runtime-metadata-canonical-manifest-cd2999-current-20261012.json'), 'utf8'));
  const canonicalCd2999 = canonicalManifest.rows.find((row) => row.gameCode === 'chengdu2999');
  assert.ok(canonicalCd2999, 'canonical current chengdu2999 row must exist');
  assert.equal(canonicalCd2999.gameId, 2999);
  assert.equal(CATALOG_GAME_METADATA.chengdu2999.gameId, canonicalCd2999.gameId);
  assert.notEqual(CATALOG_GAME_METADATA.chengdu2999.gameId, 630);
  const active = CATALOG_FAMILY_BINDINGS.filter(({ family }) => family !== 'UNCLASSIFIED_MISSING_SOURCE');
  assert.equal(FAMILY_RUNTIME_REGISTRY.all().length, active.length);
  assert.equal(new Set(active.map(({ code }) => code)).size, active.length);
  for (const binding of active) {
    assert.deepEqual(FAMILY_RUNTIME_REGISTRY.resolve(binding.code), binding);
    assert.ok(FAMILY_RUNTIME_SCHEMAS[binding.family], binding.family);
  }
  assert.equal(FAMILY_RUNTIME_REGISTRY.resolve('chengdu2001')?.family, 'poker:pao-de-kuai');
  assert.equal(FAMILY_RUNTIME_REGISTRY.resolve('neijiang2002')?.family, 'poker:pao-de-kuai');
  assert.equal(FAMILY_RUNTIME_REGISTRY.resolve('liangshan2003')?.family, 'poker:pao-de-kuai');
  assert.ok(FAMILY_RUNTIME_SCHEMAS['poker:cd299']);
});

test('registry rejects duplicate and unclassified runtime bindings', () => {
  const { FamilyRuntimeRegistry } = loadRuntime();
  const registry = new FamilyRuntimeRegistry();
  const binding = { code: 'test-pdk', family: 'poker:pao-de-kuai', regionConfig: 'CONFIG:test@local' };
  registry.register(binding);
  assert.deepEqual(registry.resolve('test-pdk'), binding);
  assert.throws(() => registry.register(binding), /duplicate family runtime test-pdk/);
  assert.throws(() => registry.register({
    code: 'missing-source', family: 'UNCLASSIFIED_MISSING_SOURCE', regionConfig: 'CONFIG:missing@local',
  }), /blocked missing-source runtime missing-source/);
});

test('family adapter sends ordered intent and ignores stale authoritative snapshots', async () => {
  const { FamilyGameplayAdapter, FAMILY_RUNTIME_SCHEMAS } = loadRuntime();
  const requests = [];
  const responses = [
    { gameCode: 'chengdu2001', stateVersion: 4, phase: 'PLAYING' },
    { gameCode: 'chengdu2001', stateVersion: 3, phase: 'PLAYING' },
  ];
  const adapter = new FamilyGameplayAdapter({
    request: async (message, payload) => {
      requests.push({ message, payload });
      return responses.shift();
    },
  }, 88, {
    code: 'chengdu2001', family: 'poker:pao-de-kuai', regionConfig: 'CONFIG:chengdu2001@sichuan/chengdu',
  }, FAMILY_RUNTIME_SCHEMAS['poker:pao-de-kuai']);

  const current = await adapter.act(2, 'play', { cards: [3, 4, 5] });
  const stale = await adapter.act(2, 'pass');
  assert.deepEqual(current, { gameCode: 'chengdu2001', stateVersion: 4, phase: 'PLAYING' });
  assert.deepEqual(stale, current);
  assert.deepEqual(requests, [
    { message: 'poker.chengdu2001.dispatch', payload: { roomId: 88, sequence: 1, seatId: 2, action: 'play', payload: { cards: [3, 4, 5] } } },
    { message: 'poker.chengdu2001.dispatch', payload: { roomId: 88, sequence: 2, seatId: 2, action: 'pass', payload: {} } },
  ]);
  assert.throws(() => adapter.act(2, 'discard'), /unsupported poker:pao-de-kuai action/);
});

test('family adapter rejects malformed or mismatched authoritative responses', async () => {
  const { FamilyGameplayAdapter, FAMILY_RUNTIME_SCHEMAS } = loadRuntime();
  const binding = { code: 'chengdu2001', family: 'poker:pao-de-kuai', regionConfig: 'CONFIG:chengdu2001@sichuan/chengdu' };
  const adapter = new FamilyGameplayAdapter({ request: async () => ({ gameCode: 'wrong-game', stateVersion: 1, phase: 'PLAYING' }) }, 9, binding, FAMILY_RUNTIME_SCHEMAS['poker:pao-de-kuai']);
  await assert.rejects(adapter.state(), /mismatched family response/);
  const invalidPhase = new FamilyGameplayAdapter({ request: async () => ({ gameCode: 'chengdu2001', stateVersion: 1, phase: 'NOT_A_PHASE' }) }, 9, binding, FAMILY_RUNTIME_SCHEMAS['poker:pao-de-kuai']);
  await assert.rejects(invalidPhase.state(), /mismatched family response/);
});
