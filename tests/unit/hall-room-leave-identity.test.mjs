import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';

const source = readFileSync(new URL('../../assets/Lobby/Code/HallRoomGateway.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const identity = () => ({ roomId: '901001', gameId: '2001', gameCode: 'chengdu2001', playVersion: 'v1',
  roomInstanceId: 'instance-901001', lifecycleEpoch: '9007199254740993', fencingToken: '9223372036854775807', stateVersion: '0',
  releaseId: '9007199254740995', indexGeneration: '9007199254740997', regionCode: 'CN-51-01', sourceHash: 'a'.repeat(64),
  ruleContentHash: 'b'.repeat(64), componentContentHash: 'c'.repeat(64), cardCodecVersion: 'card-v1',
  eventInterpreterVersion: 'event-v1', protocolVersion: 'protocol-v1', snapshotSchemaVersion: 'snapshot-v1' });

function fixture(admission = identity(), failFirst = false) {
  const calls = []; let sequence = 0;
  class ProductionApiError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
  class ProductionApiClient {
    static operationKey(scope) { return `${scope}:${++sequence}`; }
    async get(path) { calls.push({ method: 'GET', path }); return path.endsWith('/active') ? { active: false }
      : { roomId: 901001, state: 'OPEN', leaveAdmission: admission }; }
    async mutate(method, path, body, key) { calls.push({ method, path, body, key });
      if (failFirst) { failFirst = false; throw new ProductionApiError('NETWORK_UNAVAILABLE', 'response unavailable', 0); }
      return { roomId: 901001, status: 'LEFT' }; }
    destroy() {}
  }
  const module = { exports: {} };
  const dependencies = {
    '../../Common/Code/Runtime/Activity/ProductionApiClient': { ProductionApiClient, ProductionApiError },
    '../../Common/Code/Runtime/config/RuntimeEndpoints': { resolveRuntimeEndpoints: () => ({ hallWebSocketUrl: 'wss://test.invalid' }) },
    '../../Common/Code/Runtime/navigation/PublishedRoomResourceRoute': { resolvePublishedRoomBundle: value => value },
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)((name) => {
    assert.ok(dependencies[name], `unexpected dependency ${name}`); return dependencies[name];
  }, module, module.exports);
  return { gateway: new module.exports.HallRoomGateway('unit-test-access', '7', () => 'unit-device'), calls };
}

test('leave consumes exact lossless non-authorizing projection and joins concurrent requests', async () => {
  const f = fixture(); const [a, b] = await Promise.all([f.gateway.leave(901001), f.gateway.leave(901001)]);
  assert.equal(a, b);
  const posts = f.calls.filter(c => c.method === 'POST');
  assert.equal(posts.length, 1); assert.deepEqual(posts[0].body, identity());
  assert.equal(posts[0].body.lifecycleEpoch, '9007199254740993');
  assert.equal(posts[0].body.fencingToken, '9223372036854775807');
  assert.equal(f.calls[0].method, 'GET');
  assert.ok(!f.calls.some(c => c.path.includes('/account/session')));
  for (const key of ['sessionId', 'accountSessionId', 'actorType', 'accountId', 'permission']) assert.ok(!(key in posts[0].body));
});

test('ambiguous leave reconciles with the same exact identity without refetching', async () => {
  const f = fixture(identity(), true); await f.gateway.leave(901001);
  const posts = f.calls.filter(c => c.method === 'POST');
  assert.equal(posts.length, 2); assert.deepEqual(posts[0].body, identity()); assert.deepEqual(posts[1].body, identity());
  assert.equal(f.calls.filter(c => c.method === 'GET' && !c.path.endsWith('/active')).length, 1);
});

test('leaveWaiting consumes the same non-authorizing identity', async () => {
  const f = fixture(); await f.gateway.leaveWaiting(901001);
  assert.deepEqual(f.calls.find(c => c.method === 'POST').body, identity());
});

for (const [name, change] of [
  ['missing projection', () => null],
  ['wrong room', value => ({ ...value, roomId: '901002' })],
  ['missing runtime identity', value => { delete value.roomInstanceId; return value; }],
  ['unsafe number', value => ({ ...value, lifecycleEpoch: Number(value.lifecycleEpoch) })],
  ['noncanonical decimal', value => ({ ...value, stateVersion: '01' })],
  ['out of range', value => ({ ...value, fencingToken: '9223372036854775808' })],
  ['forged permission', value => ({ ...value, permission: 'SEATED_MEMBER' })],
]) test(`${name} fails before any leave mutation`, async () => {
  const f = fixture(change(identity()));
  await assert.rejects(f.gateway.leave(901001));
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});
