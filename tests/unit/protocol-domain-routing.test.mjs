import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../assets/Common/Code/Runtime/network/ProtocolClient.ts', import.meta.url), 'utf8');
const socketSource = readFileSync(new URL('../../assets/Common/Code/Runtime/network/LegacyWebSocketClient.ts', import.meta.url), 'utf8');

test('lobby discovery is explicitly outside room authority and room commands remain fail-closed', () => {
    for (const action of ['game.C1101GetRoomID', 'room.CBaseRoomConfig', 'room.CBaseEnterRoom', 'game.CPlayerSetRoomRecord', 'game.CPlayerPlayBack']) {
        assert.ok(source.includes(`event === '${action}'`), `${action} must have an explicit lobby route`);
    }
    assert.match(source, /if \(\/\^room\[\._\]\/i\.test\(event\)\) return 'common\.room\.dispatch'/);
    assert.doesNotMatch(source, /\/room\|ready\|dissolve\|trusteeship\|chat\|voice\|gift\//);
    assert.match(source, /if \(!roomId\) throw new Error\('权威请求缺少 roomId'\)/);
    assert.match(source, /if \(!playVersion\) throw new Error\('权威请求缺少 playVersion'\)/);
});

test('callers can force inherited lobby queries through the hall domain', () => {
    assert.match(source, /public requestLobby<T>\(legacyMsgId: string, body: unknown, timeoutMs = 8000\): Promise<T>/);
    assert.match(source, /canonicalMsgId: 'hall\.dispatch', legacyEvent: legacyMsgId/);
    assert.match(source, /const route = forcedRoute \?\? this\.getRoute\(msgId\)/);
});

test('authoritative room state pushes stay in the room domain', () => {
    assert.match(source, /event === 'common\.room\.state_push'/);
    assert.match(source, /directRoomEvent \? envelope\.body : wrapper\.payload/);
    assert.doesNotMatch(source, /common\.room\.state_push[^\n]+hall\.dispatch/);
});

test('reconnect authenticator also uses the V2 websocket envelope', () => {
    assert.match(source, /protected override requestImmediate<T>\(msgId: string, body: unknown, timeoutMs = 8000\): Promise<T>/);
    assert.match(source, /dispatchProtocolRequest\(msgId, body, timeoutMs,/);
    assert.match(source, /super\.requestImmediate<ProtocolResponse<T>>\(event, outbound, requestTimeoutMs\)/);
    assert.match(source, /send\('protocol\.v2\.dispatch', outbound, timeoutMs\)/);
    assert.doesNotMatch(source, /base\.C1006RoleLogin[^\n]+super\.requestImmediate/);
});

test('V2 websocket sequence is allocated only at the real send boundary', () => {
    assert.match(socketSource, /const preparedBody = this\.prepareOutboundBody\(event, body\)/);
    assert.match(socketSource, /this\.requestSequence\(event, preparedBody\)/);
    assert.match(socketSource, /this\.socket!\.send\(this\.encodeWire\(event, preparedBody, sequence, false\)\)/);
    assert.doesNotMatch(socketSource, /queuedRequests|queuedNotifies|flushQueued|private async reconnect/);
    assert.match(source, /private deferEnvelope\(route: ProtocolRouteDecision, kind: 'req' \| 'push', body: unknown\): DeferredProtocolEnvelope/);
    assert.match(source, /protected override prepareOutboundBody\(_event: string, body: unknown\): unknown/);
    assert.match(source, /body\.envelope = envelope/);
    assert.doesNotMatch(source, /const envelope = this\.envelope\(route, 'req', body\);\s*return send/);
});

test('authoritative V2 room context uses only positive room ids and keeps error correlation populated', () => {
    assert.match(source, /private authoritativeRoomId\(authority: Record<string, unknown>\): string/);
    assert.match(source, /ProtocolClient\.positiveId\(authority\.roomId\)[\s\S]*ProtocolClient\.positiveId\(authority\.roomID\)[\s\S]*this\.roomAuthority\?\.roomId/);
    assert.match(source, /private correlatedRoomId\(body: unknown\): string \| undefined/);
    assert.match(source, /roomId = this\.correlatedRoomId\(body\)/);
    assert.match(source, /return \/\^\[1-9\]\\d\*\$\/\.test\(text\) \? text : undefined/);
    assert.doesNotMatch(source, /String\(authority\.roomId \?\? authority\.roomID \?\? this\.roomAuthority\?\.roomId/);
});
