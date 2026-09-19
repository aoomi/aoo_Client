import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../../../Admin/node_modules/typescript/lib/typescript.js';

const root = path.resolve(import.meta.dirname, '../..');
function compile(file, dependencies = {}) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: file })(
        specifier => dependencies[specifier] ?? (() => { throw new Error(`unexpected import ${specifier}`); })(),
        module, module.exports,
    );
    return module.exports;
}

const coordinator = compile('assets/Common/Code/Runtime/network/ReconnectCoordinator.ts');
const policy = compile('assets/Common/Code/Runtime/network/RequestReplayPolicy.ts');
const { StableTransportFacade } = compile('assets/Common/Code/Runtime/network/StableTransportFacade.ts', {
    './ReconnectCoordinator': coordinator,
    './RequestReplayPolicy': policy,
});

class FakeTransport {
    listeners = new Map();
    requests = [];
    response = async body => body;
    request(_msgId, body) { this.requests.push(body); return this.response(body); }
    notify() {}
    on(event, listener) { return this.listen(event, listener); }
    onActivity(listener) { return this.listen('activity', listener); }
    onClose(listener) { return this.listen('close', listener); }
    isConnected() { return true; }
    connect() { return Promise.resolve(); }
    close() {}
    setWsTicket() {}
    setReconnectAuthenticator() {}
    setReconnectPreparation() {}
    updateReconnectEndpoint() {}
    bindRoomAuthority() {}
    confirmSessionReplacement() {}
    listen(event, listener) {
        const set = this.listeners.get(event) ?? new Set(); set.add(listener); this.listeners.set(event, set);
        return () => set.delete(listener);
    }
    emit(event, body) { for (const listener of this.listeners.get(event) ?? []) listener(body); }
}

test('non-replayable actions fail while disconnected and are never queued', async () => {
    const slot = new coordinator.ConnectionSlot('GAME');
    const facade = new StableTransportFacade(slot);
    await assert.rejects(facade.request('room.dispatch', { action: 'play' }), /REQUEST_INTERRUPTED_NOT_REPLAYABLE/);
});

test('query waits for READY and stale generation is replayed exactly once', async () => {
    const slot = new coordinator.ConnectionSlot('GAME');
    const facade = new StableTransportFacade(slot);
    const waiting = facade.request('common.room.state_req', { roomId: 1 });
    const first = new FakeTransport();
    slot.adopt(first);
    assert.deepEqual(await waiting, { roomId: 1 });

    let resolveFirst;
    first.response = () => new Promise(resolve => { resolveFirst = resolve; });
    const replayed = facade.request('common.room.state_req', { roomId: 2 });
    await Promise.resolve();
    const second = new FakeTransport();
    slot.adopt(second);
    resolveFirst({ stale: true });
    assert.deepEqual(await replayed, { roomId: 2 });
    assert.equal(first.requests.length, 2);
    assert.equal(second.requests.length, 1);
});

test('idempotent replay preserves its key and subscriptions follow only the current generation', async () => {
    const slot = new coordinator.ConnectionSlot('GAME');
    const first = new FakeTransport();
    slot.adopt(first);
    const facade = new StableTransportFacade(slot);
    await facade.requestWithPolicy('profile.update', { value: 1 }, {
        policy: 'IDEMPOTENT_KEYED', idempotencyKey: 'operation-1',
    });
    assert.equal(first.requests[0].idempotencyKey, 'operation-1');
    const pushes = [];
    facade.on('room.state', body => pushes.push(body));
    first.emit('room.state', 1);
    const second = new FakeTransport();
    slot.adopt(second);
    first.emit('room.state', 2);
    second.emit('room.state', 3);
    assert.deepEqual(pushes, [1, 3]);
});

test('nested rematch idempotency key makes final-settlement continuation reconnect-safe', async () => {
    assert.deepEqual(policy.resolveRequestPolicy('poker.CD201.dispatch', {
        action: 'common.room.rematch_req',
        payload: { idempotencyKey: 'rematch-operation-1' },
    }), { policy: 'IDEMPOTENT_KEYED', idempotencyKey: 'rematch-operation-1' });

    const slot = new coordinator.ConnectionSlot('GAME');
    const facade = new StableTransportFacade(slot);
    const pending = facade.request('poker.CD201.dispatch', {
        action: 'common.room.rematch_req',
        payload: { idempotencyKey: 'rematch-operation-1' },
    });
    const connected = new FakeTransport();
    slot.adopt(connected);
    assert.equal((await pending).idempotencyKey, 'rematch-operation-1');
    assert.equal(connected.requests[0].idempotencyKey, 'rematch-operation-1');
});

test('hall and game retries are independent single flights', async () => {
    const owner = new coordinator.ReconnectCoordinator();
    let hallAttempts = 0;
    const hall = owner.retry(owner.hall, async () => {
        hallAttempts += 1;
        if (hallAttempts === 1) throw new Error('hall transient');
        return new FakeTransport();
    }, 2);
    const game = owner.retry(owner.game, async () => new FakeTransport(), 1);
    assert.ok(await game);
    assert.ok(await hall);
    assert.equal(hallAttempts, 2);
});

test('cancelling a retry cannot later force its slot terminal', async () => {
    const owner = new coordinator.ReconnectCoordinator();
    const retry = owner.retry(owner.hall, async () => { throw new Error('offline'); }, 2);
    await Promise.resolve();
    owner.cancelHall();
    await assert.rejects(retry, /CONNECTION_RETRY_CANCELLED/);
    assert.equal(owner.hall.snapshot().state, 'DISCONNECTED');
});

test('ticket refresh is a single flight and clears after settlement', async () => {
    const owner = new coordinator.ReconnectCoordinator();
    let calls = 0;
    let release;
    const refresh = () => { calls += 1; return new Promise(resolve => { release = resolve; }); };
    const first = owner.singleFlightTicket(refresh);
    const second = owner.singleFlightTicket(refresh);
    assert.equal(first, second);
    assert.equal(calls, 1);
    release('ticket-1');
    assert.equal(await first, 'ticket-1');
    await Promise.resolve();
    const third = owner.singleFlightTicket(async () => { calls += 1; return 'ticket-2'; });
    assert.equal(await third, 'ticket-2');
    assert.equal(calls, 2);
});

test('game generation is not READY until authoritative recovery settles', async () => {
    const slot = new coordinator.ConnectionSlot('GAME');
    const facade = new StableTransportFacade(slot);
    const transport = new FakeTransport();
    let release;
    let recovered = false;
    facade.onReconnect(async () => {
        await facade.request('common.room.state_req', { roomId: 100001 });
        await new Promise(resolve => { release = resolve; });
        recovered = true;
    });
    const established = slot.establish(({ signal, generation }) => ({
        signal, generation, reconnecting: true,
        authenticate: async () => undefined,
        connect: async () => transport,
        recover: async () => facade.recoverGeneration(generation),
    }), true);
    while (!release) await Promise.resolve();
    assert.equal(slot.snapshot().state, 'RECOVERING');
    assert.equal(slot.current(), null);
    assert.equal(transport.requests.length, 1);
    release();
    await established;
    assert.equal(recovered, true);
    assert.equal(slot.snapshot().state, 'READY');
});

test('reconnect recovery listeners run exactly once for a replacement generation', async () => {
    const slot = new coordinator.ConnectionSlot('GAME');
    const first = new FakeTransport();
    slot.adopt(first);
    const facade = new StableTransportFacade(slot);
    let recoveries = 0;
    facade.onReconnect(() => { recoveries += 1; });
    const second = new FakeTransport();
    await slot.establish(({ signal, generation }) => ({
        signal, generation, reconnecting: true,
        authenticate: async () => undefined,
        connect: async () => second,
        recover: async () => facade.recoverGeneration(generation),
    }), true);
    assert.equal(slot.snapshot().state, 'READY');
    assert.equal(recoveries, 1);
});

test('default reconnect budget survives a normal managed-service restart window', () => {
    const source = fs.readFileSync(path.join(root,
        'assets/Common/Code/Runtime/network/ReconnectCoordinator.ts'), 'utf8');
    assert.match(source, /maxAttempts = 8/);
    assert.match(source, /Math\.min\(8_000, 500 \* \(2 \*\*/);
});
