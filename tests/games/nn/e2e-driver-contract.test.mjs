import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const path = new URL('../../../work/nn-horizontal-full-e2e.mjs', import.meta.url);
const harnessPath = new URL('../../../work/pdk-small-settlement-background-e2e.mjs', import.meta.url);

test('NN horizontal E2E covers the real ten-account room lifecycle', async () => {
    const source = await readFile(path, 'utf8');
    const harness = await readFile(harnessPath, 'utf8');
    assert.match(source, /60,61,62,63,64,65,66,67,68,69/);
    assert.match(source, /AOO_NN_PLAYER_COUNT/);
    assert.match(source, /Btn_GuestLogin\|游客登录/);
    assert.match(source, /\^CreateRoom\$\|创建房间/);
    assert.match(source, /NN\|牛牛\|Nn/);
    assert.match(source, /visibleRoomId/);
    assert.match(source, /Page\.addScriptToEvaluateOnNewDocument/);
    assert.match(source, /assertHeadlessBrowserPlan/);
    assert.match(source, /profilePath: browser\.profileDir/);
    assert.match(source, /usesUserSession: false/);
    assert.match(source, /occupiedSeats/);
    assert.match(source, /viewerStatus/);
    for (const phase of ['ROBBING', 'BETTING', 'SPLITTING', 'SETTLEMENT', 'FINISHED']) {
        assert.match(source, new RegExp(`'${phase}'`), phase);
    }
    for (const action of ['sit_req', 'rob_req', 'bet_req', 'split_req']) {
        assert.match(source, new RegExp(`poker\\.quanguo2998\\.${action}`), action);
    }
    assert.match(source, /Network\.emulateNetworkConditions/);
    assert.match(source, /AOO_NN_TIMEOUT_ROUND/);
    assert.match(source, /timeoutAutoOperation/);
    assert.match(source, /Page\.reload/);
    assert.match(source, /performance\.timeOrigin/);
    assert.match(source, /Creator Preview broadcast browser:reload/);
    assert.match(source, /peer left active room/);
    assert.match(harness, /Page\.captureScreenshot/);
    assert.match(source, /stateVersionsMonotonic/);
    assert.match(source, /scoreConserved/);
    assert.match(source, /common\.room\.state_push/);
    assert.match(source, /poker\.quanguo2998\.state_push/);
    assert.match(source, /commonRoomStatePushCaptured/);
    assert.match(source, /requestId: event\.params\.requestId/);
    assert.match(source, /statePushGameRoomFilterMatched/);
});

test('NN E2E never invokes gameplay controllers or handlers directly', async () => {
    const source = await readFile(path, 'utf8');
    const harness = await readFile(harnessPath, 'utf8');
    assert.doesNotMatch(source, /__NN[^\n]*\.(?:sit|start|rob|bet|split|continue|timeout)\s*\(/);
    assert.doesNotMatch(source, /getComponent[^\n]*NN[^\n]*\.(?:sit|start|rob|bet|split|continue|timeout)\s*\(/);
    assert.match(harness, /Input\.dispatchTouchEvent/);
    assert.match(source, /clickExpression/);
});

test('NN E2E preserves structured evidence for every failed HTTP request', async () => {
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

test('NN E2E persists sanitized join diagnostics before isolated browsers are destroyed', async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /Runtime\.exceptionThrown/);
    assert.match(source, /Network\.loadingFailed/);
    assert.match(source, /Network\.webSocketFrameSent/);
    assert.match(source, /socketSummary/);
    assert.match(source, /identityFingerprint/);
    assert.match(source, /isolated guests did not receive distinct identities/);
    assert.match(source, /failure-\$\{failureStage\}-account-/);
    assert.match(source, /sanitizedUiState/);
    assert.match(source, /failure-report\.json/);
    assert.ok(source.indexOf("writeFile(join(destination, 'failure-report.json')")
        < source.indexOf('} finally {'), 'failure evidence must be written before browser cleanup');
});

test('NN join enters all six room digits only through the authored Numpad subtree', async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /assert\.match\(roomId, \/\^\\d\{6\}\$\//);
    assert.match(source, /for \(const digit of roomId\)/);
    assert.match(source, /pathClickExpression\('Numpad', `Keypad\/Keys\/Btn_\$\{digit\}`\)/);
    assert.match(source, /pathClickExpression\('Numpad', 'Keypad\/Btn_Confirm'\)/);
    assert.doesNotMatch(source, /clickVisible\(player, `\^Btn_\$\{digit\}/,
        'room digits must never use a scene-wide name/label selector');
    assert.doesNotMatch(source, /clickVisible\(player, '\^Btn_Confirm/,
        'confirmation must never use an unrelated scene-wide label');
});

test('NN join-only diagnostic proves each display length and captures structured stages', async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /numpadDisplayLength/);
    assert.match(source, /joinDigitLengths\.push\(length\)/);
    assert.match(source, /Numpad display length mismatch after digit/);
    assert.match(source, /Numpad display must contain six digits before confirm/);
    assert.match(source, /__aooJoinStages/);
    for (const stage of ['confirm', 'request', 'response', 'failed', 'validation-failed']) {
        assert.match(source, new RegExp(`'${stage}'`), stage);
    }
    assert.match(source, /AOO_NN_JOIN_DIAGNOSTIC/);
    assert.match(source, /join-diagnostic\.json/);
    assert.match(source, /JOIN_DIAGNOSTIC_STOP/);
    assert.doesNotMatch(source, /join-diagnostic[^\n]*roomId/,
        'join-only diagnostic must not persist the room number');
});

test('NN peer join waits for its own runtime readiness and exact room nodes', async () => {
    const source = await readFile(path, 'utf8');
    assert.match(source, /waitForOwnInitialState/);
    assert.match(source, /\[NN\] initial state ready/);
    assert.match(source, /\[NN\] enter failed/);
    assert.match(source, /n\.name==='NN_CommonRoom'/);
    assert.match(source, /n\.name==='CommonRoom'&&n\.getChildByPath\('RoomInfo\/Lb_RoomId'\)/);
    assert.match(source, /roomMatches:label\.includes/);
    assert.match(source, /NN peer initial state timed out/);
    assert.match(source, /scene=\$\{nodes\.scene\} rows=\$\{nodes\.rows\.length\} joinStage=/);
    assert.match(source, /serializeConsoleArg/);
    assert.match(source, /Runtime\.getProperties/);
    assert.match(source, /\['reason', 'message', 'stack', 'code', 'name'\]\.includes\(name\)/);
    assert.match(source, /token\|ticket\|password/);
    assert.doesNotMatch(source, /await visibleRoomId\(player\)/,
        'peer join must not use a scene-wide room-label timeout as its success criterion');
});
