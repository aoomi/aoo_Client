import assert from 'node:assert/strict';
import test from 'node:test';

const { CommonRoomHeadAssetLease } = await import(
    new URL('../../assets/Games/Common/Code/Room/CommonRoomHeadAssetLease.ts', import.meta.url),
);

test('CommonHead lease releases a late async asset exactly once after destroy', async () => {
    let retained = 0;
    let releaseCalls = 0;
    let resolveLoad;
    const pending = new Promise(resolve => { resolveLoad = resolve; });
    const lease = new CommonRoomHeadAssetLease(() => {
        retained -= 1;
        releaseCalls += 1;
    });
    const load = pending.then(asset => {
        retained += 1;
        return lease.accept(asset);
    });

    lease.cancel();
    assert.equal(lease.isActive(), false);
    resolveLoad({ name: 'CommonHead.prefab' });
    assert.equal(await load, false);
    assert.equal(retained, 0);
    assert.equal(releaseCalls, 1);

    lease.cancel();
    assert.equal(retained, 0);
    assert.equal(releaseCalls, 1);
});

test('CommonHead lease transfers a live asset without releasing it early', () => {
    let releaseCalls = 0;
    const lease = new CommonRoomHeadAssetLease(() => { releaseCalls += 1; });
    const asset = { name: 'CommonHead.prefab' };
    assert.equal(lease.accept(asset), true);
    lease.detach();
    assert.equal(releaseCalls, 0);
});
