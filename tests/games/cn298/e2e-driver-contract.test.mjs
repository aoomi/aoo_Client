import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const path = new URL('../../../work/cn298-horizontal-full-e2e.mjs', import.meta.url);
const harnessPath = new URL('../../../work/pdk-small-settlement-background-e2e.mjs', import.meta.url);

test('CN298 horizontal E2E covers the real ten-account room lifecycle', async () => {
    const source = await readFile(path, 'utf8');
    const harness = await readFile(harnessPath, 'utf8');
    assert.match(source, /60,61,62,63,64,65,66,67,68,69/);
    assert.match(source, /AOO_CN298_PLAYER_COUNT/);
    for (const phase of ['ROBBING', 'BETTING', 'SPLITTING', 'SETTLEMENT', 'FINISHED']) {
        assert.match(source, new RegExp(`'${phase}'`), phase);
    }
    for (const action of ['sit_req', 'rob_req', 'bet_req', 'split_req']) {
        assert.match(source, new RegExp(`poker\\.cn298\\.${action}`), action);
    }
    assert.match(source, /Network\.emulateNetworkConditions/);
    assert.match(source, /AOO_CN298_TIMEOUT_ROUND/);
    assert.match(source, /timeoutAutoOperation/);
    assert.match(source, /Page\.reload/);
    assert.match(source, /performance\.timeOrigin/);
    assert.match(source, /Creator Preview broadcast browser:reload/);
    assert.match(source, /peer left active room/);
    assert.match(harness, /Page\.captureScreenshot/);
    assert.match(source, /stateVersionsMonotonic/);
    assert.match(source, /scoreConserved/);
    assert.match(source, /common\.room\.state_push/);
    assert.match(source, /poker\.CN298\.state_push/);
    assert.match(source, /commonRoomStatePushCaptured/);
    assert.match(source, /requestId: event\.params\.requestId/);
    assert.match(source, /statePushGameRoomFilterMatched/);
});

test('CN298 E2E never invokes gameplay controllers or handlers directly', async () => {
    const source = await readFile(path, 'utf8');
    const harness = await readFile(harnessPath, 'utf8');
    assert.doesNotMatch(source, /__CN298[^\n]*\.(?:sit|start|rob|bet|split|continue|timeout)\s*\(/);
    assert.doesNotMatch(source, /getComponent[^\n]*CN298[^\n]*\.(?:sit|start|rob|bet|split|continue|timeout)\s*\(/);
    assert.match(harness, /Input\.dispatchTouchEvent/);
    assert.match(source, /clickExpression/);
});

test('CN298 E2E preserves structured evidence for every failed HTTP request', async () => {
    const source = await readFile(path, 'utf8');
    for (const field of ['status', 'responseBody', 'responseJson', 'traceId', 'requestId', 'operationId']) {
        assert.match(source, new RegExp(field), field);
    }
    assert.match(source, /Network\.getResponseBody/);
    assert.match(source, /failedHttpSummary/);
    assert.match(source, /gatewayConsoleSummary/);
    assert.match(source, /join-failure-/);
    assert.match(source, /joinFailureEvidence/);
});
